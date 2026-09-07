import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { getEngine } from "@/lib/player/engine";
import { usePlayer } from "@/lib/player/store";

export function PartyViz({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const track = index >= 0 ? tracks[index] : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const freq = new Uint8Array(128);
    const wave = new Uint8Array(256);
    let raf = 0;
    let hue = 280;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { analyser } = getEngine();
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave);
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);

      let bass = 0;
      for (let i = 0; i < 8; i++) bass += freq[i];
      bass /= 8 * 255;
      hue = (hue + 0.4 + bass * 2) % 360;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * (0.16 + bass * 0.08);

      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.8 + bass), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${0.08 + bass * 0.18})`;
      ctx.fill();

      const bars = 64;
      for (let i = 0; i < bars; i++) {
        const v = (freq[i] ?? 0) / 255;
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const inner = radius;
        const outer = radius + 24 + v * Math.min(w, h) * 0.22;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.strokeStyle = `hsla(${(hue + i * 4) % 360}, 90%, ${60 + v * 20}%, ${0.45 + v * 0.5})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.beginPath();
      const amp = Math.min(h * 0.12, 90);
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = h * 0.82 + ((wave[i] - 128) / 128) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue}, 90%, 70%, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <canvas ref={canvasRef} className="size-full" />
      <button
        type="button"
        aria-label="Close visualizer"
        onClick={onClose}
        className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="size-5" strokeWidth={1.75} />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center">
        <p className="text-lg font-semibold text-white">{track?.name ?? "Nothing playing"}</p>
        <p className="text-sm text-white/70">{track?.artist ?? ""}</p>
      </div>
    </div>
  );
}