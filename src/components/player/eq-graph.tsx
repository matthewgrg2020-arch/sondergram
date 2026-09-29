import { useEffect, useRef, useState } from "react";
import { EQ_BANDS, EQ_MAX, EQ_MIN, EQ_Q } from "@/lib/player/constants";
import { getEngine } from "@/lib/player/engine";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";

const F_MIN = 20;
const F_MAX = 20000;
const COLORS = ["#5b8def", "#7ed957", "#50e3c2", "#f5c542", "#c084fc", "#fb7185", "#38bdf8", "#a3e635", "#f97316", "#e879f9"];

function xOf(f: number, w: number) {
  const a = Math.log10(F_MIN);
  const t = (Math.log10(Math.min(F_MAX, Math.max(F_MIN, f))) - a) / (Math.log10(F_MAX) - a);
  return t * w;
}

function fOf(x: number, w: number) {
  const a = Math.log10(F_MIN);
  const t = Math.min(1, Math.max(0, x / w));
  return 10 ** (a + t * (Math.log10(F_MAX) - a));
}

function yOf(db: number, h: number, range: number) {
  return h * (0.5 - db / (2 * range));
}

function dbOf(y: number, h: number, range: number) {
  return (0.5 - y / h) * 2 * range;
}

function peakingMag(f: number, f0: number, Q: number, gainDb: number, fs = 44100) {
  if (Math.abs(gainDb) < 0.01) return 0;
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosw0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha / A;
  const B0 = b0 / a0;
  const B1 = b1 / a0;
  const B2 = b2 / a0;
  const A1 = a1 / a0;
  const A2 = a2 / a0;
  const w = (2 * Math.PI * f) / fs;
  const z1r = Math.cos(w);
  const z1i = -Math.sin(w);
  const z2r = Math.cos(2 * w);
  const z2i = -Math.sin(2 * w);
  const numR = B0 + B1 * z1r + B2 * z2r;
  const numI = B1 * z1i + B2 * z2i;
  const denR = 1 + A1 * z1r + A2 * z2r;
  const denI = A1 * z1i + A2 * z2i;
  const mag = Math.hypot(numR, numI) / Math.max(1e-12, Math.hypot(denR, denI));
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

function nearestBand(freq: number) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < EQ_BANDS.length; i++) {
    const d = Math.abs(Math.log10(EQ_BANDS[i].freq) - Math.log10(freq));
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

function formatHz(f: number) {
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${Math.round(f)}`;
}

function formatDb(v: number) {
  const n = Math.round(v * 10) / 10;
  return n > 0 ? `+${n}` : `${n}`;
}

function isMobileUi() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

const RANGES = [6, 12, 30] as const;

export function EqGraph() {
  const eq = usePlayer((s) => s.eq);
  const preamp = usePlayer((s) => s.preamp);
  const setEqBand = usePlayer((s) => s.setEqBand);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eqRef = useRef(eq);
  const preRef = useRef(preamp);
  const dragRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const [range, setRange] = useState<(typeof RANGES)[number]>(12);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const rangeRef = useRef(range);
  eqRef.current = eq;
  preRef.current = preamp;
  rangeRef.current = range;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const mobile = isMobileUi();
    const bins = new Uint8Array(mobile ? 1024 : 2048);
    let raf = 0;
    let last = 0;
    const minFrameMs = mobile ? 80 : 33; // ~12fps phone, ~30fps desktop
    const stepPx = mobile ? 8 : 3;
    const curveStep = mobile ? 6 : 2;
    const maxDpr = mobile ? 1 : 2;

    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const onVis = () => {
      if (document.hidden) visibleRef.current = false;
    };
    document.addEventListener("visibilitychange", onVis);

    const paint = (stamp: number) => {
      raf = requestAnimationFrame(paint);
      if (!visibleRef.current || document.hidden) return;
      if (stamp - last < minFrameMs) return;
      last = stamp;

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 8 || h < 8) return;

      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      const tw = Math.floor(w * dpr);
      const th = Math.floor(h * dpr);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#141416";
      ctx.fillRect(0, 0, w, h);

      const rng = rangeRef.current;
      const gains = eqRef.current;
      const pre = preRef.current;
      let sr = 44100;
      let analyser: AnalyserNode | null = null;
      try {
        const eng = getEngine();
        analyser = eng.analyser;
        sr = eng.ctx.sampleRate || 44100;
        // Keep FFT modest on phones — large fftSize is a common jank source
        const want = mobile ? 1024 : 2048;
        if (analyser.fftSize !== want) analyser.fftSize = want;
      } catch {
        analyser = null;
      }

      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const freqs = mobile ? [50, 200, 1000, 5000, 20000] : [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      for (const f of freqs) {
        const x = xOf(f, w);
        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(formatHz(f), x, h - 6);
      }

      // Spectrum fill — skip every other bin on mobile
      if (analyser) {
        const n = analyser.frequencyBinCount;
        const data = n > bins.length ? new Uint8Array(n) : bins;
        analyser.getByteFrequencyData(data);
        ctx.beginPath();
        ctx.moveTo(0, h);
        const stride = mobile ? 4 : 1;
        for (let i = 1; i < n; i += stride) {
          const f = (i * sr) / analyser.fftSize;
          if (f < F_MIN) continue;
          if (f > F_MAX) break;
          const mag = (data[i]! / 255) * rng * 0.9;
          ctx.lineTo(xOf(f, w), yOf(mag, h, rng));
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = "rgba(180,180,200,0.08)";
        ctx.fill();
      }

      // Per-band fills only for active bands, coarse step
      for (let i = 0; i < EQ_BANDS.length; i++) {
        const g = gains[i] ?? 0;
        if (Math.abs(g) < 0.2) continue;
        const f0 = EQ_BANDS[i]!.freq;
        ctx.beginPath();
        let started = false;
        for (let px = 0; px <= w; px += stepPx) {
          const f = fOf(px, w);
          const db = peakingMag(f, f0, EQ_Q, g, sr);
          const y = yOf(db + pre * 0.15, h, rng);
          if (!started) {
            ctx.moveTo(px, h / 2);
            ctx.lineTo(px, y);
            started = true;
          } else ctx.lineTo(px, y);
        }
        ctx.lineTo(w, h / 2);
        ctx.closePath();
        const col = COLORS[i % COLORS.length]!;
        ctx.fillStyle = `${col}33`;
        ctx.fill();
      }

      // Sum curve
      ctx.beginPath();
      for (let px = 0; px <= w; px += curveStep) {
        const f = fOf(px, w);
        let db = pre;
        for (let i = 0; i < EQ_BANDS.length; i++) {
          const g = gains[i] ?? 0;
          if (Math.abs(g) < 0.01) continue;
          db += peakingMag(f, EQ_BANDS[i]!.freq, EQ_Q, g, sr);
        }
        const y = yOf(db, h, rng);
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.strokeStyle = "#f5c542";
      ctx.lineWidth = 2;
      ctx.stroke();

      for (let i = 0; i < EQ_BANDS.length; i++) {
        const g = gains[i] ?? 0;
        const active = Math.abs(g) >= 0.2 || dragRef.current === i;
        if (!active) continue;
        const x = xOf(EQ_BANDS[i]!.freq, w);
        const y = yOf(g + pre, h, rng);
        ctx.beginPath();
        ctx.arc(x, y, mobile ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[i % COLORS.length]!;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#111";
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const bandAt = (clientX: number, clientY: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return { i: -1, x: 0, y: 0 };
    const x = clientX - box.left;
    const y = clientY - box.top;
    const freq = fOf(x, box.width);
    let i = nearestBand(freq);
    let best = 36;
    for (let n = 0; n < EQ_BANDS.length; n++) {
      const g = eqRef.current[n] ?? 0;
      const nx = xOf(EQ_BANDS[n]!.freq, box.width);
      const ny = yOf(g + preRef.current, box.height, rangeRef.current);
      const d = Math.hypot(nx - x, ny - y);
      if (d < best) {
        best = d;
        i = n;
      }
    }
    return { i, x, y };
  };

  const applyPointer = (clientX: number, clientY: number, band: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const y = clientY - box.top;
    const x = clientX - box.left;
    const db = Math.max(
      EQ_MIN,
      Math.min(EQ_MAX, Math.round(dbOf(y, box.height, rangeRef.current) * 2) / 2 - preRef.current),
    );
    const next = nearestBand(fOf(x, box.width));
    const curX = xOf(EQ_BANDS[band]!.freq, box.width);
    const nextX = xOf(EQ_BANDS[next]!.freq, box.width);
    if (next !== band && dragRef.current != null && Math.abs(x - nextX) + 10 < Math.abs(x - curX)) {
      const cur = eqRef.current[band] ?? 0;
      if (Math.abs(cur) > 0.01) setEqBand(band, 0);
      dragRef.current = next;
      setEqBand(next, db);
      return;
    }
    setEqBand(band, db);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Analyzer · Pre+Post</p>
        <div className="flex items-center gap-1">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRange(n)}
              className={cn(
                "h-7 rounded-md px-2 text-[11px] font-medium",
                range === n ? "bg-raised text-fg" : "text-subtle hover:text-fg",
              )}
            >
              {n} dB
            </button>
          ))}
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative h-48 w-full touch-none cursor-crosshair overflow-hidden rounded-lg bg-[#141416] ring-1 ring-white/10 sm:h-72 md:h-80"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          const hit = bandAt(e.clientX, e.clientY);
          dragRef.current = hit.i;
          applyPointer(e.clientX, e.clientY, hit.i);
          setHover(hit);
        }}
        onPointerMove={(e) => {
          if (dragRef.current == null) return;
          // Avoid React state updates on every move when not dragging (was mobile jank)
          applyPointer(e.clientX, e.clientY, dragRef.current);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onDoubleClick={(e) => {
          const hit = bandAt(e.clientX, e.clientY);
          if (hit.i >= 0) setEqBand(hit.i, 0);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
        {hover ? (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] text-fg">
            {EQ_BANDS[hover.i]?.label} Hz · {formatDb(eq[hover.i] ?? 0)} dB
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-subtle">
        Drag nodes to boost or cut. Move sideways to slide the band. Double-click to flatten a point.
      </p>
    </div>
  );
}
