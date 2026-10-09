import { createServerFn } from "@tanstack/react-start";
import { STREAM_SOURCES, type StreamHit, type StreamSource } from "./stream-search";

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
    key:
      partial.key ||
      `${partial.source}:${partial.kind}:${partial.deezerId || partial.spotifyId || partial.amazonId || partial.youtubeId || partial.archiveId || partial.bandcampUrl || partial.audiusId || partial.appleId || partial.name}:${partial.artist}`,
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
        cover: str(album.cover_xl) || str(album.cover_big),
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
      cover: art > 0 ? `https://f4.bcbits.com/img/a${art}_10.jpg` : str(item.img),
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
    const titles = [...blob.matchAll(/"title":\{"runs":\[\{"text":"([^"]{2,120})"/g)].map((m) => m[1] || "");
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

async function amazonSearch(q: string): Promise<StreamHit[]> {
  const out: StreamHit[] = [];
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

export const streamSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string; token?: string; sources?: StreamSource[] }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (!q) return { hits: [] as StreamHit[] };
    const sources = (data.sources || []).filter((s): s is StreamSource => STREAM_SOURCES.includes(s as StreamSource));
    const jobs: Promise<StreamHit[]>[] = [];
    if (wanted(sources, "Apple Music")) jobs.push(itunesSearch(q, "song"), itunesSearch(q, "album"));
    if (wanted(sources, "Deezer")) jobs.push(deezerSearch(q));
    if (wanted(sources, "Bandcamp")) jobs.push(bandcampSearch(q));
    if (wanted(sources, "Archive")) jobs.push(archiveSearch(q));
    if (wanted(sources, "Audius")) jobs.push(audiusSearch(q));
    if (wanted(sources, "YouTube")) jobs.push(youtubeSearch(q));
    if (wanted(sources, "Spotify")) jobs.push(spotifySearch(q, data.token));
    if (wanted(sources, "Amazon")) jobs.push(amazonSearch(q));
    const settled = await Promise.allSettled(jobs);
    const hits: StreamHit[] = [];
    const seen = new Set<string>();
    for (const row of settled) {
      if (row.status !== "fulfilled") continue;
      for (const item of row.value) {
        if (!item.name || seen.has(item.key)) continue;
        seen.add(item.key);
        hits.push(item);
      }
    }
    return { hits };
  });

export const streamAlbum = createServerFn({ method: "POST" })
  .validator((d: StreamHit & { token?: string }) => d)
  .handler(async ({ data }) => {
    const tracks: StreamHit[] = [];
    try {
      if (data.source === "Deezer" && data.deezerId && data.kind === "album") {
        const json = asJson(await getJson(`https://api.deezer.com/album/${encodeURIComponent(data.deezerId)}/tracks?limit=100`));
        const rows = Array.isArray(json.data) ? (json.data as unknown[]) : [];
        for (const row of rows) {
          const item = asJson(row);
          const artist = asJson(item.artist);
          tracks.push(
            hit({
              source: "Deezer",
              kind: "track",
              name: str(item.title),
              artist: str(artist.name) || data.artist,
              album: data.name,
              year: data.year,
              cover: data.cover,
              preview: str(item.preview),
              duration: num(item.duration),
              trackNo: num(item.track_position),
              deezerId: str(item.id),
              page: str(item.link),
            }),
          );
        }
      } else if (data.source === "Apple Music" && data.collectionId) {
        const url = new URL("https://itunes.apple.com/lookup");
        url.searchParams.set("id", data.collectionId);
        url.searchParams.set("entity", "song");
        url.searchParams.set("limit", "200");
        const json = asJson(await getJson(url.toString()));
        const rows = Array.isArray(json.results) ? (json.results as unknown[]) : [];
        for (const row of rows) {
          const item = asJson(row);
          if (str(item.wrapperType) !== "track") continue;
          tracks.push(
            hit({
              source: "Apple Music",
              kind: "track",
              name: str(item.trackName),
              artist: str(item.artistName) || data.artist,
              album: str(item.collectionName) || data.name,
              year: yearOf(item.releaseDate) || data.year,
              cover: str(item.artworkUrl100).replace(/\/\d+x\d+bb/, "/1200x1200bb") || data.cover,
              preview: str(item.previewUrl),
              duration: Math.round(num(item.trackTimeMillis) / 1000),
              trackNo: num(item.trackNumber),
              appleId: str(item.trackId),
              collectionId: str(item.collectionId),
              page: str(item.trackViewUrl),
            }),
          );
        }
      } else if (data.source === "Spotify" && data.spotifyId && data.token && data.kind === "album") {
        const json = asJson(
          await getJson(`https://api.spotify.com/v1/albums/${encodeURIComponent(data.spotifyId)}/tracks?limit=50`, {
            headers: { Authorization: `Bearer ${data.token}` },
          }),
        );
        const rows = Array.isArray(json.items) ? (json.items as unknown[]) : [];
        for (const row of rows) {
          const item = asJson(row);
          const artists = Array.isArray(item.artists) ? item.artists : [];
          tracks.push(
            hit({
              source: "Spotify",
              kind: "track",
              name: str(item.name),
              artist: artists.map((a) => str(asJson(a).name)).filter(Boolean).join(", ") || data.artist,
              album: data.name,
              year: data.year,
              cover: data.cover,
              preview: str(item.preview_url),
              duration: Math.round(num(item.duration_ms) / 1000),
              trackNo: num(item.track_number),
              spotifyId: str(item.id),
              page: str(asJson(asJson(item.external_urls).spotify)),
            }),
          );
        }
      }
    } catch {
      /* soft fail */
    }
    return { tracks: tracks.filter((t) => t.name) };
  });

async function youtubeStreamUrl(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "19.17.34", hl: "en" } },
        videoId,
      }),
    });
    const data = asJson(await res.json().catch(() => ({})));
    const formats = [
      ...(Array.isArray(asJson(data.streamingData).adaptiveFormats) ? (asJson(data.streamingData).adaptiveFormats as unknown[]) : []),
      ...(Array.isArray(asJson(data.streamingData).formats) ? (asJson(data.streamingData).formats as unknown[]) : []),
    ];
    const audio = formats
      .map((row) => {
        const item = asJson(row);
        const mime = str(item.mimeType);
        const href = str(item.url);
        if (!href || !/audio/i.test(mime)) return null;
        let score = num(item.bitrate);
        if (/mp4|m4a|aac/i.test(mime)) score += 500000;
        return { href, score };
      })
      .filter((row): row is { href: string; score: number } => Boolean(row))
      .sort((a, b) => b.score - a.score);
    return audio[0]?.href || "";
  } catch {
    return "";
  }
}

export const resolveFullTrack = createServerFn({ method: "POST" })
  .validator((d: { artist?: string; name?: string; album?: string; duration?: number; youtubeId?: string }) => d)
  .handler(async ({ data }) => {
    const known = str(data.youtubeId);
    if (known.length === 11) {
      const stream = await youtubeStreamUrl(known);
      return { youtubeId: known, url: stream, duration: num(data.duration) };
    }
    const artist = str(data.artist);
    const name = str(data.name);
    if (!name) return { youtubeId: "", url: "", duration: 0 };
    const yt = await youtubeSearch(`${artist} ${name}`.trim());
    const first = yt[0];
    if (first?.youtubeId) {
      const stream = await youtubeStreamUrl(first.youtubeId);
      return { youtubeId: first.youtubeId, url: stream, duration: first.duration || num(data.duration) };
    }
    return { youtubeId: "", url: "", duration: 0 };
  });
