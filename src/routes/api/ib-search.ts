import { createFileRoute } from "@tanstack/react-router";

export const maxDuration = 120;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractBalanced(src: string, openIdx: number): string | null {
  if (openIdx < 0 || openIdx >= src.length || src[openIdx] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return null;
}

function parseMap(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function artworkUrl(artId: string | undefined): string | undefined {
  if (!artId) return undefined;
  return `https://artwork.ibroadcast.com/artwork/${artId}-300`;
}

type Hit = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year?: string;
  genre?: string;
  file?: string;
  artwork?: string;
};

async function handle({ request }: { request: Request }) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      token?: string;
      q?: string;
      maxHits?: number;
    };
    const userId = String(body.userId || "").trim();
    const token = String(body.token || "").trim();
    const q = String(body.q || "").trim().toLowerCase();
    if (!userId || !token) {
      return json({ ok: false, tracks: [], total: 0, error: "Sign in to iBroadcast first." }, 401);
    }
    if (q.length < 2) {
      return json({ ok: false, tracks: [], total: 0, error: "Type at least 2 characters to search." }, 400);
    }

    const uidNum = Number(userId);
    const uid = Number.isFinite(uidNum) && uidNum > 0 ? uidNum : userId;
    const payload = {
      _token: token,
      _userid: uid,
      user_id: uid,
      token,
      client: "Sondergram",
      version: "1.0",
      device_name: "Sondergram Web",
      user_agent: "Sondergram/1.0",
      mode: "library",
      supported_types: false,
      url: "//library.ibroadcast.com",
    };

    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), 100000);

    let upstream: Response;
    try {
      upstream = await fetch("https://library.ibroadcast.com/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Sondergram/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(kill);
      const msg =
        err instanceof Error && /abort/i.test(err.message)
          ? "Search timed out scanning your large library. Try a more specific artist or album name."
          : "Could not reach iBroadcast library.";
      return json({ ok: false, tracks: [], total: 0, error: msg });
    }

    if (!upstream.ok || !upstream.body) {
      clearTimeout(kill);
      return json({
        ok: false,
        tracks: [],
        total: 0,
        error: `iBroadcast library HTTP ${upstream.status}`,
      });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const artists = new Map<string, string>();
    const albums = new Map<string, string>();
    let trackMap: Record<string, number> = {};
    let albumMap: Record<string, number> = {};
    let artistMap: Record<string, number> = {};
    const hits: Hit[] = [];
    const seen = new Set<string>();
    const MAX_HITS = 120;
    const MAX_BUF = 8_000_000;

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
        let depth = 1;
        let inStr = false;
        let esc = false;
        let end = -1;
        for (let i = arrStart + 1; i < section.length; i++) {
          const ch = section[i]!;
          if (inStr) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inStr = false;
            continue;
          }
          if (ch === '"') inStr = true;
          else if (ch === "[") depth++;
          else if (ch === "]") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end < 0) continue;
        let row: unknown[] = [];
        try {
          row = JSON.parse(section.slice(arrStart, end + 1)) as unknown[];
        } catch {
          continue;
        }
        if (!Array.isArray(row)) continue;

        if (label === "artists") {
          const nameIdx = artistMap.name ?? 0;
          const name = typeof row[nameIdx] === "string" ? (row[nameIdx] as string) : "";
          if (name && !/^\d+$/.test(name)) {
            artists.set(id, name);
            artists.set(String(id), name);
          }
          continue;
        }
        if (label === "albums") {
          const nameIdx = albumMap.name ?? 0;
          const name = typeof row[nameIdx] === "string" ? (row[nameIdx] as string) : "";
          if (name && !/^\d+$/.test(name)) {
            albums.set(id, name);
            albums.set(String(id), name);
          }
          continue;
        }

        // tracks
        if (hits.length >= MAX_HITS || seen.has(id)) continue;
        const tm = trackMap;
        const titleIdx = tm.title ?? 2;
        const artistIdx = tm.artist_id ?? 7;
        const albumIdx = tm.album_id ?? 5;
        const fileIdx = tm.file ?? 16;
        const yearIdx = tm.year ?? 1;
        const genreIdx = tm.genre ?? 3;
        const artIdx = tm.artwork_id ?? 6;
        const title = typeof row[titleIdx] === "string" ? (row[titleIdx] as string) : "";
        const file = typeof row[fileIdx] === "string" ? (row[fileIdx] as string) : "";
        const yearRaw = row[yearIdx];
        const year = typeof yearRaw === "string" && /^\d{4}$/.test(yearRaw) ? yearRaw : "";
        const genre = typeof row[genreIdx] === "string" ? (row[genreIdx] as string) : "";
        const artId = row[artIdx] != null ? String(row[artIdx]) : "";
        const artistId = row[artistIdx] != null ? String(row[artistIdx]) : "";
        const albumId = row[albumIdx] != null ? String(row[albumIdx]) : "";
        const artistName = (artistId && (artists.get(artistId) || artists.get(String(artistId)))) || "";
        const albumName = (albumId && (albums.get(albumId) || albums.get(String(albumId)))) || "";
        const blob = `${title} ${artistName} ${albumName}`.toLowerCase();
        if (!blob.includes(q)) continue;
        const trashedIdx = tm.trashed;
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
      if (buf.length > MAX_BUF) {
        buf = buf.slice(-Math.floor(MAX_BUF / 2));
      }
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
    } catch (readErr) {
      if (!hits.length) {
        clearTimeout(kill);
        const msg =
          readErr instanceof Error && /abort/i.test(readErr.message)
            ? "Search timed out scanning your large library. Try a more specific artist or album name."
            : readErr instanceof Error
              ? readErr.message
              : "Search failed while reading library.";
        return json({ ok: false, tracks: [], total: 0, error: msg });
      }
    } finally {
      clearTimeout(kill);
    }

    if (!hits.length) {
      return json({
        ok: false,
        tracks: [],
        total: 0,
        error:
          "No matches found (or scan timed out before reaching that name). Try a shorter, more specific search.",
      });
    }

    return json({
      ok: true,
      tracks: hits,
      total: hits.length,
      truncated: hits.length >= MAX_HITS,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message && err.message !== "[object Object]"
        ? err.message
        : "iBroadcast search failed.";
    return json({ ok: false, tracks: [], total: 0, error: message });
  }
}

export const Route = createFileRoute("/api/ib-search")({
  server: {
    handlers: {
      POST: handle,
    },
  },
});
