export type StreamSource =
  | "Amazon"
  | "Apple Music"
  | "Deezer"
  | "Spotify"
  | "Bandcamp"
  | "Archive"
  | "YouTube"
  | "Audius"
  | "Arcod";

export type StreamHit = {
  key: string;
  source: StreamSource;
  kind: "track" | "album";
  name: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  preview: string;
  duration: number;
  trackNo: number;
  page?: string;
  amazonId?: string;
  deezerId?: string;
  spotifyId?: string;
  youtubeId?: string;
  archiveId?: string;
  bandcampUrl?: string;
  audiusId?: string;
  qobuzId?: string;
  appleId?: string;
  collectionId?: string;
  genre?: string;
  diskNo?: number;
  tracksCount?: number;
};

export function parseQobuzUrl(input: string): { kind: "album" | "track"; id: string } | null {
  const text = input.trim();
  if (!text) return null;
  const open = text.match(/(?:open|play|www)\.qobuz\.com\/(?:[a-z]{2}-[a-z]{2}\/)?(album|track)\/(?:[^/]+\/)?([A-Za-z0-9]+)/i);
  if (open?.[1] && open[2]) return { kind: open[1].toLowerCase() === "track" ? "track" : "album", id: open[2] };
  const album = text.match(/qobuz\.com\/(?:[a-z]{2}-[a-z]{2}\/)?album\/[^/]+\/([A-Za-z0-9]+)/i);
  if (album?.[1]) return { kind: "album", id: album[1] };
  const track = text.match(/qobuz\.com\/(?:[a-z]{2}-[a-z]{2}\/)?track\/[^/]+\/([A-Za-z0-9]+)/i);
  if (track?.[1]) return { kind: "track", id: track[1] };
  return null;
}

export const STREAM_SOURCES: StreamSource[] = [
  "Amazon",
  "Apple Music",
  "Deezer",
  "Spotify",
  "Bandcamp",
  "Archive",
  "YouTube",
  "Audius",
  "Arcod",
];

export function isPreviewClip(
  url?: string,
  duration?: number,
  extra?: { youtubeId?: string; archiveId?: string; bandcampId?: string },
) {
  if (extra?.archiveId || extra?.bandcampId) return false;
  const src = url || "";
  if (/audius\.co|bcbits\.com|archive\.org|bandcamp\.com|googlevideo\.com|piped/i.test(src)) return false;
  if (/itunes\.apple\.com|mzstatic\.com|dzcdn\.net|scdn\.co|audio-ssl\.itunes|spotifycdn|\/preview/i.test(src)) return true;
  if (duration && duration > 0 && duration <= 35) return true;
  return false;
}

export function officialCatalogUrl(track?: { previewUrl?: string; url?: string } | null) {
  const src = track?.previewUrl || track?.url || "";
  if (!src || !/^https?:/i.test(src)) return "";
  if (/googlevideo\.com|youtube\.com|ytimg/i.test(src)) return "";
  if (/dzcdn\.net|scdn\.co|spotifycdn|itunes\.apple|mzstatic|audio-ssl\.itunes/i.test(src)) return src;
  if (/\/preview/i.test(src)) return src;
  return "";
}

export function isEngineCatalog(track?: {
  deezerId?: string;
  amazonId?: string;
  spotifyId?: string;
  qobuzId?: string;
  appleId?: string;
  format?: string;
  tags?: string[];
  previewUrl?: string;
  url?: string;
} | null) {
  if (!track) return false;
  if (track.deezerId || track.amazonId || track.spotifyId || track.qobuzId || track.appleId) return true;
  if (track.format === "APP") return true;
  if (track.tags?.includes("Apple Music")) return true;
  const src = track.previewUrl || track.url || "";
  return /itunes\.apple\.com|mzstatic\.com|audio-ssl\.itunes/i.test(src);
}

export function isYoutubePlayback(track?: {
  youtubeId?: string;
  format?: string;
  url?: string;
  previewUrl?: string;
  deezerId?: string;
  amazonId?: string;
  spotifyId?: string;
  archiveId?: string;
  bandcampId?: string;
  soulseekId?: string;
  qobuzId?: string;
  appleId?: string;
  tags?: string[];
  durationSec?: number;
  forceYoutube?: boolean;
} | null) {
  if (track?.forceYoutube && track.youtubeId) return true;
  if (isEngineCatalog(track) || track?.bandcampId) return false;
  if (!track?.youtubeId) return false;
  if (track.format === "YT" || (track.url || "").startsWith("yt:")) return true;
  const src = track.previewUrl || track.url || "";
  if (src && /^https?:/i.test(src) && !isPreviewClip(src, track.durationSec, { archiveId: track.archiveId, bandcampId: track.bandcampId })) {
    return false;
  }
  return true;
}
