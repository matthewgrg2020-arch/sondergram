import { createAPIFileRoute } from "@tanstack/react-start/api";

export const maxDuration = 60;

type Hit = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  file: string;
  artwork: string;
};

function artworkUrl(artId: string) {
  const id = String(artId || "").trim();
  if (!id || id === "0") return "";
  return `https://artwork.ibroadcast.com/artwork/${id}-500`;
}

/** Extract a JSON object/array starting at index with balanced braces/brackets. */
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

export const APIRoute = createAPIFileRoute("/api/ib-search")({
  POST: async ({ request }) => {
    try {
      const body = (await request.json()) as {
        userId?: string;
        token?: string;
        streaming?: string;
        q?: string;
      };
      const userId = String(body.userId || "").trim();
      const token = String(body.token || "").trim();
      const q = String(body.q || "").trim().toLowerCase();
      if (!userId || !token) {
        return Response.json({ ok: false, tracks: [], total: 0, error: "Sign in to iBroadcast first." });
      }
      if (q.length < 2) {
        return Response.json({ ok: false, tracks: [], total: 0, error: "Type at least 2 characters to search." });
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
      const kill = setTimeout(() => controller.abort(), 55000);

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
        const msg = err instanceof Error && /abort/i.test(err.message)
          ? "Search timed out scanning your large library. Try a more specific name."
          : "Could not reach iBroadcast library.";
        return Response.json({ ok: false, tracks: [], total: 0, error: msg });
      }

      if (!upstream.ok || !upstream.body) {
        clearTimeout(kill);
        return Response.json({
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
      const MAX_HITS = 80;
      const MAX_BUF = 8_000_000;

      const digestSection = (label: "artists" | "albums" | "tracks", section: string) => {
        // map first
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

        // entries: "id":[...]
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

          // tracks
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
          // skip trashed
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
            // Drop consumed prefix to keep memory bounded (keep tail for partial)
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
            } catch {}
            break;
          }
        }
        buf += decoder.decode();
        scanBuffer();
      } finally {
        clearTimeout(kill);
      }

      if (!hits.length) {
        return Response.json({
          ok: false,
          tracks: [],
          total: 0,
          error:
            "No matches found (or library scan timed out before hitting that name). Try a shorter, more specific search.",
        });
      }

      return Response.json({
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
      return Response.json({ ok: false, tracks: [], total: 0, error: message });
    }
  },
});
