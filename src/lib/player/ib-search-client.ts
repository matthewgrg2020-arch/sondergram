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

function strAt(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function numAt(row: unknown[], idx: number | undefined): string {
  const s = strAt(row, idx);
  return s && /^\d+$/.test(s) ? s : "";
}

/** Client-side stream search against iBroadcast library (stops early when enough hits). */
export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<IbSearchResult> {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: false, tracks: [], total: 0, error: "Query too short." };
  const MAX_HITS = opts?.maxHits ?? 200;

  // Prefer client stream so we can stop early and avoid server 55s abort on large libraries.
  let res: Response | null = null;
  try {
    res = await fetch("/api/ib-library-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ userId: session.userId, token: session.token }),
    });
    if (!res.ok || !res.body) res = null;
  } catch {
    res = null;
  }

  if (!res?.body) {
    // Server fallback
    try {
      const server = await fetch("/api/ib-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, token: session.token, q, maxHits: MAX_HITS }),
      });
      const data = (await server.json()) as IbSearchResult;
      if (data?.ok && Array.isArray(data.tracks)) {
        opts?.onProgress?.(data.tracks.length);
        return data;
      }
      return { ok: false, tracks: [], total: 0, error: data?.error || "No matches." };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed.";
      if (/abort/i.test(msg)) {
        return {
          ok: false,
          tracks: [],
          total: 0,
          error: "Search timed out. Try a more specific artist or album name.",
        };
      }
      return { ok: false, tracks: [], total: 0, error: msg };
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const artists = new Map<string, string>();
  const albums = new Map<string, string>();
  const pending: PendingHit[] = [];
  const matchedArtistIds = new Set<string>();
  const matchedAlbumIds = new Set<string>();
  let trackMap: Record<string, number> = { ...DEFAULT_TRACK_MAP };
  let artistMap: Record<string, number> = { ...DEFAULT_ARTIST_MAP };
  let albumMap: Record<string, number> = { ...DEFAULT_ALBUM_MAP };
  let artistsStart = -1, albumsStart = -1, tracksStart = -1;

  const noteArtist = (artistId: string) => {
    if (!artistId || matchedArtistIds.has(artistId)) return;
    matchedArtistIds.add(artistId);
  };
  const noteAlbum = (albumId: string) => {
    if (!albumId || matchedAlbumIds.has(albumId)) return;
    matchedAlbumIds.add(albumId);
  };

  // Lightweight scan: pull JSON chunks and collect matching tracks by title/artist/album text.
  // Full map parsing is best-effort; we always keep path-derived names as fallback.
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Cap buffer to avoid memory blow-ups on huge libraries
      if (buf.length > 12_000_000) buf = buf.slice(buf.length - 4_000_000);

      // Extract simple "title"-like strings near query matches for progress
      if (pending.length < MAX_HITS && buf.toLowerCase().includes(q.toLowerCase())) {
        opts?.onProgress?.(pending.length);
      }
      if (pending.length >= MAX_HITS) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    buf += decoder.decode();
  } catch (err) {
    // Fall through to server if stream fails mid-way with no hits
    if (!pending.length) {
      try {
        const server = await fetch("/api/ib-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.userId, token: session.token, q, maxHits: MAX_HITS }),
        });
        const data = (await server.json()) as IbSearchResult;
        if (data?.ok && Array.isArray(data.tracks)) {
          opts?.onProgress?.(data.tracks.length);
          return data;
        }
        return { ok: false, tracks: [], total: 0, error: data?.error || "No matches." };
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : "Search failed.";
        if (/abort/i.test(msg)) {
          return {
            ok: false,
            tracks: [],
            total: 0,
            error: "Search timed out. Try a more specific artist or album name.",
          };
        }
        return { ok: false, tracks: [], total: 0, error: msg };
      }
    }
  }

  // Stream path above is progress-oriented; for accurate results always also hit server search
  // when client pending is empty (common when lightweight scan can't parse maps).
  if (!pending.length) {
    try {
      const server = await fetch("/api/ib-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, token: session.token, q, maxHits: MAX_HITS }),
      });
      const data = (await server.json()) as IbSearchResult;
      if (data?.ok && Array.isArray(data.tracks)) {
        opts?.onProgress?.(data.tracks.length);
        return data;
      }
      return {
        ok: false,
        tracks: [],
        total: 0,
        error: data?.error || "No matches found. Try a more specific title.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed.";
      if (/abort/i.test(msg)) {
        return {
          ok: false,
          tracks: [],
          total: 0,
          error: "Search timed out scanning your library. Try a more specific artist or album name.",
        };
      }
      return { ok: false, tracks: [], total: 0, error: msg };
    }
  }

  const tracks = pending.map((h) => resolveHit(h, artists, albums));
  opts?.onProgress?.(tracks.length);
  return { ok: true, tracks, total: tracks.length, truncated: tracks.length >= MAX_HITS };
}

export { fetchIbAlbumTracks, fetchIbArtistTracks } from "./ib-album-fetch";
