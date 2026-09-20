import { searchPicardCovers, searchWebCovers } from "./cover-search-api";

export function proxyCoverUrl(url: string) {
  if (!url) return url;
  if (/^(blob:|data:)/i.test(url)) return url;
  if (url.startsWith("/api/cover")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/cover?u=${encodeURIComponent(url)}`;
}

export type CoverHit = {

  url: string;
  thumb: string;
  source: string;
  label: string;
};

export type CoverSource = "all" | "google" | "picard" | "catalog";

async function picardCovers(artist: string, album: string): Promise<CoverHit[]> {
  if (!artist && !album) return [];
  try {
    const hits = await searchPicardCovers({ data: { artist, album } });
    return (hits ?? []).map((hit) => ({
      url: hit.url,
      thumb: hit.thumb || hit.url,
      source: "MusicBrainz Picard",
      label: hit.label || album,
    }));
  } catch {
    return [];
  }
}

function clean(value: string) {
  return /^unknown/i.test(value) ? "" : value.trim();
}

function unique(hits: CoverHit[]) {
  const seen = new Set<string>();
  const out: CoverHit[] = [];
  for (const hit of hits) {
    const key = hit.url.replace(/\/\d+x\d+bb/g, "/600x600bb").split("?")[0];
    if (!hit.url || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
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

async function itunesCovers(artist: string, album: string): Promise<CoverHit[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", [artist, album].filter(Boolean).join(" "));
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "12");
  const data = await json<{ results?: { collectionName?: string; artworkUrl100?: string }[] }>(url.toString());
  return (data?.results ?? [])
    .filter((row) => row.artworkUrl100)
    .map((row) => {
      const art = row.artworkUrl100!.replace(/\/\d+x\d+bb/g, "/1200x1200bb");
      const artistName = (row as { artistName?: string }).artistName || "";
      return {
        url: art,
        thumb: row.artworkUrl100!.replace(/\/\d+x\d+bb/g, "/300x300bb"),
        source: "iTunes",
        label: [row.collectionName || album, artistName].filter(Boolean).join(" · "),
      };
    });
}

async function deezerCovers(artist: string, album: string): Promise<CoverHit[]> {
  const q = encodeURIComponent([artist, album].filter(Boolean).join(" "));
  const data = await json<{
    data?: { title?: string; cover_medium?: string; cover_xl?: string; cover_big?: string; artist?: { name?: string } }[];
  }>(`https://api.deezer.com/search/album?q=${q}&limit=12`);
  return (data?.data ?? [])
    .map((row) => {
      const url = row.cover_xl || row.cover_big || "";
      if (!url) return null;
      return {
        url,
        thumb: row.cover_medium || url,
        source: "Deezer",
        label: [row.title || album, row.artist?.name].filter(Boolean).join(" · "),
      } satisfies CoverHit;
    })
    .filter((row): row is CoverHit => Boolean(row));
}

async function audioDbCovers(artist: string, album: string): Promise<CoverHit[]> {
  if (!artist) return [];
  const url = new URL("https://www.theaudiodb.com/api/v1/json/2/searchalbum.php");
  url.searchParams.set("s", artist);
  if (album) url.searchParams.set("a", album);
  const data = await json<{
    album?: { strAlbum?: string; strAlbumThumb?: string; strAlbumThumbHQ?: string; strAlbumCDart?: string; strAlbumSpine?: string }[];
  }>(url.toString());
  const hits: CoverHit[] = [];
  for (const row of data?.album ?? []) {
    const hq = row.strAlbumThumbHQ || row.strAlbumThumb;
    if (hq) hits.push({ url: hq, thumb: row.strAlbumThumb || hq, source: "AudioDB", label: row.strAlbum || album });
    if (row.strAlbumCDart) hits.push({ url: row.strAlbumCDart, thumb: row.strAlbumCDart, source: "AudioDB", label: `${row.strAlbum || album} CD` });
  }
  return hits;
}

async function wikiCovers(artist: string, album: string): Promise<CoverHit[]> {
  const titleGuess = [album, artist].filter(Boolean).join(" ");
  if (!titleGuess) return [];
  const search = await json<{ query?: { search?: { title: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${titleGuess} album`)}&srlimit=4&format=json&origin=*`,
  );
  const titles = (search?.query?.search ?? []).map((row) => row.title);
  if (!titles.length) return [];
  const images = await json<{
    query?: { pages?: Record<string, { title?: string; original?: { source?: string }; thumbnail?: { source?: string } }> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|thumbnail&pithumbsize=300&titles=${encodeURIComponent(titles.join("|"))}&format=json&origin=*`,
  );
  return Object.values(images?.query?.pages ?? {})
    .map((page) => {
      const url = page.original?.source || page.thumbnail?.source || "";
      if (!url) return null;
      return {
        url,
        thumb: page.thumbnail?.source || url,
        source: "Wikipedia",
        label: page.title || album,
      } satisfies CoverHit;
    })
    .filter((row): row is CoverHit => Boolean(row));
}

async function googleCovers(artist: string, album: string): Promise<CoverHit[]> {
  const q = [artist, album, "album cover"].filter(Boolean).join(" ");
  if (!q.trim()) return [];
  try {
    const hits = await searchWebCovers({ data: { q } });
    return (hits ?? []).map((hit) => ({
      url: hit.url,
      thumb: hit.thumb || hit.url,
      source: hit.source || "Google",
      label: hit.label || [album, artist].filter(Boolean).join(" · "),
    }));
  } catch {
    return [];
  }
}

function coverScore(hit: CoverHit, artist: string, album: string) {
  const hay = hit.label.toLowerCase();
  const a = album.toLowerCase();
  const r = artist.toLowerCase();
  let n = 0;
  if (a && hay.includes(a)) n += 8;
  else if (a && a.length > 5 && hay.includes(a.slice(0, Math.min(a.length, 16)))) n += 3;
  else if (a) n -= 2;
  if (r && hay.includes(r)) n += 5;
  else if (r && r.length > 4 && hay.includes(r.slice(0, Math.min(r.length, 12)))) n += 2;
  if (/cd art|spine|back|poster|live|deluxe analog/i.test(hit.label)) n -= 2;
  if (hit.source === "iTunes" || hit.source === "Deezer") n += 1;
  if (hit.source === "MusicBrainz Picard") n += 2;
  if (hit.source === "Google") n += 1;
  if (/^front$/i.test(hit.label) || /front/i.test(hit.label)) n += 2;
  return n;
}

export async function searchCovers(artist: string, album: string, source: CoverSource = "all"): Promise<CoverHit[]> {
  const a = clean(artist);
  const b = clean(album);
  if (!a && !b) return [];
  const catalog = source === "all" || source === "catalog";
  const google = source === "all" || source === "google";
  const picard = source === "all" || source === "picard";
  const packs = await Promise.all([
    catalog ? itunesCovers(a, b).catch(() => []) : Promise.resolve([]),
    catalog ? deezerCovers(a, b).catch(() => []) : Promise.resolve([]),
    catalog ? audioDbCovers(a, b).catch(() => []) : Promise.resolve([]),
    catalog ? wikiCovers(a, b).catch(() => []) : Promise.resolve([]),
    picard ? picardCovers(a, b).catch(() => []) : Promise.resolve([]),
    google ? googleCovers(a, b).catch(() => []) : Promise.resolve([]),
  ]);
  return unique(packs.flat()).sort((x, y) => coverScore(y, a, b) - coverScore(x, a, b));
}
