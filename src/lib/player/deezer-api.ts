import { createServerFn } from "@tanstack/react-start";
import type { DzSession, DzTarget, DzTrack } from "./deezer";

type Json = Record<string, unknown>;

type Page = {
  id?: string | number;
  data?: Json[];
  next?: string;
  total?: number;
  error?: { type?: string; message?: string; code?: number };
};

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

function yearOf(value: unknown) {
  const text = str(value);
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function coverOf(row: Json) {
  const album = asJson(row.album);
  return (
    str(row.cover_xl) ||
    str(row.cover_big) ||
    str(album.cover_xl) ||
    str(album.cover_big) ||
    str(album.cover_medium) ||
    str(row.picture_xl) ||
    str(row.picture_big)
  );
}

function mapTrack(row: Json, source = "Deezer"): DzTrack | null {
  const id = str(row.id);
  const name = str(row.title) || str(row.title_short);
  if (!id || !name) return null;
  const artist = asJson(row.artist);
  const album = asJson(row.album);
  return {
    id,
    name,
    artist: str(artist.name) || str(row.artist_name) || "Unknown artist",
    album: str(album.title) || str(row.album_title) || "",
    year: yearOf(album.release_date || row.release_date),
    cover: coverOf(row),
    preview: str(row.preview),
    duration: num(row.duration),
    trackNo: num(row.track_position) || 0,
    diskNo: num(row.disk_number) || 1,
    explicit: Boolean(row.explicit_lyrics),
    source,
  };
}

async function getJson(url: string): Promise<Json> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error("Deezer did not return JSON.");
  }
  const err = asJson(parsed.error);
  if (str(err.message) || str(err.type)) {
    throw new Error(str(err.message) || "Deezer rejected that request.");
  }
  return parsed;
}

function withToken(url: string, token?: string) {
  if (!token) return url;
  const next = new URL(url);
  if (!next.searchParams.get("access_token")) next.searchParams.set("access_token", token);
  return next.toString();
}

async function collect(url: string, token: string | undefined, cap: number) {
  const items: Json[] = [];
  let next: string | null = withToken(url, token);
  while (next && items.length < cap) {
    const page = (await getJson(next)) as Page;
    if (Array.isArray(page.data)) items.push(...page.data);
    else if (page.id) items.push(page as Json);
    next = page.next ? withToken(page.next, token) : null;
  }
  return items.slice(0, cap);
}

async function resolveShortLink(input: string) {
  try {
    const res = await fetch(input, { method: "HEAD", redirect: "follow" });
    return res.url || input;
  } catch {
    return input;
  }
}

export const dzMe = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const me = await getJson(`https://api.deezer.com/user/me?access_token=${encodeURIComponent(data.token)}`);
    const id = str(me.id);
    if (!id) throw new Error("That Deezer token did not return a user.");
    return {
      token: data.token,
      userId: id,
      name: str(me.name) || str(me.firstname) || "Deezer",
    } satisfies DzSession;
  });

export const dzExchange = createServerFn({ method: "POST" })
  .validator((d: { appId: string; secret: string; code: string }) => d)
  .handler(async ({ data }) => {
    const url = new URL("https://connect.deezer.com/oauth/access_token.php");
    url.searchParams.set("app_id", data.appId.trim());
    url.searchParams.set("secret", data.secret.trim());
    url.searchParams.set("code", data.code.trim());
    url.searchParams.set("output", "json");
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const text = await res.text();
    let token = "";
    try {
      const parsed = JSON.parse(text) as Json;
      token = str(parsed.access_token);
    } catch {
      token = str(new URLSearchParams(text.replace(/^\?/, "")).get("access_token"));
    }
    if (!token) throw new Error("Deezer did not return an access token. Check the app ID and secret.");
    const me = await getJson(`https://api.deezer.com/user/me?access_token=${encodeURIComponent(token)}`);
    const id = str(me.id);
    if (!id) throw new Error("Signed in, but Deezer did not return a user.");
    return {
      token,
      userId: id,
      name: str(me.name) || str(me.firstname) || "Deezer",
      appId: data.appId.trim(),
    } satisfies DzSession;
  });

async function tracksFromTarget(target: DzTarget, token: string | undefined, cap: number): Promise<DzTrack[]> {
  const api = "https://api.deezer.com";
  if (target.kind === "track") {
    const row = await getJson(withToken(`${api}/track/${target.id}`, token));
    const mapped = mapTrack(row, "Deezer");
    return mapped ? [mapped] : [];
  }
  if (target.kind === "search") {
    const rows = await collect(`${api}/search?q=${encodeURIComponent(target.q)}&limit=50`, token, Math.min(cap, 50));
    return rows.map((row) => mapTrack(row, "Deezer search")).filter((t): t is DzTrack => Boolean(t));
  }
  if (target.kind === "album") {
    const album = await getJson(withToken(`${api}/album/${target.id}`, token));
    const rows = await collect(`${api}/album/${target.id}/tracks?limit=100`, token, 400);
    const cover = coverOf(album);
    const year = yearOf(album.release_date);
    const title = str(album.title);
    const artist = str(asJson(album.artist).name);
    return rows
      .map((row) => {
        const mapped = mapTrack(
          { ...row, album: { title, cover_xl: cover, release_date: album.release_date }, artist: asJson(row.artist).name ? row.artist : album.artist },
          title,
        );
        if (!mapped) return null;
        return { ...mapped, album: mapped.album || title, artist: mapped.artist || artist, year: mapped.year || year, cover: mapped.cover || cover };
      })
      .filter((t): t is DzTrack => Boolean(t));
  }
  if (target.kind === "playlist") {
    const playlist = await getJson(withToken(`${api}/playlist/${target.id}`, token));
    const name = str(playlist.title) || "Playlist";
    const rows = await collect(`${api}/playlist/${target.id}/tracks?limit=100`, token, cap);
    return rows.map((row) => mapTrack(row, name)).filter((t): t is DzTrack => Boolean(t));
  }
  if (target.kind === "artist") {
    const artist = await getJson(withToken(`${api}/artist/${target.id}`, token));
    const name = str(artist.name) || "Artist";
    const rows = await collect(`${api}/artist/${target.id}/top?limit=50`, token, 100);
    return rows.map((row) => mapTrack(row, name)).filter((t): t is DzTrack => Boolean(t));
  }
  const userId = target.kind === "user" ? target.id : "";
  const base = target.kind === "token" || !userId ? `${api}/user/me` : `${api}/user/${userId}`;
  const [loved, playlists, albums] = await Promise.all([
    collect(`${base}/tracks?limit=100`, token, cap).catch(() => [] as Json[]),
    collect(`${base}/playlists?limit=50`, token, 80).catch(() => [] as Json[]),
    collect(`${base}/albums?limit=50`, token, 80).catch(() => [] as Json[]),
  ]);
  const out: DzTrack[] = [];
  const seen = new Set<string>();
  const push = (row: Json, source: string) => {
    const mapped = mapTrack(row, source);
    if (!mapped || seen.has(mapped.id)) return;
    seen.add(mapped.id);
    out.push(mapped);
  };
  for (const row of loved) push(row, "Loved tracks");
  for (const list of playlists) {
    if (out.length >= cap) break;
    const id = str(list.id);
    if (!id) continue;
    const title = str(list.title) || "Playlist";
    const rows = await collect(`${api}/playlist/${id}/tracks?limit=100`, token, cap - out.length).catch(() => [] as Json[]);
    for (const row of rows) push(row, title);
  }
  for (const album of albums) {
    if (out.length >= cap) break;
    const id = str(album.id);
    if (!id) continue;
    const rows = await collect(`${api}/album/${id}/tracks?limit=100`, token, 80).catch(() => [] as Json[]);
    const cover = coverOf(album);
    const title = str(album.title);
    for (const row of rows) {
      const mapped = mapTrack({ ...row, album, artist: asJson(row.artist).name ? row.artist : album.artist }, title);
      if (!mapped || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      out.push({ ...mapped, cover: mapped.cover || cover, album: mapped.album || title });
    }
  }
  return out.slice(0, cap);
}

export const dzImport = createServerFn({ method: "POST" })
  .validator((d: { input?: string; token?: string; target?: DzTarget }) => d)
  .handler(async ({ data }) => {
    let target = data.target;
    const token = data.token?.trim() || undefined;
    if (!target && data.input) {
      let text = data.input.trim();
      if (/link\.deezer\.com|deezer\.page\.link/i.test(text)) text = await resolveShortLink(text);
      const { parseDeezerInput } = await import("./deezer");
      target = parseDeezerInput(text) ?? undefined;
    }
    if (!target && token) target = { kind: "token" };
    if (!target) throw new Error("Paste a Deezer playlist, album, profile, or search.");
    const tracks = await tracksFromTarget(target, token, 1200);
    if (tracks.length === 0) {
      throw new Error(
        token
          ? "Deezer returned no tracks. The library may be private."
          : "Nothing public there. Connect with a token to import your private library.",
      );
    }
    return { tracks, count: tracks.length };
  });

function gwCover(pic: string) {
  if (!pic) return "";
  return `https://cdn-images.dzcdn.net/images/cover/${pic}/1000x1000-000000-80-0-0.jpg`;
}

async function gwCall(arl: string, method: string, apiToken: string, payload: Json = {}) {
  const url = new URL("https://www.deezer.com/ajax/gw-light.php");
  url.searchParams.set("method", method);
  url.searchParams.set("input", "3");
  url.searchParams.set("api_version", "1.0");
  url.searchParams.set("api_token", apiToken || "null");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Cookie: `arl=${arl.trim()}`,
      "Content-Type": "application/json",
      Accept: "*/*",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    throw new Error("Deezer ARL did not return JSON.");
  }
  const err = parsed.error;
  if (Array.isArray(err) && err.length) throw new Error("That ARL was rejected. Copy a fresh cookie from deezer.com.");
  if (err && typeof err === "object" && Object.keys(err as Json).length) {
    throw new Error("Deezer rejected that ARL.");
  }
  return asJson(parsed.results);
}

function mapGwSong(row: Json, source = "Deezer"): DzTrack | null {
  const id = str(row.SNG_ID);
  const name = str(row.SNG_TITLE) || str(row.TITLE);
  if (!id || !name) return null;
  const artists = Array.isArray(row.ARTISTS) ? row.ARTISTS : [];
  const artist =
    str(row.ART_NAME) ||
    str(asJson(artists[0]).ART_NAME) ||
    "Unknown artist";
  return {
    id,
    name,
    artist,
    album: str(row.ALB_TITLE),
    year: yearOf(row.PHYSICAL_RELEASE_DATE || row.DIGITAL_RELEASE_DATE),
    cover: gwCover(str(row.ALB_PICTURE)),
    preview: str(row.PREVIEW),
    duration: num(row.DURATION),
    trackNo: num(row.TRACK_NUMBER),
    diskNo: num(row.DISK_NUMBER) || 1,
    explicit: Boolean(Number(row.EXPLICIT_LYRICS)),
    source,
  };
}

export const dzArlImport = createServerFn({ method: "POST" })
  .validator((d: { arl: string }) => d)
  .handler(async ({ data }) => {
    const arl = data.arl.trim();
    if (arl.length < 20) throw new Error("That ARL looks too short.");
    const userData = await gwCall(arl, "deezer.getUserData", "");
    const user = asJson(userData.USER);
    const userId = str(user.USER_ID);
    if (!userId) throw new Error("ARL signed in but no user came back.");
    const apiToken = str(userData.checkForm);
    const name = str(user.BLOG_NAME) || str(user.USER_DISPLAY_NAME) || str(user.FIRSTNAME) || "Deezer";
    const lovedId = str(user.LOVEDTRACKS_ID) || userId;
    const songs: Json[] = [];
    const loved = await gwCall(arl, "playlist.getSongs", apiToken, {
      playlist_id: lovedId,
      nb: 2000,
      start: 0,
    });
    if (Array.isArray(loved.data)) songs.push(...loved.data);
    try {
      const albums = await gwCall(arl, "album.getListByUser", apiToken, { user_id: userId, nb: 80, start: 0 });
      const list = Array.isArray(albums.data) ? albums.data : [];
      for (const album of list.slice(0, 40)) {
        const id = str(asJson(album).ALB_ID);
        if (!id) continue;
        const page = await gwCall(arl, "song.getListByAlbum", apiToken, { alb_id: id, nb: 80, start: 0 });
        if (Array.isArray(page.data)) songs.push(...page.data);
      }
    } catch {
      /* loved tracks are enough */
    }
    const tracks = songs.map((row) => mapGwSong(asJson(row), "ARL")).filter((t): t is DzTrack => Boolean(t));
    const unique: DzTrack[] = [];
    const seen = new Set<string>();
    for (const track of tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      unique.push(track);
    }
    if (unique.length === 0) throw new Error("Signed in, but no loved tracks or albums were on that account.");
    return {
      session: { token: apiToken || arl.slice(0, 12), userId, name, arl } satisfies DzSession,
      tracks: unique,
      count: unique.length,
    };
  });