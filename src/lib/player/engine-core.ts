// @ts-nocheck
import { BAND_COUNT, EQ_BANDS, EQ_Q, type EqGains } from "./constants";
import {
  createSpatial,
  disconnectSpatial,
  setSpatial as applySpatialState,
  spatialNodes,
  wireSpatial,
  type SpatialGraph,
  type SpatialPreset,
} from "./spatial";

export type IsolateMode = "mix" | "vocals" | "instruments" | "drums" | "bass";
export type RemasterPreset = "off" | "clean" | "full" | "vinyl" | "loud";
export type { SpatialPreset };

// CRITICAL iOS FIX: when DSP (EQ) is active, never switch to bgAudio on track change while backgrounded.
// Full engine body is loaded from the previous working build — this stub is replaced by full push.

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
const SILENCE = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}
function eqIsActive() {
  return lastRemaster !== "off" || Math.abs(lastPreamp) > 0.05 || Math.abs(bassLockDb) > 0.05 || lastGains.some((g) => Math.abs(g) > 0.05);
}
function dspActive() {
  if (eqIsActive()) return true;
  if (!engine) return false;
  return engine.spatial?.preset !== "off" || engine.isolateMode !== "mix";
}

function prepareAudioElement(el: HTMLAudioElement, graph = false) {
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  (el as any).playsInline = true;
  if (!graph) {
    el.muted = false;
  }
}

function seekEl(el: HTMLAudioElement, time: number) {
  if (!Number.isFinite(time) || time < 0) return;
  const apply = () => {
    try {
      if (Math.abs((el.currentTime || 0) - time) > 0.25) el.currentTime = time;
    } catch {}
  };
  apply();
  el.addEventListener("loadedmetadata", apply, { once: true });
  el.addEventListener("canplay", apply, { once: true });
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
  const filters: BiquadFilterNode[] = [];
  let prev: AudioNode = preamp;
  for (let i = 0; i < BAND_COUNT; i++) {
    const f = ctx.createBiquadFilter();
    f.type = i === 0 ? "lowshelf" : i === BAND_COUNT - 1 ? "highshelf" : "peaking";
    f.frequency.value = EQ_BANDS[i];
    f.Q.value = EQ_Q;
    f.gain.value = 0;
    prev.connect(f);
    prev = f;
    filters.push(f);
  }
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  prev.connect(gain);
  gain.connect(panner);
  panner.connect(analyser);
  analyser.connect(ctx.destination);
  source.connect(preamp);
  const spatial = createSpatial(ctx);
  engine = {
    audio, bgAudio, ctx, source, preamp, filters, gain, panner, analyser,
    isolateMode: "mix" as IsolateMode,
    spatial,
    apple: isAppleMobile(),
    graphActive: true,
    mono: false,
    remaster: "off" as RemasterPreset,
    remasterAmt: 0.7,
  };
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
  if (url.includes("/api/stream") || url.includes("proxy")) return url;
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "https://sondergram.vercel.app");
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    return `/api/stream?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
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
  // KEY FIX: keep Web Audio (EQ) path when DSP is active — iOS drops EQ if we switch to bgAudio on track change
  const forceGraph = dspActive() || !hiddenApple;
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

  // No DSP and hidden on Apple: use native bgAudio for reliable background play
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
    // Returning to foreground — restore graph path without restarting track
    eng.ctx.resume().catch(() => {});
    const t = Number.isFinite(eng.bgAudio.currentTime) ? eng.bgAudio.currentTime : eng.audio.currentTime;
    const raw = (eng.audio.currentSrc || eng.audio.src || lastPlayUrl || "").trim();
    if (!raw || raw.startsWith("data:")) {
      // Already on graph or no src — just ensure graph is active and playing
      eng.graphActive = true;
      applyOutputGain();
      eng.audio.play().catch(() => {});
      eng.bgAudio.muted = true;
      eng.bgAudio.volume = 0;
      return;
    }
    eng.graphActive = true;
    applyOutputGain();
    const graphSrc = proxyStreamUrl(raw);
    if (eng.audio.src !== graphSrc && eng.audio.currentSrc !== graphSrc) {
      // Only change src if different — avoid restart
      const sameTime = eng.audio.currentTime || 0;
      if (sameTime < 0.5 && t > 1) {
        // Graph element was idle; sync from bg
        if (eng.audio.src !== graphSrc) eng.audio.src = graphSrc;
        seekEl(eng.audio, t);
      }
    } else {
      // Same source — just ensure playing at current position
      if (Math.abs((eng.audio.currentTime || 0) - t) > 1.5 && t > 0.5) {
        seekEl(eng.audio, t);
      }
    }
    eng.audio.muted = false;
    eng.audio.play().catch(() => {});
    eng.bgAudio.muted = true;
    eng.bgAudio.volume = 0;
    eng.bgAudio.pause();
    return;
  }
  // Going to background
  const out = outputAudio();
  if (out.paused || out.ended) return;
  if (dspActive()) {
    // Keep EQ alive — do not switch to bgAudio
    eng.ctx.resume().catch(() => {});
    eng.graphActive = true;
    applyOutputGain();
    eng.audio.play().catch(() => {});
    eng.bgAudio.pause();
    eng.bgAudio.muted = true;
    eng.bgAudio.volume = 0;
    return;
  }
  // No DSP: native element is more reliable for pure background on iOS
  const src = eng.audio.currentSrc || eng.audio.src || lastPlayUrl;
  if (!src || src.startsWith("data:")) return;
  prepareAudioElement(eng.bgAudio);
  if (eng.bgAudio.src !== src && eng.bgAudio.currentSrc !== src) {
    eng.bgAudio.src = src;
    eng.bgAudio.load();
  }
  eng.bgAudio.playbackRate = eng.audio.playbackRate;
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
  const { filters } = ensureEngine();
  const n = Math.min(filters.length, gains.length);
  lastGains = gains.slice();
  for (let i = 0; i < n; i++) filters[i].gain.value = gains[i];
  // If EQ becomes active while on bg path, promote
  if (dspActive() && engine && !engine.graphActive) {
    setBackgroundOutput(false);
  }
}
export function applyPreamp(db: number) {
  lastPreamp = db;
  ensureEngine().preamp.gain.value = dbToGain(db);
}
export function setBassLock(db: number) {
  bassLockDb = db;
}
export function setIsolateMode(m: string) {
  ensureEngine().isolateMode = m as IsolateMode;
}
export function setSpatialMode(p: string, a?: number) {
  const eng = ensureEngine();
  if (eng.spatial) applySpatialState(eng.spatial, p as SpatialPreset, a ?? 0.5);
}
export function setMonoMode(_m: boolean) {}
export function setRemaster(p: string, a?: number) {
  lastRemaster = p as RemasterPreset;
  lastRemasterAmt = a ?? 0.7;
}
export function setBalance(v: number) {
  ensureEngine().panner.pan.value = v;
}
export function setMasterGain(v: number) {
  ensureEngine().gain.gain.value = v;
}
export function setPlaybackRate(r: number) {
  const eng = ensureEngine();
  eng.audio.playbackRate = r;
  if (eng.bgAudio) eng.bgAudio.playbackRate = r;
}
export function setFadeMul(_v: number) {}
export function setNormalizeMul(_v: number) {}
export function setReplayGainDb(_db: number) {}
