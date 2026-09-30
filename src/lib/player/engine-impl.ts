// @ts-nocheck
// See engine-final local restore — temporary stub
export function getEngine() {
  throw new Error("engine-impl incomplete");
}
export async function resumeEngine() {}
export function outputAudio() { return document.createElement("audio"); }
export function pauseOutput() {}
export function seekOutput(_t: number) {}
export function setBackgroundOutput(_on: boolean) {}
export function unlockEngine() {}
export function primePlayback() {}
export async function beginPlayback(_url: string, _at = 0) {}
export function applyEq(_g: number[]) {}
export function applyPreamp(_db: number) {}
export function setBassLock(_db: number) {}
export function setIsolateMode(_m: string) {}
export function setSpatialMode(_p: string, _a?: number) {}
export function setMonoMode(_m: boolean) {}
export function setRemaster(_p: string, _a?: number) {}
export function setBalance(_v: number) {}
export function setMasterGain(_v: number) {}
export function setPlaybackRate(_r: number) {}
export function setFadeMul(_v: number) {}
export function setNormalizeMul(_v: number) {}
export function setReplayGainDb(_db: number) {}
export function setAudioSessionPlayback() {}
export function isAppleMobile() { return false; }
