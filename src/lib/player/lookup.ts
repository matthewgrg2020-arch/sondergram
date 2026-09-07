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

async function wikiDescription(artist: string, album: string) {
  const query = [album, artist, "album"].filter((part) => part && !/^unknown/i.test(part)).join(" ");
  if (!query) return "";
  try {
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", query);
    searchUrl.searchParams.set("srlimit", "5");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) return "";
    const search = (await searchRes.json()) as { query?: { search?: { title: string }[] } };
    const title = search.query?.search?.find((row) => {
      const t = row.title.toLowerCase();
      return t.includes(album.trim().toLowerCase().slice(0, 12)) || t.includes("album");
    })?.title ?? search.query?.search?.[0]?.title;
    if (!title) return "";
    const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
    extractUrl.searchParams.set("action", "query");
    extractUrl.searchParams.set("prop", "extracts");
    extractUrl.searchParams.set("exintro", "1");
    extractUrl.searchParams.set("explaintext", "1");
    extractUrl.searchParams.set("titles", title);
    extractUrl.searchParams.set("format", "json");
    extractUrl.searchParams.set("origin", "*");
    const extractRes = await fetch(extractUrl.toString());
    if (!extractRes.ok) return "";
    const data = (await extractRes.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    const text = (page?.extract || "").replace(/\s+/g, " ").trim();
    if (text.length < 40) return "";
    return text.slice(0, 600);
  } catch {
    return "";
  }
}

export async function searchAlbums(artist: string, album: string, track?: string): Promise<AlbumHit[]> {
  const cleanArtist = /^unknown/i.test(artist) ? "" : artist.trim();
  const cleanAlbum = /^unknown/i.test(album) ? "" : album.trim();
  const term = [cleanArtist, cleanAlbum || track || ""].filter(Boolean).join(" ").trim();
  if (!term) return [];

  const [albums, songs, deezer] = await Promise.all([
    itunesSearch(cleanAlbum ? `${cleanArtist} ${cleanAlbum}`.trim() : term, "album"),
    itunesSearch([cleanArtist, track || cleanAlbum].filter(Boolean).join(" "), "song"),
    deezerAlbums(cleanArtist, cleanAlbum || track || ""),
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
  for (const hit of deezer) push(hit);
  hits.sort((a, b) => score(b, cleanArtist, cleanAlbum) - score(a, cleanArtist, cleanAlbum));
  const top = hits.slice(0, 12);
  await Promise.all(
    top.slice(0, 4).map(async (hit) => {
      if (!hit.description) {
        hit.description = await wikiDescription(hit.artist || cleanArtist, hit.title || cleanAlbum);
      }
    }),
  );
  return top;
}

async function deezerAlbums(artist: string, album: string): Promise<AlbumHit[]> {
  const q = encodeURIComponent([artist, album].filter(Boolean).join(" "));
  if (!q) return [];
  try {
    const res = await fetch(`https://api.deezer.com/search/album?q=${q}&limit=8`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { title?: string; cover_xl?: string; cover_big?: string; release_date?: string; artist?: { name?: string }; nb_tracks?: number; explicit_lyrics?: boolean }[];
    };
    return (data.data ?? []).map((row) => ({
      title: (row.title || "").trim() || "Unknown album",
      artist: (row.artist?.name || artist).trim() || "Unknown artist",
      year: yearOf(row.release_date),
      genre: "",
      artwork: row.cover_xl || row.cover_big || "",
      description: "",
      explicit: Boolean(row.explicit_lyrics),
      trackCount: Number(row.nb_tracks) || 0,
    }));
  } catch {
    return [];
  }
}

export async function lookupAlbum(artist: string, album: string, track?: string): Promise<AlbumHit | null> {
  const hits = await searchAlbums(artist, album, track);
  return hits[0] ?? null;
}

export async function blobFromUrl(src: string): Promise<Blob | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && blob.size === 0) return null;
    return blob;
  } catch {
    return null;
  }
}