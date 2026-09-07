import { capturePlayStream } from "./engine";
import { getAudioBlob } from "./persist";
import { transcribeAudio } from "./transcribe-api";
import type { Lyrics } from "./lyrics";

const cache = new Map<string, Lyrics>();

function cacheKey(artist: string, title: string) {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export async function recordPlayingClip(seconds = 22): Promise<{ audio: string; mime: string } | null> {
  const stream = capturePlayStream();
  if (!stream || typeof MediaRecorder === "undefined") return null;
  const mime = pickMime();
  if (!mime) return null;
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  rec.start(250);
  await new Promise((resolve) => window.setTimeout(resolve, Math.max(6, seconds) * 1000));
  if (rec.state !== "inactive") rec.stop();
  await new Promise((resolve) => {
    rec.onstop = () => resolve(null);
    window.setTimeout(resolve, 800);
  });
  const blob = new Blob(chunks, { type: mime });
  if (blob.size < 2000) return null;
  return { audio: await blobToBase64(blob), mime };
}

async function clipFromTrack(id: string) {
  const blob = await getAudioBlob(id);
  if (!blob || blob.size < 2000) return null;
  const slice = blob.slice(0, Math.min(blob.size, 1_200_000));
  return { audio: await blobToBase64(slice), mime: slice.type || "audio/mpeg" };
}

export async function transcribeTrack(opts: {
  id: string;
  artist: string;
  title: string;
  url?: string;
  youtube?: boolean;
  live?: boolean;
}): Promise<Lyrics> {
  const key = cacheKey(opts.artist, opts.title);
  if (cache.has(key)) return cache.get(key)!;

  let audio: string | undefined;
  let mime: string | undefined;
  if (opts.live) {
    const clip = await recordPlayingClip(20);
    if (clip) {
      audio = clip.audio;
      mime = clip.mime;
    }
  }
  if (!audio && !opts.youtube) {
    const file = await clipFromTrack(opts.id);
    if (file) {
      audio = file.audio;
      mime = file.mime;
    }
  }

  const remote = !audio && opts.url && /^https?:\/\//i.test(opts.url) ? opts.url : undefined;
  const result = await transcribeAudio({
    data: {
      audio,
      mime,
      url: remote,
      artist: opts.artist,
      title: opts.title,
    },
  });
  if (!result.ok) throw new Error(result.error);
  const lyrics: Lyrics = {
    plain: result.plain,
    synced: result.lines.map((text, i) => ({ t: i * 4, text })),
  };
  cache.set(key, lyrics);
  return lyrics;
}
