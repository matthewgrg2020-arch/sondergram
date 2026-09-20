import { saveSpSession, type SpSession } from "./spotify";
import type { StreamHit } from "./stream-search";

export type SpTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  cover: string;
  preview: string;
  duration: number;
  trackNo: number;
  diskNo: number;
  explicit: boolean;
  liked: boolean;
  genre: string;
  playlist?: string;
};

type Json = Record<string, unknown>;

function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function readJson(res: Response): Promise<Json> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Spotify sent an empty response.");
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    throw new Error(
      res.ok
        ? "Spotify returned a web page instead of data. Check the redirect URI in your Spotify app."
        : `Spotify blocked that request (${res.status}). Check the Client ID and redirect URI.`,
    );
  }
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    const form = new URLSearchParams(trimmed.replace(/^\?/, ""));
    const token = form.get("access_token");
    if (token) {
      return {
        access_token: token,
        refresh_token: form.get("refresh_token") || "",
        expires_in: form.get("expires_in") || "3600",
      };
    }
    const err = form.get("error_description") || form.get("error") || trimmed.slice(0, 80);
    throw new Error(err || "Spotify did not return JSON. Check the Client ID and redirect URI.");
  }
}

async function spGet(token: string, path: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = asJson(data.error);
    throw new Error(str(err.message) || str(data.error_description) || `Spotify ${res.status}`);
  }
  return data;
}

function yearOf(date: string) {
  return date.slice(0, 4);
}

function coverOf(album: Json) {
  const images = Array.isArray(album.images) ? album.images : [];
  const best = [...images].sort((a, b) => num(asJson(b).width) - num(asJson(a).width))[0];
  return str(asJson(best).url);
}

function mapTrack(row: Json, extra?: { liked?: boolean; playlist?: string }): SpTrack | null {
  const nested = row.item && typeof row.item === "object" ? asJson(row.item) : row.track && typeof row.track === "object" ? asJson(row.track) : row;
  const track = nested;
  if (track.is_local) return null;
  const id = str(track.id);
  const name = str(track.name);
  if (!id || !name) return null;
  const artists = Array.isArray(track.artists) ? track.artists.map((a) => str(asJson(a).name)).filter(Boolean) : [];
  const album = asJson(track.album);
  const albumArtists = Array.isArray(album.artists) ? album.artists.map((a) => str(asJson(a).name)).filter(Boolean) : [];
  return {
    id,
    name,
    artist: artists.join(", ") || "Unknown artist",
    album: str(album.name) || "Unknown album",
    albumArtist: albumArtists[0] || artists[0] || "",
    year: yearOf(str(album.release_date)),
    cover: coverOf(album),
    preview: str(track.preview_url),
    duration: Math.round(num(track.duration_ms) / 1000),
    trackNo: num(track.track_number),
    diskNo: num(track.disc_number) || 1,
    explicit: Boolean(track.explicit),
    liked: Boolean(extra?.liked),
    genre: "",
    playlist: extra?.playlist,
  };
}

async function paginate<T>(token: string, path: string, pick: (data: Json) => T[]): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const data = next.startsWith("http")
      ? await (async () => {
          const res = await fetch(next!, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
          return readJson(res);
        })()
      : await spGet(token, next);
    out.push(...pick(data));
    const n = str(data.next);
    next = n ? (n.startsWith("http") ? n : n.replace("https://api.spotify.com/v1", "")) : "";
    if (out.length > 8000) break;
  }
  return out;
}

export async function spotifyMe(token: string) {
  const me = await spGet(token, "/me");
  return {
    id: str(me.id),
    name: str(me.display_name) || str(me.id) || "Spotify",
    product: str(me.product),
  };
}

export async function spotifyToken(args: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<SpSession> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(
      str(data.error_description) || str(asJson(data.error).message) || str(data.error) || "Spotify token failed",
    );
  }
  const token = str(data.access_token);
  if (!token) throw new Error("Spotify did not return a token. Check the Client ID and redirect URI.");
  const me = await spotifyMe(token);
  const session: SpSession = {
    token,
    refresh: str(data.refresh_token) || undefined,
    expiresAt: Date.now() + (num(data.expires_in) || 3600) * 1000,
    userId: me.id,
    name: me.name,
    product: me.product,
  };
  saveSpSession(session);
  return session;
}

export async function refreshSpotify(session: SpSession, clientId: string): Promise<SpSession> {
  if (!session.refresh) return session;
  if (session.expiresAt - 30_000 > Date.now()) return session;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: session.refresh,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(str(data.error_description) || "Spotify session expired. Sign in again.");
  const next: SpSession = {
    ...session,
    token: str(data.access_token) || session.token,
    refresh: str(data.refresh_token) || session.refresh,
    expiresAt: Date.now() + (num(data.expires_in) || 3600) * 1000,
  };
  saveSpSession(next);
  return next;
}

export async function fetchSpotifyLibrary(token: string): Promise<SpTrack[]> {
  const seen = new Set<string>();
  const tracks: SpTrack[] = [];
  const push = (row: SpTrack | null) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    tracks.push(row);
  };

  const albums = await paginate(token, "/me/albums?limit=50", (data) => {
    const items = Array.isArray(data.items) ? data.items : [];
    const batch: SpTrack[] = [];
    for (const item of items) {
      const album = asJson(asJson(item).album);
      const albumTracks = asJson(album.tracks);
      const list = Array.isArray(albumTracks.items) ? albumTracks.items : [];
      for (const t of list) {
        const mapped = mapTrack({ ...asJson(t), album });
        if (mapped) batch.push(mapped);
      }
    }
    return batch;
  });
  albums.forEach((t) => push(t));

  const saved = await paginate(token, "/me/tracks?limit=50", (data) => {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((row) => mapTrack(asJson(row), { liked: true })).filter((t): t is SpTrack => Boolean(t));
  });
  saved.forEach((t) => push(t));

  const playlists = await paginate(token, "/me/playlists?limit=50", (data) => {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((row) => ({ id: str(asJson(row).id), name: str(asJson(row).name) })).filter((p) => p.id);
  });
  for (const list of playlists.slice(0, 40)) {
    const items = await paginate(token, `/playlists/${list.id}/items?limit=50`, (data) => {
      const rows = Array.isArray(data.items) ? data.items : [];
      return rows.map((row) => mapTrack(asJson(row), { playlist: list.name })).filter((t): t is SpTrack => Boolean(t));
    }).catch(async () =>
      paginate(token, `/playlists/${list.id}/tracks?limit=50`, (data) => {
        const rows = Array.isArray(data.items) ? data.items : [];
        return rows.map((row) => mapTrack(asJson(row), { playlist: list.name })).filter((t): t is SpTrack => Boolean(t));
      }),
    );
    items.forEach((t) => push(t));
  }

  const missing = tracks.filter((t) => !t.preview);
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const data = await spGet(token, `/tracks?ids=${chunk.map((t) => t.id).join(",")}`);
    const list = Array.isArray(data.tracks) ? data.tracks : [];
    for (const row of list) {
      const full = mapTrack(asJson(row));
      const target = tracks.find((t) => t.id === full?.id);
      if (target && full?.preview) target.preview = full.preview;
    }
  }

  return tracks;
}

function coverFromImages(images: unknown) {
  const list = Array.isArray(images) ? images : [];
  const best = [...list].sort((a, b) => num(asJson(b).width) - num(asJson(a).width))[0];
  return str(asJson(best).url);
}

export async function searchSpotifyCatalog(token: string, q: string): Promise<StreamHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const search = (type: "track" | "album", extra = "") =>
    spGet(token, `/search?q=${encodeURIComponent(query)}&type=${type}&limit=10${extra}`);
  const [trackData, albumData] = await Promise.all([
    search("track", "&market=from_token").catch(() => search("track")),
    search("album", "&market=from_token").catch(() => search("album")),
  ]);
  const out: StreamHit[] = [];
  const tracks = asJson(trackData.tracks);
  for (const row of Array.isArray(tracks.items) ? tracks.items : []) {
    const item = asJson(row);
    const id = str(item.id);
    const name = str(item.name);
    if (!id || !name) continue;
    const album = asJson(item.album);
    const artists = Array.isArray(item.artists) ? item.artists.map((a) => str(asJson(a).name)).filter(Boolean) : [];
    out.push({
      key: `spotify:track:${id}`,
      source: "Spotify",
      kind: "track",
      name,
      artist: artists.join(", ") || "Unknown artist",
      album: str(album.name),
      year: yearOf(str(album.release_date)),
      cover: coverFromImages(album.images),
      preview: str(item.preview_url),
      duration: Math.round(num(item.duration_ms) / 1000),
      trackNo: num(item.track_number),
      spotifyId: id,
      page: str(asJson(item.external_urls).spotify),
    });
  }
  const albums = asJson(albumData.albums);
  for (const row of Array.isArray(albums.items) ? albums.items : []) {
    const item = asJson(row);
    const id = str(item.id);
    const name = str(item.name);
    if (!id || !name) continue;
    const artists = Array.isArray(item.artists) ? item.artists.map((a) => str(asJson(a).name)).filter(Boolean) : [];
    out.push({
      key: `spotify:album:${id}`,
      source: "Spotify",
      kind: "album",
      name,
      artist: artists.join(", ") || "Unknown artist",
      album: name,
      year: yearOf(str(item.release_date)),
      cover: coverFromImages(item.images),
      preview: "",
      duration: 0,
      trackNo: 0,
      spotifyId: id,
      page: str(asJson(item.external_urls).spotify),
    });
  }
  return out;
}