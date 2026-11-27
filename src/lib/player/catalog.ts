import type { Track } from "./store";
import { isExplicitAlbum, isExplicitTrack } from "./explicit";

export type AlbumGroup = {
  key: string;
  title: string;
  artist: string;
  year: string;
  coverUrl: string | null;
  trackIds: string[];
  tags: string[];
  genre: string;
  explicit: boolean;
  note: string;
  lossless: boolean;
  rating: number;
  /** Highest disc number present (1 = single disc). */
  discCount: number;
};

export type ArtistGroup = {
  key: string;
  name: string;
  coverUrl: string | null;
  albumCount: number;
  trackCount: number;
  albums: AlbumGroup[];
  genre: string;
  tags: string[];
};

export type GenreGroup = {
  name: string;
  albums: AlbumGroup[];
  trackCount: number;
};

export function splitGenres(value: string) {
  return value
    .split(/[/|,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normAlbum(name: string) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip "Disc 1", "CD2", "(Disk 3 of 3)" style suffixes so multi-disc sets share one album. */
export function cleanAlbumTitle(name: string) {
  return (name || "")
    .replace(/\s*[\(\[]\s*(?:cd|disc|disk)\s*\d+(?:\s*of\s*\d+)?\s*[\)\]]\s*$/i, "")
    .replace(/\s*[-–—]\s*(?:cd|disc|disk)\s*\d+\s*$/i, "")
    .replace(/\s+(?:cd|disc|disk)\s*\d+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer tagged diskNo; otherwise parse from album title suffix. */
export function resolveDiskNo(track: Pick<{ diskNo?: number; album?: string }, "diskNo" | "album">): number {
  const tagged = Number(track.diskNo || 0);
  if (Number.isFinite(tagged) && tagged > 0) return Math.floor(tagged);
  const album = track.album || "";
  const m =
    album.match(/[\(\[]\s*(?:cd|disc|disk)\s*(\d+)/i) ||
    album.match(/[-–—]\s*(?:cd|disc|disk)\s*(\d+)/i) ||
    album.match(/\b(?:cd|disc|disk)\s*(\d+)\s*$/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

/** Group tracks by disc for album page sections. */
export function groupTracksByDisc<T extends { diskNo?: number; album?: string; id: string }>(tracks: T[]) {
  const map = new Map<number, T[]>();
  for (const t of tracks) {
    const d = resolveDiskNo(t);
    const list = map.get(d);
    if (list) list.push(t);
    else map.set(d, [t]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function isVariousName(value: string) {
  const name = (value || "").trim().toLowerCase();
  return (
    name === "va" ||
    name === "v/a" ||
    name === "v.a." ||
    name === "various" ||
    name === "various artist" ||
    name === "various artists" ||
    name.includes("various artist") ||
    name.includes("compilation") ||
    name === "ost" ||
    name === "soundtrack" ||
    name.endsWith(" soundtrack") ||
    name.includes("original soundtrack")
  );
}

/** Group VA / compilation albums by album title alone so tracks stick together. */
export function albumKey(track: Pick<Track, "album" | "artist" | "id"> & { albumArtist?: string }) {
  const album = normAlbum(cleanAlbumTitle(track.album));
  if (!album || album === "unknown album") return `track::${track.id}`;
  const albumArtist = (track.albumArtist || "").trim().toLowerCase();
  const artist = (track.artist || "").trim().toLowerCase();
  if (isVariousName(albumArtist) || isVariousName(artist) || isVariousName(album)) {
    return `album::va::${album}`;
  }
  if (albumArtist && !isVariousName(albumArtist)) return `album::${albumArtist}::${album}`;
  if (!albumArtist) return `album::${album}`;
  return `album::${albumArtist || artist}::${album}`;
}

export function artistKey(name: string) {
  return (name || "Unknown artist").trim().toLowerCase();
}

function majority(values: string[]) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { label: value.trim(), n: 1 });
  }
  let best: { label: string; n: number } | null = null;
  for (const row of counts.values()) {
    if (!best || row.n > best.n) best = row;
  }
  return best;
}

function pickAlbumArtist(songs: Track[]) {
  const albumArtists = songs.map((s) => s.albumArtist || "").filter((s) => s.trim() && !/^unknown/i.test(s));
  const named = majority(albumArtists);
  if (named && !isVariousName(named.label)) return named.label;
  if (named && isVariousName(named.label)) return "Various Artists";
  const artists = songs.map((s) => s.artist).filter((s) => s.trim() && !/^unknown/i.test(s));
  const top = majority(artists);
  if (!top) return "Unknown artist";
  const unique = new Set(artists.map((a) => a.trim().toLowerCase()));
  if (unique.size > 1) return "Various Artists";
  if (isVariousName(top.label)) return "Various Artists";
  return top.label;
}

export function compareTracks(a: Track, b: Track) {
  const disk = resolveDiskNo(a) - resolveDiskNo(b);
  if (disk) return disk;
  const aNo = a.trackNo || 0;
  const bNo = b.trackNo || 0;
  if (aNo && bNo && aNo !== bNo) return aNo - bNo;
  if (aNo && !bNo) return -1;
  if (bNo && !aNo) return 1;
  return (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.name.localeCompare(b.name);
}

export function groupAlbums(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = albumKey(track);
    const list = map.get(key);
    if (list) list.push(track);
    else map.set(key, [track]);
  }
  const albums: AlbumGroup[] = [];
  for (const [key, songs] of map) {
    songs.sort(compareTracks);
    const first = songs[0]!;
    const genre =
      songs.find((s) => s.genre)?.genre ||
      songs.find((s) => s.artistGenre)?.artistGenre ||
      "";
    const title = cleanAlbumTitle(first.album) || first.album.trim() || "Unknown album";
    const artist = pickAlbumArtist(songs);
    const tags = [...new Set(songs.flatMap((s) => [...(s.tags || []), ...(s.artistTags || [])]))];
    albums.push({
      key,
      title,
      artist,
      year: songs.find((s) => s.year)?.year ?? "",
      coverUrl: songs.find((s) => s.coverUrl)?.coverUrl ?? null,
      trackIds: songs.map((s) => s.id),
      tags,
      genre,
      explicit:
        isExplicitAlbum({ title, artist, genre, tags }, songs) || songs.some((s) => isExplicitTrack(s)),
      note: songs.find((s) => s.albumNote)?.albumNote ?? "",
      lossless: songs.some((s) => s.lossless),
      rating: songs.find((s) => s.albumRating)?.albumRating ?? 0,
      discCount: Math.max(1, ...songs.map((s) => resolveDiskNo(s))),
    });
  }
  return albums.sort((a, b) => a.title.localeCompare(b.title));
}

export function groupArtists(tracks: Track[]): ArtistGroup[] {
  const albums = groupAlbums(tracks);
  const map = new Map<string, ArtistGroup>();
  for (const album of albums) {
    const key = artistKey(album.artist);
    const songs = album.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is Track => Boolean(t));
    const genre =
      songs.find((s) => s.artistGenre)?.artistGenre ||
      album.genre ||
      "";
    const tags = [...new Set(songs.flatMap((s) => s.artistTags || []))];
    const existing = map.get(key);
    if (existing) {
      existing.albums.push(album);
      existing.trackCount += album.trackIds.length;
      existing.albumCount += 1;
      if (!existing.coverUrl && album.coverUrl) existing.coverUrl = album.coverUrl;
      if (!existing.genre && genre) existing.genre = genre;
      existing.tags = [...new Set([...existing.tags, ...tags])];
    } else {
      map.set(key, {
        key,
        name: album.artist,
        coverUrl: album.coverUrl,
        albumCount: 1,
        trackCount: album.trackIds.length,
        albums: [album],
        genre,
        tags,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type TagGroup = {
  name: string;
  albums: AlbumGroup[];
  trackCount: number;
};

export function groupTags(albums: AlbumGroup[]): TagGroup[] {
  const map = new Map<string, TagGroup>();
  for (const album of albums) {
    for (const tag of album.tags || []) {
      const name = String(tag || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.albums.some((a) => a.key === album.key)) {
          existing.albums.push(album);
          existing.trackCount += album.trackIds.length;
        }
      } else {
        map.set(key, { name, albums: [album], trackCount: album.trackIds.length });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function groupGenres(albums: AlbumGroup[]): GenreGroup[] {
  const map = new Map<string, GenreGroup>();
  for (const album of albums) {
    const names = splitGenres(album.genre);
    if (names.length === 0) continue;
    for (const name of names) {
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.albums.some((a) => a.key === album.key)) {
          existing.albums.push(album);
          existing.trackCount += album.trackIds.length;
        }
      } else {
        map.set(key, { name, albums: [album], trackCount: album.trackIds.length });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function radioScore(seed: Track, candidate: Track): number {
  if (seed.id === candidate.id) return 0;
  let n = 0;
  const artistA = (seed.artist || "").trim().toLowerCase();
  const artistB = (candidate.artist || "").trim().toLowerCase();
  if (artistA && artistB && artistA === artistB) n += 4;
  const albumA = cleanAlbumTitle(seed.album || "").toLowerCase();
  const albumB = cleanAlbumTitle(candidate.album || "").toLowerCase();
  if (albumA && albumB && albumA === albumB) n += 2;
  const genreA = (seed.genre || seed.artistGenre || "").trim().toLowerCase();
  const genreB = (candidate.genre || candidate.artistGenre || "").trim().toLowerCase();
  if (genreA && genreB && (genreA === genreB || genreA.includes(genreB) || genreB.includes(genreA))) n += 3;
  const tags = new Set((seed.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  for (const tag of candidate.tags || []) {
    if (tags.has(tag.trim().toLowerCase())) n += 1;
  }
  if (seed.liked && candidate.liked) n += 1;
  return n;
}

export function pickRadioIndex(tracks: Track[], current: number, recentIds: string[]): number | null {
  const track = tracks[current];
  if (!track) return null;

  const scored = tracks
    .map((candidate, i) => ({ i, n: radioScore(track, candidate), id: candidate.id }))
    .filter((row) => row.i !== current && row.n > 0);

  let pool = scored.filter((row) => !recentIds.includes(row.id));
  if (pool.length === 0) pool = scored;
  if (pool.length === 0) {
    pool = tracks
      .map((candidate, i) => ({ i, n: 1, id: candidate.id }))
      .filter((row) => row.i !== current && !recentIds.includes(row.id));
  }
  if (pool.length === 0) {
    const others = tracks.map((_, i) => i).filter((i) => i !== current);
    if (!others.length) return null;
    return others[Math.floor(Math.random() * others.length)]!;
  }
  pool.sort((a, b) => b.n - a.n);
  const top = pool.filter((row) => row.n === pool[0]!.n);
  return top[Math.floor(Math.random() * top.length)]!.i;
}

export function similarAlbums(album: AlbumGroup, all: AlbumGroup[], limit = 8): AlbumGroup[] {
  const genreParts = new Set(splitGenres(album.genre).map((s) => s.toLowerCase()));
  const tags = new Set((album.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
  const artistKey = (album.artist || "").trim().toLowerCase();
  const titleKey = (album.title || "").trim().toLowerCase();
  const scored = all
    .filter((a) => a.key !== album.key)
    .map((a) => {
      let score = 0;
      const aGenre = new Set(splitGenres(a.genre).map((s) => s.toLowerCase()));
      const aTags = new Set((a.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
      for (const g of genreParts) if (aGenre.has(g)) score += 3;
      for (const t of tags) if (aTags.has(t)) score += 2;
      if (artistKey && (a.artist || "").trim().toLowerCase() === artistKey) score += 4;
      const tokens = titleKey.split(/\s+/).filter((w) => w.length > 3);
      const aTitle = (a.title || "").toLowerCase();
      for (const w of tokens) if (aTitle.includes(w)) score += 1;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title));
  return scored.slice(0, limit).map((x) => x.a);
}

export function similarArtistsForAlbum(album: AlbumGroup, artists: ArtistGroup[], limit = 8): ArtistGroup[] {
  const self = (album.artist || "").trim().toLowerCase();
  const genre = (album.genre || "").toLowerCase();
  const scored = artists
    .filter((a) => a.name.trim().toLowerCase() !== self)
    .map((a) => {
      let score = 0;
      if (genre && (a.genre || "").toLowerCase().includes(genre.split(/[/|,]/)[0] || "")) score += 2;
      for (const tag of album.tags || []) {
        if ((a.tags || []).some((t) => t.toLowerCase() === String(tag).toLowerCase())) score += 1;
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name));
  return scored.slice(0, limit).map((x) => x.a);
}

/** Group library tracks that share the same title (and artist when present). */
export function findDuplicates(tracks: Track[]): Track[][] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const title = (t.name || "").trim().toLowerCase();
    if (!title) continue;
    const artist = (t.artist || "").trim().toLowerCase();
    const key = artist ? `${title}::${artist}` : title;
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return [...map.values()]
    .filter((list) => list.length > 1)
    .sort((a, b) => b.length - a.length || a[0]!.name.localeCompare(b[0]!.name));
}
