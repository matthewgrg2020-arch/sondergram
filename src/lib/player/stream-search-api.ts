import { createServerFn } from "@tanstack/react-start";
import { STREAM_SOURCES, parseQobuzUrl, type StreamHit, type StreamSource } from "./stream-search";

type Json = Record<string, unknown>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const row = asJson(value);
    return str(row.name || row.title || row["#text"]);
  }
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(value: unknown) {
  const match = str(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function wanted(sources: StreamSource[] | undefined, name: StreamSource) {
  return !sources?.length || sources.includes(name);
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": UA, ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function getText(url: string) {
  const res = await fetch(url, { headers: { Accept: "text/html", "User-Agent": UA, "Accept-Language": "en-US" } });
  return res.ok ? res.text() : "";
}

function hit(partial: Omit<StreamHit, "key"> & { key?: string }): StreamHit {
  return {
    key: partial.key || `${partial.source}:${partial.kind}:${partial.deezerId || partial.spotifyId || partial.amazonId || partial.youtubeId || partial.archiveId || partial.bandcampUrl || partial.audiusId || partial.qobuzId || partial.appleId || partial.name}:${partial.artist}`,
    ...partial,
  };
}

async function itunesSearch(q: string, entity: "song" | "album"): Promise<StreamHit[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", q);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", entity);
  url.searchParams.set("limit", "10");
  const data = asJson(await getJson(url.toString()));
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows.map((row) => {
    const item = asJson(row);
    const album = entity === "album";
    return hit({
      source: "Apple Music",
      kind: album ? "album" : "track",
      name: str(item.trackName) || str(item.collectionName),
      artist: str(item.artistName),
      album: str(item.collectionName),
      year: yearOf(item.releaseDate),
      cover: str(item.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb"),
      preview: str(item.previewUrl),
      duration: Math.round(num(item.trackTimeMillis) / 1000),
      trackNo: num(item.trackNumber) || 0,
      collectionId: str(item.collectionId),
      appleId: album ? str(item.collectionId) : str(item.trackId) || str(item.collectionId),
      page: str(item.collectionViewUrl || item.trackViewUrl),
    });
  });
}

async function deezerSearch(q: string): Promise<StreamHit[]> {
  const [tracks, albums] = await Promise.all([
    getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`),
    getJson(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=8`),
  ]);
  const out: StreamHit[] = [];
  for (const row of Array.isArray(asJson(tracks).data) ? (asJson(tracks).data as unknown[]) : []) {
    const item = asJson(row);
    const artist = asJson(item.artist);
    const album = asJson(item.album);
    out.push(
      hit({
        source: "Deezer",
        kind: "track",
        name: str(item.title),
        artist: str(artist.name),
        album: str(album.title),
        year: yearOf(album.release_date || item.release_date),
        cover: str(album.cover_xl) || str(album.cover_big) || str(item.album),
        preview: str(item.preview),
        duration: num(item.duration),
        trackNo: num(item.track_position),
        deezerId: str(item.id),
        page: str(item.link),
      }),
    );
  }
  for (const row of Array.isArray(asJson(albums).data) ? (asJson(albums).data as unknown[]) : []) {
    const item = asJson(row);
    const artist = asJson(item.artist);
    out.push(
      hit({
        source: "Deezer",
        kind: "album",
        name: str(item.title),
        artist: str(artist.name),
        album: str(item.title),
        year: yearOf(item.release_date),
        cover: str(item.cover_xl) || str(item.cover_big),
        preview: "",
        duration: num(item.duration),
        trackNo: 0,
        deezerId: str(item.id),
        page: str(item.link),
      }),
    );
  }
  return out.filter((row) => row.name);
}

async function amazonSearch(q: string): Promise<StreamHit[]> {
  const out: StreamHit[] = [];
  try {
    const html = await getText(`https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=digital-music`);
    const parts = html.split(/data-asin="(B0[A-Z0-9]+)"/i);
    for (let i = 1; i < parts.length && out.length < 8; i += 2) {
      const asin = parts[i] || "";
      const chunk = parts[i + 1] || "";
      const title = str(chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{2,120})<\/span>/i)?.[1]);
      const img = str(chunk.match(/src="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/i)?.[1]);
      if (!asin || !title) continue;
      out.push(
        hit({
          source: "Amazon",
          kind: "album",
          name: title,
          artist: q,
          album: title,
          year: "",
          cover: img.replace(/\._[^.]+_\./, "."),
          preview: "",
          duration: 0,
          trackNo: 0,
          amazonId: asin,
          page: `https://music.amazon.com/albums/${asin}`,
        }),
      );
    }
  } catch {
    /* amazon html is flaky */
  }
  const itunes = await itunesSearch(q, "song");
  for (const row of itunes.slice(0, 8)) {
    out.push(
      hit({
        ...row,
        source: "Amazon",
        amazonId: row.amazonId || row.collectionId,
        page: `https://music.amazon.com/search/${encodeURIComponent(`${row.artist} ${row.album || row.name}`)}`,
      }),
    );
  }
  return out;
}

async function bandcampSearch(q: string): Promise<StreamHit[]> {
  const body = await getJson("https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ search_text: q, search_filter: "a", full_page: false, fan_id: null }),
  });
  const auto = asJson(asJson(body).auto);
  const rows = Array.isArray(auto.results) ? auto.results : [];
  return rows.slice(0, 8).map((row) => {
    const item = asJson(row);
    const url = str(item.item_url_path || item.url);
    const art = num(item.art_id);
    return hit({
      source: "Bandcamp",
      kind: str(item.type) === "t" ? "track" : "album",
      name: str(item.name),
      artist: str(item.band_name),
      album: str(item.name),
      year: "",
      cover: art > 0 ? `https://f4.bcbits.com/img/a${art}_10.jpg` : str(item.img).replace(/\/img\/(?!a)(\d+)_/, "/img/a$1_"),
      preview: "",
      duration: 0,
      trackNo: 0,
      bandcampUrl: url.startsWith("http") ? url : `https://${url.replace(/^\/\//, "")}`,
      page: url.startsWith("http") ? url : `https://${url.replace(/^\/\//, "")}`,
    });
  });
}

async function archiveSearch(q: string): Promise<StreamHit[]> {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", `(mediatype:audio OR mediatype:etree) AND (${q})`);
  url.searchParams.set("output", "json");
  url.searchParams.set("rows", "8");
  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "year");
  url.searchParams.append("sort[]", "downloads desc");
  const data = asJson(await getJson(url.toString()));
  const docs = Array.isArray(asJson(data.response).docs) ? (asJson(data.response).docs as unknown[]) : [];
  return docs.map((row) => {
    const item = asJson(row);
    const id = str(item.identifier);
    return hit({
      source: "Archive",
      kind: "album",
      name: str(item.title) || id,
      artist: str(item.creator) || "Internet Archive",
      album: str(item.title) || id,
      year: yearOf(item.year),
      cover: `https://archive.org/services/img/${id}`,
      preview: "",
      duration: 0,
      trackNo: 0,
      archiveId: id,
      page: `https://archive.org/details/${id}`,
    });
  });
}

async function audiusSearch(q: string): Promise<StreamHit[]> {
  const data = asJson(
    await getJson(`https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=Sondergram`),
  );
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.slice(0, 8).map((row) => {
    const item = asJson(row);
    const user = asJson(item.user);
    const art = asJson(item.artwork);
    const id = str(item.id);
    return hit({
      source: "Audius",
      kind: "track",
      name: str(item.title),
      artist: str(user.name),
      album: str(item.album) || str(item.title),
      year: yearOf(item.release_date || item.created_at),
      cover: str(art["1000x1000"] || art["480x480"] || art["150x150"]),
      preview: id ? `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=Sondergram` : "",
      duration: num(item.duration),
      trackNo: 0,
      audiusId: id,
      page: str(item.permalink) ? `https://audius.co${str(item.permalink)}` : "",
    });
  });
}

async function youtubeSearch(q: string): Promise<StreamHit[]> {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } },
        query: `${q} official audio`,
      }),
    });
    const data = asJson(await res.json().catch(() => ({})));
    const blob = JSON.stringify(data);
    const ids = [...new Set([...blob.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]!))];
    const titles = [...blob.matchAll(/"title":\{"runs":\[\{"text":"([^"]{2,120})"\}/g)].map((m) => m[1] || "");
    const owners = [...blob.matchAll(/"ownerText":\{"runs":\[\{"text":"([^"]{2,80})"/g)].map((m) => m[1] || "");
    return ids.slice(0, 8).map((id, i) =>
      hit({
        source: "YouTube",
        kind: "track",
        name: titles[i] || q,
        artist: owners[i] || "YouTube",
        album: "YouTube",
        year: "",
        cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        preview: "",
        duration: 0,
        trackNo: 0,
        youtubeId: id,
        page: `https://www.youtube.com/watch?v=${id}`,
      }),
    );
  } catch {
    return [];
  }
}

async function spotifySearch(q: string, token?: string): Promise<StreamHit[]> {
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const [trackJson, albumJson] = await Promise.all([
    getJson(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=from_token`, { headers }),
    getJson(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=10&market=from_token`, { headers }),
  ]);
  const out: StreamHit[] = [];
  const tracks = asJson(asJson(trackJson).tracks);
  for (const row of Array.isArray(tracks.items) ? tracks.items : []) {
    const item = asJson(row);
    const album = asJson(item.album);
    const artists = Array.isArray(item.artists) ? item.artists : [];
    const images = Array.isArray(album.images) ? album.images : [];
    out.push(
      hit({
        source: "Spotify",
        kind: "track",
        name: str(item.name),
        artist: artists.map((a) => str(asJson(a).name)).filter(Boolean).join(", "),
        album: str(album.name),
        year: yearOf(album.release_date),
        cover: str(asJson(images[0]).url),
        preview: str(item.preview_url),
        duration: Math.round(num(item.duration_ms) / 1000),
        trackNo: num(item.track_number),
        spotifyId: str(item.id),
        page: str(asJson(asJson(item.external_urls).spotify)),
      }),
    );
  }
  const albums = asJson(asJson(albumJson).albums);
  for (const row of Array.isArray(albums.items) ? albums.items : []) {
    const item = asJson(row);
    const artists = Array.isArray(item.artists) ? item.artists : [];
    const images = Array.isArray(item.images) ? item.images : [];
    out.push(
      hit({
        source: "Spotify",
        kind: "album",
        name: str(item.name),
        artist: artists.map((a) => str(asJson(a).name)).filter(Boolean).join(", "),
        album: str(item.name),
        year: yearOf(item.release_date),
        cover: str(asJson(images[0]).url),
        preview: "",
        duration: 0,
        trackNo: 0,
        spotifyId: str(item.id),
        page: str(asJson(asJson(item.external_urls).spotify)),
      }),
    );
  }
  return out;
}

function qobuzCoverFromId(id: string) {
  if (!/^\d{8,}$/.test(id)) return "";
  return `https://static.qobuz.com/images/covers/${id.slice(-2)}/${id.slice(-4, -2)}/${id}_org.jpg`;
}

function qobuzCover(image: unknown) {
  const row = asJson(image);
  const src = str(row.extralarge) || str(row.large) || str(row.small) || str(row.thumbnail) || str(image);
  return src.replace(/_600\.jpg(\?|$)/i, "_org.jpg$1");
}

function mapArcodTrack(item: Json, fallback: { album?: string; artist?: string; cover?: string; year?: string; genre?: string } = {}): StreamHit | null {
  const album = asJson(item.album);
  const performer = asJson(item.performer);
  const albumArtist = asJson(album.artist);
  const version = str(item.version);
  const name = str(item.title) || str(item.name);
  const id = str(item.id || item.qobuz_id);
  if (!name || !id) return null;
  const artist = str(performer.name) || str(albumArtist.name) || fallback.artist || "Unknown artist";
  const cover = qobuzCover(album.image) || qobuzCover(item.image) || fallback.cover || qobuzCoverFromId(str(album.id || album.qobuz_id)) || "";
  const genre = str(asJson(album.genre).name) || str(asJson(item.genre).name) || fallback.genre || "";
  return hit({
    source: "Arcod",
    kind: "track",
    name: version ? `${name} (${version})` : name,
    artist,
    album: str(album.title) || fallback.album || name,
    year: yearOf(item.release_date_original || album.release_date_original || item.released_at) || fallback.year || "",
    cover,
    preview: str(item.preview || item.sample),
    duration: num(item.duration),
    trackNo: num(item.track_number) || 0,
    diskNo: num(item.media_number) || 1,
    genre,
    qobuzId: id,
    page: `https://www.qobuz.com/track/${id}`,
  });
}

function mapArcodAlbum(item: Json): StreamHit | null {
  const artist = asJson(item.artist);
  const name = str(item.title) || str(item.name);
  const id = str(item.id || item.qobuz_id);
  if (!name || !id) return null;
  const version = str(item.version);
  return hit({
    source: "Arcod",
    kind: "album",
    name: version ? `${name} (${version})` : name,
    artist: str(artist.name) || "Unknown artist",
    album: name,
    year: yearOf(item.release_date_original || item.released_at),
    cover: qobuzCover(item.image) || qobuzCoverFromId(id),
    preview: "",
    duration: num(item.duration),
    trackNo: 0,
    tracksCount: num(item.tracks_count) || 0,
    genre: str(asJson(item.genre).name),
    qobuzId: id,
    page: `https://www.qobuz.com/album/${id}`,
  });
}

function parseArcodPayload(data: unknown): StreamHit[] {
  const root = asJson(data);
  const payload = asJson(root.data && typeof root.data === "object" ? root.data : root);
  const albums = asJson(payload.albums);
  const tracks = asJson(payload.tracks);
  const popular = asJson(payload.most_popular);
  const out: StreamHit[] = [];
  const seen = new Set<string>();
  const push = (hitRow: StreamHit | null) => {
    if (!hitRow || seen.has(hitRow.key)) return;
    seen.add(hitRow.key);
    out.push(hitRow);
  };
  const albumItems = Array.isArray(albums.items) ? albums.items : Array.isArray(payload.albums) ? (payload.albums as unknown[]) : [];
  const trackItems = Array.isArray(tracks.items) ? tracks.items : Array.isArray(payload.tracks) ? (payload.tracks as unknown[]) : [];
  const popularItems = Array.isArray(popular.items) ? popular.items : [];
  for (const row of albumItems) push(mapArcodAlbum(asJson(row)));
  for (const row of popularItems) {
    const item = asJson(row);
    const inner = asJson(item.album && typeof item.album === "object" ? item.album : item.track && typeof item.track === "object" ? item.track : item);
    const type = str(item.type).toLowerCase();
    if (type === "album" || inner.tracks_count) push(mapArcodAlbum(inner));
    else push(mapArcodTrack(inner));
  }
  for (const row of trackItems) push(mapArcodTrack(asJson(row)));
  return out;
}

async function arcodGet(url: string, ms = 18000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        Origin: "https://arcod.xyz",
        Referer: "https://arcod.xyz/",
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Arcod ${res.status}`);
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function arcodSearch(q: string): Promise<StreamHit[]> {
  const urls = [
    `https://arcod.xyz/api/get-music?q=${encodeURIComponent(q)}&offset=0`,
    `https://arcod.xyz/api/search?q=${encodeURIComponent(q)}&limit=10`,
  ];
  const pending = urls.map(async (url) => {
    const hits = parseArcodPayload(await arcodGet(url));
    if (!hits.length) throw new Error("empty");
    return hits;
  });
  pending.forEach((p) => p.catch(() => undefined));
  let hits: StreamHit[] = [];
  try {
    hits = await Promise.any(pending);
  } catch {
    hits = [];
  }
  const parsed = parseQobuzUrl(q);
  if (!hits.length && parsed) {
    hits = [
      hit({
        source: "Arcod",
        kind: parsed.kind,
        name: parsed.kind === "album" ? "Qobuz album" : "Qobuz track",
        artist: "Arcod",
        album: parsed.kind === "album" ? "Qobuz album" : "",
        year: "",
        cover: "",
        preview: "",
        duration: 0,
        trackNo: 0,
        qobuzId: parsed.id,
        page: `https://www.qobuz.com/${parsed.kind}/${parsed.id}`,
      }),
    ];
  }
  return hits.slice(0, 24);
}

function namesClose(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function songsFromItunesLookup(data: unknown, meta: { cover?: string; year?: string; genre?: string; qobuzId?: string; album?: string; artist?: string }): Promise<StreamHit[]> {
  const rows = (Array.isArray(asJson(data).results) ? (asJson(data).results as unknown[]) : []).map((row) => asJson(row));
  const songs = rows.filter((item) => str(item.wrapperType) === "track" || str(item.kind) === "song");
  const albumRow = rows.find((item) => str(item.wrapperType) === "collection") || {};
  if (!songs.length) return [];
  const cover =
    meta.cover ||
    qobuzCoverFromId(meta.qobuzId || "") ||
    str(albumRow.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb");
  const year = meta.year || yearOf(albumRow.releaseDate);
  const album = meta.album && meta.album !== "Qobuz album" ? meta.album : str(albumRow.collectionName);
  const artist = meta.artist && meta.artist !== "Arcod" ? meta.artist : str(albumRow.artistName);
  return songs.map((item, i) => {
    const trackNo = num(item.trackNumber) || i + 1;
    return hit({
      source: "Arcod",
      kind: "track",
      name: str(item.trackName),
      artist: str(item.artistName) || artist,
      album: str(item.collectionName) || album,
      year: yearOf(item.releaseDate) || year,
      cover,
      preview: str(item.previewUrl),
      duration: Math.round(num(item.trackTimeMillis) / 1000),
      trackNo,
      diskNo: num(item.discNumber) || 1,
      genre: meta.genre || str(item.primaryGenreName),
      qobuzId: meta.qobuzId ? `${meta.qobuzId}:${trackNo}` : undefined,
      page: meta.qobuzId ? `https://www.qobuz.com/album/${meta.qobuzId}` : str(item.trackViewUrl),
    });
  });
}

async function catalogAlbumTracks(artist: string, album: string, meta: { cover?: string; year?: string; genre?: string; qobuzId?: string }): Promise<StreamHit[]> {
  const upc = (meta.qobuzId || "").replace(/\D/g, "");
  if (upc.length >= 12) {
    const byUpc = await songsFromItunesLookup(await getJson(`https://itunes.apple.com/lookup?upc=${encodeURIComponent(upc)}&entity=song`), {
      ...meta,
      album,
      artist,
    });
    if (byUpc.length) return byUpc;
  }
  const term = `${artist && artist !== "Arcod" ? artist : ""} ${album && album !== "Qobuz album" ? album : ""}`.trim();
  if (term.length < 2) return [];
  const itunes = asJson(await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=album&limit=8`));
  const albums = (Array.isArray(itunes.results) ? itunes.results : []).map((row) => asJson(row));
  const match =
    albums.find((item) => namesClose(str(item.collectionName), album) && namesClose(str(item.artistName), artist)) ||
    albums.find((item) => namesClose(str(item.collectionName), album)) ||
    albums[0];
  if (match) {
    const collectionId = str(match.collectionId);
    const lookup = asJson(await getJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song`));
    const songs = (Array.isArray(lookup.results) ? lookup.results : [])
      .map((row) => asJson(row))
      .filter((item) => str(item.wrapperType) === "track" || str(item.kind) === "song");
    if (songs.length) {
      const cover = meta.cover || qobuzCoverFromId(meta.qobuzId || "") || str(match.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb");
      const year = meta.year || yearOf(match.releaseDate);
      return songs.map((item, i) => {
        const trackNo = num(item.trackNumber) || i + 1;
        return hit({
          source: "Arcod",
          kind: "track",
          name: str(item.trackName),
          artist: str(item.artistName) || artist,
          album: str(item.collectionName) || album,
          year: yearOf(item.releaseDate) || year,
          cover,
          preview: str(item.previewUrl),
          duration: Math.round(num(item.trackTimeMillis) / 1000),
          trackNo,
          diskNo: num(item.discNumber) || 1,
          genre: meta.genre,
          qobuzId: meta.qobuzId ? `${meta.qobuzId}:${trackNo}` : collectionId ? `${collectionId}:${trackNo}` : undefined,
          page: meta.qobuzId ? `https://www.qobuz.com/album/${meta.qobuzId}` : str(item.trackViewUrl),
        });
      });
    }
  }
  const deezer = asJson(await getJson(`https://api.deezer.com/search/album?q=${encodeURIComponent(term)}&limit=8`));
  const dzAlbums = (Array.isArray(deezer.data) ? deezer.data : []).map((row) => asJson(row));
  const dzMatch =
    dzAlbums.find((item) => namesClose(str(item.title), album) && namesClose(str(asJson(item.artist).name), artist)) ||
    dzAlbums.find((item) => namesClose(str(item.title), album)) ||
    dzAlbums[0];
  if (!dzMatch) return [];
  const dzId = str(dzMatch.id);
  const dzAlbum = asJson(await getJson(`https://api.deezer.com/album/${encodeURIComponent(dzId)}`));
  const rows = Array.isArray(asJson(dzAlbum.tracks).data) ? (asJson(dzAlbum.tracks).data as unknown[]) : [];
  const cover = meta.cover || str(dzAlbum.cover_xl) || str(dzMatch.cover_xl);
  const year = meta.year || yearOf(dzAlbum.release_date);
  const who = str(asJson(dzAlbum.artist).name) || artist;
  return rows.map((row, i) => {
    const item = asJson(row);
    const trackNo = num(item.track_position) || i + 1;
    return hit({
      source: "Arcod",
      kind: "track",
      name: str(item.title),
      artist: who,
      album: str(dzAlbum.title) || album,
      year,
      cover,
      preview: str(item.preview),
      duration: num(item.duration),
      trackNo,
      diskNo: num(item.disk_number) || 1,
      genre: meta.genre,
      qobuzId: meta.qobuzId ? `${meta.qobuzId}:${trackNo}` : undefined,
      page: meta.qobuzId ? `https://www.qobuz.com/album/${meta.qobuzId}` : str(item.link),
    });
  });
}

async function arcodAlbumTracks(hitRow: StreamHit): Promise<StreamHit[]> {
  if (!hitRow.qobuzId) return [];
  const album = asJson(
    await arcodGet(`https://arcod.xyz/api/get-album?album_id=${encodeURIComponent(hitRow.qobuzId)}`, 7000),
  );
  const payload = asJson(album.data && typeof album.data === "object" ? album.data : album);
  const albumObj = asJson(payload.album && typeof payload.album === "object" ? payload.album : payload);
  const tracks = asJson(albumObj.tracks);
  const rows = Array.isArray(tracks.items) ? tracks.items : Array.isArray(payload.tracks) ? (payload.tracks as unknown[]) : [];
  const cover = qobuzCover(albumObj.image) || hitRow.cover;
  const artist = str(asJson(albumObj.artist).name) || hitRow.artist;
  const year = yearOf(albumObj.release_date_original) || hitRow.year;
  const genre = str(asJson(albumObj.genre).name) || hitRow.genre || "";
  const title = str(albumObj.title) || hitRow.album || hitRow.name;
  return rows
    .map((row) => mapArcodTrack(asJson(row), { album: title, artist, cover, year, genre }))
    .filter((row): row is StreamHit => Boolean(row))
    .map((row, i) => (row.trackNo ? row : { ...row, trackNo: i + 1 }));
}

export const streamSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string; token?: string; sources?: StreamSource[] }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (q.length < 2) return { hits: [] as StreamHit[] };
    const sources = (data.sources || []).filter((s): s is StreamSource => STREAM_SOURCES.includes(s as StreamSource));
    const jobs: Promise<StreamHit[]>[] = [];
    if (wanted(sources, "Amazon")) jobs.push(amazonSearch(q).catch(() => []));
    if (wanted(sources, "Apple Music")) {
      jobs.push(itunesSearch(q, "album").catch(() => []));
      jobs.push(itunesSearch(q, "song").catch(() => []));
    }
    if (wanted(sources, "Deezer")) jobs.push(deezerSearch(q).catch(() => []));
    if (wanted(sources, "Spotify")) jobs.push(spotifySearch(q, data.token).catch(() => []));
    if (wanted(sources, "Bandcamp")) jobs.push(bandcampSearch(q).catch(() => []));
    if (wanted(sources, "Archive")) jobs.push(archiveSearch(q).catch(() => []));
    if (wanted(sources, "YouTube")) jobs.push(youtubeSearch(q).catch(() => []));
    if (wanted(sources, "Audius")) jobs.push(audiusSearch(q).catch(() => []));
    if (wanted(sources, "Arcod")) jobs.push(arcodSearch(q).catch(() => []));
    const groups = await Promise.all(jobs);
    const seen = new Set<string>();
    const hits: StreamHit[] = [];
    for (const group of groups) {
      for (const row of group) {
        if (!row.name || seen.has(row.key)) continue;
        seen.add(row.key);
        hits.push(row);
      }
    }
    return { hits };
  });

export const streamAlbum = createServerFn({ method: "POST" })
  .validator((d: StreamHit & { token?: string }) => d)
  .handler(async ({ data }) => {
    const hitRow = data;
    if (hitRow.source === "Arcod" && hitRow.qobuzId) {
      const catalogPromise = catalogAlbumTracks(hitRow.artist, hitRow.album || hitRow.name, {
        cover: hitRow.cover,
        year: hitRow.year,
        genre: hitRow.genre,
        qobuzId: hitRow.qobuzId,
      }).catch(() => [] as StreamHit[]);
      try {
        const rows = await arcodAlbumTracks(hitRow);
        if (rows.length) return { tracks: rows };
      } catch {
        /* catalog fallback */
      }
      const fallback = await catalogPromise;
      if (fallback.length) return { tracks: fallback };
    }
    if (hitRow.source === "Deezer" && hitRow.deezerId) {
      const album = asJson(await getJson(`https://api.deezer.com/album/${hitRow.deezerId}`));
      const tracks = asJson(album.tracks);
      const rows = Array.isArray(tracks.data) ? tracks.data : [];
      const cover = str(album.cover_xl) || hitRow.cover;
      const artist = str(asJson(album.artist).name) || hitRow.artist;
      const year = yearOf(album.release_date) || hitRow.year;
      return {
        tracks: rows.map((row, i) => {
          const item = asJson(row);
          return hit({
            source: "Deezer",
            kind: "track",
            name: str(item.title),
            artist,
            album: str(album.title) || hitRow.album,
            year,
            cover,
            preview: str(item.preview),
            duration: num(item.duration),
            trackNo: num(item.track_position) || i + 1,
            deezerId: str(item.id),
          });
        }),
      };
    }
    if (hitRow.source === "Apple Music" && hitRow.collectionId) {
      const data = asJson(await getJson(`https://itunes.apple.com/lookup?id=${hitRow.collectionId}&entity=song`));
      const rows = Array.isArray(data.results) ? data.results : [];
      return {
        tracks: rows
          .map((row) => asJson(row))
          .filter((item) => str(item.wrapperType) === "track" || str(item.kind) === "song")
          .map((item, i) =>
            hit({
              source: "Apple Music",
              kind: "track",
              name: str(item.trackName),
              artist: str(item.artistName) || hitRow.artist,
              album: str(item.collectionName) || hitRow.album,
              year: yearOf(item.releaseDate) || hitRow.year,
              cover: str(item.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb") || hitRow.cover,
              preview: str(item.previewUrl),
              duration: Math.round(num(item.trackTimeMillis) / 1000),
              trackNo: num(item.trackNumber) || i + 1,
              collectionId: str(item.collectionId),
              appleId: str(item.trackId) || str(item.collectionId),
            }),
          ),
      };
    }
    if (hitRow.source === "Spotify" && hitRow.spotifyId && hitRow.kind === "album" && data.token) {
      const album = asJson(
        await getJson(`https://api.spotify.com/v1/albums/${hitRow.spotifyId}`, {
          headers: { Authorization: `Bearer ${data.token}` },
        }),
      );
      const tracks = asJson(album.tracks);
      const rows = Array.isArray(tracks.items) ? tracks.items : [];
      return {
        tracks: rows.map((row, i) => {
          const item = asJson(row);
          const artists = Array.isArray(item.artists) ? item.artists : [];
          return hit({
            source: "Spotify",
            kind: "track",
            name: str(item.name),
            artist: artists.map((a) => str(asJson(a).name)).filter(Boolean).join(", ") || hitRow.artist,
            album: hitRow.album,
            year: hitRow.year,
            cover: hitRow.cover,
            preview: str(item.preview_url),
            duration: Math.round(num(item.duration_ms) / 1000),
            trackNo: num(item.track_number) || i + 1,
            spotifyId: str(item.id),
          });
        }),
      };
    }
    if (hitRow.source === "Spotify" && hitRow.spotifyId) {
      return { tracks: [hit({ ...hitRow, kind: "track" })] };
    }
    return { tracks: hitRow.kind === "track" ? [hitRow] : [] };
  });

function cleanName(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseClock(value: string) {
  const parts = value.split(":").map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] || 0;
}

function collectVideos(node: unknown, out: { id: string; title: string; length: number; owner: string }[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((row) => collectVideos(row, out));
    return;
  }
  const row = asJson(node);
  const video = asJson(row.videoRenderer || row.compactVideoRenderer || row.playlistVideoRenderer);
  const id = str(video.videoId);
  if (id.length === 11) {
    const titleJson = asJson(video.title);
    const titleRuns = Array.isArray(titleJson.runs) ? titleJson.runs : [];
    const title = str(asJson(titleRuns[0]).text) || str(titleJson.simpleText) || str(video.title);
    const lengthJson = asJson(video.lengthText);
    const lengthRuns = Array.isArray(lengthJson.runs) ? lengthJson.runs : [];
    const length = parseClock(str(lengthJson.simpleText) || str(asJson(lengthRuns[0]).text));
    const ownerJson = asJson(video.ownerText || video.shortBylineText || video.longBylineText);
    const ownerRuns = Array.isArray(ownerJson.runs) ? ownerJson.runs : [];
    const owner = str(asJson(ownerRuns[0]).text) || str(ownerJson.simpleText);
    out.push({ id, title, length, owner });
  }
  for (const value of Object.values(row)) collectVideos(value, out);
}

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "feat",
  "ft",
  "featuring",
  "with",
  "official",
  "audio",
  "video",
  "lyrics",
  "lyric",
  "visualizer",
  "provided",
  "youtube",
  "topic",
  "vevo",
  "hd",
  "hq",
  "mv",
]);

function tokens(value: string) {
  return cleanName(value)
    .split(" ")
    .filter((part) => part.length > 1 && !STOP.has(part));
}

function corePhrase(value: string) {
  return cleanName(value)
    .replace(/\b(feat|ft|featuring|with)\b.+$/g, " ")
    .replace(/\b(official|audio|video|lyrics|lyric|visualizer|hd|hq|4k|remastered|remaster|topic|provided|youtube|music)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseInTitle(want: string, videoTitle: string, artist: string) {
  const a = corePhrase(want);
  if (!a) return false;
  let b = corePhrase(videoTitle);
  const art = corePhrase((artist.split(/,|&|\sx\s/i)[0] || artist).trim());
  if (art && (b.startsWith(art + " ") || b.endsWith(" " + art))) b = b.replace(art, " ").replace(/\s+/g, " ").trim();
  if (b === a) return true;
  if (b.startsWith(a + " ") || b.endsWith(" " + a) || b.includes(" " + a + " ")) return true;
  const wantTok = tokens(a);
  const haveTok = new Set(tokens(b));
  return wantTok.length > 0 && wantTok.every((part) => haveTok.has(part));
}

function pickVideo(
  artist: string,
  name: string,
  rows: { id: string; title: string; length: number; owner?: string }[],
  expected = 0,
) {
  const titleTokens = tokens(name);
  const artistTokens = tokens((artist.split(/,|&|\sx\s|\svs\s/i)[0] || artist).trim());
  if (!titleTokens.length) return null;
  const scored = rows
    .filter((row) => row.id)
    .map((row) => {
      const title = cleanName(row.title);
      const owner = cleanName(row.owner || "");
      const hay = `${title} ${owner}`;
      if (!phraseInTitle(name, row.title, artist)) return { ...row, score: -1 };
      const titleHits = titleTokens.filter((part) => title.includes(part));
      if (titleHits.length < titleTokens.length) return { ...row, score: -1 };
      let score = titleHits.length * 8;
      const artistHits = artistTokens.filter((part) => hay.includes(part));
      if (artistTokens.length && artistHits.length === 0) return { ...row, score: -1 };
      score += artistHits.length * 6;
      if (/topic$/.test(owner)) score += 10;
      if (/provided to youtube|official audio/.test(title)) score += 8;
      if (/official video|music video/.test(title)) score += 1;
      if (
        /live|cover|karaoke|slowed|sped|nightcore|8d|remix|mashup|reaction|instrumental|piano version|full album|greatest hits|compilation|megamix|nonstop|hour long|playlist/.test(
          title,
        ) &&
        !titleTokens.some((part) => ["live", "cover", "remix", "instrumental"].includes(part))
      ) {
        score -= 20;
      }
      if (expected >= 40) {
        if (row.length) {
          const diff = Math.abs(row.length - expected);
          const slack = Math.max(16, expected * 0.16);
          if (diff <= slack) score += 14;
          else if (diff > Math.max(22, expected * 0.22)) return { ...row, score: -1 };
        }
      }
      if (row.length > 0 && row.length <= 40) score -= 16;
      if (row.length > 12 * 60) score -= 12;
      return { ...row, score };
    })
    .filter((row) => row.score >= 14)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

async function youtubeAudio(artist: string, name: string, expected = 0, album = "") {
  const queries = [
    `"${name}" "${artist}" official audio`,
    `${artist} - ${name} official audio`,
    album ? `"${name}" "${artist}" "${album}"` : `${artist} ${name} topic`,
  ].filter(Boolean);
  for (const query of queries) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } },
          query,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const rows: { id: string; title: string; length: number; owner: string }[] = [];
      collectVideos(data, rows);
      const seen = new Set<string>();
      const unique = rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
      const pick = pickVideo(artist, name, unique, expected);
      if (pick) return { youtubeId: pick.id, duration: pick.length };
    } catch {
      /* try next query / piped */
    }
  }
  const query = `${artist} ${name} official audio`;
  for (const url of [
    `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`,
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
  ]) {
    try {
      const data = await getJson(url);
      const list = Array.isArray(data) ? data : Array.isArray(asJson(data).items) ? (asJson(data).items as unknown[]) : [];
      const rows = list.map((row) => {
        const item = asJson(row);
        return {
          id: str(item.videoId || item.id).slice(0, 11),
          title: str(item.title),
          length: num(item.duration) || parseClock(str(item.length) || str(item.durationString)),
          owner: str(item.uploaderName || item.author || item.uploader),
        };
      });
      const pick = pickVideo(artist, name, rows, expected);
      if (pick) return { youtubeId: pick.id, duration: pick.length };
    } catch {
      /* next */
    }
  }
  return null;
}

async function audiusAudio(artist: string, name: string, expected = 0) {
  try {
    const data = asJson(
      await getJson(`https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(`${artist} ${name}`)}&app_name=Sondergram`),
    );
    const rows = Array.isArray(data.data) ? data.data : [];
    const titleTokens = tokens(name);
    const artistTokens = tokens((artist.split(/,|&/)[0] || artist).trim());
    if (!titleTokens.length) return null;
    const match = rows
      .map((row) => asJson(row))
      .find((item) => {
        const title = cleanName(str(item.title));
        const user = cleanName(str(asJson(item.user).name));
        const hay = `${title} ${user}`;
        const titleHits = titleTokens.filter((part) => title.includes(part));
        if (titleHits.length < titleTokens.length) return false;
        if (artistTokens.length && !artistTokens.every((part) => hay.includes(part))) return false;
        if (!phraseInTitle(name, str(item.title), artist)) return false;
        const duration = num(item.duration);
        if (expected >= 40) {
          if (duration < 30) return false;
          const diff = Math.abs(duration - expected);
          if (diff > Math.max(22, expected * 0.22)) return false;
        }
        return true;
      });
    const id = str(asJson(match).id);
    if (!id) return null;
    return {
      url: `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=Sondergram`,
      duration: num(asJson(match).duration),
    };
  } catch {
    return null;
  }
}

async function pipedAudioUrl(videoId: string) {
  const endpoints = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://pipedapi.adminforge.de/streams/${videoId}`,
    `https://pipedapi.leptons.xyz/streams/${videoId}`,
    `https://pipedapi.ducks.party/streams/${videoId}`,
    `https://api.piped.private.coffee/streams/${videoId}`,
    `https://inv.nadeko.net/api/v1/videos/${videoId}`,
    `https://invidious.f5.si/api/v1/videos/${videoId}`,
    `https://yt.chocolatemoo53.com/api/v1/videos/${videoId}`,
  ];
  for (const url of endpoints) {
    try {
      const data = asJson(await getJson(url));
      const piped = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const inv = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];
      const rows = (piped.length ? piped : inv).map((row) => asJson(row));
      const scored = rows
        .map((row) => {
          const mime = str(row.mimeType || row.type || row.codec);
          const href = str(row.url);
          if (!href) return null;
          let score = num(row.bitrate);
          if (/mp4|m4a|aac/i.test(mime) || /mp4|m4a/i.test(href)) score += 200000;
          if (/opus|webm/i.test(mime)) score -= 50000;
          return { href, score };
        })
        .filter((row): row is { href: string; score: number } => Boolean(row))
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.href) return scored[0].href;
    } catch {
      /* next instance */
    }
  }
  return "";
}

async function innertubeAudioUrl(videoId: string) {
  const clients = [
    {
      clientName: "IOS",
      clientVersion: "20.11.6",
      ua: "com.google.ios.youtube/20.11.6 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X)",
      name: "5",
      extra: {
        deviceModel: "iPhone16,2",
        osName: "iOS",
        osVersion: "18.2",
        hl: "en",
        gl: "US",
      },
    },
    {
      clientName: "ANDROID_VR",
      clientVersion: "1.61.48",
      ua: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1) gzip",
      name: "28",
      extra: {
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        osName: "Android",
        osVersion: "12",
        androidSdkVersion: 32,
        hl: "en",
        gl: "US",
      },
    },
    {
      clientName: "ANDROID",
      clientVersion: "19.28.35",
      ua: "com.google.android.youtube/19.28.35 (Linux; U; Android 14; en_US) gzip",
      name: "3",
      extra: {
        androidSdkVersion: 34,
        osName: "Android",
        osVersion: "14",
        hl: "en",
        gl: "US",
      },
    },
  ];
  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.ua,
          "X-YouTube-Client-Name": client.name,
          "X-YouTube-Client-Version": client.clientVersion,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              ...client.extra,
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      const data = asJson(await res.json().catch(() => ({})));
      const sd = asJson(data.streamingData);
      const rows = [...(Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : []), ...(Array.isArray(sd.formats) ? sd.formats : [])].map(
        (row) => asJson(row),
      );
      const audio = rows
        .map((row) => {
          const href = str(row.url);
          const mime = str(row.mimeType);
          if (!href) return null;
          if (!/audio/i.test(mime) && num(row.itag) !== 140 && num(row.itag) !== 139) return null;
          let score = num(row.bitrate);
          if (/mp4|m4a|aac/i.test(mime)) score += 500000;
          if (/opus|webm/i.test(mime)) score -= 200000;
          return { href, score };
        })
        .filter((row): row is { href: string; score: number } => Boolean(row))
        .sort((a, b) => b.score - a.score);
      if (audio[0]?.href) return audio[0].href;
    } catch {
      /* next client */
    }
  }
  return "";
}

async function youtubeStreamUrl(videoId: string) {
  return (await innertubeAudioUrl(videoId)) || (await pipedAudioUrl(videoId));
}

export const resolveFullTrack = createServerFn({ method: "POST" })
  .validator((d: { artist?: string; name?: string; album?: string; duration?: number; youtubeId?: string }) => d)
  .handler(async ({ data }) => {
    const artist = str(data.artist);
    const name = str(data.name);
    const known = str(data.youtubeId);
    if (known.length === 11) {
      const stream = await youtubeStreamUrl(known);
      if (stream) return { youtubeId: known, url: stream, duration: num(data.duration) };
      return { youtubeId: known, url: "", duration: 0 };
    }
    if (!name) return { youtubeId: "", url: "", duration: 0 };
    const expected = num(data.duration);
    const yt = await youtubeAudio(artist, name, expected, str(data.album));
    const stream = yt?.youtubeId ? await youtubeStreamUrl(yt.youtubeId) : "";
    if (stream) {
      if (expected >= 40 && yt?.duration && Math.abs(yt.duration - expected) > Math.max(22, expected * 0.22)) {
        return { youtubeId: yt?.youtubeId || "", url: "", duration: yt?.duration || 0 };
      }
      return { youtubeId: yt?.youtubeId || "", url: stream, duration: yt?.duration || 0 };
    }
    const au = await audiusAudio(artist, name, expected);
    if (au?.url) {
      if (expected >= 40 && au.duration && Math.abs(au.duration - expected) > Math.max(22, expected * 0.22)) {
        return { youtubeId: yt?.youtubeId || "", url: "", duration: 0 };
      }
      return { youtubeId: yt?.youtubeId || "", url: au.url, duration: au.duration };
    }
    return { youtubeId: yt?.youtubeId || "", url: "", duration: yt?.duration || 0 };
  });

