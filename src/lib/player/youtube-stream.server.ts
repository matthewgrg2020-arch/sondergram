/** YouTube / YouTube Music stream URL resolution (server-only). */
import { ytDlpStreamUrl } from "./yt-dlp.server";

type Json = Record<string, unknown>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Browser (esp. iOS) cannot use many googlevideo URLs cross-origin — proxy them. */
export function proxyAudioUrl(href: string): string {
  if (!href || !/^https?:\/\//i.test(href)) return href || "";
  if (/googlevideo\.com|youtube\.com|ytimg\.com/i.test(href) || href.includes("piped") || href.includes("invidious")) {
    return `/api/stream?u=${encodeURIComponent(href)}`;
  }
  return href;
}

function pickAudioFromPlayer(data: Json): string {
  const streaming = asJson(data.streamingData);
  const formats = [
    ...(Array.isArray(streaming.adaptiveFormats) ? (streaming.adaptiveFormats as unknown[]) : []),
    ...(Array.isArray(streaming.formats) ? (streaming.formats as unknown[]) : []),
  ];
  const audio = formats
    .map((row) => {
      const item = asJson(row);
      const mime = str(item.mimeType);
      const href = str(item.url);
      if (!href || !/^https?:\/\//i.test(href)) return null;
      if (mime && !/audio|mp4|webm|m4a|aac|opus/i.test(mime) && !str(item.audioQuality)) return null;
      let score = num(item.bitrate) || num(item.averageBitrate);
      if (/audio\//i.test(mime) || str(item.audioQuality)) score += 1_000_000;
      if (/mp4|m4a|aac/i.test(mime)) score += 500_000;
      if (/AUDIO_QUALITY_MEDIUM|AUDIO_QUALITY_HIGH/i.test(str(item.audioQuality))) score += 200_000;
      return { href, score };
    })
    .filter((row): row is { href: string; score: number } => Boolean(row))
    .sort((a, b) => b.score - a.score);
  return audio[0]?.href || "";
}

async function innertubePlayerUrl(videoId: string): Promise<string> {
  const clients = [
    { clientName: "ANDROID_MUSIC", clientVersion: "7.27.52", userAgent: "com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 13)" },
    { clientName: "ANDROID", clientVersion: "19.17.34", userAgent: "com.google.android.youtube/19.17.34 (Linux; U; Android 13)" },
    { clientName: "IOS", clientVersion: "19.45.4", userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X)" },
    { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", userAgent: UA },
  ];
  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.userAgent,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              hl: "en",
              gl: "US",
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      const data = asJson(await res.json().catch(() => ({})));
      const href = pickAudioFromPlayer(data);
      if (href) return href;
    } catch {
      /* try next client */
    }
  }
  return "";
}

async function publicInstanceStreamUrl(videoId: string): Promise<string> {
  const bases = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://pipedapi.adminforge.de/streams/${videoId}`,
  ];
  for (const endpoint of bases) {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": UA },
      });
      if (!res.ok) continue;
      const data = asJson(await res.json().catch(() => ({})));
      const audioStreams = Array.isArray(data.audioStreams) ? (data.audioStreams as unknown[]) : [];
      const ranked = audioStreams
        .map((row) => {
          const item = asJson(row);
          const href = str(item.url);
          if (!href) return null;
          let score = num(item.bitrate) || num(item.quality);
          if (/m4a|mp4|aac/i.test(str(item.mimeType) || str(item.format))) score += 1000;
          return { href, score };
        })
        .filter((row): row is { href: string; score: number } => Boolean(row))
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.href) return ranked[0].href;
    } catch {
      /* next */
    }
  }
  return "";
}

export async function youtubeStreamUrl(videoId: string): Promise<string> {
  if (!videoId) return "";
  try {
    const dlp = await ytDlpStreamUrl(videoId);
    if (dlp.url) return dlp.url;
  } catch {
    /* fall through */
  }
  const innertube = await innertubePlayerUrl(videoId);
  if (innertube) return innertube;
  try {
    return await publicInstanceStreamUrl(videoId);
  } catch {
    return "";
  }
}
