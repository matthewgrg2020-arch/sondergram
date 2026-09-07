import type { Track } from "./store";

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

export function albumKey(track: Pick<Track, "album" | "id">) {
  const album = normAlbum(track.album);
  if (!album || album === "unknown album") return `track::${track.id}`;
  return `album::${album}`;
}

export function artistKey(name: string) {
  return (name || "Unknown artist").trim().toLowerCase();
}

function majority(values: string[]) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const row = counts.get(key);
    if (row) row.n += 1;
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
  if (named) return named.label;
  const artists = songs.map((s) => s.artist).filter((s) => s.trim() && !/^unknown/i.test(s));
  const top = majority(artists);
  if (!top) return "Unknown artist";
  if (new Set(artists.map((a) => a.trim().toLowerCase())).size > 2 && top.n / artists.length < 0.5) {
    return "Various Artists";
  }
  return top.label;
}

export function compareTracks(a: Track, b: Track) {
  const disk = (a.diskNo || 1) - (b.diskNo || 1);
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
    const first = songs[0];
    const genre =
      songs.find((s) => s.genre)?.genre ||
      songs.find((s) => s.artistGenre)?.artistGenre ||
      "";
    albums.push({
      key,
      title: first.album.trim() || "Unknown album",
      artist: pickAlbumArtist(songs),
      year: songs.find((s) => s.year)?.year ?? "",
      coverUrl: songs.find((s) => s.coverUrl)?.coverUrl ?? null,
      trackIds: songs.map((s) => s.id),
      tags: [...new Set(songs.flatMap((s) => [...(s.tags || []), ...(s.artistTags || [])]))],
      genre,
      explicit: songs.some((s) => s.explicit),
      note: songs.find((s) => s.albumNote)?.albumNote ?? "",
      lossless: songs.some((s) => s.lossless),
      rating: songs.find((s) => s.albumRating)?.albumRating ?? 0,
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
};

export function groupTags(albums: AlbumGroup[]): TagGroup[] {
  const map = new Map<string, TagGroup>();
  for (const album of albums) {
    for (const tag of album.tags) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        if (!existing.albums.some((a) => a.key === album.key)) existing.albums.push(album);
      } else {
        map.set(key, { name: tag.trim(), albums: [album] });
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

export function pickRadioIndex(tracks: Track[], current: number, recentIds: string[]): number | null {
  const track = tracks[current];
  if (!track) return null;
  const tags = new Set(track.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (tags.size === 0) return null;

  const scoreOf = (candidate: Track) =>
    candidate.tags.reduce((n, tag) => n + (tags.has(tag.trim().toLowerCase()) ? 1 : 0), 0);

  const scored = tracks
    .map((candidate, i) => ({ i, n: scoreOf(candidate), id: candidate.id }))
    .filter((row) => row.i !== current && row.n > 0);

  if (scored.length === 0) return null;

  const fresh = scored.filter((row) => !recentIds.includes(row.id));
  const pool = fresh.length > 0 ? fresh : scored;
  const best = Math.max(...pool.map((row) => row.n));
  const top = pool.filter((row) => row.n === best);
  return top[Math.floor(Math.random() * top.length)].i;
}

export function similarAlbums(album: AlbumGroup, all: AlbumGroup[], limit = 8): AlbumGroup[] {
  const tags = new Set(album.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (tags.size === 0) return [];
  return all
    .filter((other) => other.key !== album.key)
    .map((other) => ({
      album: other,
      score: other.tags.filter((t) => tags.has(t.trim().toLowerCase())).length,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.album.title.localeCompare(b.album.title))
    .slice(0, limit)
    .map((row) => row.album);
}

export function similarArtistsForAlbum(album: AlbumGroup, artists: ArtistGroup[], limit = 8): ArtistGroup[] {
  const tags = new Set(album.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (tags.size === 0) return [];
  const current = artistKey(album.artist);
  return artists
    .filter((artist) => artist.key !== current)
    .map((artist) => ({
      artist,
      score: artist.albums.reduce(
        (sum, item) => sum + item.tags.filter((t) => tags.has(t.trim().toLowerCase())).length,
        0,
      ),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.artist.name.localeCompare(b.artist.name))
    .slice(0, limit)
    .map((row) => row.artist);
}

export function similarArtistsForArtist(artist: ArtistGroup, artists: ArtistGroup[], limit = 8): ArtistGroup[] {
  const tags = new Set(
    artist.albums.flatMap((album) => album.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  );
  if (tags.size === 0) return [];
  return artists
    .filter((other) => other.key !== artist.key)
    .map((other) => ({
      artist: other,
      score: other.albums.reduce(
        (sum, item) => sum + item.tags.filter((t) => tags.has(t.trim().toLowerCase())).length,
        0,
      ),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.artist.name.localeCompare(b.artist.name))
    .slice(0, limit)
    .map((row) => row.artist);
}

export function findDuplicates(tracks: Track[]) {
  const map = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = `${(track.artist || "").trim().toLowerCase()}|${(track.name || "").trim().toLowerCase()}`;
    if (key === "|") continue;
    const list = map.get(key) ?? [];
    list.push(track);
    map.set(key, list);
  }
  return [...map.values()].filter((list) => list.length > 1);
}

export function isCompilation(tracks: Track[]) {
  const artists = new Set(tracks.map((t) => (t.albumArtist || t.artist || "").trim().toLowerCase()).filter(Boolean));
  if (artists.size > 2) return true;
  const name = (tracks[0]?.albumArtist || "").toLowerCase();
  return name.includes("various") || name === "va" || name.includes("compilation");
}