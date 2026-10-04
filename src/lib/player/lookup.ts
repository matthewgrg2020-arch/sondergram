export type AlbumHit = {
  title: string;
  artist: string;
  year: string;
  genre: string;
  artwork: string;
  description: string;
  explicit: boolean;
  trackCount: number;
};

type ItunesResult = {
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  wrapperType?: string;
  collectionType?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  trackCount?: number;
  longDescription?: string;
  copyright?: string;
};

function hiResArt(url: string) {
  return url.replace(/\/\d+x\d+bb/g, "/1200x1200bb");
}

function yearOf(date?: string) {
  return date ? date.slice(0, 4) : "";
}

function fromItunes(row: ItunesResult): AlbumHit | null {
  const title = (row.collectionName || "").trim();
  const artist = (row.artistName || "").trim();
  if (!title && !artist) return null;
  const explicit =
    row.collectionExplicitness === "explicit" || row.trackExplicitness === "explicit";
  return {
    title: title || "Unknown album",
    artist: artist || "Unknown artist",
    year: yearOf(row.releaseDate),
    genre: (row.primaryGenreName || "").trim(),
    artwork: row.artworkUrl100 ? hiResArt(row.artworkUrl100) : "",
    description: (row.longDescription || "").trim(),
    explicit,
    trackCount: Number(row.trackCount) || 0,
  };
}

async function itunesSearch(term: string, entity: "album" | "song") {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", entity);
  url.searchParams.set("limit", "8");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ItunesResult[] };
  return data.results ?? [];
}

function score(hit: AlbumHit, artist: string, album: string) {
  const a = artist.trim().toLowerCase();
  const b = album.trim().toLowerCase();
  const ha = hit.artist.toLowerCase();
  const ht = hit.title.toLowerCase();
  let n = 0;
  if (a && ha === a) n += 4;
  else if (a && ha.includes(a)) n += 2;
  else if (a && a.includes(ha) && ha.length > 3) n += 1;
  else if (a) n -= 2;
  if (b && ht === b) n += 6;
  else if (b && ht.includes(b)) n += 4;
  else if (b && b.includes(ht) && ht.length > 3) n += 2;
  else if (b) n -= 3;
  if (hit.artwork) n += 1;
  if (hit.description) n += 1;
  if (hit.trackCount > 1) n += 1;
  return n;
}

export async function searchAlbums(artist: string, album: string, track?: string): Promise<AlbumHit[]> {
  const cleanArtist = /^unknown/i.test(artist) ? "" : artist.trim();
  const cleanAlbum = /^unknown/i.test(album) ? "" : album.trim();
  const term = [cleanArtist, cleanAlbum || track || ""].filter(Boolean).join(" ").trim();
  if (!term) return [];

  try {
    const { searchAlbumHits } = await import("./cover-search-api");
    const hits = await searchAlbumHits({
      data: { artist: cleanArtist, album: cleanAlbum, track: track || "" },
    });
    if (hits?.length) return hits;
  } catch {
    /* fall through to the browser catalogs */
  }

  const [albums, songs, catalog] = await Promise.all([
    itunesSearch(cleanAlbum ? `${cleanArtist} ${cleanAlbum}`.trim() : term, "album"),
    itunesSearch([cleanArtist, track || cleanAlbum].filter(Boolean).join(" "), "song"),
    import("./catalog-api").then((mod) => mod.searchMusicDatabase({ data: { query: term } })).catch(() => []),
  ]);

  const hits: AlbumHit[] = [];
  const seen = new Set<string>();
  const push = (hit: AlbumHit | null) => {
    if (!hit) return;
    const key = `${hit.artist.toLowerCase()}::${hit.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };
  for (const row of albums) push(fromItunes(row));
  for (const row of songs) push(fromItunes(row));
  for (const row of catalog) {
    push({
      title: row.title,
      artist: row.artist,
      year: row.year,
      genre: row.genre,
      artwork: row.artwork,
      description: row.source === "dbPoweramp" ? "dbPoweramp (MusicBrainz + Discogs)" : row.source === "AcoustID" ? "AcoustID / MusicBrainz" : "Discogs",
      explicit: false,
      trackCount: 0,
    });
  }
  hits.sort((a, b) => score(b, cleanArtist, cleanAlbum) - score(a, cleanArtist, cleanAlbum));
  return hits.slice(0, 12);
}

export async function lookupAlbum(artist: string, album: string, track?: string): Promise<AlbumHit | null> {
  const hits = await searchAlbums(artist, album, track);
  return hits[0] ?? null;
}

export type TracklistSong = {
  trackNo: number;
  title: string;
  artist: string;
  album: string;
};

export async function lookupTracklist(artist: string, album: string): Promise<TracklistSong[]> {
  const a = artist.trim();
  const b = album.trim();
  if (!a && !b) return [];
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", [a, b].filter(Boolean).join(" "));
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "50");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: (ItunesResult & { trackNumber?: number; trackName?: string; collectionName?: string })[];
    };
    const groups = new Map<string, TracklistSong[]>();
    for (const row of data.results ?? []) {
      const title = (row.trackName || "").trim();
      const col = (row.collectionName || "").trim();
      const art = (row.artistName || a).trim();
      const n = Number(row.trackNumber) || 0;
      if (!title) continue;
      const hay = `${art} ${col}`.toLowerCase();
      if (b && !hay.includes(b.toLowerCase()) && !b.toLowerCase().includes(col.toLowerCase())) continue;
      if (a && !hay.includes(a.toLowerCase()) && !a.toLowerCase().includes(art.toLowerCase())) continue;
      const key = `${art.toLowerCase()}::${col.toLowerCase()}`;
      const list = groups.get(key) ?? [];
      if (!list.some((song) => song.trackNo === n && song.title === title)) {
        list.push({ trackNo: n, title, artist: art, album: col || b });
      }
      groups.set(key, list);
    }
    let best: TracklistSong[] = [];
    for (const list of groups.values()) {
      if (list.length > best.length) best = list;
    }
    return best.sort((x, y) => x.trackNo - y.trackNo);
  } catch {
    return [];
  }
}

export async function blobFromUrl(src: string): Promise<Blob | null> {
  if (!src) return null;
  if (/^(blob:|data:)/i.test(src)) {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.size > 400 ? blob : null;
    } catch {
      return null;
    }
  }
  try {
    const { proxyCoverUrl } = await import("./covers");
    const res = await fetch(proxyCoverUrl(src));
    if (res.ok) {
      const blob = await res.blob();
      const type = blob.type || "";
      if (blob.size > 400 && (!type || type.startsWith("image/"))) return blob;
    }
  } catch {
    /* try the server function next */
  }
  try {
    const { fetchCoverImage } = await import("./cover-search-api");
    const row = await fetchCoverImage({ data: { url: src } });
    if (!row?.ok) return null;
    const bin = atob(row.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: row.type || "image/jpeg" });
  } catch {
    return null;
  }
}