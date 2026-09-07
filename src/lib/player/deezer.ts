export type DzSession = {
  token: string;
  userId: string;
  name: string;
  appId?: string;
  arl?: string;
};

export type DzTrack = {
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

const KEY = "sondergram:deezer";

export function loadDzSession(): DzSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DzSession;
    if (!parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDzSession(session: DzSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

export type DzTarget =
  | { kind: "user"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "album"; id: string }
  | { kind: "track"; id: string }
  | { kind: "artist"; id: string }
  | { kind: "token" }
  | { kind: "search"; q: string };

export function parseDeezerInput(input: string): DzTarget | null {
  const text = input.trim();
  if (!text) return null;
  if (/^token:/i.test(text)) return { kind: "token" };
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "link.deezer.com" || host.endsWith(".deezer.com") || host === "deezer.page.link") {
      const parts = url.pathname.split("/").filter(Boolean);
      const typeIdx = parts.findIndex((p) =>
        ["playlist", "album", "track", "artist", "profile"].includes(p.toLowerCase()),
      );
      if (typeIdx >= 0 && parts[typeIdx + 1]) {
        const kind = parts[typeIdx].toLowerCase() === "profile" ? "user" : parts[typeIdx].toLowerCase();
        const id = parts[typeIdx + 1].replace(/\D/g, "") || parts[typeIdx + 1];
        if (kind === "playlist") return { kind: "playlist", id };
        if (kind === "album") return { kind: "album", id };
        if (kind === "track") return { kind: "track", id };
        if (kind === "artist") return { kind: "artist", id };
        if (kind === "user") return { kind: "user", id };
      }
      const id = url.searchParams.get("id") || url.searchParams.get("playlist") || url.searchParams.get("album");
      if (id && /^\d+$/.test(id)) return { kind: "playlist", id };
    }
  } catch {
    /* not a url */
  }
  if (/^\d+$/.test(text)) return { kind: "playlist", id: text };
  return { kind: "search", q: text };
}