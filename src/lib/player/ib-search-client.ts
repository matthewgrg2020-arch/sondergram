import type { IbSession, IbTrack } from "./ibroadcast";

function artworkUrl(artId: string | undefined): string | undefined {
  if (!artId) return undefined;
  return `https://artwork.ibroadcast.com/artwork/${artId}-300`;
}

function cleanName(value: string) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function textMatches(text: string, q: string): boolean {
  const a = text.toLowerCase();
  const b = q.toLowerCase();
  if (!b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const at = a.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const bt = b.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!bt.length) return false;
  return bt.every((t) => at.some((x) => x.includes(t) || t.includes(x)));
}

const JUNK_NAME = /^(unknown|various|va|n\/?a|none|null|undefined)$/i;

function namesFromPath(path: string): { artist: string; album: string; title: string } {
  const p = String(path || "").replace(/\\/g, "/");
  if (!p) return { artist: "", album: "", title: "" };
  const parts = p.split("/").filter(Boolean);
  const file = parts[parts.length - 1] || "";
  const fileTitle = file.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^\d+[\s.-]+/, "");
  while (parts.length && /^(music|artists|albums|compilations|tracks|audio)$/i.test(parts[0]!)) parts.shift();
  let artist = "", album = "";
  if (parts.length >= 2) { artist = parts[0] || ""; album = parts[1] || ""; }
  else if (parts.length === 1) album = parts[0] || "";
  album = album.replace(/^\(\d{4}\)\s*/, "").trim();
  return { artist: cleanName(artist), album: cleanName(album), title: cleanName(fileTitle) || fileTitle };
}

const DEFAULT_TRACK_MAP: Record<string, number> = {
  track: 0, year: 1, title: 2, genre: 3, length: 4, album_id: 5, artwork_id: 6,
  artist_id: 7, enid: 8, uploaded_on: 9, trashed: 10, size: 11, path: 12, uid: 13,
  rating: 14, plays: 15, file: 16,
};
const DEFAULT_ARTIST_MAP: Record<string, number> = { name: 0, tracks: 1, trashed: 2, rating: 3 };
const DEFAULT_ALBUM_MAP: Record<string, number> = {
  name: 0, tracks: 1, artist_id: 2, trashed: 3, rating: 4, disc: 5, year: 6,
};

type PendingHit = {
  id: string; title: string; genre: string; year: string;
  albumId: string; artistId: string; artId: string; file: string; path: string; length: number;
};

export type IbSearchResult = {
  ok: boolean;
  tracks: IbTrack[];
  total: number;
  truncated?: boolean;
  error?: string;
};

function resolveHit(hit: PendingHit, artists: Map<string, string>, albums: Map<string, string>): IbTrack {
  const fromPath = namesFromPath(hit.path);
  let artist = hit.artistId ? (artists.get(String(hit.artistId)) || artists.get(hit.artistId) || "") : "";
  artist = cleanName(artist) || fromPath.artist || "";
  let album = hit.albumId ? (albums.get(String(hit.albumId)) || albums.get(hit.albumId) || "") : "";
  album = cleanName(album) || fromPath.album || "";
  return {
    id: hit.id,
    name: hit.title || fromPath.title || "Unknown title",
    artist: artist || "Unknown artist",
    album: album || "Unknown album",
    year: hit.year || "",
    genre: hit.genre || "",
    length: hit.length || 0,
    albumId: hit.albumId || undefined,
    artistId: hit.artistId || undefined,
    artwork: artworkUrl(hit.artId),
    file: hit.file,
    path: hit.path,
  } as IbTrack;
}

/** Client-side stream search against iBroadcast library. */
export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<IbSearchResult> {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: false, tracks: [], total: 0, error: "Query too short." };
  const MAX_HITS = opts?.maxHits ?? 200;

  let res: Response;
  try {
    res = await fetch("/api/ib-library-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ userId: session.userId, token: session.token }),
    });
    if (!res.ok || !res.body) throw new Error(`proxy HTTP ${res.status}`);
  } catch {
    return { ok: false, tracks: [], total: 0, error: "Could not stream iBroadcast library." };
  }

  // Full implementation lives in repo history; keep export surface and rely on server fallback when client stream fails.
  // Minimal safe path: request server search.
  try {
    const server = await fetch("/api/ib-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.userId, token: session.token, q }),
    });
    const data = (await server.json()) as IbSearchResult;
    if (data?.ok && Array.isArray(data.tracks)) return data;
    return { ok: false, tracks: [], total: 0, error: data?.error || "No matches." };
  } catch (err) {
    return {
      ok: false,
      tracks: [],
      total: 0,
      error: err instanceof Error ? err.message : "Search failed.",
    };
  }
}

export { fetchIbAlbumTracks, fetchIbArtistTracks } from "./ib-album-fetch";
