import { refineGenre } from "./genre-refine";
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
  primaryGenreName?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  trackCount?: number;
  description?: string;
};

function yearFrom(iso?: string) {
  if (!iso) return "";
  const y = iso.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : "";
}

function artFrom(row: ItunesResult) {
  const base = row.artworkUrl600 || row.artworkUrl100 || "";
  return base.replace(/100x100bb/, "600x600bb").replace(/200x200bb/, "600x600bb");
}

function fromItunes(row: ItunesResult): AlbumHit | null {
  const title = (row.collectionName || row.trackName || "").trim();
  const artist = (row.artistName || "").trim();
  if (!title && !artist) return null;
  return {
    title: title || "Unknown album",
    artist: artist || "Unknown artist",
    year: yearFrom(row.releaseDate),
    genre: (row.primaryGenreName || "").trim(),
    artwork: artFrom(row),
    description: (row.description || "").trim() || "iTunes",
    explicit: /explicit/i.test(row.collectionExplicitness || "") || /explicit/i.test(row.trackExplicitness || ""),
    trackCount: typeof row.trackCount === "number" ? row.trackCount : 0,
  };
}

function score(hit: AlbumHit, artist: string, album: string) {
  const a = artist.toLowerCase();
  const b = album.toLowerCase();
  const ha = hit.artist.toLowerCase();
  const ht = hit.title.toLowerCase();
  let s = 0;
  if (a && ha === a) s += 5;
  else if (a && ha.includes(a)) s += 2;
  if (b && ht === b) s += 5;
  else if (b && (ht.includes(b) || b.includes(ht))) s += 2;
  if (hit.artwork) s += 1;
  if (hit.genre) s += 1;
  return s;
}

export async function searchAlbums(artist: string, album: string, track?: string): Promise<AlbumHit[]> {
  const cleanArtist = (artist || "").trim();
  const cleanAlbum = (album || "").trim();
  const cleanTrack = (track || "").trim();
  if (!cleanArtist && !cleanAlbum && !cleanTrack) return [];

  let catalog: { title: string; artist: string; year: string; genre: string; artwork: string; source?: string }[] = [];
  try {
    const { searchAlbumHits } = await import("./cover-search-api");
    const hits = await searchAlbumHits({
      data: { artist: cleanArtist, album: cleanAlbum, track: cleanTrack },
    } as any);
    if (Array.isArray(hits)) catalog = hits as any;
  } catch {
    /* optional path */
  }

  const term = [cleanArtist, cleanAlbum, cleanTrack].filter(Boolean).join(" ");
  const itunesAlbum = new URL("https://itunes.apple.com/search");
  itunesAlbum.searchParams.set("term", term);
  itunesAlbum.searchParams.set("media", "music");
  itunesAlbum.searchParams.set("entity", "album");
  itunesAlbum.searchParams.set("limit", "12");
  const itunesSong = new URL("https://itunes.apple.com/search");
  itunesSong.searchParams.set("term", term);
  itunesSong.searchParams.set("media", "music");
  itunesSong.searchParams.set("entity", "song");
  itunesSong.searchParams.set("limit", "12");

  const [albumsRes, songsRes] = await Promise.all([
    fetch(itunesAlbum.toString()).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
    fetch(itunesSong.toString()).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
  ]);

  const albums = ((albumsRes as { results?: ItunesResult[] }).results || []) as ItunesResult[];
  const songs = ((songsRes as { results?: ItunesResult[] }).results || []) as ItunesResult[];

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
  for (const hit of hits) {
    hit.genre = refineGenre(hit.genre || "", hit.artist || cleanArtist, hit.title || cleanAlbum, hit.description || "");
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
    const rows = data.results || [];
    const out: TracklistSong[] = [];
    for (const row of rows) {
      const title = (row.trackName || "").trim();
      if (!title) continue;
      out.push({
        trackNo: typeof row.trackNumber === "number" ? row.trackNumber : out.length + 1,
        title,
        artist: (row.artistName || a).trim(),
        album: (row.collectionName || b).trim(),
      });
    }
    out.sort((x, y) => x.trackNo - y.trackNo);
    return out;
  } catch {
    return [];
  }
}
