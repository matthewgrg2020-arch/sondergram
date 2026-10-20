import { getStoredTrack, listStoredTracks, putStoredTrack, type StoredTrack } from "./persist";
import { loadPlaylists, savePlaylists, type UserPlaylist } from "./playlists";
import { zipBlobs, unzipBlobs } from "./zip";

export type BackupMeta = {
  version: 1 | 2;
  exportedAt: string;
  tracks: Array<
    Omit<StoredTrack, "audio" | "cover"> & {
      audioFile?: string;
      coverFile?: string;
    }
  >;
  playlists?: UserPlaylist[];
};

export type LibraryPack = {
  blob: Blob;
  file: File;
  name: string;
  tracks: number;
  albums: number;
  playlists: number;
  bytes: number;
  hasLocalAudio: boolean;
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

const MIME_BY_FORMAT: Record<string, string> = {
  MP3: "audio/mpeg",
  FLAC: "audio/flac",
  WAV: "audio/wav",
  AIFF: "audio/aiff",
  ALAC: "audio/mp4",
  M4A: "audio/mp4",
  AAC: "audio/aac",
  OGG: "audio/ogg",
  OPUS: "audio/ogg",
};

function extFor(format: string) {
  return AUDIO_EXT[format.toUpperCase()] ?? "bin";
}

function mimeForFormat(format: string) {
  return MIME_BY_FORMAT[(format || "").toUpperCase()] ?? "audio/mpeg";
}

function isRealAudio(blob: Blob | undefined | null) {
  if (!blob || blob.size < 1024) return false;
  if (/^text\//i.test(blob.type)) return false;
  return true;
}

function isCatalogRow(row: {
  youtubeId?: string;
  ibroadcastId?: string;
  deezerId?: string;
  spotifyId?: string;
  amazonId?: string;
  archiveId?: string;
  bandcampId?: string;
  soulseekId?: string;
  qobuzId?: string;
  appleId?: string;
  previewUrl?: string;
}) {
  return Boolean(
    row.youtubeId ||
      row.ibroadcastId ||
      row.deezerId ||
      row.spotifyId ||
      row.amazonId ||
      row.archiveId ||
      row.bandcampId ||
      row.soulseekId ||
      row.qobuzId ||
      row.appleId ||
      row.previewUrl,
  );
}

function catalogKey(row: {
  id: string;
  youtubeId?: string;
  ibroadcastId?: string;
  deezerId?: string;
  spotifyId?: string;
  amazonId?: string;
  archiveId?: string;
  bandcampId?: string;
  soulseekId?: string;
  qobuzId?: string;
  appleId?: string;
}) {
  if (row.soulseekId) return `slsk:${row.soulseekId}`;
  if (row.deezerId) return `dz:${row.deezerId}`;
  if (row.spotifyId) return `sp:${row.spotifyId}`;
  if (row.appleId) return `ap:${row.appleId}`;
  if (row.qobuzId) return `qb:${row.qobuzId}`;
  if (row.amazonId) return `am:${row.amazonId}`;
  if (row.archiveId) return `ia:${row.archiveId}`;
  if (row.bandcampId) return `bc:${row.bandcampId}`;
  if (row.ibroadcastId) return `ib:${row.ibroadcastId}`;
  if (row.youtubeId) return `yt:${row.youtubeId}`;
  return `id:${row.id}`;
}

function albumKeyOf(row: { artist?: string; albumArtist?: string; album?: string }) {
  return `${(row.albumArtist || row.artist || "").toLowerCase()}::${(row.album || "").toLowerCase()}`;
}

function findZipBlob(map: Map<string, Blob>, path?: string) {
  if (!path) return undefined;
  const norm = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (map.has(norm)) return map.get(norm);
  const lower = norm.toLowerCase();
  if (map.has(lower)) return map.get(lower);
  const base = norm.split("/").pop() || norm;
  for (const [key, blob] of map) {
    const k = key.replace(/\\/g, "/");
    if (k === norm || k === base || k.endsWith("/" + base) || k.endsWith(base)) return blob;
  }
  return undefined;
}

function typedBlob(blob: Blob, mime: string) {
  if (blob.type === mime) return blob;
  return new Blob([blob], { type: mime });
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function formatPackSize(n: number) {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)} MB`;
  return `${(n / 1_000_000_000).toFixed(1)} GB`;
}

export function isLibraryBackup(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") && (name.includes("sondergram") || name.includes("library"));
}

export function canShareLibraryFile() {
  try {
    const probe = new File(["sg"], "sondergram-library.zip", { type: "application/zip" });
    return typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare({ files: [probe] }));
  } catch {
    return typeof navigator.share === "function";
  }
}

export async function shareLibraryFile(pack: LibraryPack) {
  if (!navigator.share) throw new Error("Share is not available on this device");
  await navigator.share({
    files: [pack.file],
    title: "Sondergram library",
    text: `${pack.tracks} songs from Sondergram`,
  });
}

export function downloadLibraryFile(pack: LibraryPack) {
  triggerDownload(pack.blob, pack.name);
}

export async function packLibraryBackup(): Promise<LibraryPack> {
  const rows = await listStoredTracks();
  const files: { name: string; data: Blob }[] = [];
  const tracks: BackupMeta["tracks"] = [];
  let hasLocalAudio = false;
  for (const row of rows) {
    const stored = (await getStoredTrack(row.id)) ?? row;
    const audioName = isRealAudio(stored.audio) ? `audio/${stored.id}.${extFor(stored.format)}` : undefined;
    const coverName = stored.cover && stored.cover.size > 32 ? `cover/${stored.id}.jpg` : undefined;
    if (audioName) {
      files.push({ name: audioName, data: stored.audio });
      hasLocalAudio = true;
    }
    if (coverName && stored.cover) files.push({ name: coverName, data: stored.cover });
    const { audio: _a, cover: _c, ...meta } = stored;
    tracks.push({
      ...meta,
      audioFile: audioName,
      coverFile: coverName,
    });
  }
  const playlists = loadPlaylists();
  const catalog: BackupMeta = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tracks,
    playlists,
  };
  files.unshift({
    name: "library.json",
    data: new Blob([JSON.stringify(catalog)], { type: "application/json" }),
  });
  files.push({
    name: "README.txt",
    data: new Blob(
      [
        [
          "Sondergram library",
          "",
          "Open Sondergram on the other phone or computer.",
          "Settings → Move library → Restore zip.",
          "You can also drop this zip onto the Library page.",
          "",
          "This pack has your songs, artwork, likes, and playlists.",
          "Streaming titles play the same way they do here.",
          "Soulseek still needs your Soulseek login on the new device.",
        ].join("\n"),
      ],
      { type: "text/plain" },
    ),
  });
  const zip = await zipBlobs(files);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `sondergram-library-${stamp}.zip`;
  const file = new File([zip], name, { type: "application/zip" });
  const albums = new Set(tracks.map(albumKeyOf)).size;
  return {
    blob: zip,
    file,
    name,
    tracks: tracks.length,
    albums,
    playlists: playlists.length,
    bytes: zip.size,
    hasLocalAudio,
  };
}

export async function exportLibraryBackup() {
  const pack = await packLibraryBackup();
  if (canShareLibraryFile()) {
    try {
      await shareLibraryFile(pack);
      return pack.tracks;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return pack.tracks;
    }
  }
  downloadLibraryFile(pack);
  return pack.tracks;
}

export async function importLibraryBackup(file: File) {
  const entries = await unzipBlobs(file);
  const map = new Map<string, Blob>();
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/");
    map.set(name, e.data);
    map.set(name.toLowerCase(), e.data);
  }
  const catalogBlob = map.get("library.json") || map.get("LIBRARY.JSON");
  if (!catalogBlob) throw new Error("Not a Sondergram library backup");
  const catalog = JSON.parse(await catalogBlob.text()) as BackupMeta;
  if (!catalog?.tracks?.length) throw new Error("Backup has no tracks");
  const existingRows = await listStoredTracks();
  const existingIds = new Set(existingRows.map((t) => t.id));
  const existingKeys = new Map(existingRows.map((t) => [catalogKey(t), t.id]));
  const idMap = new Map<string, string>();
  let imported = 0;
  let withAudio = 0;
  for (const row of catalog.tracks) {
    const key = catalogKey(row);
    const already = existingIds.has(row.id) ? row.id : existingKeys.get(key);
    if (already) {
      idMap.set(row.id, already);
      const audioRaw = findZipBlob(map, row.audioFile);
      if (isRealAudio(audioRaw ?? null) && audioRaw) {
        const existing = await getStoredTrack(already);
        if (!existing || !isRealAudio(existing.audio)) {
          const mime = mimeForFormat(row.format || existing?.format || "MP3");
          await putStoredTrack({
            ...(existing || (row as StoredTrack)),
            id: already,
            audio: typedBlob(audioRaw, mime),
            audioType: mime,
            cover: existing?.cover ?? null,
          });
          withAudio += 1;
        }
      }
      continue;
    }
    const audioRaw = findZipBlob(map, row.audioFile);
    const coverRaw = findZipBlob(map, row.coverFile);
    if (!isCatalogRow(row) && !isRealAudio(audioRaw ?? null)) continue;
    const mime = mimeForFormat(row.format || "MP3");
    const audio =
      isRealAudio(audioRaw ?? null) && audioRaw
        ? typedBlob(audioRaw, mime)
        : new Blob([row.soulseekId || row.deezerId || row.spotifyId || row.appleId || row.id], {
            type: "text/plain",
          });
    if (isRealAudio(audio)) withAudio += 1;
    await putStoredTrack({
      ...row,
      tags: row.tags ?? [],
      audio,
      audioType: isRealAudio(audio) ? mime : row.audioType,
      cover: coverRaw && coverRaw.size > 0 ? typedBlob(coverRaw, "image/jpeg") : null,
      addedAt: row.addedAt || Date.now(),
    });
    existingIds.add(row.id);
    existingKeys.set(key, row.id);
    idMap.set(row.id, row.id);
    imported += 1;
  }
  if (catalog.playlists?.length) {
    const have = loadPlaylists();
    const haveIds = new Set(have.map((p) => p.id));
    const haveNames = new Set(have.map((p) => p.name.toLowerCase()));
    const extra: UserPlaylist[] = [];
    for (const list of catalog.playlists) {
      if (!list?.name || haveIds.has(list.id) || haveNames.has(list.name.toLowerCase())) continue;
      const trackIds = (list.trackIds || []).map((id) => idMap.get(id)).filter((id): id is string => Boolean(id));
      if (!trackIds.length) continue;
      extra.push({
        id: list.id,
        name: list.name,
        trackIds,
        createdAt: list.createdAt || Date.now(),
      });
      haveIds.add(list.id);
      haveNames.add(list.name.toLowerCase());
    }
    if (extra.length) savePlaylists([...have, ...extra].slice(0, 40));
  }
  return imported;
}
