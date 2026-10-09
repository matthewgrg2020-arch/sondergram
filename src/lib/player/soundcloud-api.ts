import { createServerFn } from "@tanstack/react-start";
import { parseSoundCloudUrl, type ScHit } from "./soundcloud";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Last known working public web client id — refreshed from the site when possible. */
const FALLBACK_CLIENT_ID = "IysGhRTI7AdLDwRrKw5hy3UqwhvyW3Vw";

let cachedClientId = "";
let cacheAt = 0;
const CACHE_MS = 1000 * 60 * 60 * 6;

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function asJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractClientId(text: string): string {
  const patterns = [
    /client_id\s*[:=]\s*["']([a-zA-Z0-9]{32})["']/,
    /["']client_id["']\s*[:=]\s*["']([a-zA-Z0-9]{32})["']/,
    /client_id=([a-zA-Z0-9]{32})/,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function discoverClientId(): Promise<string> {
  const page = await fetch("https://soundcloud.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!page.ok) throw new Error(`SoundCloud home ${page.status}`);
  const html = await page.text();

  const fromHtml = extractClientId(html);
  if (fromHtml) return fromHtml;

  const scripts = [...html.matchAll(/src=["'](https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js)["']/g)].map((m) => m[1]!);
  // Prefer larger app bundles first (client_id usually lives there).
  const ordered = [...scripts].reverse();
  for (const src of ordered) {
    try {
      const js = await fetch(src, { headers: { "User-Agent": UA } }).then((r) => r.text());
      const id = extractClientId(js);
      if (id) return id;
    } catch {
      /* try next */
    }
  }
  return "";
}

async function clientId() {
  if (cachedClientId && Date.now() - cacheAt < CACHE_MS) return cachedClientId;
  try {
    const found = await discoverClientId();
    if (found) {
      cachedClientId = found;
      cacheAt = Date.now();
      return cachedClientId;
    }
  } catch {
    /* use fallback */
  }
  if (FALLBACK_CLIENT_ID) {
    cachedClientId = FALLBACK_CLIENT_ID;
    cacheAt = Date.now();
    return cachedClientId;
  }
  throw new Error("Could not reach SoundCloud right now.");
}

function mapTrack(row: Record<string, unknown>): ScHit | null {
  const user = asJson(row.user);
  const media = asJson(row.media);
  const transcodings = Array.isArray(media.transcodings) ? media.transcodings : [];
  const progressive =
    transcodings
      .map(asJson)
      .find((t) => str(asJson(t.format).protocol) === "progressive" && /mpeg|mp3/i.test(str(asJson(t.format).mime_type))) ||
    transcodings.map(asJson).find((t) => str(asJson(t.format).protocol) === "progressive") ||
    transcodings.map(asJson)[0];
  const streamUrl = str(progressive?.url);
  const id = str(row.id || row.urn);
  const page = str(row.permalink_url || row.uri);
  const name = str(row.title);
  if (!id || !name) return null;
  const artwork = str(row.artwork_url || row.artworkUrl || user.avatar_url).replace("-large", "-t500x500");
  return {
    id,
    name,
    artist: str(user.username || user.full_name || "Unknown artist"),
    album: str(row.publisher_metadata && asJson(row.publisher_metadata).album_title) || "SoundCloud",
    genre: str(row.genre) || "SoundCloud",
    cover: artwork,
    duration: Math.round((Number(row.duration) || 0) / 1000),
    url: page,
    streamUrl,
    page,
  };
}

async function resolveStream(apiUrl: string) {
  if (!apiUrl) return "";
  const cid = await clientId();
  const joined = apiUrl.includes("?") ? `${apiUrl}&client_id=${cid}` : `${apiUrl}?client_id=${cid}`;
  const res = await fetch(joined, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return "";
  const data = asJson(await res.json());
  return str(data.url);
}

export const scSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (q.length < 2) return { hits: [] as ScHit[] };
    const cid = await clientId();
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=24&app_locale=en`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error("SoundCloud search failed.");
    const body = asJson(await res.json());
    const collection = Array.isArray(body.collection) ? body.collection : Array.isArray(body) ? body : [];
    const hits: ScHit[] = [];
    for (const row of collection) {
      const hit = mapTrack(asJson(row));
      if (hit) hits.push(hit);
    }
    return { hits };
  });

export const scResolve = createServerFn({ method: "POST" })
  .validator((d: { url?: string; id?: string; streamUrl?: string }) => d)
  .handler(async ({ data }) => {
    const cid = await clientId();
    const page = parseSoundCloudUrl(data.url || "");
    if (page) {
      const res = await fetch(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(page)}&client_id=${cid}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Could not open that SoundCloud link.");
      const row = asJson(await res.json());
      const hit = mapTrack(row);
      if (!hit) throw new Error("That SoundCloud page is not a track.");
      const stream = (await resolveStream(hit.streamUrl)) || hit.streamUrl;
      return { ...hit, streamUrl: stream };
    }
    if (data.streamUrl) {
      const stream = await resolveStream(str(data.streamUrl));
      return { streamUrl: stream || str(data.streamUrl) };
    }
    throw new Error("Paste a SoundCloud track link or search first.");
  });
