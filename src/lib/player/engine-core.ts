// @ts-nocheck
// ENGINE CORE PART 1 - full file will follow
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
	} catch {}
}
