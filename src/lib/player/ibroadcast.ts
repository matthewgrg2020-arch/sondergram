export type IbSession = {
  userId: string;
  token: string;
  streaming: string;
  email: string;
};

export type IbTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  file: string;
  artwork: string;
};

export type IbPlaylist = {
  id: string;
  name: string;
  trackIds: string[];
};

const KEY = "sondergram:ibroadcast";

export function loadIbSession(): IbSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IbSession;
    if (!parsed.userId || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveIbSession(session: IbSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

/**
 * Build a streaming URL.
 * Format (from iBroadcast / LMS plugin):
 *   https://streaming.ibroadcast.com/{file}?
 *     expires={unix_seconds}&signature={token}&user_id={id}&file_id={trackId}&platform=...
 */
export function streamUrl(session: IbSession, file: string, fileId: string) {
  let path = String(file || "").trim();
  if (!path) return "";
  // Prefer 128kbps path token if present
  path = path.replace(/\{bitrate\}/gi, "128");
  path = path.replace(/^\//, "");
  const expires = Math.floor(Date.now() / 1000);
  const base = (session.streaming || "https://streaming.ibroadcast.com").replace(/\/$/, "");
  const params = new URLSearchParams({
    expires: String(expires),
    signature: session.token,
    file_id: String(fileId),
    user_id: String(session.userId),
    platform: "Sondergram",
    version: "1.0",
  });
  return `${base}/${path}?${params.toString()}`;
}

export function parseSharePlaylist(input: string) {
  const text = input.trim();
  try {
    const url = new URL(text);
    const id =
      url.searchParams.get("container_id") ||
      url.searchParams.get("playlist") ||
      url.searchParams.get("id") ||
      url.searchParams.get("playlist_id");
    if (id) return id;
  } catch {
    /* not a url */
  }
  if (/^\d+$/.test(text)) return text;
  return null;
}
