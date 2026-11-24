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

const REMASTER: Record<RemasterPreset, { gains: number[]; preamp: number }> = {
  off: { gains: EQ_BANDS.map(() => 0), preamp: 0 },
  clean: {
    gains: [-1.5,-1.5,-1.5,-1.0,-1.0,-1.0,-1.0,-0.5,-0.5,0.0,0.0,0.5,0.5,0.5,0.5,0.5,1.0,1.0,1.0,1.0,1.0,1.0,1.0,0.5,0.5,0.0,0.0,-0.5,-0.5,-1.0,-1.0],
    preamp: 0.8,
  },
  full: {
    gains: [2.5,2.5,2.5,2.0,2.0,2.0,1.5,1.5,1.0,0.5,0.5,0.0,0.0,-0.5,-0.5,0.0,0.0,0.0,0.5,0.5,1.0,1.0,1.5,1.5,1.5,2.0,1.5,1.5,1.0,1.0,0.5],
    preamp: 1.2,
  },
  vinyl: {
    gains: [1.5,1.5,1.5,1.0,1.0,1.0,1.0,1.0,0.5,0.5,0.5,0.0,-0.5,-0.5,-1.0,-1.0,-1.0,-1.0,-1.0,-0.5,-0.5,0.0,0.5,0.5,0.5,0.5,1.0,0.0,-0.5,-1.0,-2.0],
    preamp: 0.6,
  },
  loud: {
    gains: [3.0,3.0,3.0,2.5,2.5,2.5,2.0,1.5,1.0,1.0,1.0,0.5,0.5,0.0,0.0,0.0,0.0,0.0,0.0,0.5,0.5,1.0,1.0,1.5,1.5,1.5,2.0,2.0,1.5,1.5,1.2],
    preamp: 2.0,
  },
};

function prepareAudioElement(el: HTMLAudioElement, graph = false) {
  // Only force CORS for Web Audio MediaElementSource. On iOS, crossOrigin on a
  // plain HTMLAudioElement often leaves duration=NaN and blocks seeking.
  if (graph) el.crossOrigin = "anonymous";
  else {
    try { el.removeAttribute("crossorigin"); } catch {}
    try { (el as any).crossOrigin = null; } catch {}
  }
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
  const eng = ensureEngine();
  const active = outputAudio();
  const cur = active.currentSrc || active.src || lastPlayUrl || "";
  if (cur && (cur === url || cur.includes(url.split("?")[0] || "___") || url.includes((cur.split("?")[0] || "___")))) {
    seekOutput(time);
    if (active.paused) {
      try { await active.play(); } catch {}
    }
    return;
  }
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
/*__NEXT_CHUNK_1__*/
