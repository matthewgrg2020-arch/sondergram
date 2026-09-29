export type BcTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  tags: string[];
  cover: string;
  url: string;
  duration: number;
  trackNo: number;
  note: string;
  page: string;
};

export type BcAlbum = {
  url: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  note: string;
  tags: string[];
  tracks: BcTrack[];
};

export type BcHit = {
  url: string;
  title: string;
  artist: string;
  cover: string;
  kind: "album" | "track" | "artist";
  genre?: string;
};

/** Common Bandcamp Discover / tag genres */
export const BC_GENRES = [
  "electronic",
  "rock",
  "metal",
  "alternative",
  "hip-hop-rap",
  "experimental",
  "punk",
  "folk",
  "pop",
  "ambient",
  "soundtrack",
  "world",
  "jazz",
  "acoustic",
  "funk",
  "r-b-soul",
  "classical",
  "reggae",
  "country",
  "blues",
  "latin",
  "soul",
  "house",
  "techno",
  "lo-fi",
  "indie",
  "shoegaze",
  "drone",
  "idm",
  "vaporwave",
] as const;

export function genreSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseBandcampUrl(input: string) {
  const text = input.trim().split(/\s+/)[0] || "";
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const path = url.pathname;
    const host = url.hostname.toLowerCase();
    const onBandcamp = host === "bandcamp.com" || host.endsWith(".bandcamp.com");
    const albumPath = /\/(album|track)\//i.test(path) || /\/music\/?$/i.test(path);
    if (!onBandcamp && !albumPath) return "";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function isBandcampInput(input: string) {
  const text = input.trim();
  return Boolean(parseBandcampUrl(text) || /bandcamp\.com/i.test(text));
}

export function artUrl(artId: unknown, size = 10) {
  const n = Number(artId);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `https://f4.bcbits.com/img/a${Math.trunc(n)}_${size}.jpg`;
}

export function normalizeCover(url: string, artId?: unknown) {
  const fromId = artUrl(artId, 10);
  if (fromId) return fromId;
  let img = (url || "").trim();
  if (!img) return "";
  if (img.startsWith("//")) img = `https:${img}`;
  img = img.replace(/\/img\/(?!a)(\d+)_(\d+)\.jpg/i, "/img/a$1_$2.jpg");
  img = img.replace(/_3\.jpg$/i, "_10.jpg");
  img = img.replace(/_5\.jpg$/i, "_10.jpg");
  return img;
}
