export type AmSession = {
  arl: string;
  name: string;
};

export type AmTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  preview: string;
  duration: number;
  trackNo: number;
  diskNo: number;
  explicit: boolean;
  source: string;
};

const KEY = "sondergram:amazon";

export function loadAmSession(): AmSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AmSession;
    if (!parsed.arl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAmSession(session: AmSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

export type AmTarget =
  | { kind: "album"; id: string }
  | { kind: "artist"; id: string }
  | { kind: "track"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "search"; q: string };

export function parseAmazonInput(input: string): AmTarget | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    if (host.includes("amazon.")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const typeIdx = parts.findIndex((p) => ["albums", "album", "artists", "artist", "tracks", "track", "playlists", "playlist"].includes(p.toLowerCase()));
      if (typeIdx >= 0 && parts[typeIdx + 1]) {
        const kind = parts[typeIdx].toLowerCase().replace(/s$/, "");
        const id = parts[typeIdx + 1].split("?")[0];
        if (kind === "album") return { kind: "album", id };
        if (kind === "artist") return { kind: "artist", id };
        if (kind === "track") return { kind: "track", id };
        if (kind === "playlist") return { kind: "playlist", id };
      }
      const asin = parts.find((p) => /^B0[A-Z0-9]{8,}$/i.test(p));
      if (asin) return { kind: "album", id: asin };
    }
  } catch {
    /* not a url */
  }
  if (/^B0[A-Z0-9]{8,}$/i.test(text)) return { kind: "album", id: text };
  return { kind: "search", q: text };
}
