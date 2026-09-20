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
  if (!/\s/.test(trimmed) && trimmed.includes("-")) {
    const parts = trimmed.split("-").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3 && parts.some((part) => isTrackToken(part))) return parts;
  }
  return [trimmed];
}

export function looksLikeFilenameTitle(name: string) {
  const value = (name || "").trim();
  if (!value) return true;
  if (/_0?\d{1,3}_/.test(value)) return true;
  if (value.includes("_") && value.split("_").length >= 3) return true;
  if (/^.+\s+[-–—]\s+\d{1,3}\s+[-–—]\s+/.test(value)) return true;
  return false;
}

export function parseSlskFilename(filename: string) {
  const parts = pathParts(filename);
  const base = (parts.pop() || filename).replace(/\.[^.]+$/, "");
  const folder = parts.join("/");
  const tokens = splitNameTokens(base);
  if (tokens[0]) {
    const peeled = peelTrack(tokens[0]);
    if (peeled) {
      tokens[0] = peeled.rest;
      tokens.unshift(String(peeled.n).padStart(2, "0"));
    }
  }

  let trackNo = 0;
  let trackIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const n = isTrackToken(tokens[i] || "");
    if (!n) continue;
    trackNo = n;
    trackIdx = i;
    break;
  }

  let artist = "";
  let album = "";
  let name = tidyPiece(base);

  if (trackIdx >= 0) {
    const before = tokens.slice(0, trackIdx).map(tidyPiece).filter(Boolean);
    const after = tokens.slice(trackIdx + 1).map(tidyPiece).filter(Boolean);
    name = after.join(" - ") || before.pop() || name;
    if (before.length >= 2) {
      artist = before[0] || "";
      album = before.slice(1).join(" ");
    } else if (before.length === 1) {
      artist = before[0] || "";
    }
  } else if (tokens.length >= 3) {
    artist = tidyPiece(tokens[0] || "");
    album = tidyPiece(tokens[1] || "");
    name = tokens.slice(2).map(tidyPiece).filter(Boolean).join(" - ") || name;
  } else if (tokens.length === 2) {
    artist = tidyPiece(tokens[0] || "");
    name = tidyPiece(tokens[1] || "") || name;
  } else if (tokens[0]) {
    name = tidyPiece(tokens[0]) || name;
  }

  let year = "";
  let discogArtist = "";
  const meaningful: string[] = [];
  for (const part of parts) {
    const yearAlbum = part.match(/^((?:19|20)\d{2})\s*[-.)]\s*(.+)$/);
    if (yearAlbum?.[1] && yearAlbum[2] && !DISCOG_RANGE.test(part)) {
      year = yearAlbum[1];
      const albumPart = tidyFolderPart(yearAlbum[2]);
      if (albumPart) meaningful.push(albumPart);
      continue;
    }
    if (/^(19|20)\d{2}$/.test(part)) {
      year = part;
      continue;
    }
    if (DISCOG_RANGE.test(part) || /discography/i.test(part)) {
      const cleaned = tidyFolderPart(part);
      if (cleaned) discogArtist = cleaned;
      continue;
    }
    if (GENERIC_DIR.test(part) || /^\d+$/.test(part)) continue;
    const cleaned = tidyFolderPart(part) || part;
    if (cleaned) meaningful.push(cleaned);
  }
  const albumGuess = meaningful[meaningful.length - 1] || "";
  const artistGuess = meaningful.length > 1 ? meaningful[meaningful.length - 2] || "" : discogArtist;
  if (!album) album = albumGuess;
  if (!artist || looksLikeDumpMeta(artist) || (album && artist.toLowerCase() === album.toLowerCase())) {
    artist = artistGuess || discogArtist || artist;
  }
  if (looksLikeDumpMeta(artist)) artist = tidyFolderPart(artist) || artistGuess || discogArtist || artist;
  if (looksLikeDumpMeta(album)) album = tidyFolderPart(album) || albumGuess || album;
  return {
    artist: artist || artistGuess || discogArtist || "Soulseek",
    name: name || tidyPiece(base) || base,
    album: album || albumGuess || artistGuess || "",
    folder,
    trackNo,
    year,
  };
}

export function polishTrackFromFilename<
  T extends {
    name: string;
    artist: string;
    album?: string;
    albumArtist?: string;
    trackNo?: number;
    soulseekId?: string;
    metaEdited?: boolean;
  },
>(track: T): T {
  if (track.metaEdited) return track;
  const source = track.soulseekId ? parseSlskTrackId(track.soulseekId).filename : track.name;
  if (!source) return track;
  const parsed = parseSlskFilename(source);
  const dirty = looksLikeFilenameTitle(track.name);
  const dirtyArtist = !track.artist.trim() || looksLikeDumpMeta(track.artist) || looksLikeDumpMeta(track.albumArtist || "");
  const dirtyAlbum = !(track.album || "").trim() || looksLikeDumpMeta(track.album || "");
  if (!dirty && !dirtyArtist && !dirtyAlbum && (track.trackNo || 0) > 0) return track;
  const nextName = dirty ? parsed.name || track.name : track.name;
  const nextArtist = dirtyArtist ? parsed.artist || track.artist : track.artist;
  const nextAlbum = dirtyAlbum ? parsed.album || track.album : track.album;
  const nextTrackNo = track.trackNo || parsed.trackNo || undefined;
  const nextAlbumArtist = dirtyArtist ? parsed.artist || nextArtist : track.albumArtist || nextArtist;
  if (
    nextName === track.name &&
    nextArtist === track.artist &&
    nextAlbum === (track.album || "") &&
    nextTrackNo === track.trackNo &&
    nextAlbumArtist === (track.albumArtist || "")
  ) {
    return track;
  }
  return {
    ...track,
    name: nextName,
    artist: nextArtist,
    album: nextAlbum || track.album,
    albumArtist: nextAlbumArtist,
    trackNo: nextTrackNo,
  };
}

export function slskTrackId(username: string, filename: string) {
  return `${username}|${filename}`;
}

export function parseSlskTrackId(id: string) {
  const i = id.indexOf("|");
  if (i < 0) return { username: "", filename: id };
  return { username: id.slice(0, i), filename: id.slice(i + 1) };
}

export function formatBytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

export function formatSpeed(n: number) {
  if (!n) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB/s`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB/s`;
  return `${Math.round(n)} B/s`;
}

export function slskStreamUrl(session: SlskSession, username: string, filename: string, local = "", size = 0) {
  const params = new URLSearchParams({
    file: filename,
    user: username,
  });
  if (session.kind) params.set("kind", session.kind);
  if (session.base) params.set("base", session.base);
  if (session.key) params.set("key", session.key);
  if (session.token) params.set("token", session.token);
  if (session.name) params.set("name", session.name);
  if (session.ticket) params.set("ticket", session.ticket);
  if (local) params.set("local", local);
  if (size) params.set("size", String(size));
  return `/api/soulseek?${params.toString()}`;
}

function majority(values: string[]) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || key === "soulseek" || key === "unknown") continue;
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
  if (album.lossless) n += 10;
  else if (album.bitRate >= 320) n += 8;
  else if (album.bitRate >= 256) n += 3;
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
