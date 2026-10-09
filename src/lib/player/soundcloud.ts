export type ScHit = {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  cover: string;
  duration: number;
  url: string;
  streamUrl: string;
  page: string;
};

export function parseSoundCloudUrl(input: string) {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!/soundcloud\.com$/i.test(url.hostname) && !url.hostname.endsWith(".soundcloud.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function scStreamProxy(streamUrl: string, page = "") {
  if (!streamUrl) return "";
  const ref = page || "https://soundcloud.com/";
  return `/api/stream?u=${encodeURIComponent(streamUrl)}&ref=${encodeURIComponent(ref)}`;
}
