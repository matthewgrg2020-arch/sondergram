import { createServerFn } from "@tanstack/react-start";

export type CatalogHit = {
  title: string;
  artist: string;
  year: string;
  genre: string;
  artwork: string;
  source: "Discogs" | "AcoustID";
  links: { label: string; url: string }[];
};

const UA = "Sondergram/1.0 (metadata; +https://sondergram.vercel.app)";

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function findLinks(artist: string, title: string, extra: { label: string; url: string }[]) {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  return [
    ...extra,
    { label: "Apple Music", url: `https://music.apple.com/search?term=${q}` },
    { label: "Bandcamp", url: `https://bandcamp.com/search?q=${q}` },
    { label: "Archive", url: `https://archive.org/search?query=${q}` },
    { label: "YouTube", url: `https://www.youtube.com/results?search_query=${q}` },
  ].filter((link) => link.url);
}

async function discogs(query: string): Promise<CatalogHit[]> {
  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=8`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (data.results || []).map((row) => {
    const title = str(row.title);
    const [artist, album] = title.includes(" - ") ? title.split(" - ") : ["", title];
    const id = str(row.id);
    const uri = str(row.uri);
    return {
      title: album || title || "Unknown album",
      artist: artist || str(row.artist) || "Unknown artist",
      year: str(row.year),
      genre: Array.isArray(row.genre) ? str(row.genre[0]) : str(row.genre),
      artwork: str(row.cover_image),
      source: "Discogs" as const,
      links: findLinks(artist || title, album || title, [
        { label: "Discogs", url: uri ? `https://www.discogs.com${uri}` : id ? `https://www.discogs.com/release/${id}` : "" },
      ]),
    };
  });
}

async function acoustid(query: string): Promise<CatalogHit[]> {
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { recordings?: Array<Record<string, unknown>> };
  return (data.recordings || []).map((row) => {
    const title = str(row.title);
    const credits = Array.isArray(row["artist-credit"]) ? row["artist-credit"] : [];
    const artist = credits.map((credit) => str((credit as { name?: string }).name)).filter(Boolean).join(", ") || "Unknown artist";
    const releases = Array.isArray(row.releases) ? row.releases : [];
    const release = (releases[0] || {}) as { id?: string; title?: string; date?: string };
    const id = str(row.id);
    return {
      title: str(release.title) || title || "Unknown recording",
      artist,
      year: str(release.date).slice(0, 4),
      genre: "",
      artwork: "",
      source: "AcoustID" as const,
      links: findLinks(artist, title, [
        { label: "AcoustID", url: id ? `https://musicbrainz.org/recording/${id}` : "" },
        { label: "MusicBrainz", url: release.id ? `https://musicbrainz.org/release/${release.id}` : id ? `https://musicbrainz.org/recording/${id}` : "" },
      ]),
    };
  });
}

export const searchMusicDatabase = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }) => {
    const query = data.query.trim();
    if (query.length < 2) return [] as CatalogHit[];
    const [fromDiscogs, fromAcoust] = await Promise.all([discogs(query), acoustid(query)]);
    return [...fromDiscogs, ...fromAcoust].slice(0, 16);
  });
