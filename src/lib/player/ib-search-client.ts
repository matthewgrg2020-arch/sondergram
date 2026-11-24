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

/**
 * Fetch library.ibroadcast.com DIRECTLY from the browser (CORS is open)
 * and match as the stream arrives. Avoids Vercel/host time limits.
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
    // Fallback through our proxy if direct fails (rare)
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
  const hits: IbTrack[] = [];
  const seen = new Set<string>();
  const MAX_BUF = 12_000_000;

  const digestSection = (label: "artists" | "albums" | "tracks", section: string) => {
    const mapIdx = section.indexOf('"map"');
    if (mapIdx >= 0) {
      const colon = section.indexOf(":", mapIdx);
      const brace = section.indexOf("{", colon);
      if (brace >= 0) {
        const raw = extractBalanced(section, brace);
        if (raw) {
          const m = parseMap(raw);
          if (label === "tracks") trackMap = { ...trackMap, ...m };
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
        const name = strAt(row, artistMap.name ?? 0);
        if (name) artists.set(id, name);
        continue;
      }
      if (label === "albums") {
        const name = strAt(row, albumMap.name ?? 0);
        if (name) albums.set(id, name);
        continue;
      }

      if (hits.length >= MAX_HITS || seen.has(id)) continue;
      const title = strAt(row, trackMap.title ?? trackMap.name ?? 2);
      const genre = strAt(row, trackMap.genre ?? 3);
      const year = strAt(row, trackMap.year ?? 1).slice(0, 4);
      const albumId = numAt(row, trackMap.album_id ?? 5);
      const artistId = numAt(row, trackMap.artist_id ?? 7);
      const artId = numAt(row, trackMap.artwork_id ?? 6);
      const file = strAt(row, trackMap.file ?? 16);
      const path = strAt(row, trackMap.path ?? 12);
      const albumName = albums.get(albumId) || "";
      const artistName = artists.get(artistId) || "";
      const hay = [title, artistName, albumName, genre, path, arrRaw].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
      const trashedIdx = trackMap.trashed;
      if (trashedIdx != null) {
        const tr = row[trashedIdx];
        if (tr === true || tr === 1 || tr === "1" || tr === "true") continue;
      }
      seen.add(id);
      hits.push({
        id,
        name: title || "Untitled",
        artist: artistName || "Unknown artist",
        album: albumName || "Unknown album",
        year,
        genre,
        file,
        artwork: artworkUrl(artId),
      });
      opts?.onProgress?.(hits.length);
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
        if (label === "tracks" && hits.length >= MAX_HITS) return true;
        from = brace + section.length;
      }
    }
    if (buf.length > MAX_BUF) buf = buf.slice(-Math.floor(MAX_BUF / 2));
    return hits.length >= MAX_HITS;
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
    if (hits.length) {
      return { ok: true, tracks: hits, total: hits.length, truncated: true };
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

  if (!hits.length) {
    return {
      ok: false,
      tracks: [],
      total: 0,
      error: "No matches found. Try a more specific song or album title.",
    };
  }

  return {
    ok: true,
    tracks: hits,
    total: hits.length,
    truncated: hits.length >= MAX_HITS,
  };
}
