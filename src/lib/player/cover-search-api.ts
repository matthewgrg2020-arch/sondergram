import { createServerFn } from "@tanstack/react-start";
import { pullCoverBytes } from "./cover-fetch";

export type AlbumHitDto = {
  title: string;
  artist: string;
  year: string;
  genre: string;
  artwork: string;
  description: string;
  explicit: boolean;
  trackCount: number;
};

type WebCover = {
  url: string;
  thumb: string;
  source: string;
  label: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SKIP =
  /gstatic\.com\/images\/branding|google\.com\/(logos|images\/nav)|schemas\.google|favicon|sprite|pixel|1x1|logo\.png|youtube\.com\/(watch|embed)|doubleclick|pagead/i;

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function unescapeUrl(value: string) {
  const amp = String.fromCharCode(38);
  const raw = value
    .replaceAll(`${amp}amp;`, amp)
    .replaceAll(`${amp}quot;`, '"')
    .replaceAll(`${amp}#39;`, "'")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function okImage(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.length > 1800) return false;
  if (SKIP.test(url)) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  return true;
}

function pushHit(out: WebCover[], seen: Set<string>, url: string, thumb: string, source: string, label: string) {
  const clean = unescapeUrl(url).split("#")[0];
  const key = clean.split("?")[0];
  if (!okImage(clean) || seen.has(key)) return;
  seen.add(key);
  out.push({
    url: clean,
    thumb: okImage(thumb) ? unescapeUrl(thumb) : clean,
    source,
    label: label || "Album cover",
  });
}

async function read(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      ...(headers || {}),
    },
    redirect: "follow",
  });
  if (!res.ok) return "";
  return res.text();
}

function googleHits(html: string, seen: Set<string>): WebCover[] {
  const out: WebCover[] = [];
  const ou = [...html.matchAll(/"ou":"(https?:\\\/\\\/[^"]+)"/g)];
  const tu = [...html.matchAll(/"tu":"(https?:\\\/\\\/[^"]+)"/g)];
  const titles = [...html.matchAll(/"pt":"([^"]+)"/g)];
  for (let i = 0; i < ou.length; i++) {
    const url = ou[i]?.[1] || "";
    const thumb = tu[i]?.[1] || "";
    const label = titles[i]?.[1]?.replace(/\\u0026/g, "&") || "Google";
    pushHit(out, seen, url, thumb, "Google", label);
  }
  for (const match of html.matchAll(/imgurl=(https?:\/\/[^&"]+)/gi)) {
    pushHit(out, seen, match[1] || "", "", "Google", "Google");
  }
  for (const match of html.matchAll(/"(https:\/\/encrypted-tbn[^"]+)"/g)) {
    const thumb = unescapeUrl(match[1] || "");
    if (okImage(thumb)) pushHit(out, seen, thumb, thumb, "Google", "Google");
  }
  return out;
}

async function searchGoogle(q: string): Promise<WebCover[]> {
  const seen = new Set<string>();
  const query = encodeURIComponent(q);
  const pages = [
    `https://www.google.com/search?q=${query}&tbm=isch&hl=en&safe=off&ijn=0`,
    `https://www.google.com/search?q=${query}&udm=2&hl=en`,
  ];
  const out: WebCover[] = [];
  for (const url of pages) {
    const html = await read(url);
    if (!html || html.length < 400) continue;
    if (/unusual traffic|sorry\/index|detected unusual/i.test(html) && html.length < 12000) continue;
    out.push(...googleHits(html, seen));
    if (out.length >= 12) break;
  }
  return out.slice(0, 16);
}

async function searchBing(q: string): Promise<WebCover[]> {
  const html = await read(
    `https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=0&count=28&mmasync=1`,
    { Referer: "https://www.bing.com/images/search" },
  );
  if (!html) return [];
  const amp = String.fromCharCode(38);
  const decoded = html.replaceAll(`${amp}quot;`, '"').replaceAll(`${amp}amp;`, amp);
  const seen = new Set<string>();
  const out: WebCover[] = [];
  for (const match of decoded.matchAll(/murl":"(https?:[^"]+)","turl":"(https?:[^"]+)"[\s\S]{0,500}?t":"([^"]*)"/g)) {
    const label = (match[3] || "Bing").replace(/&#\d+;/g, " ").slice(0, 80);
    pushHit(out, seen, match[1] || "", match[2] || "", "Bing", label);
  }
  return out.slice(0, 16);
}

async function searchDdg(q: string): Promise<WebCover[]> {
  const page = await read(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`);
  const vqd = page.match(/vqd=["']([^"']+)["']/)?.[1] || page.match(/vqd=([0-9-]+)/)?.[1] || "";
  if (!vqd) return [];
  const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(vqd)}&f=,,,`;
  const text = await read(url, { Accept: "application/json", Referer: "https://duckduckgo.com/" });
  if (!text) return [];
  let data: { results?: { image?: string; thumbnail?: string; title?: string }[] };
  try {
    data = JSON.parse(text) as { results?: { image?: string; thumbnail?: string; title?: string }[] };
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: WebCover[] = [];
  for (const row of data.results ?? []) {
    if (!row.image) continue;
    pushHit(out, seen, row.image, row.thumbnail || row.image, "DuckDuckGo", row.title || "DuckDuckGo");
  }
  return out.slice(0, 16);
}

const MB_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Sondergram/1.0 (https://grok.com)",
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  const text = await read(url, { Accept: "application/json", ...(headers || {}) });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function searchPicard(artist: string, album: string): Promise<WebCover[]> {
  const query =
    artist && album
      ? `release:"${album}" AND artist:"${artist}"`
      : album
        ? `"${album}"`
        : `artist:"${artist}"`;
  if (!query || query === `artist:""` || query === `""`) return [];
  const encoded = encodeURIComponent(query);
  const [groups, releases] = await Promise.all([
    readJson<{ release_groups?: { id?: string; title?: string }[] }>(
      `https://musicbrainz.org/ws/2/release-group/?query=${encoded}&limit=5&fmt=json`,
      MB_HEADERS,
    ),
    readJson<{ releases?: { id?: string; title?: string }[] }>(
      `https://musicbrainz.org/ws/2/release/?query=${encoded}&limit=6&fmt=json`,
      MB_HEADERS,
    ),
  ]);
  const jobs: { kind: "release" | "release-group"; id: string; title: string }[] = [];
  const seenId = new Set<string>();
  for (const row of releases?.releases ?? []) {
    if (!row.id || seenId.has(row.id)) continue;
    seenId.add(row.id);
    jobs.push({ kind: "release", id: row.id, title: row.title || album });
  }
  for (const row of groups?.release_groups ?? []) {
    if (!row.id || seenId.has(row.id)) continue;
    seenId.add(row.id);
    jobs.push({ kind: "release-group", id: row.id, title: row.title || album });
  }
  const seen = new Set<string>();
  const out: WebCover[] = [];
  for (const job of jobs.slice(0, 4)) {
    const art = await readJson<{
      images?: {
        image?: string;
        front?: boolean;
        types?: string[];
        thumbnails?: { small?: string; large?: string; "250"?: string; "500"?: string; "1200"?: string };
      }[];
    }>(`https://coverartarchive.org/${job.kind}/${job.id}`, { Accept: "application/json" });
    const images = art?.images ?? [];
    const ordered = [...images.filter((image) => image.front), ...images.filter((image) => !image.front)].slice(0, 3);
    for (const image of ordered) {
      const url = image.image || image.thumbnails?.["1200"] || image.thumbnails?.large || image.thumbnails?.["500"] || "";
      if (!url) continue;
      const types = (image.types || []).join(" · ");
      const front = image.front || /front/i.test(types);
      pushHit(
        out,
        seen,
        url,
        image.thumbnails?.small || image.thumbnails?.["250"] || url,
        "MusicBrainz Picard",
        front ? job.title || album : types || job.title || album,
      );
    }
    await wait(110);
  }
  return out;
}

export const searchPicardCovers = createServerFn({ method: "POST" })
  .validator((d: { artist?: string; album?: string }) => d)
  .handler(async ({ data }) => searchPicard(str(data.artist), str(data.album)));

export const searchWebCovers = createServerFn({ method: "POST" })
  .validator((d: { q?: string }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (!q) return [] as WebCover[];
    const packs = await Promise.all([
      searchGoogle(q).catch(() => [] as WebCover[]),
      searchBing(q).catch(() => [] as WebCover[]),
      searchDdg(q).catch(() => [] as WebCover[]),
    ]);
    const seen = new Set<string>();
    const out: WebCover[] = [];
    for (const hit of packs.flat()) {
      const key = hit.url.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
    return out.slice(0, 24);
  });

export const fetchCoverImage = createServerFn({ method: "POST" })
  .validator((d: { url?: string }) => d)
  .handler(async ({ data }) => {
    const pulled = await pullCoverBytes(str(data.url));
    if (!pulled) return { ok: false as const };
    return { ok: true as const, type: pulled.type, b64: pulled.buf.toString("base64") };
  });

function hiResArt(url: string) {
  return url.replace(/\/\d+x\d+bb/g, "/1200x1200bb");
}

function yearOf(date?: string) {
  return date ? date.slice(0, 4) : "";
}

function scoreAlbum(hit: AlbumHitDto, artist: string, album: string) {
  const a = artist.trim().toLowerCase();
  const b = album.trim().toLowerCase();
  const ha = hit.artist.toLowerCase();
  const ht = hit.title.toLowerCase();
  let n = 0;
  if (a && ha === a) n += 4;
  else if (a && ha.includes(a)) n += 2;
  else if (a && a.includes(ha) && ha.length > 3) n += 1;
  else if (a) n -= 2;
  if (b && ht === b) n += 6;
  else if (b && ht.includes(b)) n += 4;
  else if (b && b.includes(ht) && ht.length > 3) n += 2;
  else if (b) n -= 3;
  if (hit.artwork) n += 1;
  if (hit.trackCount > 1) n += 1;
  return n;
}

async function searchAlbumHitsRaw(artist: string, album: string, track: string): Promise<AlbumHitDto[]> {
  const cleanArtist = /^unknown/i.test(artist) ? "" : artist.trim();
  const cleanAlbum = /^unknown/i.test(album) ? "" : album.trim();
  const term = [cleanArtist, cleanAlbum || track || ""].filter(Boolean).join(" ").trim();
  if (!term) return [];

  const itunesTerm = encodeURIComponent(cleanAlbum ? `${cleanArtist} ${cleanAlbum}`.trim() : term);
  const songTerm = encodeURIComponent([cleanArtist, track || cleanAlbum].filter(Boolean).join(" "));
  const deezerQ = encodeURIComponent([cleanArtist, cleanAlbum || track].filter(Boolean).join(" "));

  const [albumsRes, songsRes, deezerRes] = await Promise.all([
    fetch(`https://itunes.apple.com/search?term=${itunesTerm}&media=music&entity=album&limit=8`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
    fetch(`https://itunes.apple.com/search?term=${songTerm}&media=music&entity=song&limit=8`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
    deezerQ
      ? fetch(`https://api.deezer.com/search/album?q=${deezerQ}&limit=8`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  type ItunesRow = {
    collectionName?: string;
    artistName?: string;
    releaseDate?: string;
    artworkUrl100?: string;
    primaryGenreName?: string;
    collectionExplicitness?: string;
    trackExplicitness?: string;
    trackCount?: number;
    longDescription?: string;
  };

  const hits: AlbumHitDto[] = [];
  const seen = new Set<string>();
  const push = (hit: AlbumHitDto | null) => {
    if (!hit) return;
    const key = `${hit.artist.toLowerCase()}::${hit.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  const readItunes = async (res: Response | null) => {
    if (!res?.ok) return;
    const data = (await res.json()) as { results?: ItunesRow[] };
    for (const row of data.results ?? []) {
      const title = (row.collectionName || "").trim();
      const name = (row.artistName || "").trim();
      if (!title && !name) continue;
      push({
        title: title || "Unknown album",
        artist: name || "Unknown artist",
        year: yearOf(row.releaseDate),
        genre: (row.primaryGenreName || "").trim(),
        artwork: row.artworkUrl100 ? hiResArt(row.artworkUrl100) : "",
        description: (row.longDescription || "").trim(),
        explicit: row.collectionExplicitness === "explicit" || row.trackExplicitness === "explicit",
        trackCount: Number(row.trackCount) || 0,
      });
    }
  };

  await readItunes(albumsRes);
  await readItunes(songsRes);

  if (deezerRes?.ok) {
    const data = (await deezerRes.json()) as {
      data?: {
        title?: string;
        cover_xl?: string;
        cover_big?: string;
        release_date?: string;
        artist?: { name?: string };
        nb_tracks?: number;
        explicit_lyrics?: boolean;
      }[];
    };
    for (const row of data.data ?? []) {
      push({
        title: (row.title || "").trim() || "Unknown album",
        artist: (row.artist?.name || cleanArtist).trim() || "Unknown artist",
        year: yearOf(row.release_date),
        genre: "",
        artwork: row.cover_xl || row.cover_big || "",
        description: "",
        explicit: Boolean(row.explicit_lyrics),
        trackCount: Number(row.nb_tracks) || 0,
      });
    }
  }

  hits.sort((a, b) => scoreAlbum(b, cleanArtist, cleanAlbum) - scoreAlbum(a, cleanArtist, cleanAlbum));
  return hits.slice(0, 12);
}

export const searchAlbumHits = createServerFn({ method: "POST" })
  .validator((d: { artist?: string; album?: string; track?: string }) => d)
  .handler(async ({ data }) => searchAlbumHitsRaw(str(data.artist), str(data.album), str(data.track)));
