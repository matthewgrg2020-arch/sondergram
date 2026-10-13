export type SlskKind = "native" | "slskd";

export type SlskSession = {
  kind?: SlskKind;
  base: string;
  key: string;
  token?: string;
  name?: string;
  ticket?: string;
};

export type SlskFile = {
  username: string;
  filename: string;
  size: number;
  bitRate: number;
  length: number;
  ext: string;
  name: string;
  artist: string;
  album: string;
  lossless: boolean;
  locked: boolean;
  speed: number;
  queue: number;
  free: boolean;
  folder?: string;
  trackNo?: number;
  year?: string;
};

export type SlskAlbum = {
  key: string;
  username: string;
  folder: string;
  artist: string;
  album: string;
  year: string;
  files: SlskFile[];
  size: number;
  duration: number;
  bitRate: number;
  lossless: boolean;
  free: boolean;
  speed: number;
  queue: number;
  ext: string;
};

export type SlskAlbumPack = {
  key: string;
  artist: string;
  album: string;
  copies: SlskAlbum[];
};

const KEY = "sondergram:soulseek";
const AUDIO = /\.(flac|alac|wav|aiff|aif|aifc|mp3|m4a|aac|ogg|opus|wma)$/i;
const GENERIC_DIR =
  /^(music|audio|mp3|flac|wav|aac|ogg|opus|alac|albums?|complete|incoming|shared?|downloads?|songs?|tracks?|media|files?|soulseek|slsk|disk\s*\d*|disc\s*\d*|cd\s*\d*|vinyl|320|320kbps|v0|lossless|mp3s?|___+|new folder|various|va)$/i;
const DISCOG_RANGE = /(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}/;

export function loadSlskSession(): SlskSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlskSession;
    if (!parsed.kind) {
      parsed.kind = parsed.base ? "slskd" : "native";
    }
    if (parsed.kind === "native" && !parsed.name) return null;
    if (parsed.kind === "slskd" && !parsed.base) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSlskSession(session: SlskSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

export function isNativeSlsk(session: SlskSession | null | undefined) {
  if (!session) return false;
  if (session.kind === "native") return true;
  if (session.kind === "slskd") return false;
  return Boolean(session.name && session.key && !session.base);
}

export function normalizeSlskBase(input: string) {
  const text = input.trim().replace(/\/+$/, "");
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}

export function isAudioFile(filename: string) {
  return AUDIO.test(filename.replace(/\\/g, "/"));
}

export function fileExt(filename: string) {
  const base = filename.replace(/\\/g, "/").split("/").pop() || filename;
  const match = base.match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || "").toUpperCase();
}

export function slskFolder(filename: string) {
  const path = filename.replace(/\\/g, "/");
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

function pathParts(filename: string) {
  return filename.replace(/\\/g, "/").split("/").filter(Boolean);
}

function tidyPiece(value: string) {
  return value
    .replace(/\s*[\[({]?(?:flac|alac|wav|aiff|mp3|aac|ogg|opus|m4a|320(?:\s*kbps)?|v0|v2|web|cd\s*rip|16[\s-]?bit|24[\s-]?bit)[\])}]?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tidyFolderPart(value: string) {
  return tidyPiece(value)
    .replace(/\s*[-–—]?\s*\(?((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2})\)?\s*$/i, "")
    .replace(/\s*[-–—]?\s*\b(discography|collection|anthology|box\s*set|complete|web\s*rip|cd\s*rips?)\b\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeDumpMeta(value: string) {
  const v = (value || "").trim();
  if (!v) return false;
  if (/^unknown|soulseek$/i.test(v)) return true;
  if (DISCOG_RANGE.test(v)) return true;
  if (/\b(flac|alac|wav|mp3|aac|ogg|opus|lossless|discography|cd\s*rip)\b/i.test(v)) return true;
  return false;
}

function isTrackToken(token: string) {
  const match = token.match(/^(\d{1,3})(?:[.)])?$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n < 200 ? n : 0;
}

function peelTrack(token: string): { n: number; rest: string } | null {
  const match = token.match(/^(\d{1,3})(?:\s*[.)\u2013-]+\s*|\s+)(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 199) return null;
  return { n, rest: match[2].trim() };
}

function splitNameTokens(base: string) {
  const trimmed = base.trim();
  if (!trimmed) return [] as string[];
  if (trimmed.includes("_")) {
    return trimmed.split(/_+/).map((part) => part.trim()).filter(Boolean);
  }
  if (/\s+[-–—]+\s+/.test(trimmed)) {
    return trimmed.split(/\s+[-–—]+\s+/).map((part) => part.trim()).filter(Boolean);
  }
  return [trimmed];
}

export function parseSlskFilename(filename: string) {
  const path = filename.replace(/\\/g, "/");
  const parts = pathParts(path);
  const base = parts.pop() || filename;
  const folder = parts.join("/");
  const noExt = base.replace(/\.[^.]+$/, "");
  let trackNo: number | undefined;
  let name = tidyPiece(noExt);
  const peeled = peelTrack(name);
  if (peeled) {
    trackNo = peeled.n;
    name = tidyPiece(peeled.rest);
  }
  let artist = "";
  let album = "";
  let year = "";
  const folderBits = parts.filter((p) => !GENERIC_DIR.test(p));
  if (folderBits.length >= 2) {
    artist = tidyFolderPart(folderBits[folderBits.length - 2] || "");
    album = tidyFolderPart(folderBits[folderBits.length - 1] || "");
  } else if (folderBits.length === 1) {
    album = tidyFolderPart(folderBits[0] || "");
  }
  const yearMatch = path.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) year = yearMatch[1] || "";
  if (looksLikeDumpMeta(artist)) artist = "";
  if (looksLikeDumpMeta(album)) album = "";
  if (!name) name = tidyPiece(noExt) || base;
  return { name, artist, album, folder, trackNo, year };
}

export function formatBytes(n: number) {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatSpeed(n: number) {
  if (!n || n < 0) return "";
  return `${formatBytes(n)}/s`;
}

function majority(values: string[]) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const value of values) {
    const key = (value || "").trim().toLowerCase();
    if (!key) continue;
    const row = counts.get(key);
    if (row) row.n += 1;
    else counts.set(key, { label: value.trim(), n: 1 });
  }
  let best: { label: string; n: number } | null = null;
  for (const row of counts.values()) {
    if (!best || row.n > best.n) best = row;
  }
  return best?.label || "";
}

function albumScore(album: SlskAlbum) {
  let n = 0;
  if (album.files.length >= 6) n += 40;
  else if (album.files.length >= 4) n += 28;
  else if (album.files.length >= 2) n += 10;
  n += Math.min(album.files.length, 24) * 2;
  if (album.free) n += 14;
  // Prefer smaller lossy packs for quicker streaming
  if (/mp3/i.test(album.ext) && !album.lossless) n += 12;
  else if (!album.lossless && album.bitRate >= 320) n += 10;
  else if (!album.lossless && album.bitRate >= 256) n += 6;
  else if (album.lossless) n += 2;
  n += Math.min(album.speed / 2e5, 10);
  n -= Math.min(album.queue, 12);
  return n;
}

export function sortSlskFiles(files: SlskFile[]) {
  return [...files].sort((a, b) => {
    const an = a.trackNo || 0;
    const bn = b.trackNo || 0;
    if (an && bn && an !== bn) return an - bn;
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.name.localeCompare(b.name) || a.filename.localeCompare(b.filename);
  });
}

export function groupSlskAlbums(files: SlskFile[]) {
  const buckets = new Map<string, SlskFile[]>();
  for (const file of files) {
    const folder = file.folder || slskFolder(file.filename);
    const key = `${file.username}\n${folder}`;
    const list = buckets.get(key);
    if (list) list.push(file);
    else buckets.set(key, [file]);
  }
  const albums: SlskAlbum[] = [];
  for (const [key, rows] of buckets) {
    const filesSorted = sortSlskFiles(rows);
    const first = filesSorted[0];
    if (!first) continue;
    const folder = first.folder || slskFolder(first.filename);
    const bitRates = filesSorted.map((f) => f.bitRate).filter((n) => n > 0);
    albums.push({
      key,
      username: first.username,
      folder,
      artist: majority(filesSorted.map((f) => f.artist)) || first.artist,
      album: majority(filesSorted.map((f) => f.album)) || first.album || folder.split("/").filter(Boolean).pop() || "Album",
      year: majority(filesSorted.map((f) => f.year || "")) || "",
      files: filesSorted,
      size: filesSorted.reduce((n, f) => n + (f.size || 0), 0),
      duration: filesSorted.reduce((n, f) => n + (f.length || 0), 0),
      bitRate: bitRates.length ? Math.round(bitRates.reduce((n, v) => n + v, 0) / bitRates.length) : 0,
      lossless: filesSorted.every((f) => f.lossless),
      free: filesSorted.some((f) => f.free),
      speed: Math.max(...filesSorted.map((f) => f.speed || 0)),
      queue: Math.min(...filesSorted.map((f) => f.queue || 0)),
      ext: majority(filesSorted.map((f) => f.ext)) || first.ext,
    });
  }
  albums.sort((a, b) => albumScore(b) - albumScore(a) || b.files.length - a.files.length);
  return albums;
}

export function packSlskAlbums(albums: SlskAlbum[]): SlskAlbumPack[] {
  const buckets = new Map<string, SlskAlbum[]>();
  for (const album of albums) {
    const artist = album.artist.trim().toLowerCase();
    const title = album.album.trim().toLowerCase();
    const key = artist && title && artist !== "soulseek" ? `${artist}::${title}` : album.key;
    const list = buckets.get(key);
    if (list) list.push(album);
    else buckets.set(key, [album]);
  }
  return [...buckets.values()].map((copies) => {
    const best = copies[0]!;
    return {
      key: copies[0]!.key,
      artist: best.artist,
      album: best.album,
      copies,
    };
  });
}
