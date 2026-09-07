import { createServerFn } from "@tanstack/react-start";
import type { IbPlaylist, IbSession, IbTrack } from "./ibroadcast";

const CLIENT = "Sondergram";
const VERSION = "1.0";

type Json = Record<string, unknown>;

async function postJson(url: string, body: Json): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `${CLIENT}/${VERSION}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error(text.slice(0, 180) || `iBroadcast ${url} did not return JSON.`);
  }
  if (parsed.result === false || parsed.authenticated === false) {
    throw new Error(str(parsed.message) || "iBroadcast rejected the request.");
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
  return { tracks: tracks.slice(0, 800), playlists, total: tracks.length };
}

function authBody(session: IbSession, mode: string, extra: Json = {}): Json {
  return {
    _token: session.token,
    _userid: Number(session.userId) || session.userId,
    user_id: Number(session.userId) || session.userId,
    token: session.token,
    client: CLIENT,
    version: VERSION,
    mode,
    supported_types: false,
    ...extra,
  };
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
    let parsed = parseLibrary(
      await postJson("https://library.ibroadcast.com", {
        ...authBody(data, "library"),
        url: "//library.ibroadcast.com",
      }),
    );
    if (parsed.total === 0) {
      try {
        parsed = parseLibrary(
          await postJson("https://api.ibroadcast.com/s/JSON/library", {
            ...authBody(data, "library"),
            url: "//api.ibroadcast.com/s/JSON/library",
          }),
        );
      } catch {
        /* keep the first empty result */
      }
    }
    if (parsed.total === 0) {
      throw new Error("Signed in, but iBroadcast returned no tracks. Try Sync library again.");
    }
    return parsed;
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
