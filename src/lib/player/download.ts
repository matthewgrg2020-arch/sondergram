import type { Track } from "./store";
import { getStoredTrack } from "./persist";
import { zipBlobs } from "./zip";

const EXT: Record<string, string> = {
  MP3: "mp3",
  FLAC: "flac",
  WAV: "wav",
  AIFF: "aiff",
  ALAC: "m4a",
  M4A: "m4a",
  AAC: "aac",
  OGG: "ogg",
  OPUS: "opus",
};

function safeName(value: string) {
  const cleaned = [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && !'<>:"/\\|?*'.includes(ch);
    })
    .join("");
  return cleaned.replace(/\s+/g, " ").trim() || "Untitled";
}

function extFor(format: string) {
  return EXT[format.toUpperCase()] ?? "bin";
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function albumHasDownloads(tracks: Track[]) {
  return tracks.some((t) => !t.youtubeId);
}

export async function downloadTrack(track: Track) {
  if (track.youtubeId) return;
  const stored = await getStoredTrack(track.id);
  if (!stored?.audio || stored.audio.size === 0) return;
  triggerDownload(
    stored.audio,
    `${safeName(track.artist)} - ${safeName(track.name)}.${extFor(track.format)}`,
  );
}

export async function downloadAlbum(opts: {
  title: string;
  artist: string;
  tracks: Track[];
}) {
  const files: { name: string; data: Blob }[] = [];
  let index = 1;
  for (const track of opts.tracks) {
    if (track.youtubeId) continue;
    const stored = await getStoredTrack(track.id);
    if (!stored?.audio || stored.audio.size === 0) continue;
    const num = String(index).padStart(2, "0");
    index += 1;
    files.push({
      name: `${num} ${safeName(track.name)}.${extFor(track.format)}`,
      data: stored.audio,
    });
    if (stored.cover && !files.some((f) => f.name === "cover.jpg")) {
      files.push({ name: "cover.jpg", data: stored.cover });
    }
  }
  if (files.length === 0) throw new Error("No downloadable files");
  const zip = await zipBlobs(files);
  const album = safeName(opts.title);
  const artist = safeName(opts.artist);
  triggerDownload(zip, `${artist} - ${album}.zip`);
}