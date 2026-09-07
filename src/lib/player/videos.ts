import { parseYoutubeId, youtubeThumb } from "./youtube";

export type MusicVideo = {
  youtubeId?: string;
  url: string;
  thumb: string;
  title: string;
  source: "youtube" | "itunes";
};

const cache = new Map<string, MusicVideo | null>();

function keyOf(artist: string, title: string) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function queryOf(artist: string, title: string) {
  return [artist, title, "official music video"].filter(Boolean).join(" ").trim();
}

function cleanTitle(value: string) {
  return value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function playable(hit: MusicVideo | null): hit is MusicVideo {
  if (!hit) return false;
  if (hit.youtubeId) return true;
  return /\.(m4v|mp4|mov|m3u8)(\?|$)/i.test(hit.url) || /video-ssl\.itunes\.apple\.com/i.test(hit.url);
}

async function itunesVideo(artist: string, title: string): Promise<MusicVideo | null> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${artist} ${title}`.trim());
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "musicVideo");
  url.searchParams.set("limit", "8");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: {
      trackName?: string;
      artistName?: string;
      previewUrl?: string;
      trackViewUrl?: string;
      artworkUrl100?: string;
    }[];
  };
  const want = cleanTitle(title);
  const artistWant = cleanTitle(artist);
  const rows = data.results ?? [];
  const row =
    rows.find((item) => cleanTitle(item.trackName || "").includes(want) && cleanTitle(item.artistName || "").includes(artistWant.slice(0, 12))) ||
    rows.find((item) => cleanTitle(item.trackName || "").includes(want)) ||
    rows[0];
  if (!row?.previewUrl && !row?.trackViewUrl) return null;
  const preview = row.previewUrl || "";
  return {
    url: preview || row.trackViewUrl || "",
    thumb: row.artworkUrl100 ? row.artworkUrl100.replace(/\/\d+x\d+bb/, "/800x800bb") : "",
    title: row.trackName || title,
    source: "itunes",
  };
}

const SEARCH_APIS = [
  (q: string) => `https://pipedapi.kavin.rocks/search?q=${q}&filter=videos`,
  (q: string) => `https://pipedapi.adminforge.de/search?q=${q}&filter=videos`,
  (q: string) => `https://inv.nadeko.net/api/v1/search?q=${q}&type=video`,
  (q: string) => `https://y.com.sb/api/v1/search?q=${q}&type=video`,
];

function pickThumb(value: unknown): string {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (Array.isArray(value)) {
    const best = value.find((item) => item && typeof item === "object" && (item as { quality?: string }).quality === "high") || value[0];
    if (typeof best === "string") return best;
    if (best && typeof best === "object" && "url" in best) return String((best as { url: string }).url || "");
  }
  if (value && typeof value === "object" && "url" in (value as object)) return String((value as { url: string }).url || "");
  return "";
}

async function youtubeVideo(artist: string, title: string): Promise<MusicVideo | null> {
  const q = encodeURIComponent(queryOf(artist, title));
  const want = cleanTitle(title);
  for (const make of SEARCH_APIS) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(make(q), { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      const rows = Array.isArray(data)
        ? data
        : ((data as { items?: unknown[]; results?: unknown[] }).items ?? (data as { results?: unknown[] }).results ?? []);
      const typed = rows as {
        type?: string;
        url?: string;
        title?: string;
        id?: string;
        videoId?: string;
        thumbnail?: unknown;
        videoThumbnails?: unknown;
      }[];
      const item =
        typed.find((row) => {
          if (row.type && row.type !== "video") return false;
          const name = cleanTitle(row.title || "");
          return name.includes(want.slice(0, 18)) || /official|music video|mv/.test(name);
        }) || typed.find((row) => !row.type || row.type === "video");
      if (!item) continue;
      const id =
        item.videoId ||
        item.id ||
        parseYoutubeId(item.url || "") ||
        parseYoutubeId(`https://www.youtube.com${item.url || ""}`);
      if (!id || id.length !== 11) continue;
      return {
        youtubeId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        thumb: pickThumb(item.thumbnail) || pickThumb(item.videoThumbnails) || youtubeThumb(id),
        title: item.title || title,
        source: "youtube",
      };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function findMusicVideo(artist: string, title: string): Promise<MusicVideo | null> {
  if (!title.trim()) return null;
  const key = keyOf(artist, title);
  if (cache.has(key)) return cache.get(key) ?? null;
  const [yt, apple] = await Promise.all([
    youtubeVideo(artist, title).catch(() => null),
    itunesVideo(artist, title).catch(() => null),
  ]);
  const hit = [yt, apple].find(playable) ?? null;
  if (hit && !hit.thumb && apple?.thumb) hit.thumb = apple.thumb;
  if (hit?.youtubeId && !hit.thumb) hit.thumb = youtubeThumb(hit.youtubeId);
  cache.set(key, hit);
  return hit;
}

export async function findAlbumVideos(
  tracks: { id: string; artist: string; name: string; mvId?: string }[],
): Promise<Record<string, MusicVideo>> {
  const out: Record<string, MusicVideo> = {};
  const pending = tracks.filter((t) => !t.mvId);
  for (let i = 0; i < pending.length; i += 2) {
    const chunk = pending.slice(i, i + 2);
    const found = await Promise.all(chunk.map((t) => findMusicVideo(t.artist, t.name)));
    chunk.forEach((track, index) => {
      const hit = found[index];
      if (hit && playable(hit)) out[track.id] = hit;
    });
  }
  return out;
}