export type AlbumIntel = {
  singles: string[];
  popular: string[];
  ranks: Record<string, number>;
};

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|with)\b.*$/i, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchName(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

async function json<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type DeezerAlbum = {
  id?: number;
  title?: string;
  record_type?: string;
  artist?: { id?: number; name?: string };
  tracks?: { data?: { title?: string; rank?: number }[] };
};

async function deezerIntel(artist: string, album: string, titles: string[]): Promise<Partial<AlbumIntel>> {
  const q = encodeURIComponent(`${artist} ${album}`.trim());
  const search = await json<{ data?: { id?: number; title?: string; record_type?: string }[] }>(
    `https://api.deezer.com/search/album?q=${q}`,
  );
  const albumHit = (search?.data ?? []).find((row) => matchName(row.title || "", album)) ?? search?.data?.[0];
  const ranks: Record<string, number> = {};
  const popular: string[] = [];
  const singles: string[] = [];
  if (albumHit?.id) {
    const detail = await json<DeezerAlbum>(`https://api.deezer.com/album/${albumHit.id}`);
    const tracks = detail?.tracks?.data ?? [];
    const scored = tracks
      .map((t) => ({ title: t.title || "", rank: Number(t.rank) || 0 }))
      .filter((t) => t.title)
      .sort((a, b) => b.rank - a.rank);
    for (const row of scored) {
      const local = titles.find((name) => matchName(name, row.title));
      if (local) ranks[local] = row.rank;
    }
    popular.push(...scored.slice(0, 4).map((row) => titles.find((name) => matchName(name, row.title)) || "").filter(Boolean));
    const artistId = detail?.artist?.id;
    if (artistId) {
      const discs = await json<{ data?: { title?: string; record_type?: string }[] }>(
        `https://api.deezer.com/artist/${artistId}/albums?limit=80`,
      );
      for (const disc of discs?.data ?? []) {
        if (disc.record_type !== "single") continue;
        const local = titles.find((name) => matchName(name, disc.title || ""));
        if (local && !singles.includes(local)) singles.push(local);
      }
    }
  }
  return { ranks, popular, singles };
}

async function itunesIntel(artist: string, titles: string[]): Promise<Partial<AlbumIntel>> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", artist);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "25");
  url.searchParams.set("attribute", "artistTerm");
  const data = await json<{ results?: { trackName?: string; artistName?: string }[] }>(url.toString());
  const popular: string[] = [];
  for (const row of data?.results ?? []) {
    if (artist && row.artistName && !matchName(row.artistName, artist) && !row.artistName.toLowerCase().includes(artist.toLowerCase())) {
      continue;
    }
    const local = titles.find((name) => matchName(name, row.trackName || ""));
    if (local && !popular.includes(local)) popular.push(local);
  }
  const videoUrl = new URL("https://itunes.apple.com/search");
  videoUrl.searchParams.set("term", artist);
  videoUrl.searchParams.set("media", "music");
  videoUrl.searchParams.set("entity", "musicVideo");
  videoUrl.searchParams.set("limit", "20");
  const videos = await json<{ results?: { trackName?: string }[] }>(videoUrl.toString());
  const singles: string[] = [];
  for (const row of videos?.results ?? []) {
    const local = titles.find((name) => matchName(name, row.trackName || ""));
    if (local && !singles.includes(local)) singles.push(local);
  }
  return { popular, singles };
}

async function musicBrainzSingles(artist: string, titles: string[]): Promise<string[]> {
  const query = encodeURIComponent(`artist:"${artist}" AND primarytype:single`);
  const data = await json<{ release_groups?: { title?: string }[] }>(
    `https://musicbrainz.org/ws/2/release-group/?query=${query}&limit=40&fmt=json`,
    { Accept: "application/json" },
  );
  const singles: string[] = [];
  for (const row of data?.release_groups ?? []) {
    const local = titles.find((name) => matchName(name, row.title || ""));
    if (local && !singles.includes(local)) singles.push(local);
  }
  return singles;
}

export async function lookupAlbumIntel(artist: string, album: string, titles: string[]): Promise<AlbumIntel> {
  const cleanArtist = /^unknown/i.test(artist) ? "" : artist.trim();
  const cleanAlbum = /^unknown/i.test(album) ? "" : album.trim();
  const names = titles.filter(Boolean);
  if (!cleanArtist || names.length === 0) return { singles: [], popular: [], ranks: {} };

  const [deezer, apple, brainz] = await Promise.all([
    deezerIntel(cleanArtist, cleanAlbum, names).catch((): Partial<AlbumIntel> => ({})),
    itunesIntel(cleanArtist, names).catch((): Partial<AlbumIntel> => ({})),
    musicBrainzSingles(cleanArtist, names).catch((): string[] => []),
  ]);

  const ranks = { ...(deezer.ranks ?? {}) };
  const popular: string[] = [];
  for (const name of [...(deezer.popular ?? []), ...(apple.popular ?? [])]) {
    if (!popular.includes(name)) popular.push(name);
  }
  const singles: string[] = [];
  for (const name of [...(deezer.singles ?? []), ...(apple.singles ?? []), ...brainz]) {
    if (!singles.includes(name)) singles.push(name);
  }
  if (singles.length === 0 && popular.length) {
    singles.push(...popular.slice(0, Math.min(3, popular.length)));
  }
  return {
    ranks,
    popular: popular.slice(0, 6),
    singles: singles.slice(0, 8),
  };
}