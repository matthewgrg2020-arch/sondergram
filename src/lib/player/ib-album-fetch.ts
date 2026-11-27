import type { IbSession, IbTrack } from "./ibroadcast";

export type IbSearchResult = {
  ok: boolean;
  tracks: IbTrack[];
  total: number;
  truncated?: boolean;
  error?: string;
};

function artworkUrl(artId: string | undefined): string | undefined {
  if (!artId) return undefined;
  return `https://artwork.ibroadcast.com/artwork/${artId}-300`;
}

function cleanName(value: string) {
  return String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function textMatches(text: string, q: string): boolean {
  const a = text.toLowerCase();
  const b = q.toLowerCase();
  if (!b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const at = a.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const bt = b.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!bt.length) return false;
  return bt.every((t) => at.some((x) => x.includes(t) || t.includes(x)));
}

function namesFromPath(path: string): { artist: string; album: string; title: string } {
  const p = String(path || "").replace(/\\/g, "/");
  if (!p) return { artist: "", album: "", title: "" };
  const parts = p.split("/").filter(Boolean);
  const file = parts[parts.length - 1] || "";
  const fileTitle = file.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^\d+[\s.-]+/, "");
  while (parts.length && /^(music|artists|albums|compilations|tracks|audio)$/i.test(parts[0]!)) parts.shift();
  let artist = "", album = "";
  if (parts.length >= 2) { artist = parts[0] || ""; album = parts[1] || ""; }
  else if (parts.length === 1) album = parts[0] || "";
  album = album.replace(/^\(\d{4}\)\s*/, "").trim();
  return { artist: cleanName(artist), album: cleanName(album), title: cleanName(fileTitle) || fileTitle };
}

function authPayload(session: IbSession) {
  return {
    user_id: session.userId,
    token: session.token,
    mode: "library",
    client: "sondergram",
    version: "1.0",
    device_name: "web",
    device_id: session.deviceId || "web",
  };
}

/** Load full album tracks from iBroadcast library stream. */
export async function fetchIbAlbumTracks(
  session: IbSession,
  opts: { albumId?: string; album?: string; artist?: string; maxTracks?: number },
): Promise<IbSearchResult> {
  const albumWant = String(opts.album || "").trim();
  const artistWant = String(opts.artist || "").trim();
  const q = [artistWant, albumWant].filter(Boolean).join(" ");
  if (!opts.albumId && !albumWant) return { ok: false, tracks: [], total: 0, error: "Missing album." };
  try {
    const res = await fetch("/api/ib-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session.userId,
        token: session.token,
        q: q || albumWant,
        albumId: opts.albumId,
        maxHits: opts.maxTracks ?? 200,
      }),
    });
    const data = (await res.json()) as IbSearchResult;
    if (data?.ok && Array.isArray(data.tracks)) {
      let tracks = data.tracks;
      if (albumWant) tracks = tracks.filter((t) => textMatches(t.album || "", albumWant));
      if (artistWant) tracks = tracks.filter((t) => textMatches(t.artist || "", artistWant));
      return { ok: true, tracks, total: tracks.length };
    }
    return { ok: false, tracks: [], total: 0, error: data?.error || "Album not found." };
  } catch (err) {
    return { ok: false, tracks: [], total: 0, error: err instanceof Error ? err.message : "Album load failed." };
  }
}

/** Load all tracks for an artist from iBroadcast. */
export async function fetchIbArtistTracks(
  session: IbSession,
  opts: { artistId?: string; artist?: string; maxTracks?: number },
): Promise<IbSearchResult> {
  const artistWant = String(opts.artist || "").trim();
  if (!opts.artistId && !artistWant) return { ok: false, tracks: [], total: 0, error: "Missing artist." };
  try {
    const res = await fetch("/api/ib-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session.userId,
        token: session.token,
        q: artistWant,
        artistId: opts.artistId,
        maxHits: opts.maxTracks ?? 2000,
      }),
    });
    const data = (await res.json()) as IbSearchResult;
    if (data?.ok && Array.isArray(data.tracks)) {
      let tracks = data.tracks;
      if (artistWant) {
        const exact = tracks.filter((t) => textMatches(t.artist || "", artistWant));
        if (exact.length) tracks = exact;
      }
      tracks.sort(
        (a, b) =>
          (a.album || "").localeCompare(b.album || "") ||
          (a.name || "").localeCompare(b.name || ""),
      );
      return { ok: true, tracks, total: tracks.length, truncated: tracks.length >= (opts.maxTracks ?? 2000) };
    }
    return { ok: false, tracks: [], total: 0, error: data?.error || "Artist not found." };
  } catch (err) {
    return { ok: false, tracks: [], total: 0, error: err instanceof Error ? err.message : "Artist load failed." };
  }
}
