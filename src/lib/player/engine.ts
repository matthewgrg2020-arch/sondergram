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

type Engine = {
  audio: HTMLAudioElement;
  bgAudio: HTMLAudioElement | null;
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  splitter: ChannelSplitterNode;
  midL: GainNode;
  midR: GainNode;
  sideL: GainNode;
  invert: GainNode;
  isoIn: GainNode;
  isoHp: BiquadFilterNode;
  isoPeak: BiquadFilterNode;
  isoLp: BiquadFilterNode;
  isoOut: GainNode;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  isolateMode: IsolateMode;
  spatial: SpatialGraph;
  apple: boolean;
  graphActive: boolean;
  bassShelf: BiquadFilterNode;
  rmHp: BiquadFilterNode;
  rmBody: BiquadFilterNode;
  rmMud: BiquadFilterNode;
  rmPresence: BiquadFilterNode;
  rmAir: BiquadFilterNode;
  rmDrive: WaveShaperNode;
  rmComp: DynamicsCompressorNode;
  rmMakeup: GainNode;
  rmLimit: DynamicsCompressorNode;
  remaster: RemasterPreset;
  remasterAmt: number;
  mono: boolean;
  monoSplit: ChannelSplitterNode;
  monoL: GainNode;
  monoR: GainNode;
};

let engine: Engine | null = null;

export function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function setAudioSessionPlayback() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {
    /* unsupported */
  }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function driveCurve(amount: number) {
  const n = 257;
  const curve = new Float32Array(n);
  const k = Math.max(0, amount) * 3.2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = k < 0.01 ? x : Math.tanh(x * (1 + k));
  }
  return curve;
}

type RemasterShape = {
  hp: number;
  body: number;
  mud: number;
  presence: number;
  air: number;
  drive: number;
  compress: number;
  makeup: number;
};

const REMASTER: Record<RemasterPreset, RemasterShape> = {
  off: { hp: 20, body: 0, mud: 0, presence: 0, air: 0, drive: 0, compress: 0, makeup: 0 },
  clean: { hp: 38, body: 1.1, mud: -2.4, presence: 3.4, air: 2.8, drive: 0.06, compress: 0.38, makeup: 1.6 },
  full: { hp: 28, body: 3.4, mud: -1.5, presence: 2.5, air: 2.0, drive: 0.16, compress: 0.42, makeup: 1.3 },
  vinyl: { hp: 32, body: 2.6, mud: -0.9, presence: 1.8, air: 2.4, drive: 0.24, compress: 0.28, makeup: 0.9 },
  loud: { hp: 30, body: 2.2, mud: -2.0, presence: 3.8, air: 3.0, drive: 0.12, compress: 0.58, makeup: 2.4 },
};

function applyRemasterShape(eng: Engine, preset: RemasterPreset, amount: number) {
  const mix = preset === "off" ? 0 : Math.max(0, Math.min(1, amount));
  const shape = REMASTER[preset];
  eng.rmHp.frequency.value = 20 + (shape.hp - 20) * mix;
  eng.rmBody.gain.value = shape.body * mix;
  eng.rmMud.gain.value = shape.mud * mix;
  eng.rmPresence.gain.value = shape.presence * mix;
  eng.rmAir.gain.value = shape.air * mix;
  eng.rmDrive.curve = driveCurve(shape.drive * mix);
  eng.rmComp.threshold.value = mix > 0.01 ? -12 - shape.compress * 16 * mix : 0;
  eng.rmComp.knee.value = mix > 0.01 ? 8 : 0;
  eng.rmComp.ratio.value = mix > 0.01 ? 1 + shape.compress * 3 * mix : 1;
  eng.rmMakeup.gain.value = dbToGain(shape.makeup * mix);
  eng.rmLimit.threshold.value = mix > 0.01 ? -1.2 : 0;
  eng.rmLimit.knee.value = mix > 0.01 ? 2 : 0;
  eng.rmLimit.ratio.value = mix > 0.01 ? 12 : 1;
}

export function setRemaster(preset: RemasterPreset, amount = 0.7) {
  const eng = getEngine();
  eng.remaster = preset;
  eng.remasterAmt = amount;
  lastRemaster = preset;
  lastRemasterAmt = amount;
  applyRemasterShape(eng, preset, amount);
  scheduleEqBake();
}

function makeFilters(ctx: AudioContext) {
  return EQ_BANDS.map((band) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = band.freq;
    filter.Q.value = EQ_Q;
    filter.gain.value = 0;
    return filter;
  });
}

function safeDisconnect(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    /* already disconnected */
  }
}

function configureIsolate(eng: Engine) {
  const mode = eng.isolateMode;
  eng.isoHp.type = "highpass";
  eng.isoPeak.type = "peaking";
  eng.isoLp.type = "lowpass";
  eng.isoPeak.gain.value = 0;
  eng.isoHp.Q.value = 0.7;
  eng.isoLp.Q.value = 0.7;
  eng.isoPeak.Q.value = 1;

  if (mode === "vocals") {
    eng.splitter.connect(eng.midL, 0);
    eng.splitter.connect(eng.midR, 1);
    eng.midL.gain.value = 0.75;
    eng.midR.gain.value = 0.75;
    eng.midL.connect(eng.isoIn);
    eng.midR.connect(eng.isoIn);
    eng.isoHp.frequency.value = 180;
    eng.isoPeak.frequency.value = 3000;
    eng.isoPeak.Q.value = 0.9;
    eng.isoPeak.gain.value = 6;
    eng.isoLp.frequency.value = 9000;
    eng.isoOut.gain.value = 1.35;
  } else if (mode === "instruments") {
    eng.splitter.connect(eng.sideL, 0);
    eng.splitter.connect(eng.invert, 1);
    eng.sideL.gain.value = 1;
    eng.invert.gain.value = -1;
    eng.sideL.connect(eng.isoIn);
    eng.invert.connect(eng.isoIn);
    eng.isoHp.frequency.value = 90;
    eng.isoPeak.frequency.value = 2500;
    eng.isoPeak.gain.value = 2;
    eng.isoLp.frequency.value = 14000;
    eng.isoOut.gain.value = 1.85;
  } else if (mode === "drums") {
    eng.splitter.connect(eng.sideL, 0);
    eng.splitter.connect(eng.invert, 1);
    eng.splitter.connect(eng.midL, 0);
    eng.splitter.connect(eng.midR, 1);
    eng.sideL.gain.value = 0.9;
    eng.invert.gain.value = -0.9;
    eng.midL.gain.value = 0.25;
    eng.midR.gain.value = 0.25;
    eng.sideL.connect(eng.isoIn);
    eng.invert.connect(eng.isoIn);
    eng.midL.connect(eng.isoIn);
    eng.midR.connect(eng.isoIn);
    eng.isoHp.frequency.value = 180;
    eng.isoPeak.frequency.value = 4500;
    eng.isoPeak.Q.value = 1.1;
    eng.isoPeak.gain.value = 7;
    eng.isoLp.frequency.value = 10000;
    eng.isoOut.gain.value = 1.7;
  } else if (mode === "bass") {
    eng.splitter.connect(eng.midL, 0);
    eng.splitter.connect(eng.midR, 1);
    eng.midL.gain.value = 0.8;
    eng.midR.gain.value = 0.8;
    eng.midL.connect(eng.isoIn);
    eng.midR.connect(eng.isoIn);
    eng.isoHp.frequency.value = 28;
    eng.isoPeak.frequency.value = 70;
    eng.isoPeak.Q.value = 1.3;
    eng.isoPeak.gain.value = 8;
    eng.isoLp.frequency.value = 140;
    eng.isoOut.gain.value = 2.1;
  }

  eng.isoIn.connect(eng.isoHp);
  eng.isoHp.connect(eng.isoPeak);
  eng.isoPeak.connect(eng.isoLp);
  eng.isoLp.connect(eng.isoOut);
}

function wire(eng: Engine) {
  const nodes: AudioNode[] = [
    eng.source,
    eng.splitter,
    eng.midL,
    eng.midR,
    eng.sideL,
    eng.invert,
    eng.isoIn,
    eng.isoHp,
    eng.isoPeak,
    eng.isoLp,
    eng.isoOut,
    eng.preamp,
    ...eng.filters,
    eng.bassShelf,
    eng.rmHp,
    eng.rmBody,
    eng.rmMud,
    eng.rmPresence,
    eng.rmAir,
    eng.rmDrive,
    eng.rmComp,
    eng.rmMakeup,
    eng.rmLimit,
    eng.gain,
    eng.panner,
    eng.analyser,
    eng.monoSplit,
    eng.monoL,
    eng.monoR,
    ...spatialNodes(eng.spatial),
  ];
  for (const node of nodes) safeDisconnect(node);
  disconnectSpatial(eng.spatial);

  let head: AudioNode = eng.source;
  if (eng.isolateMode !== "mix") {
    eng.source.connect(eng.splitter);
    configureIsolate(eng);
    head = eng.isoOut;
  }

  head.connect(eng.preamp);
  let node: AudioNode = eng.preamp;
  for (const filter of eng.filters) {
    node.connect(filter);
    node = filter;
  }
  node.connect(eng.bassShelf);
  eng.bassShelf.connect(eng.rmHp);
  eng.rmHp.connect(eng.rmBody);
  eng.rmBody.connect(eng.rmMud);
  eng.rmMud.connect(eng.rmPresence);
  eng.rmPresence.connect(eng.rmAir);
  eng.rmAir.connect(eng.rmDrive);
  eng.rmDrive.connect(eng.rmComp);
  eng.rmComp.connect(eng.rmMakeup);
  eng.rmMakeup.connect(eng.rmLimit);
  wireSpatial(eng.spatial, eng.rmLimit, eng.gain);
  eng.gain.connect(eng.panner);
  if (eng.mono) {
    eng.panner.connect(eng.monoSplit);
    eng.monoL.gain.value = 0.5;
    eng.monoR.gain.value = 0.5;
    eng.monoSplit.connect(eng.monoL, 0);
    eng.monoSplit.connect(eng.monoR, 1);
    eng.monoL.connect(eng.analyser);
    eng.monoR.connect(eng.analyser);
  } else {
    eng.panner.connect(eng.analyser);
  }
  eng.analyser.connect(eng.ctx.destination);
}

export function getEngine(): Engine {
  if (engine) {
    if (engine.filters.length !== BAND_COUNT) {
      engine.filters = makeFilters(engine.ctx);
      wire(engine);
    }
    return engine;
  }

  setAudioSessionPlayback();
  const apple = isAppleMobile();
  const audio = new Audio();
  prepareAudioElement(audio);
  const bgAudio = new Audio();
  prepareAudioElement(bgAudio);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new Ctx({ latencyHint: "playback" });
  } catch {
    ctx = new Ctx();
  }
  const source = ctx.createMediaElementSource(audio);
  const splitter = ctx.createChannelSplitter(2);
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  const sideL = ctx.createGain();
  const invert = ctx.createGain();
  const isoIn = ctx.createGain();
  isoIn.gain.value = 1;
  const isoHp = ctx.createBiquadFilter();
  const isoPeak = ctx.createBiquadFilter();
  const isoLp = ctx.createBiquadFilter();
  const isoOut = ctx.createGain();
  const preamp = ctx.createGain();
  preamp.gain.value = 1;
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : (ctx.createGain() as unknown as StereoPannerNode);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  const filters = makeFilters(ctx);
  const bassShelf = ctx.createBiquadFilter();
  bassShelf.type = "lowshelf";
  bassShelf.frequency.value = 90;
  bassShelf.gain.value = 0;
  const rmHp = ctx.createBiquadFilter();
  rmHp.type = "highpass";
  rmHp.frequency.value = 20;
  rmHp.Q.value = 0.7;
  const rmBody = ctx.createBiquadFilter();
  rmBody.type = "lowshelf";
  rmBody.frequency.value = 110;
  rmBody.gain.value = 0;
  const rmMud = ctx.createBiquadFilter();
  rmMud.type = "peaking";
  rmMud.frequency.value = 240;
  rmMud.Q.value = 0.9;
  rmMud.gain.value = 0;
  const rmPresence = ctx.createBiquadFilter();
  rmPresence.type = "peaking";
  rmPresence.frequency.value = 3200;
  rmPresence.Q.value = 0.85;
  rmPresence.gain.value = 0;
  const rmAir = ctx.createBiquadFilter();
  rmAir.type = "highshelf";
  rmAir.frequency.value = 10000;
  rmAir.gain.value = 0;
  const rmDrive = ctx.createWaveShaper();
  rmDrive.oversample = "2x";
  rmDrive.curve = driveCurve(0);
  const rmComp = ctx.createDynamicsCompressor();
  rmComp.threshold.value = 0;
  rmComp.knee.value = 0;
  rmComp.ratio.value = 1;
  rmComp.attack.value = 0.008;
  rmComp.release.value = 0.12;
  const rmMakeup = ctx.createGain();
  rmMakeup.gain.value = 1;
  const rmLimit = ctx.createDynamicsCompressor();
  rmLimit.threshold.value = 0;
  rmLimit.knee.value = 0;
  rmLimit.ratio.value = 1;
  rmLimit.attack.value = 0.002;
  rmLimit.release.value = 0.05;
  const spatial = createSpatial(ctx);
  const monoSplit = ctx.createChannelSplitter(2);
  const monoL = ctx.createGain();
  const monoR = ctx.createGain();

  engine = {
    audio,
    bgAudio,
    ctx,
    source,
    splitter,
    midL,
    midR,
    sideL,
    invert,
    isoIn,
    isoHp,
    isoPeak,
    isoLp,
    isoOut,
    preamp,
    filters,
    gain,
    panner,
    analyser,
    isolateMode: "mix",
    spatial,
    apple,
    graphActive: !apple,
    bassShelf,
    rmHp,
    rmBody,
    rmMud,
    rmPresence,
    rmAir,
    rmDrive,
    rmComp,
    rmMakeup,
    rmLimit,
    remaster: "off",
    remasterAmt: 0.7,
    mono: false,
    monoSplit,
    monoL,
    monoR,
  };
  wire(engine);
  applyOutputGain();
  return engine;
}

export async function resumeEngine() {
  setAudioSessionPlayback();
  const eng = getEngine();
  if (eng.ctx.state === "suspended") await eng.ctx.resume();
  const out = outputAudio();
  if (!out.paused) void out.play().catch(() => {});
}

export function outputAudio() {
  const eng = getEngine();
  return eng.graphActive || !eng.bgAudio ? eng.audio : eng.bgAudio;
}

export function pauseOutput() {
  const eng = getEngine();
  eng.audio.pause();
  eng.bgAudio?.pause();
}

export function seekOutput(time: number) {
  const eng = getEngine();
  for (const el of [eng.audio, eng.bgAudio]) {
    if (!el) continue;
    try {
      el.currentTime = time;
    } catch {
      /* not ready */
    }
  }
}

function copyPlayback(from: HTMLAudioElement, to: HTMLAudioElement, play: boolean) {
  prepareAudioElement(to);
  const src = from.currentSrc || from.src;
  if (src && to.src !== src) {
    to.src = src;
    to.load();
  }
  to.playbackRate = from.playbackRate;
  try {
    if (Number.isFinite(from.currentTime)) to.currentTime = from.currentTime;
  } catch {
    /* not ready */
  }
  if (play) return to.play();
  to.pause();
  return Promise.resolve();
}

export function setBackgroundOutput(on: boolean) {
  const eng = getEngine();
  setAudioSessionPlayback();
  if (eng.apple) {
    eng.graphActive = false;
    applyOutputGain();
    const out = outputAudio();
    if (out.paused && !out.ended) void out.play().catch(() => {});
    return;
  }
  if (!eng.bgAudio) return;

  if (!on) {
    void eng.ctx.resume();
    const out = outputAudio();
    if (!out.paused && !out.ended) return;
    eng.graphActive = true;
    applyOutputGain();
    return;
  }

  const playing = !outputAudio().paused && !outputAudio().ended;
  if (!playing) return;
  void eng.ctx.resume();

  const baked = currentBakeUrl();
  if (baked) {
    playBaked(eng, baked);
    return;
  }

  if (!eng.graphActive) {
    void eng.bgAudio.play().catch(() => {});
    return;
  }
  const from = eng.audio;
  eng.graphActive = false;
  applyOutputGain();
  void copyPlayback(from, eng.bgAudio, true);
}

function playBaked(eng: Engine, url: string) {
  if (!eng.bgAudio) return;
  const t = eng.audio.currentTime;
  const rate = eng.audio.playbackRate;
  prepareAudioElement(eng.bgAudio);
  if (eng.bgAudio.src !== url) {
    eng.bgAudio.src = url;
    eng.bgAudio.load();
  }
  eng.bgAudio.playbackRate = rate;
  try {
    eng.bgAudio.currentTime = t;
  } catch {
    /* not ready */
  }
  eng.graphActive = false;
  applyOutputGain();
  eng.audio.pause();
  void eng.bgAudio.play().catch(() => {
    eng.graphActive = true;
    applyOutputGain();
    void eng.audio.play().catch(() => {});
  });
}

function prepareAudioElement(audio: HTMLAudioElement) {
  audio.preload = "auto";
  audio.autoplay = false;
  audio.controls = false;
  audio.muted = false;
  (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.setAttribute("x-webkit-airplay", "allow");
  audio.preservesPitch = true;
  (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
  audio.removeAttribute("crossorigin");
  audio.style.position = "fixed";
  audio.style.left = "0";
  audio.style.bottom = "0";
  audio.style.width = "2px";
  audio.style.height = "2px";
  audio.style.opacity = "0.02";
  audio.style.pointerEvents = "none";
  audio.setAttribute("aria-hidden", "true");
  if (typeof document !== "undefined" && document.body && !audio.isConnected) {
    document.body.appendChild(audio);
  }
}

export function unlockEngine() {
  setAudioSessionPlayback();
  const eng = getEngine();
  prepareAudioElement(eng.audio);
  if (eng.bgAudio) prepareAudioElement(eng.bgAudio);
  if (eng.ctx.state === "suspended") void eng.ctx.resume();
}

const SILENCE =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export function primePlayback() {
  setAudioSessionPlayback();
  const eng = getEngine();
  prepareAudioElement(eng.audio);
  if (eng.bgAudio) prepareAudioElement(eng.bgAudio);
  if (eng.ctx.state === "suspended") void eng.ctx.resume();
  const out = outputAudio();
  if (!out.src) out.src = SILENCE;
  out.muted = false;
  return out.play().catch(() => undefined);
}

function ensureBgAudio(eng: Engine) {
  if (eng.bgAudio) return eng.bgAudio;
  const el = new Audio();
  prepareAudioElement(el);
  eng.bgAudio = el;
  return el;
}

function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function archiveFallbacks(url: string) {
  const urls = [url];
  const items = url.match(/\/items\/([^/]+)\/(.+)$/i);
  const dl = url.match(/archive\.org\/(?:download|cors)\/([^/]+)\/(.+)$/i);
  const id = items?.[1] || dl?.[1];
  const file = items?.[2] || dl?.[2];
  if (url.includes("/download/")) urls.push(url.replace("/download/", "/cors/"));
  if (id && file) {
    urls.push(`https://archive.org/download/${id}/${file}`);
    urls.push(`https://archive.org/cors/${id}/${file}`);
  }
  return [...new Set(urls)];
}

function playEl(el: HTMLAudioElement, src: string, at: number) {
  const seek = () => {
    try {
      if (Number.isFinite(at) && Math.abs((el.currentTime || 0) - at) > 0.2) el.currentTime = at;
    } catch {
      /* not ready */
    }
  };
  if (el.src !== src) el.src = src;
  el.muted = false;
  seek();
  el.addEventListener("loadedmetadata", seek, { once: true });
  el.addEventListener("canplay", seek, { once: true });
  return new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error("audio"));
    el.addEventListener("error", fail, { once: true });
    void el
      .play()
      .then(() => {
        el.removeEventListener("error", fail);
        resolve();
      })
      .catch(fail);
  });
}

export function beginPlayback(url: string, at = 0) {
  setAudioSessionPlayback();
  const eng = getEngine();
  prepareAudioElement(eng.audio);
  if (eng.bgAudio) prepareAudioElement(eng.bgAudio);
  if (eng.ctx.state === "suspended") void eng.ctx.resume();

  const seek = (el: HTMLAudioElement) => {
    try {
      if (Number.isFinite(at) && Math.abs((el.currentTime || 0) - at) > 0.2) el.currentTime = at;
    } catch {
      /* not ready */
    }
  };

  if (eng.apple || isRemoteUrl(url)) {
    const raw = ensureBgAudio(eng);
    eng.graphActive = false;
    applyOutputGain();
    const urls = isRemoteUrl(url) ? archiveFallbacks(url) : [url];
    return (async () => {
      let last: Error | null = null;
      for (const src of urls) {
        try {
          await playEl(raw, src, at);
          return;
        } catch (err) {
          last = err instanceof Error ? err : new Error("stream");
        }
      }
      throw last || new Error("stream");
    })();
  }

  const out = outputAudio();
  if (eng.bgAudio && eng.bgAudio !== out && eng.bgAudio.src !== url) eng.bgAudio.src = url;
  if (eng.audio !== out && eng.audio.src !== url) eng.audio.src = url;
  if (out.src !== url) out.src = url;
  out.muted = false;
  seek(out);
  out.addEventListener("loadedmetadata", () => seek(out), { once: true });
  out.addEventListener("canplay", () => seek(out), { once: true });
  return out.play();
}

export function applyEq(gains: EqGains) {
  const { filters } = getEngine();
  const n = Math.min(filters.length, gains.length);
  lastGains = gains.slice();
  for (let i = 0; i < n; i++) {
    filters[i].gain.value = gains[i];
  }
  scheduleEqBake();
}

export function applyPreamp(db: number) {
  lastPreamp = db;
  getEngine().preamp.gain.value = dbToGain(db);
  scheduleEqBake();
}

export function setBassLock(db: number) {
  bassLockDb = db;
  getEngine().bassShelf.gain.value = db;
  scheduleEqBake();
}

let lastGains: EqGains = EQ_BANDS.map(() => 0);
let lastPreamp = 0;
let bassLockDb = 0;
let lastRemaster: RemasterPreset = "off";
let lastRemasterAmt = 0.7;
let bakeJob = 0;
let baked: { src: string; sig: string; url: string } | null = null;

function eqSignature() {
  return `${lastGains.map((g) => g.toFixed(1)).join(",")}|${lastPreamp}|${bassLockDb}|${lastRemaster}|${lastRemasterAmt.toFixed(2)}`;
}

function eqIsActive() {
  return (
    lastRemaster !== "off" ||
    Math.abs(lastPreamp) > 0.05 ||
    Math.abs(bassLockDb) > 0.05 ||
    lastGains.some((g) => Math.abs(g) > 0.05)
  );
}

function currentBakeUrl() {
  if (!engine || !baked) return null;
  const src = engine.audio.currentSrc || engine.audio.src;
  if (baked.src !== src) return null;
  if (baked.sig !== eqSignature()) return null;
  return baked.url;
}

export function scheduleEqBake() {
  if (typeof window === "undefined") return;
  if (!isAppleMobile()) return;
  const eng = getEngine();
  const src = eng.audio.currentSrc || eng.audio.src;
  if (!src || (!src.startsWith("blob:") && !src.startsWith("http"))) return;
  if (!eqIsActive()) return;
  if (baked?.src === src && baked.sig === eqSignature()) return;
  const job = ++bakeJob;
  void bakeEqWav(src, lastGains.slice(), lastPreamp, bassLockDb, lastRemaster, lastRemasterAmt)
    .then((url) => {
      if (job !== bakeJob) {
        URL.revokeObjectURL(url);
        return;
      }
      if (baked) URL.revokeObjectURL(baked.url);
      baked = { src, sig: eqSignature(), url };
    })
    .catch(() => {
      /* decode/CORS */
    });
}

async function bakeEqWav(url: string, gains: EqGains, preamp: number, bass: number, remaster: RemasterPreset, remasterAmt: number) {
  const res = await fetch(url);
  const raw = await res.arrayBuffer();
  const probe = new AudioContext();
  const decoded = await probe.decodeAudioData(raw.slice(0));
  void probe.close();
  const channels = Math.min(2, Math.max(1, decoded.numberOfChannels));
  const rate = decoded.sampleRate >= 44100 ? 44100 : decoded.sampleRate;
  const duration = Math.min(decoded.duration, 12 * 60);
  const length = Math.max(rate, Math.ceil(duration * rate));
  const offline = new OfflineAudioContext({
    numberOfChannels: channels,
    length,
    sampleRate: rate,
  });
  const src = offline.createBufferSource();
  src.buffer = decoded;
  const pre = offline.createGain();
  pre.gain.value = dbToGain(preamp);
  const shelf = offline.createBiquadFilter();
  shelf.type = "lowshelf";
  shelf.frequency.value = 90;
  shelf.gain.value = bass;
  src.connect(pre);
  pre.connect(shelf);
  let node: AudioNode = shelf;
  for (let i = 0; i < Math.min(gains.length, EQ_BANDS.length); i++) {
    if (Math.abs(gains[i]) < 0.05) continue;
    const filter = offline.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = EQ_BANDS[i].freq;
    filter.Q.value = EQ_Q;
    filter.gain.value = gains[i];
    node.connect(filter);
    node = filter;
  }
  const dummy = {
    rmHp: offline.createBiquadFilter(),
    rmBody: offline.createBiquadFilter(),
    rmMud: offline.createBiquadFilter(),
    rmPresence: offline.createBiquadFilter(),
    rmAir: offline.createBiquadFilter(),
    rmDrive: offline.createWaveShaper(),
    rmComp: offline.createDynamicsCompressor(),
    rmMakeup: offline.createGain(),
    rmLimit: offline.createDynamicsCompressor(),
    remaster,
    remasterAmt,
  } as unknown as Engine;
  dummy.rmHp.type = "highpass";
  dummy.rmHp.Q.value = 0.7;
  dummy.rmBody.type = "lowshelf";
  dummy.rmBody.frequency.value = 110;
  dummy.rmMud.type = "peaking";
  dummy.rmMud.frequency.value = 240;
  dummy.rmMud.Q.value = 0.9;
  dummy.rmPresence.type = "peaking";
  dummy.rmPresence.frequency.value = 3200;
  dummy.rmPresence.Q.value = 0.85;
  dummy.rmAir.type = "highshelf";
  dummy.rmAir.frequency.value = 10000;
  dummy.rmDrive.oversample = "2x";
  dummy.rmComp.attack.value = 0.008;
  dummy.rmComp.release.value = 0.12;
  dummy.rmLimit.attack.value = 0.002;
  dummy.rmLimit.release.value = 0.05;
  applyRemasterShape(dummy, remaster, remasterAmt);
  node.connect(dummy.rmHp);
  dummy.rmHp.connect(dummy.rmBody);
  dummy.rmBody.connect(dummy.rmMud);
  dummy.rmMud.connect(dummy.rmPresence);
  dummy.rmPresence.connect(dummy.rmAir);
  dummy.rmAir.connect(dummy.rmDrive);
  dummy.rmDrive.connect(dummy.rmComp);
  dummy.rmComp.connect(dummy.rmMakeup);
  dummy.rmMakeup.connect(dummy.rmLimit);
  dummy.rmLimit.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return URL.createObjectURL(encodeWavBuffer(rendered));
}

let masterGain = 1;
let fadeMul = 1;
let normalizeMul = 1;
let replayMul = 1;

function applyOutputGain() {
  if (!engine) return;
  const level = Math.max(0, Math.min(1, masterGain * fadeMul * normalizeMul * replayMul));
  if (engine.apple) {
    engine.gain.gain.value = 0;
    engine.audio.muted = true;
    engine.audio.volume = 0;
    if (engine.bgAudio) {
      engine.bgAudio.muted = false;
      engine.bgAudio.volume = level;
    }
    return;
  }
  engine.audio.volume = 1;
  engine.audio.muted = false;
  engine.gain.gain.value = engine.graphActive ? level : 0;
  if (engine.bgAudio) {
    engine.bgAudio.volume = engine.graphActive ? 0 : level;
    engine.bgAudio.muted = engine.graphActive || level === 0;
  }
}

export function setMasterGain(value: number) {
  masterGain = value;
  applyOutputGain();
}

export function setFadeMul(value: number) {
  fadeMul = value;
  applyOutputGain();
}

export function getFadeMul() {
  return fadeMul;
}

export function setNormalizeMul(value: number) {
  normalizeMul = value;
  applyOutputGain();
}

export function setReplayGainDb(db: number) {
  replayMul = dbToGain(Math.max(-12, Math.min(12, db)));
  applyOutputGain();
}

export function setBalance(value: number) {
  const pan = getEngine().panner.pan;
  if (pan) pan.value = Math.max(-1, Math.min(1, value));
}

export function setPlaybackRate(rate: number, pitch = 0) {
  const eng = getEngine();
  const factor = Math.max(0.25, Math.min(4, rate * Math.pow(2, pitch / 12)));
  const lock = pitch === 0;
  for (const el of [eng.audio, eng.bgAudio]) {
    if (!el) continue;
    el.playbackRate = factor;
    el.preservesPitch = lock;
    (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = lock;
  }
}

export function setIsolateMode(mode: IsolateMode) {
  const eng = getEngine();
  if (eng.isolateMode === mode) return;
  eng.isolateMode = mode;
  wire(eng);
}

export function setSpatialMode(preset: SpatialPreset, amount: number) {
  const eng = getEngine();
  applySpatialState(eng.spatial, preset, amount);
  wire(eng);
}

export function setMonoMode(on: boolean) {
  const eng = getEngine();
  if (eng.mono === on) return;
  eng.mono = on;
  wire(eng);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return encodeWavBuffer({
    numberOfChannels: 1,
    sampleRate,
    length: samples.length,
    getChannelData: () => samples,
  } as unknown as AudioBuffer);
}

export function encodeWavBuffer(audio: AudioBuffer): Blob {
  const channels = Math.max(1, audio.numberOfChannels);
  const rate = audio.sampleRate;
  const frames = audio.length;
  const buffer = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const chans = Array.from({ length: channels }, (_, i) => audio.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function makeDemoTone(): { blob: Blob; name: string } {
  const sampleRate = 44100;
  const seconds = 18;
  const n = sampleRate * seconds;
  const samples = new Float32Array(n);
  const freqs = [110, 164.81, 220, 329.63, 440, 659.25];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env =
      Math.min(1, t / 0.4) *
      Math.min(1, (seconds - t) / 1.6) *
      (0.72 + 0.28 * Math.sin(2 * Math.PI * 0.12 * t));
    let s = 0;
    for (let f = 0; f < freqs.length; f++) {
      const harmonic = Math.sin(2 * Math.PI * freqs[f] * t) / (f + 1.4);
      s += harmonic;
    }
    s += 0.08 * Math.sin(2 * Math.PI * 55 * t);
    samples[i] = (s / 3.2) * env * 0.55;
  }
  return { blob: encodeWav(samples, sampleRate), name: "Studio tone" };
}

let tapDest: MediaStreamAudioDestinationNode | null = null;

export function capturePlayStream(): MediaStream | null {
  if (typeof window === "undefined") return null;
  const eng = getEngine();
  if (!eng.graphActive) return null;
  if (!tapDest || tapDest.context !== eng.ctx) {
    tapDest = eng.ctx.createMediaStreamDestination();
    try {
      eng.analyser.connect(tapDest);
    } catch {
      return null;
    }
  }
  return tapDest.stream;
}