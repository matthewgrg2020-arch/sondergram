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


function seekEl(el: HTMLAudioElement, time: number) {
  if (!Number.isFinite(time) || time < 0) return;
  const apply = () => {
    try {
      if (Math.abs((el.currentTime || 0) - time) > 0.25) el.currentTime = time;
    } catch {
      /* not ready */
    }
  };
  apply();
  el.addEventListener("loadedmetadata", apply, { once: true });
  el.addEventListener("canplay", apply, { once: true });
}

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
		const session = navigator.audioSession;
		if (session) session.type = "playback";
	} catch {
/* unsupported */
}
}
function dbToGain(db) {
	return Math.pow(10, db / 20);
}
function driveCurve(amount) {
	const n = 257;
	const curve = new Float32Array(n);
	const k = Math.max(0, amount) * 3.2;
	for (let i = 0; i < n; i++) {
		const x = i / 256 * 2 - 1;
		curve[i] = k < .01 ? x : Math.tanh(x * (1 + k));
	}
	return curve;
}
const REMASTER: Record<RemasterPreset, RemasterShape> = {
	off: {
		hp: 20,
		body: 0,
		mud: 0,
		presence: 0,
		air: 0,
		drive: 0,
		compress: 0,
		makeup: 0
	},
	clean: {
		hp: 38,
		body: 1.1,
		mud: -2.4,
		presence: 3.4,
		air: 2.8,
		drive: .06,
		compress: .38,
		makeup: 1.6
	},
	full: {
		hp: 28,
		body: 3.4,
		mud: -1.5,
		presence: 2.5,
		air: 2,
		drive: .16,
		compress: .42,
		makeup: 1.3
	},
	vinyl: {
		hp: 32,
		body: 2.6,
		mud: -.9,
		presence: 1.8,
		air: 2.4,
		drive: .24,
		compress: .28,
		makeup: .9
	},
	loud: {
		hp: 30,
		body: 2.2,
		mud: -2,
		presence: 3.8,
		air: 3,
		drive: .12,
		compress: .58,
		makeup: 2.4
	}
};
function applyRemasterShape(eng, preset, amount) {
	const mix = preset === "off" ? 0 : Math.max(0, Math.min(1, amount));
	const shape = REMASTER[preset];
	eng.rmHp.frequency.value = 20 + (shape.hp - 20) * mix;
	eng.rmBody.gain.value = shape.body * mix;
	eng.rmMud.gain.value = shape.mud * mix;
	eng.rmPresence.gain.value = shape.presence * mix;
	eng.rmAir.gain.value = shape.air * mix;
	eng.rmDrive.curve = driveCurve(shape.drive * mix);
	eng.rmComp.threshold.value = mix > .01 ? -12 - shape.compress * 16 * mix : 0;
	eng.rmComp.knee.value = mix > .01 ? 8 : 0;
	eng.rmComp.ratio.value = mix > .01 ? 1 + shape.compress * 3 * mix : 1;
	eng.rmMakeup.gain.value = dbToGain(shape.makeup * mix);
	eng.rmLimit.threshold.value = mix > .01 ? -1.2 : 0;
	eng.rmLimit.knee.value = mix > .01 ? 2 : 0;
	eng.rmLimit.ratio.value = mix > .01 ? 12 : 1;
}
export function setRemaster(preset, amount = .7) {
	const eng = getEngine();
	eng.remaster = preset;
	eng.remasterAmt = amount;
	lastRemaster = preset;
	lastRemasterAmt = amount;
	applyRemasterShape(eng, preset, amount);
	scheduleEqBake();
	promoteToGraph();
}
function makeFilters(ctx) {
	return EQ_BANDS.map((band) => {
		const filter = ctx.createBiquadFilter();
		filter.type = "peaking";
		filter.frequency.value = band.freq;
		filter.Q.value = EQ_Q;
		filter.gain.value = 0;
		return filter;
	});
}
function safeDisconnect(node) {
	try {
		node.disconnect();
	} catch {
/* unsupported */
}
}
function configureIsolate(eng) {
	const mode = eng.isolateMode;
	eng.isoHp.type = "highpass";
	eng.isoPeak.type = "peaking";
	eng.isoLp.type = "lowpass";
	eng.isoPeak.gain.value = 0;
	eng.isoHp.Q.value = .7;
	eng.isoLp.Q.value = .7;
	eng.isoPeak.Q.value = 1;
	if (mode === "vocals") {
		eng.splitter.connect(eng.midL, 0);
		eng.splitter.connect(eng.midR, 1);
		eng.midL.gain.value = .75;
		eng.midR.gain.value = .75;
		eng.midL.connect(eng.isoIn);
		eng.midR.connect(eng.isoIn);
		eng.isoHp.frequency.value = 180;
		eng.isoPeak.frequency.value = 3e3;
		eng.isoPeak.Q.value = .9;
		eng.isoPeak.gain.value = 6;
		eng.isoLp.frequency.value = 9e3;
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
		eng.isoLp.frequency.value = 14e3;
		eng.isoOut.gain.value = 1.85;
	} else if (mode === "drums") {
		eng.splitter.connect(eng.sideL, 0);
		eng.splitter.connect(eng.invert, 1);
		eng.splitter.connect(eng.midL, 0);
		eng.splitter.connect(eng.midR, 1);
		eng.sideL.gain.value = .9;
		eng.invert.gain.value = -.9;
		eng.midL.gain.value = .25;
		eng.midR.gain.value = .25;
		eng.sideL.connect(eng.isoIn);
		eng.invert.connect(eng.isoIn);
		eng.midL.connect(eng.isoIn);
		eng.midR.connect(eng.isoIn);
		eng.isoHp.frequency.value = 180;
		eng.isoPeak.frequency.value = 4500;
		eng.isoPeak.Q.value = 1.1;
		eng.isoPeak.gain.value = 7;
		eng.isoLp.frequency.value = 1e4;
		eng.isoOut.gain.value = 1.7;
	} else if (mode === "bass") {
		eng.splitter.connect(eng.midL, 0);
		eng.splitter.connect(eng.midR, 1);
		eng.midL.gain.value = .8;
		eng.midR.gain.value = .8;
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
function wire(eng) {
	const nodes = [
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
		...spatialNodes(eng.spatial)
	];
	for (const node of nodes) safeDisconnect(node);
	disconnectSpatial(eng.spatial);
	let head = eng.source;
	if (eng.isolateMode !== "mix") {
		eng.source.connect(eng.splitter);
		configureIsolate(eng);
		head = eng.isoOut;
	}
	head.connect(eng.preamp);
	let node = eng.preamp;
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
		eng.monoL.gain.value = .5;
		eng.monoR.gain.value = .5;
		eng.monoSplit.connect(eng.monoL, 0);
		eng.monoSplit.connect(eng.monoR, 1);
		eng.monoL.connect(eng.analyser);
		eng.monoR.connect(eng.analyser);
	} else eng.panner.connect(eng.analyser);
	eng.analyser.connect(eng.ctx.destination);
}
export function getEngine(): Engine {
	if (engine) {
		if (engine.filters.length !== BAND_COUNT) {
			engine.filters = makeFilters(engine.ctx);
			wire(engine);
		}
		watchContext(engine.ctx);
		return engine;
	}
	setAudioSessionPlayback();
	const apple = isAppleMobile();
	const audio = new Audio();
	prepareAudioElement(audio, true);
	const bgAudio = new Audio();
	prepareAudioElement(bgAudio, false);
	const Ctx = window.AudioContext || window.webkitAudioContext;
	let ctx;
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
	const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = .82;
	const filters = makeFilters(ctx);
	const bassShelf = ctx.createBiquadFilter();
	bassShelf.type = "lowshelf";
	bassShelf.frequency.value = 90;
	bassShelf.gain.value = 0;
	const rmHp = ctx.createBiquadFilter();
	rmHp.type = "highpass";
	rmHp.frequency.value = 20;
	rmHp.Q.value = .7;
	const rmBody = ctx.createBiquadFilter();
	rmBody.type = "lowshelf";
	rmBody.frequency.value = 110;
	rmBody.gain.value = 0;
	const rmMud = ctx.createBiquadFilter();
	rmMud.type = "peaking";
	rmMud.frequency.value = 240;
	rmMud.Q.value = .9;
	rmMud.gain.value = 0;
	const rmPresence = ctx.createBiquadFilter();
	rmPresence.type = "peaking";
	rmPresence.frequency.value = 3200;
	rmPresence.Q.value = .85;
	rmPresence.gain.value = 0;
	const rmAir = ctx.createBiquadFilter();
	rmAir.type = "highshelf";
	rmAir.frequency.value = 1e4;
	rmAir.gain.value = 0;
	const rmDrive = ctx.createWaveShaper();
	rmDrive.oversample = "2x";
	rmDrive.curve = driveCurve(0);
	const rmComp = ctx.createDynamicsCompressor();
	rmComp.threshold.value = 0;
	rmComp.knee.value = 0;
	rmComp.ratio.value = 1;
	rmComp.attack.value = .008;
	rmComp.release.value = .12;
	const rmMakeup = ctx.createGain();
	rmMakeup.gain.value = 1;
	const rmLimit = ctx.createDynamicsCompressor();
	rmLimit.threshold.value = 0;
	rmLimit.knee.value = 0;
	rmLimit.ratio.value = 1;
	rmLimit.attack.value = .002;
	rmLimit.release.value = .05;
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
		graphActive: true,
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
		remasterAmt: .7,
		mono: false,
		monoSplit,
		monoL,
		monoR
	};
	wire(engine);
	applyOutputGain();
	watchContext(ctx);
	return engine;
}
export async function resumeEngine() {
	setAudioSessionPlayback();
	const eng = getEngine();
	if (eng.ctx.state === "suspended") await eng.ctx.resume();
	const out = outputAudio();
	if (!out.paused) out.play().catch(() => {});
}
export function outputAudio() {
	const eng = getEngine();
	return eng.graphActive || !eng.bgAudio ? eng.audio : eng.bgAudio;
}
let playGen = 0;
let lastPlayUrl = "";
let ctxWatched = false;
function silenceAll() {
	if (!engine) return;
	engine.audio.pause();
	if (engine.bgAudio) {
		engine.bgAudio.pause();
		engine.bgAudio.muted = true;
		engine.bgAudio.volume = 0;
	}
}
export function pauseOutput() {
	playGen += 1;
	silenceAll();
}
export function seekOutput(time) {
	const eng = getEngine();
	for (const el of [eng.audio, eng.bgAudio]) {
		if (!el) continue;
		try {
			el.currentTime = time;
		} catch {
/* unsupported */
}
	}
}
function nativeSrc(eng) {
	const baked = currentBakeUrl();
	if (baked) return baked;
	const live = (eng.audio.currentSrc || eng.audio.src || "").trim();
	if (live && !live.startsWith("data:")) return live;
	return (lastPlayUrl || "").trim();
}
function onContextState() {
	if (!engine) return;
	const state = engine.ctx.state;
	if (state !== "interrupted" && state !== "suspended") return;
	if (!engine.apple || !engine.graphActive) return;
	if (typeof document === "undefined" || document.visibilityState !== "hidden") return;
	if (engine.audio.paused) return;
	if (dspActive()) {
		engine.ctx.resume().catch(() => {});
		return;
	}
	setBackgroundOutput(true);
}
function watchContext(ctx) {
	if (ctxWatched) return;
	ctxWatched = true;
	ctx.addEventListener("statechange", onContextState);
}
export function setBackgroundOutput(on) {
	const eng = getEngine();
	setAudioSessionPlayback();
	if (!eng.apple || !eng.bgAudio) {
		if (!on) eng.ctx.resume();
		return;
	}
	if (!on) {
		eng.ctx.resume();
		const t = Number.isFinite(eng.bgAudio.currentTime) ? eng.bgAudio.currentTime : eng.audio.currentTime;
		const raw = (eng.audio.currentSrc || eng.audio.src || lastPlayUrl || "").trim();
		if (!raw || raw.startsWith("data:")) return;
		eng.graphActive = true;
		applyOutputGain();
		const graphSrc = isGraphableSrc(raw) ? raw : isRemoteUrl(raw) ? proxyStreamUrl(raw) : raw;
		if (eng.audio.src !== graphSrc && eng.audio.currentSrc !== graphSrc) eng.audio.src = graphSrc;
		seekEl(eng.audio, t);
		eng.audio.muted = false;
		eng.audio.play().catch(() => {});
		eng.bgAudio.muted = true;
		eng.bgAudio.volume = 0;
		return;
	}
	const out = outputAudio();
	if (!(!out.paused && !out.ended && out.currentTime >= 0)) return;
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
	const baked = currentBakeUrl();
	if (baked) {
		playBaked(eng, baked);
		return;
	}
	const src = nativeSrc(eng);
	if (!src) return;
	prepareAudioElement(eng.bgAudio);
	if (!(eng.bgAudio.src === src || eng.bgAudio.currentSrc === src)) {
		eng.bgAudio.src = src;
		eng.bgAudio.load();
	}
	eng.bgAudio.playbackRate = eng.audio.playbackRate;
	const t = eng.graphActive ? eng.audio.currentTime : eng.bgAudio.currentTime;
	seekEl(eng.bgAudio, t);
	eng.graphActive = false;
	applyOutputGain();
	const run = eng.bgAudio.play();
	eng.audio.pause();
	run.catch(() => {
		eng.graphActive = true;
		applyOutputGain();
		eng.bgAudio?.pause();
		eng.audio.play().catch(() => {});
	});
}
function playBaked(eng, url) {
	if (!eng.bgAudio) return;
	const t = eng.audio.currentTime;
	const rate = eng.audio.playbackRate;
	prepareAudioElement(eng.bgAudio);
	if (eng.bgAudio.src !== url) {
		eng.bgAudio.src = url;
		eng.bgAudio.load();
	}
	eng.bgAudio.playbackRate = rate;
	seekEl(eng.bgAudio, t);
	eng.graphActive = false;
	applyOutputGain();
	eng.audio.pause();
	eng.bgAudio.play().catch(() => {
		eng.graphActive = true;
		applyOutputGain();
		eng.bgAudio?.pause();
		eng.audio.play().catch(() => {});
	});
}
function prepareAudioElement(audio, cors = false) {
	audio.preload = "auto";
	audio.autoplay = false;
	audio.controls = false;
	audio.muted = false;
	audio.playsInline = true;
	audio.setAttribute("playsinline", "true");
	audio.setAttribute("webkit-playsinline", "true");
	audio.setAttribute("x-webkit-airplay", "allow");
	audio.preservesPitch = true;
	audio.webkitPreservesPitch = true;
	audio.disableRemotePlayback = false;
	if (cors) audio.crossOrigin = "anonymous";
	else audio.removeAttribute("crossorigin");
	audio.style.position = "fixed";
	audio.style.left = "0";
	audio.style.bottom = "0";
	audio.style.width = "2px";
	audio.style.height = "2px";
	audio.style.opacity = "0.02";
	audio.style.pointerEvents = "none";
	audio.setAttribute("aria-hidden", "true");
	if (typeof document !== "undefined" && document.body && !audio.isConnected) document.body.appendChild(audio);
}
export function unlockEngine() {
	setAudioSessionPlayback();
	const eng = getEngine();
	prepareAudioElement(eng.audio, true);
	if (eng.bgAudio) prepareAudioElement(eng.bgAudio, false);
	if (eng.ctx.state === "suspended") eng.ctx.resume();
}
let SILENCE = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
export function primePlayback() {
	setAudioSessionPlayback();
	const eng = getEngine();
	prepareAudioElement(eng.audio, true);
	if (eng.bgAudio) prepareAudioElement(eng.bgAudio, false);
	if (eng.ctx.state === "suspended") eng.ctx.resume();
}
function ensureBgAudio(eng) {
	if (eng.bgAudio) return eng.bgAudio;
	const el = new Audio();
	prepareAudioElement(el, false);
	eng.bgAudio = el;
	return el;
}
function isRemoteUrl(url) {
	return /^https?:\/\//i.test(url);
}
function isProxySrc(url) {
	return /\/api\/stream(?:\?|$)/.test(url);
}
export function proxyStreamUrl(url) {
	if (!url || url.startsWith("blob:") || url.startsWith("data:") || isProxySrc(url)) return url;
	if (!isRemoteUrl(url)) return url;
	return `/api/stream?u=${encodeURIComponent(url)}`;
}
function isGraphableSrc(url) {
	return url.startsWith("blob:") || url.startsWith("data:") || isProxySrc(url) || /\/api\/soulseek(?:\?|$)/.test(url) || url.startsWith("/") && !url.startsWith("//");
}
function archiveFallbacks(url) {
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
function playEl(el, src, at, cors = false, gen = playGen) {
	const seek = () => {
		try {
			if (Number.isFinite(at) && Math.abs((el.currentTime || 0) - at) > .2) el.currentTime = at;
		} catch {
/* unsupported */
}
	};
	prepareAudioElement(el, cors);
	if (!(el.src === src || el.currentSrc === src)) el.src = src;
	else if (el.ended || el.error) el.load();
	el.muted = false;
	el.volume = 1;
	seek();
	el.addEventListener("loadedmetadata", seek, { once: true });
	el.addEventListener("canplay", seek, { once: true });
	return new Promise((resolve, reject) => {
		if (gen !== playGen) {
			el.pause();
			resolve();
			return;
		}
		const fail = () => reject(/* @__PURE__ */ new Error("audio"));
		el.addEventListener("error", fail, { once: true });
		el.play().then(() => {
			el.removeEventListener("error", fail);
			if (gen !== playGen) el.pause();
			resolve();
		}).catch(fail);
	});
}
export async function beginPlayback(url, at = 0) {
	const gen = ++playGen;
	lastPlayUrl = url;
	setAudioSessionPlayback();
	const eng = getEngine();
	prepareAudioElement(eng.audio, true);
	const bg = ensureBgAudio(eng);
	prepareAudioElement(bg, false);
	silenceAll();
	bg.pause();
	bg.muted = true;
	bg.volume = 0;
	if (bg.src && !bg.src.startsWith("data:")) bg.src = SILENCE;
	eng.ctx.resume().catch(() => {});
	if (gen !== playGen) return;
	const blob = url.startsWith("blob:") || url.startsWith("data:");
	const hiddenApple = Boolean(eng.apple && typeof document !== "undefined" && document.visibilityState === "hidden");
	const graphSrc = blob ? url : proxyStreamUrl(url);
	if (!hiddenApple) {
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
			scheduleEqBake();
			return;
		} catch {
			try {
				await playEl(eng.audio, blob ? url : graphSrc, at, true, gen);
				if (gen !== playGen) {
					silenceAll();
					return;
				}
				scheduleEqBake();
				return;
			} catch {
				if (dspActive() && !hiddenApple) try {
					await playEl(eng.audio, url, at, true, gen);
					if (gen !== playGen) {
						silenceAll();
						return;
					}
					scheduleEqBake();
					return;
				} catch {
					throw new Error("stream");
				}
			}
		}
	}
	if (gen !== playGen) {
		silenceAll();
		return;
	}
	eng.audio.pause();
	eng.graphActive = false;
	applyOutputGain();
	const urls = isRemoteUrl(url) ? [
		graphSrc,
		url,
		...archiveFallbacks(url)
	] : [graphSrc, url];
	let last = null;
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
			last = err instanceof Error ? err : /* @__PURE__ */ new Error("stream");
		}
	}
	throw last || /* @__PURE__ */ new Error("stream");
}
function promoteToGraph() {
	const eng = getEngine();
	if (eng.graphActive) return;
	if (eng.apple && typeof document !== "undefined" && document.visibilityState === "hidden") return;
	const from = outputAudio();
	const raw = from.currentSrc || from.src;
	if (!raw || raw.startsWith("data:")) return;
	const t = from.currentTime || 0;
	const src = isGraphableSrc(raw) ? raw : isRemoteUrl(raw) ? proxyStreamUrl(raw) : raw;
	const gen = playGen;
	(async () => {
		try {
			if (eng.ctx.state !== "running") await eng.ctx.resume();
			if (gen !== playGen) return;
			eng.graphActive = true;
			applyOutputGain();
			await playEl(eng.audio, src, t, true, gen);
			if (gen !== playGen) {
				silenceAll();
				return;
			}
			scheduleEqBake();
		} catch {
			eng.graphActive = false;
			applyOutputGain();
		}
	})();
}
function dspActive() {
	if (eqIsActive()) return true;
	if (!engine) return false;
	return engine.spatial.preset !== "off" || engine.isolateMode !== "mix";
}
export function applyEq(gains) {
	const { filters } = getEngine();
	const n = Math.min(filters.length, gains.length);
	lastGains = gains.slice();
	for (let i = 0; i < n; i++) filters[i].gain.value = gains[i];
	scheduleEqBake();
	promoteToGraph();
}
export function applyPreamp(db) {
	lastPreamp = db;
	getEngine().preamp.gain.value = dbToGain(db);
	scheduleEqBake();
	promoteToGraph();
}
export function setBassLock(db) {
	bassLockDb = db;
	getEngine().bassShelf.gain.value = db;
	scheduleEqBake();
	promoteToGraph();
}
let lastGains = EQ_BANDS.map(() => 0);
let lastPreamp = 0;
let bassLockDb = 0;
let lastRemaster = "off";
let lastRemasterAmt = .7;
let bakeJob = 0;
let baked = null;
function eqSignature() {
	return `${lastGains.map((g) => g.toFixed(1)).join(",")}|${lastPreamp}|${bassLockDb}|${lastRemaster}|${lastRemasterAmt.toFixed(2)}`;
}
function eqIsActive() {
	return lastRemaster !== "off" || Math.abs(lastPreamp) > .05 || Math.abs(bassLockDb) > .05 || lastGains.some((g) => Math.abs(g) > .05);
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
	if (!src || !src.startsWith("blob:") && !src.startsWith("http")) return;
	if (!eqIsActive()) return;
	if (baked?.src === src && baked.sig === eqSignature()) return;
	const job = ++bakeJob;
	bakeEqWav(src, lastGains.slice(), lastPreamp, bassLockDb, lastRemaster, lastRemasterAmt).then((url) => {
		if (job !== bakeJob) {
			URL.revokeObjectURL(url);
			return;
		}
		if (baked) URL.revokeObjectURL(baked.url);
		baked = {
			src,
			sig: eqSignature(),
			url
		};
	}).catch(() => {});
}
async function bakeEqWav(url, gains, preamp, bass, remaster, remasterAmt) {
	const raw = await (await fetch(url)).arrayBuffer();
	const probe = new AudioContext();
	const decoded = await probe.decodeAudioData(raw.slice(0));
	probe.close();
	const channels = Math.min(2, Math.max(1, decoded.numberOfChannels));
	const rate = decoded.sampleRate >= 44100 ? 44100 : decoded.sampleRate;
	const duration = Math.min(decoded.duration, 720);
	const length = Math.max(rate, Math.ceil(duration * rate));
	const offline = new OfflineAudioContext({
		numberOfChannels: channels,
		length,
		sampleRate: rate
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
	let node = shelf;
	for (let i = 0; i < Math.min(gains.length, EQ_BANDS.length); i++) {
		if (Math.abs(gains[i]) < .05) continue;
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
		remasterAmt
	};
	dummy.rmHp.type = "highpass";
	dummy.rmHp.Q.value = .7;
	dummy.rmBody.type = "lowshelf";
	dummy.rmBody.frequency.value = 110;
	dummy.rmMud.type = "peaking";
	dummy.rmMud.frequency.value = 240;
	dummy.rmMud.Q.value = .9;
	dummy.rmPresence.type = "peaking";
	dummy.rmPresence.frequency.value = 3200;
	dummy.rmPresence.Q.value = .85;
	dummy.rmAir.type = "highshelf";
	dummy.rmAir.frequency.value = 1e4;
	dummy.rmDrive.oversample = "2x";
	dummy.rmComp.attack.value = .008;
	dummy.rmComp.release.value = .12;
	dummy.rmLimit.attack.value = .002;
	dummy.rmLimit.release.value = .05;
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
	if (engine.graphActive) {
		engine.audio.muted = false;
		engine.audio.volume = 1;
		engine.gain.gain.value = level;
		if (engine.bgAudio) {
			engine.bgAudio.muted = true;
			engine.bgAudio.volume = 0;
		}
		return;
	}
	engine.gain.gain.value = 0;
	engine.audio.muted = true;
	engine.audio.volume = 0;
	if (engine.bgAudio) {
		engine.bgAudio.muted = false;
		engine.bgAudio.volume = level;
	}
}
export function setMasterGain(value) {
	masterGain = value;
	applyOutputGain();
}
export function setFadeMul(value) {
	fadeMul = value;
	applyOutputGain();
}
export function setNormalizeMul(value) {
	normalizeMul = value;
	applyOutputGain();
}
export function setReplayGainDb(db) {
	replayMul = dbToGain(Math.max(-12, Math.min(12, db)));
	applyOutputGain();
}
export function setBalance(value) {
	const pan = getEngine().panner.pan;
	if (pan) pan.value = Math.max(-1, Math.min(1, value));
}
export function setPlaybackRate(rate, pitch = 0) {
	const eng = getEngine();
	const factor = Math.max(.25, Math.min(4, rate * Math.pow(2, pitch / 12)));
	const lock = pitch === 0;
	for (const el of [eng.audio, eng.bgAudio]) {
		if (!el) continue;
		el.playbackRate = factor;
		el.preservesPitch = lock;
		el.webkitPreservesPitch = lock;
	}
}
export function setIsolateMode(mode) {
	const eng = getEngine();
	if (eng.isolateMode === mode) return;
	eng.isolateMode = mode;
	wire(eng);
	promoteToGraph();
}
export function setSpatialMode(preset, amount) {
	const eng = getEngine();
	applySpatialState(eng.spatial, preset, amount);
	wire(eng);
	promoteToGraph();
}
export function setMonoMode(on) {
	const eng = getEngine();
	if (eng.mono === on) return;
	eng.mono = on;
	wire(eng);
}
export function encodeWav(samples, sampleRate) {
	return encodeWavBuffer({
		numberOfChannels: 1,
		sampleRate,
		length: samples.length,
		getChannelData: () => samples
	});
}
export function encodeWavBuffer(audio) {
	const channels = Math.max(1, audio.numberOfChannels);
	const rate = audio.sampleRate;
	const frames = audio.length;
	const buffer = /* @__PURE__ */ new ArrayBuffer(44 + frames * channels * 2);
	const view = new DataView(buffer);
	const writeStr = (offset, str) => {
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
	for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
		const s = Math.max(-1, Math.min(1, chans[c][i]));
		view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
		offset += 2;
	}
	return new Blob([buffer], { type: "audio/wav" });
}
export function makeDemoTone() {
	const sampleRate = 44100;
	const seconds = 18;
	const n = sampleRate * seconds;
	const samples = new Float32Array(n);
	const freqs = [
		110,
		164.81,
		220,
		329.63,
		440,
		659.25
	];
	for (let i = 0; i < n; i++) {
		const t = i / sampleRate;
		const env = Math.min(1, t / .4) * Math.min(1, (seconds - t) / 1.6) * (.72 + .28 * Math.sin(2 * Math.PI * .12 * t));
		let s = 0;
		for (let f = 0; f < freqs.length; f++) {
			const harmonic = Math.sin(2 * Math.PI * freqs[f] * t) / (f + 1.4);
			s += harmonic;
		}
		s += .08 * Math.sin(2 * Math.PI * 55 * t);
		samples[i] = s / 3.2 * env * .55;
	}
	return {
		blob: encodeWav(samples, sampleRate),
		name: "Studio tone"
	};
}
let tapDest = null;
export function capturePlayStream() {
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
