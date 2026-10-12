import { createServerFn } from "@tanstack/react-start";
import type { IbPlaylist, IbSession, IbTrack } from "./ibroadcast";

const CLIENT = "Sondergram";
const VERSION = "1.0";
const DEVICE = "Sondergram Web";

type Json = Record<string, unknown>;

async function postJson(url: string, body: Json, headers: Record<string, string> = {}): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `${CLIENT}/${VERSION}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error(text.slice(0, 220) || `iBroadcast ${url} did not return JSON (HTTP ${res.status}).`);
  }
  if (parsed.result === false || parsed.authenticated === false) {
    throw new Error(str(parsed.message) || `iBroadcast rejected the request (HTTP ${res.status}).`);
  }
  if (!res.ok && parsed.result !== true) {
    throw new Error(str(parsed.message) || `iBroadcast HTTP ${res.status}.`);
  }
  return parsed;
}

/** iBroadcast packs rows as arrays plus a sibling `map` of field → index. */
function decodeMap(raw: unknown): Record<string, Json> {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  const mapping = data.map;
  const keymap: Record<number, string> = {};
  if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
    for (const [name, index] of Object.entries(mapping as Record<string, unknown>)) {
      if (typeof index === "number") keymap[index] = name;
    }
  }
  const out: Record<string, Json> = {};
  for (const [id, value] of Object.entries(data)) {
    if (id === "map" || id === "keys" || id === "length") continue;
    if (Array.isArray(value)) {
      const row: Json = {};
      value.forEach((item, i) => {
        row[keymap[i] ?? String(i)] = item as unknown;
      });
      out[id] = row;
      continue;
    }
    if (value && typeof value === "object") out[id] = value as Json;
  }
  return out;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickLibrary(raw: Json): Json {
  if (raw.library && typeof raw.library === "object") return raw.library as Json;
  if (raw.tracks || raw.albums) return raw;
  return raw;
}

function parseLibrary(raw: Json): { tracks: IbTrack[]; playlists: IbPlaylist[]; total: number } {
  const library = pickLibrary(raw);
  const tracksMap = decodeMap(library.tracks);
  const albumsMap = decodeMap(library.albums);
  const artistsMap = decodeMap(library.artists);
  const playlistsMap = decodeMap(library.playlists);
  const tracks: IbTrack[] = [];
  for (const [id, row] of Object.entries(tracksMap)) {
    if (row.trashed) continue;
    const album = albumsMap[str(row.album_id)] || {};
    const artist = artistsMap[str(row.artist_id)] || {};
    const extraArtist = str(row.artist || row.artist_name);
    const artId = str(row.artwork_id || album.artwork_id || "");
    const file = str(row.file || row.path || row.url);
    tracks.push({
      id,
      name: str(row.title || row.name) || "Untitled",
      artist: str(artist.name) || extraArtist || "Unknown artist",
      album: str(album.name || album.title) || str(row.album) || "Unknown album",
      year: str(row.year || album.year || "").slice(0, 4),
      genre: str(row.genre || ""),
      file,
      artwork: artId ? `https://artwork.ibroadcast.com/${artId}` : "",
    });
  }
  const playlists: IbPlaylist[] = Object.entries(playlistsMap).map(([id, row]) => ({
    id,
    name: str(row.name) || "Playlist",
    trackIds: Array.isArray(row.tracks) ? row.tracks.map((t) => str(t)) : [],
  }));
  return { tracks: tracks.slice(0, 2000), playlists, total: tracks.length };
}

function authBody(session: IbSession, mode: string, extra: Json = {}): Json {
  const uid = Number(session.userId) || session.userId;
  return {
    _token: session.token,
    _userid: uid,
    user_id: uid,
    token: session.token,
    client: CLIENT,
    version: VERSION,
    device_name: DEVICE,
    user_agent: `${CLIENT}/${VERSION}`,
    mode,
    supported_types: false,
    ...extra,
  };
}

async function fetchLibraryOnce(session: IbSession): Promise<{ tracks: IbTrack[]; playlists: IbPlaylist[]; total: number }> {
  const errors: string[] = [];

  // Classic library server (email/password token style)
  try {
    const raw = await postJson("https://library.ibroadcast.com/", {
      ...authBody(session, "library"),
      url: "//library.ibroadcast.com",
    });
    const parsed = parseLibrary(raw);
    if (parsed.total > 0) return parsed;
    errors.push("library.ibroadcast.com returned 0 tracks");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "library.ibroadcast.com failed");
  }

  // Same host without trailing slash
  try {
    const raw = await postJson("https://library.ibroadcast.com", {
      ...authBody(session, "library"),
      url: "//library.ibroadcast.com",
    });
    const parsed = parseLibrary(raw);
    if (parsed.total > 0) return parsed;
    errors.push("library.ibroadcast.com (no slash) returned 0 tracks");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "library.ibroadcast.com (no slash) failed");
  }

  // API JSON library endpoint
  try {
    const raw = await postJson("https://api.ibroadcast.com/s/JSON/library", {
      ...authBody(session, "library"),
      url: "//api.ibroadcast.com/s/JSON/library",
    });
    const parsed = parseLibrary(raw);
    if (parsed.total > 0) return parsed;
    errors.push("api library returned 0 tracks");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "api library failed");
  }

  // Bearer-style (newer clients)
  try {
    const raw = await postJson(
      "https://library.ibroadcast.com/",
      {
        mode: "library",
        client: CLIENT,
        version: VERSION,
        device_name: DEVICE,
        user_agent: `${CLIENT}/${VERSION}`,
      },
      { Authorization: `Bearer ${session.token}` },
    );
    const parsed = parseLibrary(raw);
    if (parsed.total > 0) return parsed;
    errors.push("Bearer library returned 0 tracks");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Bearer library failed");
  }

  // Last attempt: status endpoint sometimes embeds library snapshot
  try {
    const status = await postJson("https://api.ibroadcast.com/s/JSON/status", {
      mode: "status",
      ...authBody(session, "status"),
      url: "//api.ibroadcast.com/s/JSON/status",
    });
    if (status.library) {
      const parsed = parseLibrary(status);
      if (parsed.total > 0) return parsed;
    }
  } catch {
    /* ignore */
  }

  throw new Error(
    `Could not load iBroadcast library. ${errors.slice(0, 3).join(" · ") || "Unknown error."} Try signing out and back in.`,
  );
}

export const ibLogin = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim();
    const password = data.password;
    if (!email || !password) throw new Error("Email and password are required.");
    const status = await postJson("https://api.ibroadcast.com/s/JSON/status", {
      mode: "status",
      email_address: email,
      password,
      version: VERSION,
      client: CLIENT,
      device_name: DEVICE,
      user_agent: `${CLIENT}/${VERSION}`,
      supported_types: 1,
    });
    const user = status.user as Json | undefined;
    const token = str(user?.token || user?.login_token || status.token);
    const userId = str(user?.id || user?.user_id || status.user_id);
    if (!userId || !token) {
      throw new Error(str(status.message) || "Could not sign in to iBroadcast.");
    }
    const settings = (status.settings as Json) || {};
    const streaming = str(settings.streaming_server) || "https://streaming.ibroadcast.com";
    const session: IbSession = {
      userId,
      token,
      streaming: streaming.replace(/\/$/, ""),
      email,
    };
    return session;
  });

export const ibLibrary = createServerFn({ method: "POST" })
  .validator((d: IbSession) => d)
  .handler(async ({ data }) => {
    if (!data?.token || !data?.userId) {
      throw new Error("Missing iBroadcast session. Sign in again.");
    }
    return fetchLibraryOnce(data);
  });

export const ibSharePlaylist = createServerFn({ method: "POST" })
  .validator((d: { session: IbSession; name: string; trackIds: string[] }) => d)
  .handler(async ({ data }) => {
    const ids = data.trackIds.filter(Boolean).slice(0, 200);
    if (ids.length === 0) throw new Error("Nothing to share yet.");
    const created = await postJson("https://api.ibroadcast.com/s/JSON/createplaylist", {
      ...authBody(data.session, "createplaylist", {
        name: data.name || "Sondergram",
        description: "Shared from Sondergram",
        make_public: true,
      }),
      url: "//api.ibroadcast.com/s/JSON/createplaylist",
    });
    const playlistId = str(created.playlist_id || created.id);
    if (!playlistId) throw new Error(str(created.message) || "Could not create a share playlist.");
    await postJson("https://api.ibroadcast.com/s/JSON/updateplaylist", {
      ...authBody(data.session, "updateplaylist", {
        playlist: num(playlistId) || playlistId,
        tracks: ids.map((id) => num(id) || id),
      }),
      url: "//api.ibroadcast.com/s/JSON/updateplaylist",
    });
    return {
      playlistId,
      url: `https://media.ibroadcast.com/?view=container&container_id=${encodeURIComponent(playlistId)}&type=playlists`,
    };
  });
