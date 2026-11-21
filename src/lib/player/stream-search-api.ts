import { createServerFn } from "@tanstack/react-start";
import { STREAM_SOURCES, type StreamHit, type StreamSource } from "./stream-search";
import { ytDlpSearch } from "./yt-dlp.server";
import { proxyAudioUrl, youtubeStreamUrl } from "./youtube-stream.server";

type Json = Record<string, unknown>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const row = asJson(value);
    return str(row.name || row.title || row["#text"]);
  }
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(value: unknown) {
  const match = str(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function wanted(sources: StreamSource[] | undefined, name: StreamSource) {
  return !sources?.length || sources.includes(name);
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": UA, ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function hit(partial: Omit<StreamHit, "key"> & { key?: string }): StreamHit {
  return {
    key:
      partial.key ||
      `${partial.source}:${partial.kind}:${partial.deezerId || partial.spotifyId || partial.amazonId || partial.youtubeId || partial.archiveId || partial.bandcampUrl || partial.audiusId || partial.appleId || partial.name}:${partial.artist}`,
    ...partial,
  };
}

async function itunesSearch(q: string, entity: "song" | "album"): Promise<StreamHit[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", q);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", entity);
  url.searchParams.set("limit", "10");
  const data = asJson(await getJson(url.toString()));
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows.map((row) => {
    const item = asJson(row);
    const album = entity === "album";
    return hit({
      source: "Apple Music",
      kind: album ? "album" : "track",
      name: str(item.trackName) || str(item.collectionName),
      artist: str(item.artistName),
      album: str(item.collectionName),
      year: yearOf(item.releaseDate),
      cover: str(item.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb"),
      preview: str(item.previewUrl),
      duration: Math.round(num(item.trackTimeMillis) / 1000),
      trackNo: num(item.trackNumber) || 0,
      collectionId: str(item.collectionId),
      appleId: album ? str(item.collectionId) : str(item.trackId) || str(item.collectionId),
      page: str(item.collectionViewUrl || item.trackViewUrl),
    });
  });
}

async function deezerSearch(q: string): Promise<StreamHit[]> {
  const [tracks, albums] = await Promise.all([
    getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`),
    getJson(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=8`),
  ]);
  const out: StreamHit[] = [];
  for (const row of Array.isArray(asJson(tracks).data) ? (asJson(tracks).data as unknown[]) : []) {
    const item = asJson(row);
    const artist = asJson(item.artist);
    const album = asJson(item.album);
    out.push(
      hit({
        source: "Deezer",
        kind: "track",
        name: str(item.title),
        artist: str(artist.name),
        album: str(album.title),
        year: yearOf(album.release_date || item.release_date),
        cover: str(album.cover_xl) || str(album.cover_big),
        preview: str(item.preview),
        duration: num(item.duration),
        trackNo: num(item.track_position),
        deezerId: str(item.id),
        page: str(item.link),
      }),
    );
  }
  for (const row of Array.isArray(asJson(albums).data) ? (asJson(albums).data as unknown[]) : []) {
    const item = asJson(row);
    const artist = asJson(item.artist);
    out.push(
      hit({
        source: "Deezer",
        kind: "album",
        name: str(item.title),
        artist: str(artist.name),
        album: str(item.title),
        year: yearOf(item.release_date),
        cover: str(item.cover_xl) || str(item.cover_big),
        preview: "",
        duration: num(item.duration),
        trackNo: 0,
        deezerId: str(item.id),
        page: str(item.link),
      }),
    );
  }
  return out.filter((row) => row.name);
}

const YTM_JUNK =
  /^(like this song|save this for later|subscribe to this artist|start radio|play next|add to queue|share|go to album|go to artist|shuffle|radio|mix|playlist|album|song|videos|community|about|home|explore|library|upgrade|sign in|got it|downloads use|not now|dismiss)$/i;

function runsText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const row = asJson(value);
  if (Array.isArray(row.runs)) {
    return row.runs.map((r) => str(asJson(r).text)).filter(Boolean).join("");
  }
  return str(row.simpleText || row.text);
}

function walkYtm(node: unknown, out: { id: string; title: string; artist: string }[], seen: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkYtm(child, out, seen);
    return;
  }
  const row = asJson(node);
  const overlay =
    asJson(asJson(row.overlay).musicItemThumbnailOverlayRenderer).content ||
    asJson(asJson(row.thumbnailOverlay).musicItemThumbnailOverlayRenderer).content;
  const playBtn = asJson(asJson(overlay).musicPlayButtonRenderer);
  const playEP = asJson(asJson(playBtn.playNavigationEndpoint).watchEndpoint);
  let videoId = str(playEP.videoId);
  if (!videoId) {
    const we = asJson(asJson(row.navigationEndpoint).watchEndpoint);
    videoId = str(we.videoId);
  }
  if (!videoId) {
    videoId = str(asJson(asJson(asJson(row.doubleTapCommand).watchEndpoint)).videoId);
  }
  const flex = Array.isArray(row.flexColumns) ? row.flexColumns : [];
  let title = "";
  let artist = "";
  if (flex.length) {
    const t0 = asJson(asJson(flex[0]).musicResponsiveListItemFlexColumnRenderer).text;
    title = runsText(t0);
    if (flex[1]) {
      const t1 = asJson(asJson(flex[1]).musicResponsiveListItemFlexColumnRenderer).text;
      const sub = runsText(t1);
      artist = sub.split("•")[0]?.trim() || sub;
    }
  }
  if (!title && row.title) title = runsText(row.title);
  if (!artist && row.subtitle) artist = runsText(row.subtitle).split("•")[0]?.trim() || "";
  if (videoId && title && !YTM_JUNK.test(title) && !seen.has(videoId)) {
    seen.add(videoId);
    out.push({ id: videoId, title, artist: artist || "YouTube Music" });
  }
  for (const v of Object.values(row)) walkYtm(v, out, seen);
}

async function youtubeSearch(q: string): Promise<StreamHit[]> {
  try {
    const dlp = await ytDlpSearch(q, 12);
    if (dlp.length) {
      return dlp.map((row) =>
        hit({
          source: "YouTube Music",
          kind: "track",
          name: row.title,
          artist: row.artist.replace(/\s+[-–—]\s+Topic$/i, "").trim() || "YouTube Music",
          album: "YouTube Music",
          year: "",
          cover: row.cover || `https://i.ytimg.com/vi/${row.id}/hqdefault.jpg`,
          preview: "",
          duration: row.duration || 0,
          trackNo: 0,
          youtubeId: row.id,
          page: `https://music.youtube.com/watch?v=${row.id}`,
        }),
      );
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch("https://music.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "X-YouTube-Client-Name": "67",
        "X-YouTube-Client-Version": "1.20240101.00.00",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: "1.20240101.00.00",
            hl: "en",
            gl: "US",
          },
        },
        query: q,
        params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
      }),
    });
    const data = asJson(await res.json().catch(() => ({})));
    const found: { id: string; title: string; artist: string }[] = [];
    const seen = new Set<string>();
    walkYtm(data, found, seen);
    return found.slice(0, 12).map((row) =>
      hit({
        source: "YouTube Music",
        kind: "track",
        name: row.title,
        artist: row.artist.replace(/\s+[-–—]\s+Topic$/i, "").trim() || "YouTube Music",
        album: "YouTube Music",
        year: "",
        cover: `https://i.ytimg.com/vi/${row.id}/hqdefault.jpg`,
        preview: "",
        duration: 0,
        trackNo: 0,
        youtubeId: row.id,
        page: `https://music.youtube.com/watch?v=${row.id}`,
      }),
    );
  } catch {
    return [];
  }
}

export const streamSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string; token?: string; sources?: StreamSource[] }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (!q) return { hits: [] as StreamHit[] };
    const sources = (data.sources || []).filter((s): s is StreamSource => STREAM_SOURCES.includes(s as StreamSource));
    const jobs: Promise<StreamHit[]>[] = [];
    if (wanted(sources, "Apple Music")) jobs.push(itunesSearch(q, "song"), itunesSearch(q, "album"));
    if (wanted(sources, "Deezer")) jobs.push(deezerSearch(q));
    if (wanted(sources, "YouTube") || wanted(sources, "YouTube Music")) jobs.push(youtubeSearch(q));
    const settled = await Promise.allSettled(jobs);
    const hits: StreamHit[] = [];
    const seen = new Set<string>();
    for (const row of settled) {
      if (row.status !== "fulfilled") continue;
      for (const item of row.value) {
        if (!item.name || seen.has(item.key)) continue;
        if (item.source === "YouTube Music" && YTM_JUNK.test(item.name)) continue;
        seen.add(item.key);
        hits.push(item);
      }
    }
    return { hits };
  });

export const streamAlbum = createServerFn({ method: "POST" })
  .validator((d: StreamHit & { token?: string }) => d)
  .handler(async () => {
    return { tracks: [] as StreamHit[] };
  });

export const resolveFullTrack = createServerFn({ method: "POST" })
  .validator((d: { artist?: string; name?: string; album?: string; duration?: number; youtubeId?: string }) => d)
  .handler(async ({ data }) => {
    const youtubeId = str(data.youtubeId);
    if (youtubeId) {
      const url = await youtubeStreamUrl(youtubeId);
      return { youtubeId, url: proxyAudioUrl(url), duration: num(data.duration) };
    }
    const artist = str(data.artist);
    const name = str(data.name);
    if (artist || name) {
      const yt = await youtubeSearch(`${artist} ${name}`.trim());
      const best = yt.find((t) => t.kind === "track" && t.youtubeId) || yt[0];
      if (best?.youtubeId) {
        const url = await youtubeStreamUrl(best.youtubeId);
        return {
          youtubeId: best.youtubeId,
          url: proxyAudioUrl(url),
          duration: best.duration || num(data.duration),
        };
      }
    }
    return { youtubeId: "", url: "", duration: 0 };
  });
