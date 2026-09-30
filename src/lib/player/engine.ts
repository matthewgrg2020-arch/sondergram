// TEMP: engine restored via engine-ios-patch
export function isAppleMobile() { return /iPad|iPhone|iPod/.test(navigator.userAgent||''); }
export function setAudioSessionPlayback() { try { const s = navigator.audioSession; if (s) s.type = 'playback'; } catch {} }
export function getEngine() { throw new Error('Engine loading...'); }
export async function resumeEngine() {}
export function outputAudio() { return new Audio(); }
export function pauseOutput() {}
export function seekOutput() {}
export function setBackgroundOutput() {}
export function unlockEngine() {}
export function primePlayback() {}
export async function beginPlayback() {}
export function applyEq() {}
export function applyPreamp() {}
export function setBassLock() {}
export function setIsolateMode() {}
export function setSpatialMode() {}
export function setMonoMode() {}
export function setRemaster() {}
export function setBalance() {}
export function setMasterGain() {}
export function setPlaybackRate() {}
export function setFadeMul() {}
export function setNormalizeMul() {}
export function setReplayGainDb() {}
