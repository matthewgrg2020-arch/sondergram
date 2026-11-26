import type { IbSession, IbTrack } from "./ibroadcast";

function artworkUrl(artId: string) {
  const id = String(artId || "").trim();
  if (!id || id === "0") return "";
  return `https://artwork.ibroadcast.com/artwork/${id}-500`;
}

function extractBalanced(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseMap(mapRaw: string): Record<string, number> {
  try {
    const obj = JSON.parse(mapRaw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 64) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function strAt(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  return v == null ? "" : String(v).trim();
}

function numAt(row: unknown[], idx: number | undefined): string {
  const s = strAt(row, idx);
  return s && s !== "0" ? s : "";
}

function queryTokens(q: string): string[] {
  return q.toLowerCase().split(/[\s\-_./+,]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
}

function textMatches(text: string, q: string): boolean {
  const t = (text || "").toLowerCase().trim();
  if (!t || !q) return false;
  if (t.includes(q)) return true;
  const norm = (s: string) => s.replace(/[\/_.,+\-]+/g, " ").replace(/\s+/g, " ").trim();
  const nt = norm(t), nq = norm(q);
  if (nt && nq && nt.includes(nq)) return true;
  const toks = queryTokens(q);
  return toks.length > 0 && toks.every((tok) => t.includes(tok) || nt.includes(tok));
}

function rowLooksMatch(row: unknown[], q: string): boolean {
  for (const cell of row) {
    if (typeof cell !== "string") continue;
    const s = cell.trim();
    if (s.length < 2 || s.length > 180) continue;
    if (/^\d+$/.test(s) || /^\/\d+\//.test(s) || /^audio\//i.test(s)) continue;
    if (textMatches(s, q)) return true;
  }
  return false;
}

const DEFAULT_TRACK_MAP: Record<string, number> = {
  track: 0, year: 1, title: 2, genre: 3, length: 4, album_id: 5, artwork_id: 6,
  artist_id: 7, enid: 8, uploaded_on: 9, trashed: 10, size: 11, path: 12, uid: 13,
  rating: 14, plays: 15, file: 16, type: 17, replay_gain: 18, uploaded_time: 19,
};
const DEFAULT_ALBUM_MAP: Record<string, number> = {
  name: 0, tracks: 1, artist_id: 2, trashed: 3, rating: 4, disc: 5, year: 6,
};
const DEFAULT_ARTIST_MAP: Record<string, number> = {
  name: 0, tracks: 1, trashed: 2, rating: 3,
};

function namesFromPath(path: string): { artist: string; album: string; title: string } {
  const p = (path || "").replace(/\\/g, "/").trim();
  if (!p) return { artist: "", album: "", title: "" };
  const parts = p.split("/").filter(Boolean);
  let fileTitle = "";
  if (parts.length) {
    const file = parts.pop() || "";
    fileTitle = file.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^\d+\s*[-.]\s*/, "").trim();
  }
  while (parts.length && /^(music|artists|albums|compilations|tracks|audio)$/i.test(parts[0]!)) parts.shift();
  let artist = "", album = "";
  if (parts.length >= 2) { artist = parts[0] || ""; album = parts[1] || ""; }
  else if (parts.length === 1) album = parts[0] || "";
  album = album.replace(/^\(\d{4}\)\s*/, "").trim();
  return { artist: artist.trim(), album: album.trim(), title: fileTitle };
}

function pickTitle(row: unknown[], tm: Record<string, number>, pathTitle: string): string {
  const fromMap = strAt(row, tm.title ?? DEFAULT_TRACK_MAP.title);
  if (fromMap && !/^\d{1,3}$/.test(fromMap) && !/^\d{4}$/.test(fromMap)) return fromMap;
  for (const cell of row) {
    if (typeof cell !== "string") continue;
    const s = cell.trim();
    if (!s || s.length < 2) continue;
    if (/^\d{1,3}$/.test(s) || /^\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s)) continue;
    if (/^\d{1,2}:\d{2}/.test(s) || /^audio\//i.test(s) || /^\//.test(s)) continue;
    if (/music\//i.test(s) || /^-?\d+(\.\d+)?$/.test(s)) continue;
    return s;
  }
  return pathTitle || fromMap || "Untitled";
}

type PendingHit = {
  id: string; title: string; genre: string; year: string;
  albumId: string; artistId: string; artId: string; file: string; path: string; length: number;
};

export type IbSearchResult = {
  ok: boolean; tracks: IbTrack[]; total: number; truncated?: boolean; error?: string;
};

function authPayload(session: IbSession) {
  const uidNum = Number(session.userId);
  const uid = Number.isFinite(uidNum) && uidNum > 0 ? uidNum : session.userId;
  return {
    _token: session.token, _userid: uid, user_id: uid, token: session.token,
    client: "Sondergram", version: "1.0", device_name: "Sondergram Web",
    user_agent: "Sondergram/1.0", mode: "library", supported_types: false,
    url: "//library.ibroadcast.com",
  };
}

function resolveHit(hit: PendingHit, artists: Map<string, string>, albums: Map<string, string>): IbTrack {
  const fromPath = namesFromPath(hit.path);
  let artist = hit.artistId ? (artists.get(String(hit.artistId)) || artists.get(hit.artistId) || "") : "";
  if (!artist) artist = fromPath.artist || "";
  let album = hit.albumId ? (albums.get(String(hit.albumId)) || albums.get(hit.albumId) || "") : "";
  if (!album) album = fromPath.album || "";
  const title = hit.title && !/^\d{1,3}$/.test(hit.title) ? hit.title : fromPath.title || hit.title || "Untitled";
  return {
    id: hit.id, name: title,
    artist: artist || "Unknown artist",
    album: album || "Unknown album",
    year: hit.year, genre: hit.genre, file: hit.file,
    artwork: artworkUrl(hit.artId),
    length: hit.length > 0 ? hit.length : undefined,
    albumId: hit.albumId || undefined,
    artistId: hit.artistId || undefined,
  };
}

function findSectionStart(buf: string, label: string): number {
  const re = new RegExp(`"${label}"\\s*:\\s*\\{`);
  const m = re.exec(buf);
  return m ? buf.indexOf("{", m.index) : -1;
}

function tryParseMapNear(buf: string, from: number, window = 4000): Record<string, number> {
  const slice = buf.slice(from, from + window);
  const mapKey = slice.search(/"map"\s*:\s*\{/);
  if (mapKey < 0) return {};
  const brace = slice.indexOf("{", mapKey);
  if (brace < 0) return {};
  const raw = extractBalanced(slice, brace);
  return raw ? parseMap(raw) : {};
}

function scanEntries(buf: string, from: number, onRow: (id: string, row: unknown[]) => void): number {
  const re = /"(\d+)"\s*:\s*\[/g;
  re.lastIndex = Math.max(0, from);
  let lastComplete = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buf))) {
    const id = m[1]!;
    const arrStart = buf.indexOf("[", m.index);
    if (arrStart < 0) break;
    const arrRaw = extractBalanced(buf, arrStart);
    if (!arrRaw) return m.index;
    try {
      const row = JSON.parse(arrRaw) as unknown[];
      if (Array.isArray(row) && row.length >= 3) onRow(id, row);
    } catch { /* skip */ }
    lastComplete = arrStart + arrRaw.length;
  }
  return lastComplete;
}

export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<IbSearchResult> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { ok: false, tracks: [], total: 0, error: "Type at least 2 characters to search." };
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
    try {
      res = await fetch("https://library.ibroadcast.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(authPayload(session)),
      });
    } catch {
      return { ok: false, tracks: [], total: 0, error: "Could not reach iBroadcast. Check your connection." };
    }
  }

  if (!res.ok || !res.body) {
    return { ok: false, tracks: [], total: 0, error: `iBroadcast library HTTP ${res.status}` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const artists = new Map<string, string>();
  const albums = new Map<string, string>();
  let trackMap: Record<string, number> = { ...DEFAULT_TRACK_MAP };
  let albumMap: Record<string, number> = { ...DEFAULT_ALBUM_MAP };
  let artistMap: Record<string, number> = { ...DEFAULT_ARTIST_MAP };
  const pending: PendingHit[] = [];
  const seen = new Set<string>();
  const matchedAlbumIds = new Set<string>();
  const matchedArtistIds = new Set<string>();
  const albumBuckets = new Map<string, PendingHit[]>();
  const artistBuckets = new Map<string, PendingHit[]>();
  let artistCursor = 0, albumCursor = 0, trackCursor = 0;
  let artistsStart = -1, albumsStart = -1, tracksStart = -1;
  let mapsReady = false;

  const addPending = (hit: PendingHit) => {
    if (pending.length >= MAX_HITS || seen.has(hit.id)) return;
    seen.add(hit.id);
    pending.push(hit);
    opts?.onProgress?.(pending.length);
  };

  const noteAlbum = (albumId: string) => {
    if (!albumId || matchedAlbumIds.has(albumId)) return;
    matchedAlbumIds.add(albumId);
    const bucket = albumBuckets.get(albumId);
    if (bucket) for (const h of bucket) addPending(h);
  };

  const noteArtist = (artistId: string) => {
    if (!artistId || matchedArtistIds.has(artistId)) return;
    matchedArtistIds.add(artistId);
    const bucket = artistBuckets.get(artistId);
    if (bucket) for (const h of bucket) addPending(h);
  };

  const handleArtist = (id: string, row: unknown[]) => {
    const name = strAt(row, artistMap.name ?? 0);
    if (name && !/^\d+$/.test(name)) {
      artists.set(String(id), name);
      artists.set(id, name);
      if (q && textMatches(name, q)) noteArtist(String(id));
    }
  };

  const handleAlbum = (id: string, row: unknown[]) => {
    const name = strAt(row, albumMap.name ?? 0);
    if (name && !/^\d+$/.test(name)) {
      albums.set(String(id), name);
      albums.set(id, name);
      if (q && textMatches(name, q)) noteAlbum(String(id));
    }
  };

  const handleTrack = (id: string, row: unknown[]) => {
    if (pending.length >= Math.min(MAX_HITS * 2, 400) || seen.has(id)) return;
    const tm = trackMap;
    let pathVal = strAt(row, tm.path ?? DEFAULT_TRACK_MAP.path);
    let file = strAt(row, tm.file ?? DEFAULT_TRACK_MAP.file);
    if (!file) {
      for (const cell of row) {
        if (typeof cell === "string" && /^\/\d+\//.test(cell)) { file = cell; break; }
      }
    }
    if (!pathVal) {
      for (const cell of row) {
        if (typeof cell === "string" && cell.length > 3 && !/^\/\d+\//.test(cell) && (cell.includes("/") || /music\//i.test(cell))) {
          pathVal = cell; break;
        }
      }
    }
    const pathNames = namesFromPath(pathVal);
    const title = pickTitle(row, tm, pathNames.title);
    const genre = strAt(row, tm.genre ?? DEFAULT_TRACK_MAP.genre);
    const yearRaw = strAt(row, tm.year ?? DEFAULT_TRACK_MAP.year);
    const year = /^\d{4}$/.test(yearRaw) ? yearRaw : "";
    const albumId = numAt(row, tm.album_id ?? DEFAULT_TRACK_MAP.album_id);
    const artistId = numAt(row, tm.artist_id ?? DEFAULT_TRACK_MAP.artist_id);
    const artId = numAt(row, tm.artwork_id ?? DEFAULT_TRACK_MAP.artwork_id);
    let lengthSec = 0;
    const lenIdx = tm.length ?? DEFAULT_TRACK_MAP.length;
    if (lenIdx != null && lenIdx >= 0 && lenIdx < row.length) {
      const n = typeof row[lenIdx] === "number" ? (row[lenIdx] as number) : Number(row[lenIdx]);
      if (Number.isFinite(n) && n > 0 && n < 36000) lengthSec = Math.round(n);
    }
    const artistName = (artistId && (artists.get(String(artistId)) || artists.get(artistId))) || pathNames.artist || "";
    const albumName = (albumId && (albums.get(String(albumId)) || albums.get(albumId))) || pathNames.album || "";
    const trashedIdx = tm.trashed ?? DEFAULT_TRACK_MAP.trashed;
    if (trashedIdx != null) {
      const tr = row[trashedIdx];
      if (tr === true || tr === 1 || tr === "1" || tr === "true") return;
    }
    const hit: PendingHit = {
      id, title, genre: genre && !/^\d+$/.test(genre) ? genre : "", year,
      albumId, artistId, artId, file, path: pathVal, length: lengthSec,
    };
    if (albumId) {
      const bucket = albumBuckets.get(albumId) || [];
      if (bucket.length < 200) { bucket.push(hit); albumBuckets.set(albumId, bucket); }
    }
    if (artistId) {
      const bucket = artistBuckets.get(artistId) || [];
      if (bucket.length < 250) { bucket.push(hit); artistBuckets.set(artistId, bucket); }
    }
    if ((albumId && matchedAlbumIds.has(albumId)) || (artistId && matchedArtistIds.has(artistId))) {
      addPending(hit);
      return;
    }
    const titleMatch = textMatches(title, q);
    const artistMatch = textMatches(artistName, q);
    const albumMatch = textMatches(albumName, q);
    const pathMatch = Boolean(pathVal && textMatches(pathVal, q));
    const cellMatch = !titleMatch && !artistMatch && !albumMatch && !pathMatch && rowLooksMatch(row, q);
    if (!titleMatch && !artistMatch && !albumMatch && !pathMatch && !cellMatch) return;
    if (albumId && albumMatch) noteAlbum(albumId);
    if (artistId && artistMatch) noteArtist(artistId);
    addPending(hit);
  };

  const processBuffer = () => {
    if (artistsStart < 0) artistsStart = findSectionStart(buf, "artists");
    if (albumsStart < 0) albumsStart = findSectionStart(buf, "albums");
    if (tracksStart < 0) tracksStart = findSectionStart(buf, "tracks");
    if (!mapsReady) {
      if (artistsStart >= 0) {
        const m = tryParseMapNear(buf, artistsStart);
        if (m.name != null) artistMap = { ...DEFAULT_ARTIST_MAP, ...m };
      }
      if (albumsStart >= 0) {
        const m = tryParseMapNear(buf, albumsStart);
        if (m.name != null) albumMap = { ...DEFAULT_ALBUM_MAP, ...m };
      }
      if (tracksStart >= 0) {
        const m = tryParseMapNear(buf, tracksStart);
        if (m.title != null || m.album_id != null || m.path != null || m.file != null) {
          trackMap = { ...DEFAULT_TRACK_MAP, ...m };
          mapsReady = true;
        }
      }
    }
    if (artistsStart >= 0) { artistCursor = Math.max(artistCursor, artistsStart); artistCursor = scanEntries(buf, artistCursor, handleArtist); }
    if (albumsStart >= 0) { albumCursor = Math.max(albumCursor, albumsStart); albumCursor = scanEntries(buf, albumCursor, handleAlbum); }
    if (tracksStart >= 0) { trackCursor = Math.max(trackCursor, tracksStart); trackCursor = scanEntries(buf, trackCursor, handleTrack); }
    if (buf.length > 10_000_000) {
      const candidates: number[] = [];
      if (artistsStart >= 0) candidates.push(artistCursor);
      if (albumsStart >= 0) candidates.push(albumCursor);
      if (tracksStart >= 0) candidates.push(trackCursor);
      const keepFrom = candidates.length ? Math.min(...candidates) : 0;
      const cut = Math.max(0, Math.min(keepFrom, buf.length - 2_000_000));
      if (cut > 250_000) {
        buf = buf.slice(cut);
        if (artistsStart >= 0) { artistsStart = Math.max(0, artistsStart - cut); artistCursor = Math.max(0, artistCursor - cut); }
        if (albumsStart >= 0) { albumsStart = Math.max(0, albumsStart - cut); albumCursor = Math.max(0, albumCursor - cut); }
        if (tracksStart >= 0) { tracksStart = Math.max(0, tracksStart - cut); trackCursor = Math.max(0, trackCursor - cut); }
      }
    }
    if (pending.length < MAX_HITS) return false;
    if (matchedAlbumIds.size || matchedArtistIds.size) {
      return pending.length >= Math.min(MAX_HITS * 2, 400);
    }
    return true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (processBuffer()) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    buf += decoder.decode();
    processBuffer();
  } catch (err) {
    if (pending.length) {
      const tracks = pending.map((h) => resolveHit(h, artists, albums));
      return { ok: true, tracks, total: tracks.length, truncated: true };
    }
    return {
      ok: false, tracks: [], total: 0,
      error: err instanceof Error ? err.message : "Search failed while reading the library.",
    };
  }

  if (!pending.length) {
    return {
      ok: false, tracks: [], total: 0,
      error: tracksStart < 0
        ? "Could not read track list from iBroadcast. Sign out and sign in again, then retry."
        : "No matches found in the library stream. Try the exact song title or artist spelling, or sign out and sign in again.",
    };
  }

  const tracks = pending.map((h) => resolveHit(h, artists, albums));
  tracks.sort((a, b) => {
    const aa = (a.artist || "").localeCompare(b.artist || "");
    if (aa) return aa;
    const ab = (a.album || "").localeCompare(b.album || "");
    if (ab) return ab;
    return (a.name || "").localeCompare(b.name || "");
  });
  return { ok: true, tracks, total: tracks.length, truncated: tracks.length >= MAX_HITS };
}

export { fetchIbAlbumTracks } from "./ib-album-fetch";
