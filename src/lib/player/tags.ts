import { formatFromFilename, labelFromCodec } from "./format";
import { isExplicitContent } from "./explicit";

export type FileTags = {
  title: string;
  artist: string;
  album: string;
  genre: string;
  tags: string[];
  year: string;
  coverUrl: string | null;
  coverBlob: Blob | null;
  format: string;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  channels: number | null;
  lossless: boolean;
  trackNo: number;
  diskNo: number;
  duration: number;
  albumArtist: string;
  explicit: boolean;
};

function stripExt(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

export function trackNoFromName(filename: string) {
  const base = filename.replace(/\.[^/.]+$/, "").trim();
  const match = base.match(/^(\d{1,3})(?:\s*[.)\u2013-]+\s*|\s+)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function tagsFromFilename(filename: string): { title: string; artist: string; album: string; format: string } {
  const base = stripExt(filename).replace(/_/g, " ").trim();
  const format = formatFromFilename(filename);
  const triple = base.match(/^(.+?)\s+[-–—]\s+(.+?)\s+[-–—]\s+(.+)$/);
  if (triple) {
    return {
      artist: triple[1].replace(/^\d+\s*[.)-]?\s*/, "").trim(),
      album: triple[2].trim(),
      title: triple[3].trim(),
      format,
    };
  }
  const dashed = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashed) {
    return {
      artist: dashed[1].replace(/^\d+\s*[.)-]?\s*/, "").trim(),
      title: dashed[2].trim(),
      album: "",
      format,
    };
  }
  return {
    title: base.replace(/^\d+\s*[.)-]?\s*/, "").trim() || "Unknown title",
    artist: "Unknown artist",
    album: "",
    format,
  };
}

function splitTags(values: string[]) {
  const out: string[] = [];
  for (const value of values) {
    for (const part of value.split(/\s*[/;,]\s*/)) {
      const tag = part.trim();
      if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
    }
  }
  return out;
}

function yearFromMeta(year?: number, date?: string) {
  if (year && year > 0) return String(year);
  const match = date?.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function nativeText(meta: { native?: Record<string, { id?: string; value?: unknown }[]> }, ids: string[]) {
  const wanted = new Set(ids.map((id) => id.toUpperCase()));
  for (const frames of Object.values(meta.native ?? {})) {
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      const id = String(frame.id ?? "").toUpperCase();
      if (!wanted.has(id)) continue;
      const value = frame.value;
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object" && "text" in value) {
        const text = (value as { text?: string }).text;
        if (text?.trim()) return text.trim();
      }
      if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
    }
  }
  return "";
}

export async function readFileTags(file: Blob, filename = ""): Promise<FileTags> {
  const fallback = tagsFromFilename(filename || "track");
  const empty: FileTags = {
    title: fallback.title,
    artist: fallback.artist,
    album: fallback.album,
    genre: "",
    tags: [],
    year: "",
    coverUrl: null,
    coverBlob: null,
    format: fallback.format,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    channels: null,
    lossless:
      fallback.format === "FLAC" ||
      fallback.format === "WAV" ||
      fallback.format === "AIFF" ||
      fallback.format === "ALAC",
    trackNo: trackNoFromName(filename || "track"),
    diskNo: 1,
    duration: 0,
    albumArtist: "",
    explicit: false,
  };
  try {
    const { parseBlob } = await import("music-metadata");
    const meta = await parseBlob(file);
    const title = meta.common.title?.trim() || fallback.title;
    const artist =
      meta.common.artist?.trim() ||
      meta.common.artists?.filter(Boolean).join(", ").trim() ||
      meta.common.albumartist?.trim() ||
      fallback.artist;
    const album =
      meta.common.album?.trim() ||
      nativeText(meta, ["TALB", "ALBUM", "©ALB", "WM/ALBUMTITLE", "TOAL"]) ||
      fallback.album;
    const tags = splitTags(
      [...(meta.common.genre ?? []), nativeText(meta, ["TCON", "GENRE", "©GEN"])].filter(Boolean),
    );
    const genre = tags.join(" / ");
    const year = yearFromMeta(meta.common.year, meta.common.date);
    const albumArtist = meta.common.albumartist?.trim() || "";
    const trackNo = meta.common.track?.no || trackNoFromName(filename || title) || 0;
    const diskNo = meta.common.disk?.no || 1;
    const duration = meta.format.duration && Number.isFinite(meta.format.duration) ? meta.format.duration : 0;
    const advisory = nativeText(meta, ["ITUNESADVISORY", "RTNG"]).toLowerCase();
    const comment = (meta.common.comment ?? []).join(" ");
    const flagged = advisory === "1" || advisory === "explicit" || /\bexplicit\b/i.test(comment);
    const explicit =
      flagged ||
      isExplicitContent({
        explicit: flagged,
        name: title,
        artist,
        album,
        albumArtist,
        genre,
        tags,
      });
    let coverUrl: string | null = null;
    let coverBlob: Blob | null = null;
    const pic = meta.common.picture?.[0];
    if (pic?.data?.length) {
      const bytes = Uint8Array.from(pic.data);
      const type = pic.format?.includes("/") ? pic.format : "image/jpeg";
      coverBlob = new Blob([bytes], { type });
      coverUrl = URL.createObjectURL(coverBlob);
    }
    return {
      title,
      artist,
      album,
      genre,
      tags,
      year,
      coverUrl,
      coverBlob,
      format: labelFromCodec(meta.format.container, meta.format.codec, fallback.format),
      sampleRate: meta.format.sampleRate ?? null,
      bitDepth: meta.format.bitsPerSample ?? null,
      bitrate: meta.format.bitrate ?? null,
      channels: meta.format.numberOfChannels ?? null,
      lossless: Boolean(meta.format.lossless),
      trackNo,
      diskNo,
      duration,
      albumArtist,
      explicit,
    };
  } catch {
    return empty;
  }
}