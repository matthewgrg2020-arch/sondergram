export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRemain(current: number, duration: number) {
  const left = Math.max(0, (Number.isFinite(duration) ? duration : 0) - (Number.isFinite(current) ? current : 0));
  return `-${formatTime(left)}`;
}