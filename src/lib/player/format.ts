export const AUDIO_ACCEPT = [
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".aiff",
  ".aif",
  ".ogg",
  ".opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/flac",
  "audio/aac",
  "audio/ogg",
  "audio/*",
].join(",");

const AUDIO_EXT = /\.(flac|wav|wave|aiff|aif|aifc|mp3|m4a|aac|ogg|oga|opus|wma|wv|ape)$/i;

const MIME_BY_EXT: Record<string, string> = {
  flac: "audio/flac",
  wav: "audio/wav",
  wave: "audio/wav",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  aifc: "audio/aiff",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wma: "audio/x-ms-wma",
};

const LABEL_BY_EXT: Record<string, string> = {
  flac: "FLAC",
  wav: "WAV",
  wave: "WAV",
  aiff: "AIFF",
  aif: "AIFF",
  aifc: "AIFF",
  mp3: "MP3",
  m4a: "M4A",
  aac: "AAC",
  ogg: "OGG",
  oga: "OGG",
  opus: "OPUS",
  wma: "WMA",
  wv: "WV",
  ape: "APE",
};

export function isAudioFile(file: File) {
  if (file.type.startsWith("audio/") || file.type === "application/ogg") return true;
  if ((file.type === "video/mp4" || file.type === "video/quicktime") && AUDIO_EXT.test(file.name)) return true;
  return AUDIO_EXT.test(file.name);
}

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function formatFromFilename(name: string) {
  return LABEL_BY_EXT[extOf(name)] ?? "AUDIO";
}

export function mimeForFile(file: File) {
  const ext = extOf(file.name);
  if (ext && MIME_BY_EXT[ext]) {
    if (!file.type || file.type === "application/octet-stream" || file.type.startsWith("video/")) {
      return MIME_BY_EXT[ext];
    }
  }
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return MIME_BY_EXT[ext] ?? "audio/mpeg";
}

export function typedAudioBlob(blob: Blob, format: string) {
  const want = MIME_BY_EXT[format.toLowerCase()] ?? blob.type ?? "audio/mpeg";
  if (blob.type === want) return blob;
  return new Blob([blob], { type: want });
}

export async function copyAudioBlob(file: Blob) {
  const mime =
    file instanceof File
      ? mimeForFile(file)
      : file.type && file.type !== "application/octet-stream"
        ? file.type
        : "audio/mpeg";
  if (file.type === mime) return file;
  return file.slice(0, file.size, mime);
}

export function objectUrlForFile(file: File) {
  const mime = mimeForFile(file);
  if (file.type === mime) return URL.createObjectURL(file);
  return URL.createObjectURL(file.slice(0, file.size, mime));
}

export function labelFromCodec(container?: string, codec?: string, fallback = "AUDIO") {
  const hay = `${container ?? ""} ${codec ?? ""}`.toLowerCase();
  if (hay.includes("flac")) return "FLAC";
  if (hay.includes("alac")) return "ALAC";
  if (hay.includes("aiff") || hay.includes("aifc")) return "AIFF";
  if (hay.includes("wave") || hay.includes("pcm") || hay.includes("wav")) return "WAV";
  if (hay.includes("layer 3") || hay.includes("mp3") || hay.includes("mpeg 1 layer 3")) return "MP3";
  if (hay.includes("opus")) return "OPUS";
  if (hay.includes("vorbis")) return "OGG";
  if (hay.includes("aac")) return "AAC";
  if (hay.includes("mp4") || hay.includes("m4a")) return "M4A";
  return fallback;
}

export function formatKhz(sampleRate?: number | null) {
  if (!sampleRate) return "";
  const hz = sampleRate < 500 ? sampleRate * 1000 : sampleRate;
  const khz = hz / 1000;
  if (!Number.isFinite(khz) || khz <= 0) return "";
  return Number.isInteger(khz) ? String(khz) : khz.toFixed(1).replace(/\.0$/, "");
}

export function formatSign(info: {
  format?: string;
  lossless?: boolean;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
  tags?: string[];
}) {
  const fmt = (info.format || "AUDIO").replace(/^\s+|\s+$/g, "").toUpperCase() || "AUDIO";
  const rate = formatKhz(info.sampleRate);
  const raw = info.bitrate || 0;
  const kbps = raw > 32 ? (raw > 2000 ? Math.round(raw / 1000) : Math.round(raw)) : 0;

  // Lossless: FLAC 24/96, WAV 16/44.1, etc.
  if (info.lossless || /^(FLAC|WAV|AIFF|ALAC)$/i.test(fmt)) {
    if (info.bitDepth && rate) return `${fmt} ${info.bitDepth}/${rate}`;
    if (rate) return `${fmt} ${rate} kHz`;
    return fmt;
  }

  // Lossy: MP3 320 kbps, AAC 256 kbps
  if (kbps > 0) return `${fmt} ${kbps} kbps`;
  if (rate) return `${fmt} ${rate} kHz`;
  if ((info.tags || []).some((tag) => /atmos/i.test(tag))) return "ATMOS";
  return fmt;
}

export function formatHz(sampleRate?: number | null) {
  if (!sampleRate) return null;
  if (sampleRate >= 1000) {
    const khz = sampleRate / 1000;
    const text = Number.isInteger(khz) ? `${khz}` : khz.toFixed(1).replace(/\.0$/, "");
    return `${text} kHz`;
  }
  return `${sampleRate} Hz`;
}

export function formatSpecs(info: {
  bitDepth?: number | null;
  sampleRate?: number | null;
  bitrate?: number | null;
  channels?: number | null;
  lossless?: boolean;
}) {
  const parts: string[] = [];
  if (info.bitDepth) parts.push(`${info.bitDepth}-bit`);
  const hz = formatHz(info.sampleRate);
  if (hz) parts.push(hz);
  if (!info.lossless && info.bitrate) {
    const raw = info.bitrate;
    const kbps = raw > 2000 ? Math.round(raw / 1000) : Math.round(raw);
    parts.push(`${kbps} kbps`);
  }
  if (info.channels === 1) parts.push("Mono");
  if (info.channels === 2) parts.push("Stereo");
  if (info.channels && info.channels > 2) parts.push(`${info.channels} ch`);
  return parts.join("  ·  ");
}

export function creditLine(track: { artist: string; album?: string; genre: string; year: string }) {
  return [track.artist, track.album, track.year].filter(Boolean).join("  ·  ");
}
