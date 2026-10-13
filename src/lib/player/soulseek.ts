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
  const base = (parts.pop() || path).replace(/\.[^.]+$/, "");
  const folder = parts.join("/");
  let trackNo: number | undefined;
  let name = tidyPiece(base);
  let artist = "";
  let album = "";
  let year = "";

  const peeled = peelTrack(name);
  if (peeled) {
    trackNo = peeled.n;
    name = tidyPiece(peeled.rest);
  } else {
    const tokens = splitNameTokens(name);
    if (tokens.length >= 2) {
      const maybe = isTrackToken(tokens[0]!);
      if (maybe) {
        trackNo = maybe;
        name = tidyPiece(tokens.slice(1).join(" "));
      }
    }
  }

  const folderParts = parts.filter((p) => !GENERIC_DIR.test(p) && !looksLikeDumpMeta(p));
  if (folderParts.length >= 2) {
    artist = tidyFolderPart(folderParts[folderParts.length - 2]!);
    album = tidyFolderPart(folderParts[folderParts.length - 1]!);
  } else if (folderParts.length === 1) {
    album = tidyFolderPart(folderParts[0]!);
  }

  const yearMatch = (folder + " " + name).match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) year = yearMatch[1]!;

  if (looksLikeDumpMeta(name)) name = "Track";

  return { name, artist, album, folder, trackNo, year };
}

export function polishTrackFromFilename(filename: string) {
  return parseSlskFilename(filename);
}

export function slskTrackId(file: Pick<SlskFile, "username" | "filename">) {
  return `${file.username}|${file.filename}`;
}

export function slskStreamUrl(file: Pick<SlskFile, "username" | "filename">, session?: SlskSession | null) {
  const params = new URLSearchParams({
    u: file.username,
    f: file.filename,
  });
  if (session?.name) params.set("account", session.name);
  if (session?.key) params.set("key", session.key);
  if (session?.base) params.set("base", session.base);
  if (session?.token) params.set("token", session.token);
  return `/api/soulseek?${params.toString()}`;
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSpeed(bps: number) {
  if (!Number.isFinite(bps) || bps <= 0) return "";
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function albumScore(a: SlskAlbum) {
  let score = 0;
  if (/mp3/i.test(a.ext)) score += 100;
  else if (a.lossless) score -= 40;
  else score += 40;
  if (a.free) score += 30;
  if (a.bitRate >= 320) score += 15;
  else if (a.bitRate >= 192) score += 5;
  if (a.size > 80_000_000) score -= 20;
  if (a.queue > 5) score -= 10;
  score += Math.min(20, Math.floor(a.speed / 50_000));
  score += Math.min(10, a.files.length);
  return score;
}

export function sortSlskFiles(files: SlskFile[]) {
  return [...files].sort((a, b) => {
    const aMp3 = /mp3/i.test(a.ext) ? 0 : a.lossless ? 2 : 1;
    const bMp3 = /mp3/i.test(b.ext) ? 0 : b.lossless ? 2 : 1;
    if (aMp3 !== bMp3) return aMp3 - bMp3;
    if (a.free !== b.free) return a.free ? -1 : 1;
    const aHuge = a.size > 40_000_000;
    const bHuge = b.size > 40_000_000;
    if (aHuge !== bHuge) return aHuge ? 1 : -1;
    return b.bitRate - a.bitRate || a.queue - b.queue || a.size - b.size;
  });
}

export function groupSlskAlbums(hits: SlskFile[]): SlskAlbum[] {
  const map = new Map<string, SlsKFile[]>();
  for (const hit of hits) {
    const folder = hit.folder || slskFolder(hit.filename);
    const key = `${hit.username}|${folder}`;
    const list = map.get(key);
    if (list) list.push(hit);
    else map.set(key, [hit]);
  }
  const albums: SlskAlbum[] = [];
  for (const [key, files] of map) {
    const sorted = sortSlskFiles(files);
    const first = sorted[0]!;
    const folder = first.folder || slskFolder(first.filename);
    const size = sorted.reduce((s, f) => s + f.size, 0);
    const duration = sorted.reduce((s, f) => s + (f.length || 0), 0);
    const bitRate = Math.round(sorted.reduce((s, f) => s + (f.bitRate || 0), 0) / sorted.length) || 0;
    const lossless = sorted.every((f) => f.lossless);
    const free = sorted.some((f) => f.free);
    const speed = Math.max(...sorted.map((f) => f.speed || 0));
    const queue = Math.min(...sorted.map((f) => f.queue || 0));
    const ext = first.ext;
    albums.push({
      key,
      username: first.username,
      folder,
      artist: first.artist,
      album: first.album || folder.split("/").pop() || "Album",
      year: first.year || "",
      files: sorted,
      size,
      duration,
      bitRate,
      lossless,
      free,
      speed,
      queue,
      ext,
    });
  }
  return albums.sort((a, b) => albumScore(b) - albumScore(a));
}

export function packSlskAlbums(albums: SlskAlbum[]): SlskAlbumPack[] {
  const buckets = new Map<string, SlsKAlbum[]>();
  for (const album of albums) {
    const key = `${(album.artist || "").toLowerCase()}|${(album.album || "").toLowerCase()}`;
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
