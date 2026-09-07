export type IaHit = {
  identifier: string;
  title: string;
  creator: string;
  year: string;
  description: string;
  cover: string;
  downloads: number;
};

export type IaTrack = {
  identifier: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  note: string;
  cover: string;
  url: string;
  format: string;
  lossless: boolean;
  trackNo: number;
  duration: number;
  bytes: number;
};

const AUDIO_FORMATS = [
  "VBR MP3",
  "320Kbps MP3",
  "128Kbps MP3",
  "64Kbps MP3",
  "MP3",
  "Ogg Vorbis",
  "Flac",
  "FLAC",
  "24bit Flac",
  "WAVE",
  "AIFF",
  "Shorten",
  "Apple Lossless Audio",
];

export function parseArchiveId(input: string) {
  const text = input.trim();
  const match = text.match(/archive\.org\/(?:details|download)\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (/^[a-z0-9][a-z0-9_.-]{2,200}$/i.test(text) && !text.includes(" ")) return text;
  return "";
}

export function archiveCover(id: string) {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

export function archivePage(id: string) {
  return `https://archive.org/details/${encodeURIComponent(id)}`;
}

export function isLosslessFormat(format: string, name = "") {
  return /flac|wav|aiff|alac|shorten/i.test(format) || /\.(flac|wav|aiff|aif|alac|shn)$/i.test(name);
}

export function isAudioFormat(format: string, name = "") {
  const f = format.toLowerCase();
  if (AUDIO_FORMATS.some((item) => item.toLowerCase() === f)) return true;
  if (/\b(mp3|flac|ogg|wav|aiff|vorbis|alac|shorten)\b/i.test(format)) return true;
  return /\.(mp3|flac|ogg|oga|wav|aiff|aif|m4a|alac)$/i.test(name);
}

export function formatRank(format: string, name = "", preferLossy = false) {
  const f = `${format} ${name}`.toLowerCase();
  const lossless = isLosslessFormat(format, name);
  if (preferLossy) {
    if (f.includes("vbr")) return 70;
    if (f.includes("320")) return 65;
    if (f.includes("mp3")) return 60;
    if (f.includes("128")) return 50;
    if (f.includes("ogg")) return 45;
    if (lossless) return 15;
    return 10;
  }
  if (f.includes("24") && f.includes("flac")) return 100;
  if (f.includes("flac") || f.endsWith(".flac")) return 95;
  if (f.includes("alac")) return 88;
  if (f.includes("wav") || f.includes("aiff")) return 82;
  if (f.includes("320")) return 50;
  if (f.includes("vbr")) return 46;
  if (f.includes("mp3")) return 40;
  if (f.includes("ogg")) return 30;
  return 10;
}