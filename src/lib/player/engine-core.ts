// @ts-nocheck
import { BAND_COUNT, EQ_BANDS, EQ_Q } from "./constants";
import {
  createSpatial,
  setSpatial as applySpatialState,
  wireSpatial,
  type SpatialGraph,
  type SpatialPreset,
} from "./spatial";

export type IsolateMode = "mix" | "vocals" | "instruments" | "drums" | "bass";
export type RemasterPreset = "off" | "clean" | "full" | "vinyl" | "loud";
export type { SpatialPreset };

export function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}
export function setAudioSessionPlayback() {
  try {
    const session = (navigator as any).audioSession;
    if (session) session.type = "playback";
  } catch {}
}

let engine: any = null;
let playGen = 0;
let lastPlayUrl = "";
let lastGains: number[] = EQ_BANDS.map(() => 0);
let lastPreamp = 0;
let bassLockDb = 0;
let lastRemaster: RemasterPreset = "off";
let lastRemasterAmt = 0.7;

function finite(n: number, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}
function dbToGain(db: number) {
  return Math.pow(10, finite(db, 0) / 20);
}
function eqIsActive() {
  return (
    lastRemaster !== "off" ||
    Math.abs(lastPreamp) > 0.05 ||
    Math.abs(bassLockDb) > 0.05 ||
    lastGains.some((g) => Math.abs(g) > 0.05)
  );
}
function dspActive() {
  if (eqIsActive()) return true;
  if (!engine) return false;
  return engine.spatial?.preset !== "off" || engine.isolateMode !== "mix";
}

// Remaster curves applied as additive EQ offsets (dB) across bands + makeup
const REMASTER: Record<RemasterPreset, { gains: number[]; preamp: number }> = {
  off: { gains: EQ_BANDS.map(() => 0), preamp: 0 },
  clean: {
    gains: [-1.2, -0.6, 0.4, 0.8, 1.0, 0.6, 0.2, -0.2, -0.6, -1.0],
    preamp: 0.8,
  },
  full: {
    gains: [2.5, 1.8, 0.6, -0.4, 0.2, 0.8, 1.4, 1.8, 1.2, 0.6],
    preamp: 1.2,
  },
  vinyl: {
    gains: [1.5, 1.0, 0.4, -0.8, -1.2, -0.6, 0.4, 1.0, 0.6, -1.5],
    preamp: 0.6,
  },
  loud: {
    gains: [3.0, 2.2, 1.0, 0.2, 0.0, 0.4, 1.0, 1.6, 2.0, 1.4],
    preamp: 2.0,
  },
};

function prepareAudioElement(el: HTMLAudioElement, graph = false) {
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  (el as any).playsInline = true;
  if (!graph) el.muted = false;
}

function seekEl(el: HTMLAudioElement, time: number) {
  if (!Number.isFinite(time) || time < 0) return;
  const apply = () => {
    try {
      if (Math.abs((el.currentTime || 0) - time) > 0.2) el.currentTime = time;
    } catch {}
  };
  apply();
  el.addEventListener("loadedmetadata", apply, { once: true });
  el.addEventListener("canplay", apply, { once: true });
  el.addEventListener("canplaythrough", apply, { once: true });
  window.setTimeout(apply, 120);
  window.setTimeout(apply, 400);
  window.setTimeout(apply, 1200);
}

export async function seekHard(url: string, time: number) {
  if (!url || !Number.isFinite(time) || time < 0) return;
  try {
    await beginPlayback(url, time);
  } catch {
    seekOutput(time);
  }
}

function rebuildGraph(eng: any) {
  try { eng.source.disconnect(); } catch {}
  try { eng.preamp.disconnect(); } catch {}
  for (const f of eng.filters) {
    try { f.disconnect(); } catch {}
  }
  try { eng.gain.disconnect(); } catch {}
  try { eng.panner.disconnect(); } catch {}
  try { eng.analyser.disconnect(); } catch {}

  eng.source.connect(eng.preamp);
  let prev: AudioNode = eng.preamp;
  for (const f of eng.filters) {
    prev.connect(f);
    prev = f;
  }
  // Spatial after EQ, before master gain
  wireSpatial(eng.spatial, prev, eng.gain);
  eng.gain.connect(eng.panner);
  eng.panner.connect(eng.analyser);
  eng.analyser.connect(eng.ctx.destination);
}

function applyRemasterToFilters(eng: any) {
  const shape = REMASTER[lastRemaster] || REMASTER.off;
  const amt = Math.max(0, Math.min(1, lastRemasterAmt));
  const n = Math.min(eng.filters.length, shape.gains.length, lastGains.length);
  for (let i = 0; i < n; i++) {
    const user = finite(lastGains[i], 0);
    const rm = finite(shape.gains[i], 0) * amt;
    const bass = i === 0 ? bassLockDb : 0;
    eng.filters[i].gain.value = user + rm + bass;
  }
  eng.preamp.gain.value = dbToGain(lastPreamp + shape.preamp * amt);
}

function ensureEngine() {
  if (engine) return engine;
  const audio = new Audio();
  prepareAudioElement(audio, true);
  const bgAudio = new Audio();
  prepareAudioElement(bgAudio, false);
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaElementSource(audio);
  const preamp = ctx.createGain();
  preamp.gain.value = 1;
  const filters: BiquadFilterNode[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const f = ctx.createBiquadFilter();
    f.type = i === 0 ? "lowshelf" : i === BAND_COUNT - 1 ? "highshelf" : "peaking";
    const freq = finite((EQ_BANDS[i] as any)?.freq ?? EQ_BANDS[i], 1000);
    f.frequency.value = freq;
    f.Q.value = finite(EQ_Q, 1);
    f.gain.value = 0;
    filters.push(f);
  }
  const gain = ctx.createGain();
  gain.gain.value = 1;
  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const spatial = createSpatial(ctx);
  engine = {
    audio,
    bgAudio,
    ctx,
    source,
    preamp,
    filters,
    gain,
    panner,
    analyser,
    isolateMode: "mix" as IsolateMode,
    spatial,
    apple: isAppleMobile(),
    graphActive: true,
    mono: false,
    remaster: "off" as RemasterPreset,
    remasterAmt: 0.7,
  };
  rebuildGraph(engine);
  return engine;
}

export function getEngine() {
  return ensureEngine();
}

export function outputAudio() {
  const eng = ensureEngine();
  return eng.graphActive || !eng.bgAudio ? eng.audio : eng.bgAudio;
}

export function pauseOutput() {
  const eng = ensureEngine();
  eng.audio.pause();
  if (eng.bgAudio) eng.bgAudio.pause();
}

export function seekOutput(t: number) {
  const el = outputAudio();
  seekEl(el, t);
  const srcUrl = el.currentSrc || el.src || lastPlayUrl || "";
  if (srcUrl.includes("/api/soulseek") && (!Number.isFinite(el.duration) || el.duration === 0 || Math.abs((el.currentTime || 0) - t) > 1.5)) {
    window.setTimeout(() => {
      const now = el.currentTime || 0;
      if (Math.abs(now - t) > 1.2) void seekHard(srcUrl, t);
    }, 350);
  }
}

export async function resumeEngine() {
  const eng = ensureEngine();
  setAudioSessionPlayback();
  if (eng.ctx.state === "suspended" || eng.ctx.state === "interrupted") {
    await eng.ctx.resume().catch(() => {});
  }
  const out = outputAudio();
  if (out.paused) await out.play().catch(() => {});
}

export function unlockEngine() {
  const eng = ensureEngine();
  setAudioSessionPlayback();
  if (eng.ctx.state !== "running") eng.ctx.resume().catch(() => {});
}

export function primePlayback() {
  unlockEngine();
}

function silenceAll() {
  const eng = ensureEngine();
  eng.audio.pause();
  if (eng.bgAudio) {
    eng.bgAudio.pause();
    eng.bgAudio.muted = true;
    eng.bgAudio.volume = 0;
  }
}

function applyOutputGain() {
  const eng = ensureEngine();
  if (eng.graphActive) {
    eng.audio.muted = false;
    eng.audio.volume = 1;
    if (eng.bgAudio) {
      eng.bgAudio.muted = true;
      eng.bgAudio.volume = 0;
    }
  } else {
    eng.audio.muted = true;
    eng.audio.volume = 0;
    if (eng.bgAudio) {
      eng.bgAudio.muted = false;
      eng.bgAudio.volume = 1;
    }
  }
}

function proxyStreamUrl(url: string) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith("/api/stream") || url.startsWith("/api/soulseek")) return url;
  if (url.includes("/api/stream?") || url.includes("/api/soulseek?")) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "https://sondergram.vercel.app");
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    if (typeof location !== "undefined" && u.origin === location.origin) return url;
    return `/api/stream?u=${encodeURIComponent(u.toString())}`;
  } catch {
    return url;
  }
}

function graphOnly(url: string) {
  return (
    url.includes("/api/soulseek") ||
    url.includes("/api/stream") ||
    url.includes("bcbits.com") ||
    url.includes("bandcamp.com") ||
    url.includes("amazon") ||
    url.includes("cloudfront.net") ||
    url.includes("mzstatic.com") ||
    url.includes("deezer") ||
    url.includes("dzcdn") ||
    url.includes("sndcdn.com") ||
    url.includes("soundcloud")
  );
}

function isRemoteUrl(url: string) {
  return /^https?:/i.test(url);
}

async function playEl(el: HTMLAudioElement, url: string, at: number, graph: boolean, gen: number) {
  prepareAudioElement(el, graph);
  if (el.src !== url && el.currentSrc !== url) {
    el.src = url;
    el.load();
  }
  seekEl(el, at);
  await new Promise<void>((resolve, reject) => {
    const ok = () => {
      el.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      el.removeEventListener("canplay", ok);
      reject(new Error("load"));
    };
    if (el.readyState >= 2) {
      ok();
      return;
    }
    el.addEventListener("canplay", ok, { once: true });
    el.addEventListener("error", fail, { once: true });
    setTimeout(() => {
      if (el.readyState >= 2) ok();
    }, 50);
  });
  if (gen !== playGen) {
    el.pause();
    return;
  }
  await el.play();
  if (gen !== playGen) el.pause();
}

export async function beginPlayback(url: string, at = 0) {
  const gen = ++playGen;
  lastPlayUrl = url;
  setAudioSessionPlayback();
  const eng = ensureEngine();
  prepareAudioElement(eng.audio, true);
  if (!eng.bgAudio) {
    eng.bgAudio = new Audio();
    prepareAudioElement(eng.bgAudio, false);
  }
  const bg = eng.bgAudio;
  prepareAudioElement(bg, false);
  silenceAll();
  bg.pause();
  bg.muted = true;
  bg.volume = 0;
  eng.ctx.resume().catch(() => {});
  if (gen !== playGen) return;

  const blob = url.startsWith("blob:") || url.startsWith("data:");
  const hiddenApple = Boolean(eng.apple && typeof document !== "undefined" && document.visibilityState === "hidden");
  const forceGraph = dspActive() || !hiddenApple || graphOnly(url);
  const graphSrc = blob ? url : proxyStreamUrl(url);

  if (forceGraph) {
    bg.pause();
    bg.muted = true;
    bg.volume = 0;
    eng.graphActive = true;
    applyOutputGain();
    try {
      await playEl(eng.audio, graphSrc, at, true, gen);
      if (gen !== playGen) {
        silenceAll();
        return;
      }
      return;
    } catch {
      try {
        await playEl(eng.audio, blob ? url : graphSrc, at, true, gen);
        if (gen !== playGen) {
          silenceAll();
          return;
        }
        return;
      } catch {
        if (!blob && graphSrc !== url) {
          try {
            await playEl(eng.audio, url, at, true, gen);
            if (gen !== playGen) {
              silenceAll();
              return;
            }
            return;
          } catch {}
        }
        if (dspActive()) {
          try {
            await playEl(eng.audio, url, at, true, gen);
            if (gen !== playGen) {
              silenceAll();
              return;
            }
            return;
          } catch {
            throw new Error("stream");
          }
        }
        throw new Error("stream");
      }
    }
  }

  if (graphOnly(url)) {
    await playEl(eng.audio, url, at, true, gen);
    return;
  }

  if (gen !== playGen) {
    silenceAll();
    return;
  }
  eng.audio.pause();
  eng.graphActive = false;
  applyOutputGain();
  const urls = isRemoteUrl(url) ? [graphSrc, url] : [graphSrc, url];
  let last: Error | null = null;
  for (const next of urls) {
    if (gen !== playGen) {
      silenceAll();
      return;
    }
    try {
      await playEl(bg, next, at, false, gen);
      if (gen !== playGen) {
        silenceAll();
        return;
      }
      eng.audio.pause();
      return;
    } catch (err) {
      last = err instanceof Error ? err : new Error("stream");
    }
  }
  throw last || new Error("stream");
}

export function setBackgroundOutput(on: boolean) {
  const eng = ensureEngine();
  setAudioSessionPlayback();
  if (!eng.apple || !eng.bgAudio) {
    if (!on) eng.ctx.resume().catch(() => {});
    return;
  }
  if (!on) {
    eng.ctx.resume().catch(() => {});
    eng.graphActive = true;
    applyOutputGain();
    eng.audio.muted = false;
    eng.audio.play().catch(() => {});
    eng.bgAudio.muted = true;
    eng.bgAudio.volume = 0;
    eng.bgAudio.pause();
    return;
  }
  const out = outputAudio();
  if (out.paused || out.ended) return;
  if (dspActive()) {
    eng.ctx.resume().catch(() => {});
    eng.graphActive = true;
    applyOutputGain();
    eng.audio.play().catch(() => {});
    eng.bgAudio.pause();
    eng.bgAudio.muted = true;
    eng.bgAudio.volume = 0;
    return;
  }
  const src = eng.audio.currentSrc || eng.audio.src || lastPlayUrl;
  if (!src || src.startsWith("data:")) return;
  prepareAudioElement(eng.bgAudio);
  if (eng.bgAudio.src !== src && eng.bgAudio.currentSrc !== src) {
    eng.bgAudio.src = src;
    eng.bgAudio.load();
  }
  eng.bgAudio.playbackRate = finite(eng.audio.playbackRate, 1);
  const t = eng.graphActive ? eng.audio.currentTime : eng.bgAudio.currentTime;
  seekEl(eng.bgAudio, t);
  eng.graphActive = false;
  applyOutputGain();
  eng.bgAudio.play().catch(() => {
    eng.graphActive = true;
    applyOutputGain();
    eng.bgAudio?.pause();
    eng.audio.play().catch(() => {});
  });
  eng.audio.pause();
}

export function applyEq(gains: number[]) {
  const eng = ensureEngine();
  lastGains = gains.slice();
  applyRemasterToFilters(eng);
  if ((dspActive() || (lastPlayUrl || "").includes("/api/soulseek") || (lastPlayUrl || "").includes("/api/stream")) && engine && !engine.graphActive) {
    setBackgroundOutput(false);
  }
}

export function applyPreamp(db: number) {
  lastPreamp = finite(db, 0);
  const eng = ensureEngine();
  applyRemasterToFilters(eng);
}

export function setBassLock(db: number) {
  bassLockDb = finite(db, 0);
  const eng = ensureEngine();
  applyRemasterToFilters(eng);
}

export function setIsolateMode(m: string) {
  ensureEngine().isolateMode = m as IsolateMode;
}

export function setSpatialMode(p: string, a?: number) {
  const eng = ensureEngine();
  const preset = (p || "off") as SpatialPreset;
  const amount = finite(a ?? 0.7, 0.7);
  applySpatialState(eng.spatial, preset, amount);
  rebuildGraph(eng);
  if (preset !== "off" && engine && !engine.graphActive) {
    setBackgroundOutput(false);
  }
}

export function setMonoMode(_m: boolean) {}

export function setRemaster(p: string, a?: number) {
  lastRemaster = (p || "off") as RemasterPreset;
  lastRemasterAmt = finite(a ?? 0.7, 0.7);
  const eng = ensureEngine();
  eng.remaster = lastRemaster;
  eng.remasterAmt = lastRemasterAmt;
  applyRemasterToFilters(eng);
  if (lastRemaster !== "off" && engine && !engine.graphActive) {
    setBackgroundOutput(false);
  }
}

export function setBalance(v: number) {
  ensureEngine().panner.pan.value = Math.max(-1, Math.min(1, finite(v, 0)));
}
export function setMasterGain(v: number) {
  ensureEngine().gain.gain.value = Math.max(0, finite(v, 1));
}
export function setPlaybackRate(r: number) {
  const eng = ensureEngine();
  const rate = Math.max(0.25, Math.min(4, finite(r, 1)));
  eng.audio.playbackRate = rate;
  if (eng.bgAudio) eng.bgAudio.playbackRate = rate;
}
export function setFadeMul(_v: number) {}
export function setNormalizeMul(_v: number) {}
export function setReplayGainDb(_db: number) {}
