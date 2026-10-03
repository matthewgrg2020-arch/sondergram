import { authClient, authEnabled } from "@/lib/auth/client";
import { loadPlaylists, savePlaylists, type UserPlaylist } from "./playlists";
import { getStoredTrack, listStoredTracks, putStoredTrack, type StoredTrack } from "./persist";
import { cloudDropBlob, cloudGetPart, cloudManifest, cloudPutPart, cloudSaveSnapshot } from "./cloud-api";

const PART = 900_000;

export type CloudSnapshot = {
  version: 2;
  exportedAt: string;
  tracks: Array<Omit<StoredTrack, "audio" | "cover"> & { hasAudio?: boolean; hasCover?: boolean }>;
  playlists: UserPlaylist[];
};

function bytesToB64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function b64ToBlob(payload: string, type: string) {
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function blobParts(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += PART) parts.push(bytesToB64(bytes.subarray(i, i + PART)));
  return parts;
}

async function signedIn() {
  const account = await fetch("/api/account").then((r) => r.json()).catch(() => null);
  if (account?.email) return true;
  if (!authEnabled) return false;
  const session = await authClient.getSession();
  return Boolean(session.data?.user?.email);
}

function isRealAudio(blob: Blob | undefined | null) {
  return Boolean(blob && blob.size > 1024 && !/^text\//i.test(blob.type));
}

export async function syncAccountLibrary(onStatus?: (message: string) => void): Promise<string> {
  if (!(await signedIn())) return "Sign in to save this library to your email.";
  onStatus?.("Checking your account library…");
  const remote = await cloudManifest();
  const local = await listStoredTracks();
  const localIds = new Set(local.map((row) => row.id));
  let pulled = 0;
  if (remote.payload) {
    const snap = JSON.parse(remote.payload) as CloudSnapshot;
    const partsById = new Map(remote.blobs.map((row) => [row.id, row.parts]));
    for (const track of snap.tracks || []) {
      if (localIds.has(track.id)) continue;
      const audioKey = `a:${track.id}`;
      const coverKey = `c:${track.id}`;
      let audio = new Blob();
      let cover: Blob | null = null;
      const audioParts = partsById.get(audioKey) || 0;
      if (audioParts) {
        const chunks: Blob[] = [];
        for (let i = 0; i < audioParts; i++) {
          const part = await cloudGetPart({ data: { trackId: audioKey, part: i } });
          if (part.payload) chunks.push(b64ToBlob(part.payload, track.audioType || "audio/mpeg"));
        }
        if (chunks.length) audio = new Blob(chunks, { type: track.audioType || "audio/mpeg" });
      }
      const coverParts = partsById.get(coverKey) || 0;
      if (coverParts) {
        const part = await cloudGetPart({ data: { trackId: coverKey, part: 0 } });
        if (part.payload) cover = b64ToBlob(part.payload, "image/jpeg");
      }
      await putStoredTrack({
        ...track,
        tags: track.tags ?? [],
        audio,
        cover,
        addedAt: track.addedAt || Date.now(),
      });
      localIds.add(track.id);
      pulled += 1;
    }
    if (snap.playlists?.length) {
      const have = loadPlaylists();
      const ids = new Set(have.map((row) => row.id));
      const extra = snap.playlists.filter((row) => row?.id && !ids.has(row.id));
      if (extra.length) savePlaylists([...extra, ...have].slice(0, 40));
    }
  }

  onStatus?.("Saving this device to your account…");
  const rows = await listStoredTracks();
  const tracks = [];
  for (const row of rows) {
    const stored = (await getStoredTrack(row.id)) ?? row;
    const { audio, cover, ...meta } = stored;
    const hasAudio = isRealAudio(audio);
    const hasCover = Boolean(cover && cover.size > 32);
    tracks.push({ ...meta, hasAudio, hasCover });
    if (hasAudio) await uploadBlob(`a:${row.id}`, audio);
    if (hasCover && cover) await uploadBlob(`c:${row.id}`, cover);
  }
  const snapshot: CloudSnapshot = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tracks,
    playlists: loadPlaylists(),
  };
  await cloudSaveSnapshot({ data: { payload: JSON.stringify(snapshot) } });
  const keep = new Set(tracks.flatMap((row) => [`a:${row.id}`, `c:${row.id}`]));
  for (const blob of remote.blobs) {
    if (!keep.has(blob.id)) await cloudDropBlob({ data: { trackId: blob.id } });
  }
  const uploaded = tracks.filter((row) => row.hasAudio).length;
  return pulled
    ? `Pulled ${pulled} from your account and saved ${uploaded} song${uploaded === 1 ? "" : "s"}.`
    : `Saved ${tracks.length} song${tracks.length === 1 ? "" : "s"} to ${"your account"}.`;
}

async function uploadBlob(trackId: string, blob: Blob) {
  const parts = await blobParts(blob);
  for (let i = 0; i < parts.length; i++) {
    await cloudPutPart({ data: { trackId, part: i, payload: parts[i] } });
  }
}
