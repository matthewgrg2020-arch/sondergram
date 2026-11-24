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
    if (c === '"') {
      inStr = true;
      continue;
    }
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
      if (typeof v === "number") out[k] = v;
      // skip nested map objects (artists_additional_map etc.)
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

/** Best-effort artist/album from iBroadcast path field. */
function namesFromPath(path: string): { artist: string; album: string } {
  const p = (path || "").replace(/\\/g, "/").trim();
  if (!p) return { artist: "", album: "" };
  // music/Artists/Artist Name/(2007) Album Name/file.mp3
  // music/Artist Name/Album Name/file.mp3
  const parts = p.split("/").filter(Boolean);
  // drop filename
  if (parts.length) parts.pop();
  // strip leading music / Artists / Albums
  while (
    parts.length &&
    /^(music|artists|albums|compilations|tracks|audio)$/i.test(parts[0]!)
  ) {
    parts.shift();
  }
  let artist = "";
  let album = "";
  if (parts.length >= 2) {
    artist = parts[0] || "";
    album = parts[1] || "";
  } else if (parts.length === 1) {
    album = parts[0] || "";
  }
  // strip year prefix on album: (2007) Name
  album = album.replace(/^\(\d{4}\)\s*/, "").trim();
  return { artist: artist.trim(), album: album.trim() };
}

type PendingHit = {
  id: string;
  title: string;
  genre: string;
  year: string;
  albumId: string;
  artistId: string;
  artId: string;
  file: string;
  path: string;
};

export type IbSearchResult = {
  ok: boolean;
  tracks: IbTrack[];
  total: number;
  truncated?: boolean;
  error?: string;
};

function authPayload(session: IbSession) {
  const uidNum = Number(session.userId);
  const uid = Number.isFinite(uidNum) && uidNum > 0 ? uidNum : session.userId;
  return {
    _token: session.token,
    _userid: uid,
    user_id: uid,
    token: session.token,
    client: "Sondergram",
    version: "1.0",
    device_name: "Sondergram Web",
    user_agent: "Sondergram/1.0",
    mode: "library",
    supported_types: false,
    url: "//library.ibroadcast.com",
  };
}

function resolveHit(
  hit: PendingHit,
  artists: Map<string, string>,
  albums: Map<string, string>,
): IbTrack {
  const fromPath = namesFromPath(hit.path);
  const artist =
    artists.get(hit.artistId) ||
    fromPath.artist ||
    (hit.artistId ? `Artist ${hit.artistId}` : "") ||
    "Unknown artist";
  const album =
    albums.get(hit.albumId) ||
    fromPath.album ||
    (hit.albumId ? `Album ${hit.albumId}` : "") ||
    "Unknown album";
  return {
    id: hit.id,
    name: hit.title || "Untitled",
    artist,
    album,
    year: hit.year,
    genre: hit.genre,
    file: hit.file,
    artwork: artworkUrl(hit.artId),
  };
}

/**
 * Fetch library.ibroadcast.com DIRECTLY from the browser (CORS is open)
 * and match as the stream arrives. Resolves artist/album after maps load.
 */
export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<IbSearchResult> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return { ok: false, tracks: [], total: 0, error: "Type at least 2 characters to search." };
  }
  const MAX_HITS = opts?.maxHits ?? 80;

  let res: Response;
  try {
    res = await fetch("https://library.ibroadcast.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
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
        ok: false,
        tracks: [],
        total: 0,
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
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    if (/token|auth|login|sign/i.test(msg)) {
      msg = "iBroadcast session expired. Sign out and sign in again.";
    }
    return { ok: false, tracks: [], total: 0, error: msg };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const artists = new Map<string, string>();
  const albums = new Map<string, string>();
  let trackMap: Record<string, number> = {};
  let albumMap: Record<string, number> = {};
  let artistMap: Record<string, number> = {};
  const pending: PendingHit[] = [];
  const seen = new Set<string>();
  let sawArtists = false;
  let sawAlbums = false;
  const MAX_BUF = 12_000_000;

  // Default field indices from iBroadcast docs / community clients
  const defaultTrackMap: Record<string, number> = {
    track: 0,
    year: 1,
    title: 2,
    genre: 3,
    length: 4,
    album_id: 5,
    artwork_id: 6,
    artist_id: 7,
    // path and file vary; filled when map is seen
  };

  const digestSection = (label: "artists" | "albums" | "tracks", section: string) => {
    const mapIdx = section.indexOf('"map"');
    if (mapIdx >= 0) {
      const colon = section.indexOf(":", mapIdx);
      const brace = section.indexOf("{", colon);
      if (brace >= 0) {
        const raw = extractBalanced(section, brace);
        if (raw) {
          const m = parseMap(raw);
          if (label === "tracks") trackMap = { ...defaultTrackMap, ...trackMap, ...m };
          if (label === "albums") albumMap = { ...albumMap, ...m };
          if (label === "artists") artistMap = { ...artistMap, ...m };
        }
      }
    }

    const re = /"(\d+)"\s*:\s*\[/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section))) {
      const id = m[1]!;
      const arrStart = section.indexOf("[", m.index);
      if (arrStart < 0) continue;
      const arrRaw = extractBalanced(section, arrStart);
      if (!arrRaw) continue;
      let row: unknown[];
      try {
        row = JSON.parse(arrRaw) as unknown[];
      } catch {
        continue;
      }
      if (!Array.isArray(row)) continue;

      if (label === "artists") {
        sawArtists = true;
        const name = strAt(row, artistMap.name ?? 0);
        if (name) artists.set(id, name);
        continue;
      }
      if (label === "albums") {
        sawAlbums = true;
        const name = strAt(row, albumMap.name ?? 0);
        if (name) albums.set(id, name);
        continue;
      }

      // tracks
      if (pending.length >= MAX_HITS || seen.has(id)) continue;

      const tm = Object.keys(trackMap).length ? trackMap : defaultTrackMap;
      const title = strAt(row, tm.title ?? tm.name ?? 2);
      const genre = strAt(row, tm.genre ?? 3);
      const year = strAt(row, tm.year ?? 1).slice(0, 4);
      const albumId = numAt(row, tm.album_id ?? 5);
      const artistId = numAt(row, tm.artist_id ?? 7);
      const artId = numAt(row, tm.artwork_id ?? 6);
      // file/path indices differ across accounts — scan string fields as fallback
      let file = strAt(row, tm.file);
      let path = strAt(row, tm.path);
      if (!file || !path) {
        for (const cell of row) {
          if (typeof cell !== "string") continue;
          if (!file && /^\/\d+\//.test(cell)) file = cell;
          if (!path && /music\//i.test(cell)) path = cell;
        }
      }

      const artistName = artists.get(artistId) || "";
      const albumName = albums.get(albumId) || "";
      const pathNames = namesFromPath(path);
      const hay = [title, artistName, albumName, pathNames.artist, pathNames.album, genre, path, arrRaw]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;

      const trashedIdx = tm.trashed;
      if (trashedIdx != null) {
        const tr = row[trashedIdx];
        if (tr === true || tr === 1 || tr === "1" || tr === "true") continue;
      }

      seen.add(id);
      pending.push({
        id,
        title: title || "Untitled",
        genre,
        year,
        albumId,
        artistId,
        artId,
        file,
        path,
      });
      opts?.onProgress?.(pending.length);
    }
  };

  const scanBuffer = () => {
    for (const label of ["artists", "albums", "tracks"] as const) {
      const key = `"${label}"`;
      let from = 0;
      while (true) {
        const keyIdx = buf.indexOf(key, from);
        if (keyIdx < 0) break;
        const brace = buf.indexOf("{", keyIdx + key.length);
        if (brace < 0) break;
        const section = extractBalanced(buf, brace);
        if (!section) {
          from = keyIdx + key.length;
          continue;
        }
        digestSection(label, section);
        from = brace + section.length;
      }
    }
    if (buf.length > MAX_BUF) buf = buf.slice(-Math.floor(MAX_BUF / 2));

    // Only stop early once we have enough hits AND name maps (so artist/album resolve)
    if (pending.length >= MAX_HITS && sawArtists && sawAlbums) return true;
    // Or enough hits and path-based names can fill gaps after a long scan
    if (pending.length >= MAX_HITS && (artists.size > 0 || albums.size > 0)) return true;
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (scanBuffer()) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
    }
    buf += decoder.decode();
    scanBuffer();
  } catch (err) {
    if (pending.length) {
      const tracks = pending.map((h) => resolveHit(h, artists, albums));
      return { ok: true, tracks, total: tracks.length, truncated: true };
    }
    return {
      ok: false,
      tracks: [],
      total: 0,
      error:
        err instanceof Error && /abort/i.test(err.message)
          ? "Search was interrupted. Try again."
          : err instanceof Error
            ? err.message
            : "Search failed while reading the library.",
    };
  }

  if (!pending.length) {
    return {
      ok: false,
      tracks: [],
      total: 0,
      error: "No matches found. Try a more specific song or album title.",
    };
  }

  const tracks = pending.map((h) => resolveHit(h, artists, albums));
  return {
    ok: true,
    tracks,
    total: tracks.length,
    truncated: tracks.length >= MAX_HITS,
  };
}
