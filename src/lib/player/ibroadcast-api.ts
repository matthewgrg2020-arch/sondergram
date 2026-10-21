import { createServerFn } from "@tanstack/react-start";
import type { IbPlaylist, IbSession, IbTrack } from "./ibroadcast";

const CLIENT = "Sondergram";
const VERSION = "1.0";
const DEVICE = "Sondergram Web";
const MAX_TRACKS = 800;

type Json = Record<string, unknown>;

export type IbLibraryResult =
  | { ok: true; tracks: IbTrack[]; playlists: IbPlaylist[]; total: number }
  | { ok: false; tracks: IbTrack[]; playlists: IbPlaylist[]; total: number; error: string; debug?: string };

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function postJson(url: string, body: Json, headers: Record<string, string> = {}): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": `${CLIENT}/${VERSION}`,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Json;
    try {
      parsed = JSON.parse(text) as Json;
    } catch {
      throw new Error(text.slice(0, 180) || `iBroadcast ${url} did not return JSON (HTTP ${res.status}).`);
    }
    if (parsed.result === false || parsed.authenticated === false) {
      throw new Error(str(parsed.message) || `iBroadcast rejected the request (HTTP ${res.status}).`);
    }
    if (!res.ok && parsed.result !== true) {
      throw new Error(str(parsed.message) || `iBroadcast HTTP ${res.status}.`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
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
      else if (typeof index === "string" && /^\d+$/.test(index)) keymap[Number(index)] = name;
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

function pickLibrary(raw: Json): Json {
  if (raw.library && typeof raw.library === "object") return raw.library as Json;
  if (raw.tracks || raw.albums) return raw;
  return raw;
}

function describeRaw(raw: Json): string {
  const lib = pickLibrary(raw);
  const trackKeys =
    lib.tracks && typeof lib.tracks === "object"
      ? Object.keys(lib.tracks as object).filter((k) => k !== "map" && k !== "keys" && k !== "length").length
      : 0;
  const top = Object.keys(raw).slice(0, 10).join(",");
  const libKeys = Object.keys(lib).slice(0, 10).join(",");
  return `top=[${top}] lib=[${libKeys}] trackEntries=${trackKeys}`;
}

function parseLibrary(raw: Json): { tracks: IbTrack[]; playlists: IbPlaylist[]; total: number } {
  const library = pickLibrary(raw);
  const tracksMap = decodeMap(library.tracks);
  const albumsMap = decodeMap(library.albums);
  const artistsMap = decodeMap(library.artists);
  const playlistsMap = decodeMap(library.playlists);
  const tracks: IbTrack[] = [];
  for (const [id, row] of Object.entries(tracksMap)) {
    try {
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
    } catch {
      /* skip bad row */
    }
  }
  const playlists: IbPlaylist[] = Object.entries(playlistsMap).map(([id, row]) => ({
    id,
    name: str(row.name) || "Playlist",
    trackIds: Array.isArray(row.tracks) ? row.tracks.map((t) => str(t)).filter(Boolean) : [],
  }));
  return { tracks: tracks.slice(0, MAX_TRACKS), playlists, total: tracks.length };
}

function authBody(session: IbSession, mode: string, extra: Json = {}): Json {
  const uidNum = Number(session.userId);
  const uid = Number.isFinite(uidNum) && uidNum > 0 ? uidNum : session.userId;
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
    supported_types: 1,
    ...extra,
  };
}

function filterTracks(tracks: IbTrack[], q: string): IbTrack[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return tracks;
  return tracks.filter(
    (t) =>
      t.name.toLowerCase().includes(needle) ||
      t.artist.toLowerCase().includes(needle) ||
      t.album.toLowerCase().includes(needle) ||
      (t.genre || "").toLowerCase().includes(needle),
  );
}

async function fetchLibraryOnce(session: IbSession, query = ""): Promise<IbLibraryResult> {
  const errors: string[] = [];
  const debugs: string[] = [];

  const attempts: Array<{ label: string; run: () => Promise<Json> }> = [
    {
      label: "library.ibroadcast.com/",
      run: () =>
        postJson("https://library.ibroadcast.com/", {
          ...authBody(session, "library"),
          url: "//library.ibroadcast.com",
        }),
    },
    {
      label: "library.ibroadcast.com",
      run: () =>
        postJson("https://library.ibroadcast.com", {
          ...authBody(session, "library"),
          url: "//library.ibroadcast.com",
        }),
    },
    {
      label: "api/s/JSON/library",
      run: () =>
        postJson("https://api.ibroadcast.com/s/JSON/library", {
          ...authBody(session, "library"),
          url: "//api.ibroadcast.com/s/JSON/library",
        }),
    },
    {
      label: "Bearer library",
      run: () =>
        postJson(
          "https://library.ibroadcast.com/",
          {
            mode: "library",
            client: CLIENT,
            version: VERSION,
            device_name: DEVICE,
            user_agent: `${CLIENT}/${VERSION}`,
            supported_types: 1,
          },
          { Authorization: `Bearer ${session.token}` },
        ),
    },
  ];

  for (const attempt of attempts) {
    try {
      const raw = await attempt.run();
      const info = describeRaw(raw);
      debugs.push(`${attempt.label}: ${info}`);
      const parsed = parseLibrary(raw);
      if (parsed.total > 0) {
        const tracks = filterTracks(parsed.tracks, query);
        return {
          ok: true,
          tracks,
          playlists: parsed.playlists,
          total: query ? tracks.length : parsed.total,
        };
      }
      errors.push(`${attempt.label}: 0 tracks (${info})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "failed";
      errors.push(`${attempt.label}: ${msg}`);
      debugs.push(`${attempt.label}: error ${msg}`);
    }
  }

  return {
    ok: false,
    tracks: [],
    playlists: [],
    total: 0,
    error:
      "Could not load iBroadcast library. Sign out, sign back in, then try Load again. " +
      errors.slice(0, 2).join(" · "),
    debug: debugs.slice(0, 3).join(" | "),
  };
}

export const ibLogin = createServerFn({ method: "POST" })
  .validator((d: { email?: string; password?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const email = str(data?.email);
      const password = String(data?.password ?? "");
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
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "iBroadcast sign-in failed.");
    }
  });

export const ibLibrary = createServerFn({ method: "POST" })
  .validator((d: IbSession & { q?: string }) => d)
  .handler(async ({ data }): Promise<IbLibraryResult> => {
    try {
      if (!data?.token || !data?.userId) {
        return {
          ok: false,
          tracks: [],
          playlists: [],
          total: 0,
          error: "Missing iBroadcast session. Sign out and sign in again.",
        };
      }
      return await fetchLibraryOnce(
        {
          userId: str(data.userId),
          token: str(data.token),
          streaming: str(data.streaming) || "https://streaming.ibroadcast.com",
          email: str(data.email),
        },
        str(data.q),
      );
    } catch (err) {
      return {
        ok: false,
        tracks: [],
        playlists: [],
        total: 0,
        error: err instanceof Error ? err.message : "iBroadcast library request failed.",
      };
    }
  });

/** Search within the signed-in library (server-side filter after load). */
export const ibSearch = createServerFn({ method: "POST" })
  .validator((d: { session: IbSession; q?: string }) => d)
  .handler(async ({ data }): Promise<IbLibraryResult> => {
    try {
      const session = data?.session;
      if (!session?.token || !session?.userId) {
        return {
          ok: false,
          tracks: [],
          playlists: [],
          total: 0,
          error: "Sign in to iBroadcast first.",
        };
      }
      return await fetchLibraryOnce(session, str(data.q));
    } catch (err) {
      return {
        ok: false,
        tracks: [],
        playlists: [],
        total: 0,
        error: err instanceof Error ? err.message : "iBroadcast search failed.",
      };
    }
  });

export const ibSharePlaylist = createServerFn({ method: "POST" })
  .validator((d: { session: IbSession; name: string; trackIds: string[] }) => d)
  .handler(async ({ data }) => {
    try {
      const ids = (data.trackIds || []).filter(Boolean).slice(0, 200);
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
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Could not share playlist.");
    }
  });
