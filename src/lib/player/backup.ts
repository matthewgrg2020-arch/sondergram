import { getStoredTrack, listStoredTracks, putStoredTrack, type StoredTrack } from "./persist";
import { zipBlobs, unzipBlobs } from "./zip";

export type BackupMeta = {
  version: 1;
  exportedAt: string;
  tracks: Array<
    Omit<StoredTrack, "audio" | "cover"> & {
      audioFile?: string;
      coverFile?: string;
    }
  >;
};

const AUDIO_EXT: Record<string, string> = {
  MP3: "mp3",
  FLAC: "flac",
  WAV: "wav",
  AIFF: "aiff",
  ALAC: "m4a",
  M4A: "m4a",
  AAC: "aac",
  OGG: "ogg",
  OPUS: "opus",
  YT: "txt",
};

function extFor(format: string) {
  return AUDIO_EXT[format.toUpperCase()] ?? "bin";
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

export function isLibraryBackup(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") && (name.includes("sondergram") || name.includes("library"));
}

export async function exportLibraryBackup() {
  const rows = await listStoredTracks();
  const files: { name: string; data: Blob }[] = [];
  const tracks: BackupMeta["tracks"] = [];
  for (const row of rows) {
    const stored = (await getStoredTrack(row.id)) ?? row;
    const audioName =
      stored.youtubeId || stored.ibroadcastId
        ? undefined
        : stored.audio.size > 0
          ? `audio/${stored.id}.${extFor(stored.format)}`
          : undefined;
    const coverName = stored.cover && stored.cover.size > 0 ? `cover/${stored.id}.jpg` : undefined;
    if (audioName) files.push({ name: audioName, data: stored.audio });
    if (coverName && stored.cover) files.push({ name: coverName, data: stored.cover });
    const { audio: _a, cover: _c, ...meta } = stored;
    tracks.push({
      ...meta,
      audioFile: audioName,
      coverFile: coverName,
    });
  }
  const catalog: BackupMeta = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks,
  };
  files.unshift({
    name: "library.json",
    data: new Blob([JSON.stringify(catalog)], { type: "application/json" }),
  });
  const zip = await zipBlobs(files);
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(zip, `sondergram-library-${stamp}.zip`);
  return tracks.length;
}

export async function importLibraryBackup(file: File) {
  const entries = await unzipBlobs(file);
  const map = new Map(entries.map((e) => [e.name.replace(/\\/g, "/"), e.data]));
  const catalogBlob = map.get("library.json");
  if (!catalogBlob) throw new Error("Not a Sondergram library backup");
  const catalog = JSON.parse(await catalogBlob.text()) as BackupMeta;
  if (!catalog?.tracks?.length) throw new Error("Backup has no tracks");
  const existing = new Set((await listStoredTracks()).map((t) => t.id));
  let imported = 0;
  for (const row of catalog.tracks) {
    if (existing.has(row.id)) continue;
    const audio = row.audioFile ? map.get(row.audioFile) : undefined;
    const cover = row.coverFile ? map.get(row.coverFile) : undefined;
    if (!row.youtubeId && !row.ibroadcastId && (!audio || audio.size === 0)) continue;
    await putStoredTrack({
      ...row,
      tags: row.tags ?? [],
      audio: audio ?? new Blob([row.youtubeId || row.ibroadcastId || ""], { type: "text/plain" }),
      cover: cover && cover.size > 0 ? cover : null,
      addedAt: row.addedAt || Date.now(),
    });
    existing.add(row.id);
    imported += 1;
  }
  return imported;
}