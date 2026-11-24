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
  let depth = 0;
  let inStr = false;
  let esc = false;
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
  if (v == null) return "";
  return String(v).trim();
}

function numAt(row: unknown[], idx: number | undefined): string {
  const s = strAt(row, idx);
  return s && s !== "0" ? s : "";
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
  if (pathTitle) return pathTitle;
  if (fromMap) return fromMap;
  return "Untitled";
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
  const artist = (hit.artistId && artists.get(hit.artistId)) || fromPath.artist || "Unknown artist";
  const album = (hit.albumId && albums.get(hit.albumId)) || fromPath.album || "Unknown album";
  const title = hit.title && !/^\d{1,3}$/.test(hit.title) ? hit.title : fromPath.title || hit.title || "Untitled";
  return {
    id: hit.id, name: title, artist, album, year: hit.year, genre: hit.genre,
    file: hit.file, artwork: artworkUrl(hit.artId),
    length: hit.length > 0 ? hit.length : undefined,
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
  if (!raw) return {};
  return parseMap(raw);
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
    let row: unknown[];
    try { row = JSON.parse(arrRaw) as unknown[]; }
    catch { lastComplete = arrStart + arrRaw.length; continue; }
    if (Array.isArray(row) && row.length >= 3) onRow(id, row);
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
  const MAX_HITS = opts?.maxHits ?? 80;

  let res: Response;
  try {
    res = await fetch("https://library.ibroadcast.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(authPayload(session)),
    });
  } catch (err) {
    try {
      res = await fetch("/api/ib-library-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, token: session.token }),
      });
    } catch (err2) {
      const aborted =
        (err instanceof Error && /abort/i.test(err.message)) ||
        (err2 instanceof Error && /abort/i.test(err2.message));
      return {
        ok: false, tracks: [], total: 0,
        error: aborted
          ? "Search was interrupted. Check your connection and try again."
          : "Could not reach iBroadcast. Check your connection.",
      };
    }
  }

  if (!res.ok || !res.body) {
    let msg = `iBroadcast library HTTP ${res.status}`;
    try {
      const t = await res.text();
      if (t && t.length < 200) msg = t;
      else {
        try {
          const j = JSON.parse(t) as { message?: string; error?: string };
          if (j.message || j.error) msg = String(j.message || j.error);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    if (/token|auth|login|sign/i.test(msg)) msg = "iBroadcast session expired. Sign out and sign in again.";
    return { ok: false, tracks: [], total: 0, error: msg };
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

  let artistCursor = 0, albumCursor = 0, trackCursor = 0;
  let artistsStart = -1, albumsStart = -1, tracksStart = -1;
  let mapsReady = false;

  const handleArtist = (id: string, row: unknown[]) => {
    const name = strAt(row, artistMap.name ?? 0);
    if (name && !/^\d+$/.test(name)) artists.set(id, name);
  };
  const handleAlbum = (id: string, row: unknown[]) => {
    const name = strAt(row, albumMap.name ?? 0);
    if (name && !/^\d+$/.test(name)) albums.set(id, name);
  };
  const handleTrack = (id: string, row: unknown[]) => {
    if (pending.length >= MAX_HITS || seen.has(id)) return;
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
        if (typeof cell === "string" && /music\//i.test(cell)) { pathVal = cell; break; }
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
      const lv = row[lenIdx];
      const n = typeof lv === "number" ? lv : Number(lv);
      if (Number.isFinite(n) && n > 0 && n < 36000) lengthSec = Math.round(n);
    }
    const artistName = (artistId && artists.get(artistId)) || pathNames.artist || "";
    const albumName = (albumId && albums.get(albumId)) || pathNames.album || "";
    const hay = [title, artistName, albumName, genre, pathVal, JSON.stringify(row)].join(" ").toLowerCase();
    if (!hay.includes(q)) return;
    const trashedIdx = tm.trashed ?? DEFAULT_TRACK_MAP.trashed;
    if (trashedIdx != null) {
      const tr = row[trashedIdx];
      if (tr === true || tr === 1 || tr === "1" || tr === "true") return;
    }
    seen.add(id);
    pending.push({
      id, title, genre: genre && !/^\d+$/.test(genre) ? genre : "", year,
      albumId, artistId, artId, file, path: pathVal, length: lengthSec,
    });
    opts?.onProgress?.(pending.length);
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
        if (m.title != null) { trackMap = { ...DEFAULT_TRACK_MAP, ...m }; mapsReady = true; }
      }
    }
    if (artistsStart >= 0) { artistCursor = Math.max(artistCursor, artistsStart); artistCursor = scanEntries(buf, artistCursor, handleArtist); }
    if (albumsStart >= 0) { albumCursor = Math.max(albumCursor, albumsStart); albumCursor = scanEntries(buf, albumCursor, handleAlbum); }
    if (tracksStart >= 0) { trackCursor = Math.max(trackCursor, tracksStart); trackCursor = scanEntries(buf, trackCursor, handleTrack); }
    const MAX_BUF = 8_000_000;
    if (buf.length > MAX_BUF) {
      const keepFrom = Math.min(
        artistsStart >= 0 ? artistCursor : buf.length,
        albumsStart >= 0 ? albumCursor : buf.length,
        tracksStart >= 0 ? trackCursor : buf.length,
      );
      const cut = Math.max(0, Math.min(keepFrom, buf.length - 1_000_000));
      if (cut > 0) {
        buf = buf.slice(cut);
        if (artistsStart >= 0) { artistsStart = Math.max(0, artistsStart - cut); artistCursor = Math.max(0, artistCursor - cut); }
        if (albumsStart >= 0) { albumsStart = Math.max(0, albumsStart - cut); albumCursor = Math.max(0, albumCursor - cut); }
        if (tracksStart >= 0) { tracksStart = Math.max(0, tracksStart - cut); trackCursor = Math.max(0, trackCursor - cut); }
      }
    }
    return pending.length >= MAX_HITS;
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
      error: err instanceof Error && /abort/i.test(err.message)
        ? "Search was interrupted. Try again."
        : err instanceof Error ? err.message : "Search failed while reading the library.",
    };
  }

  if (!pending.length) {
    return {
      ok: false, tracks: [], total: 0,
      error: tracksStart < 0
        ? "Could not read track list from iBroadcast. Sign out and sign in again, then retry."
        : "No matches found yet in the part of the library that loaded. Try a more specific title, or wait and search again.",
    };
  }
  const tracks = pending.map((h) => resolveHit(h, artists, albums));
  return { ok: true, tracks, total: tracks.length, truncated: tracks.length >= MAX_HITS };
}
