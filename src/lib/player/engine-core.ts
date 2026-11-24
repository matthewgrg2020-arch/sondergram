// @ts-nocheck
import { BAND_COUNT, EQ_BANDS, EQ_Q } from "./constants";
import {
  createSpatial,
  setSpatial as applySpatialState,
  wireSpatial,
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

function isIbUrl(url: string) {
  return Boolean(url && (url.includes("/api/ib-stream") || url.includes("streaming.ibroadcast.com")));
}
function forceDirectIbApple(url?: string) {
  if (!engine?.apple) return false;
  const u = url || lastPlayUrl || "";
  if (isIbUrl(u)) return true;
  try {
    const a = engine.audio?.currentSrc || engine.audio?.src || "";
    const b = engine.bgAudio?.currentSrc || engine.bgAudio?.src || "";
    if (isIbUrl(a) || isIbUrl(b)) return true;
  } catch {}
  return false;
}

function prepareAudioElement(el: HTMLAudioElement, graph = false) {
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
  window.setTimeout(apply, 120);
  window.setTimeout(apply, 400);
}

function ensureEngine() {
  if (engine) return engine;
  const audio = new Audio();
  prepareAudioElement(audio, false);
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
  source.connect(preamp);
  let prev: AudioNode = preamp;
  for (const f of filters) { prev.connect(f); prev = f; }
  wireSpatial(spatial, prev, gain);
  gain.connect(panner);
  panner.connect(analyser);
  analyser.connect(ctx.destination);
  engine = {
    audio, bgAudio, ctx, source, preamp, filters, gain, panner, analyser,
    isolateMode: "mix" as IsolateMode,
    spatial,
    apple: isAppleMobile(),
    graphActive: false,
    mono: false,
    remaster: "off" as RemasterPreset,
    remasterAmt: 0.7,
  };
  return engine;
}

export function getEngine() { return ensureEngine(); }

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
  const eng = ensureEngine();
  if (forceDirectIbApple()) {
    eng.graphActive = false;
    eng.audio.muted = true; eng.audio.volume = 0;
    if (eng.bgAudio) { eng.bgAudio.muted = false; eng.bgAudio.volume = 1; }
  }
  const active = outputAudio();
  const other = active === eng.audio ? eng.bgAudio : eng.audio;
  if (other) { try { other.pause(); } catch {} other.muted = true; other.volume = 0; }
  seekEl(active, t);
}

export async function seekHard(url: string, time: number) {
  if (!url || !Number.isFinite(time) || time < 0) return;
  const active = outputAudio();
  const cur = active.currentSrc || active.src || lastPlayUrl || "";
  if (cur && (cur === url || cur.includes(url.split("?")[0] || "___"))) {
    seekOutput(time);
    if (active.paused) try { await active.play(); } catch {}
    return;
  }
  try { await beginPlayback(url, time); } catch { seekOutput(time); }
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
export function primePlayback() { unlockEngine(); }

function applyOutputGain() {
  const eng = ensureEngine();
  if (eng.graphActive) {
    eng.audio.muted = false; eng.audio.volume = 1;
    if (eng.bgAudio) { eng.bgAudio.muted = true; eng.bgAudio.volume = 0; }
  } else {
    eng.audio.muted = true; eng.audio.volume = 0;
    if (eng.bgAudio) { eng.bgAudio.muted = false; eng.bgAudio.volume = 1; }
  }
}

async function playEl(el: HTMLAudioElement, url: string, at: number, graph: boolean, gen: number) {
  prepareAudioElement(el, graph);
  if (el.src !== url && el.currentSrc !== url) { el.src = url; el.load(); }
  seekEl(el, at);
  await new Promise<void>((resolve, reject) => {
    const ok = () => { el.removeEventListener("error", fail); resolve(); };
    const fail = () => { el.removeEventListener("canplay", ok); reject(new Error("load")); };
    if (el.readyState >= 2) { ok(); return; }
    el.addEventListener("canplay", ok, { once: true });
    el.addEventListener("error", fail, { once: true });
    setTimeout(() => { if (el.readyState >= 2) ok(); }, 50);
  });
  if (gen !== playGen) { el.pause(); return; }
  await el.play();
  if (gen !== playGen) { el.pause(); return; }
  el.muted = false;
  el.volume = 1;
}

export async function beginPlayback(url: string, at = 0) {
  const gen = ++playGen;
  lastPlayUrl = url;
  setAudioSessionPlayback();
  const eng = ensureEngine();
  if (!eng.bgAudio) {
    eng.bgAudio = new Audio();
    prepareAudioElement(eng.bgAudio, false);
  }
  const bg = eng.bgAudio;
  prepareAudioElement(bg, false);
  eng.audio.pause(); eng.audio.muted = true; eng.audio.volume = 0;
  bg.pause(); bg.muted = true; bg.volume = 0;
  eng.ctx.resume().catch(() => {});
  if (gen !== playGen) return;

  // Apple + iBroadcast: always plain HTMLAudioElement (duration + seek work).
  // EQ does not route through Web Audio for IB on iPhone by design.
  const preferDirect = isIbUrl(url) && (!dspActive() || eng.apple);
  eng.graphActive = !preferDirect && dspActive();
  applyOutputGain();

  const el = preferDirect || forceDirectIbApple(url) ? bg : eng.audio;
  const useGraph = el === eng.audio;
  try {
    await playEl(el, url, at, useGraph, gen);
    if (gen !== playGen) return;
    if (preferDirect || forceDirectIbApple(url)) {
      eng.graphActive = false;
      eng.audio.pause(); eng.audio.muted = true; eng.audio.volume = 0;
      bg.muted = false; bg.volume = 1;
    } else {
      eng.graphActive = true;
      applyOutputGain();
    }
  } catch {
    // fallback to the other element
    const other = el === bg ? eng.audio : bg;
    await playEl(other, url, at, other === eng.audio, gen);
  }
}

export function setBackgroundOutput(on: boolean) {
  const eng = ensureEngine();
  setAudioSessionPlayback();
  if (!eng.apple || !eng.bgAudio) {
    if (!on) eng.ctx.resume().catch(() => {});
    return;
  }
  // Never force Web Audio graph for iBroadcast on iPhone
  if (forceDirectIbApple()) {
    eng.graphActive = false;
    applyOutputGain();
    if (eng.bgAudio && eng.bgAudio.paused && !eng.bgAudio.ended) {
      eng.bgAudio.play().catch(() => {});
    }
    eng.audio.pause();
    return;
  }
  if (!on) {
    eng.ctx.resume().catch(() => {});
    eng.graphActive = true;
    applyOutputGain();
    eng.audio.play().catch(() => {});
    eng.bgAudio.muted = true; eng.bgAudio.volume = 0; eng.bgAudio.pause();
    return;
  }
  if (dspActive()) {
    eng.graphActive = true;
    applyOutputGain();
    eng.audio.play().catch(() => {});
    eng.bgAudio.pause(); eng.bgAudio.muted = true; eng.bgAudio.volume = 0;
    return;
  }
  eng.graphActive = false;
  applyOutputGain();
  eng.bgAudio.play().catch(() => {});
  eng.audio.pause();
}

export function applyEq(gains: number[]) {
  lastGains = gains.slice();
  const eng = ensureEngine();
  const n = Math.min(eng.filters.length, lastGains.length);
  for (let i = 0; i < n; i++) eng.filters[i].gain.value = finite(lastGains[i], 0);
  if (!forceDirectIbApple() && dspActive() && engine && !engine.graphActive) {
    setBackgroundOutput(false);
  }
}
export function applyPreamp(db: number) {
  lastPreamp = finite(db, 0);
  ensureEngine().preamp.gain.value = dbToGain(lastPreamp);
}
export function setBassLock(db: number) { bassLockDb = finite(db, 0); }
export function setIsolateMode(m: string) { ensureEngine().isolateMode = m as IsolateMode; }
export function setSpatialMode(p: string, a?: number) {
  const eng = ensureEngine();
  applySpatialState(eng.spatial, (p || "off") as SpatialPreset, finite(a ?? 0.7, 0.7));
  if (!forceDirectIbApple() && p !== "off" && engine && !engine.graphActive) setBackgroundOutput(false);
}
export function setMonoMode(_m: boolean) {}
export function setRemaster(p: string, a?: number) {
  lastRemaster = (p || "off") as RemasterPreset;
  lastRemasterAmt = finite(a ?? 0.7, 0.7);
  const eng = ensureEngine();
  eng.remaster = lastRemaster;
  eng.remasterAmt = lastRemasterAmt;
  if (!forceDirectIbApple() && lastRemaster !== "off" && engine && !engine.graphActive) {
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
export function capturePlayStream(): MediaStream | null {
  try {
    const eng = ensureEngine();
    if (!eng?.ctx || !eng?.analyser) return null;
    const dest = eng.ctx.createMediaStreamDestination();
    eng.analyser.connect(dest);
    return dest.stream;
  } catch { return null; }
}
export function makeDemoTone(): { name: string; blob: Blob } {
  const sr = 44100, dur = 1, n = sr * dur;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); w(36, "data"); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.sin(2 * Math.PI * 440 * (i / sr)) * 0.2;
    view.setInt16(44 + i * 2, (s * 0x7fff) | 0, true);
  }
  return { name: "demo-tone.wav", blob: new Blob([buffer], { type: "audio/wav" }) };
}
