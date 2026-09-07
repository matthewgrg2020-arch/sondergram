import type { Track } from "./store";

export async function shareTrack(track: Track) {
  const text = `${track.name} — ${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: track.name, text });
      return;
    }
  } catch {
    /* cancelled */
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* no clipboard */
  }
}