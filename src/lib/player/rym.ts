/** RateYourMusic discovery helpers.
 * RYM has no public API and blocks server scrapers (403).
 * We deep-link to charts/search and pair with Bandcamp/library find.
 */

export type RymGenre = { slug: string; label: string };

export type RymPick = {
  artist: string;
  album: string;
  year: string;
  rating?: string;
  genres: string[];
  /** path under rateyourmusic.com/release/album/ */
  path: string;
};

export const RYM_GENRES: RymGenre[] = [
  { slug: "rock", label: "Rock" },
  { slug: "electronic", label: "Electronic" },
  { slug: "hip-hop", label: "Hip Hop" },
  { slug: "jazz", label: "Jazz" },
  { slug: "folk", label: "Folk" },
  { slug: "metal", label: "Metal" },
  { slug: "pop", label: "Pop" },
  { slug: "rnb", label: "R&B" },
  { slug: "classical", label: "Classical" },
  { slug: "experimental", label: "Experimental" },
  { slug: "ambient", label: "Ambient" },
  { slug: "punk", label: "Punk" },
  { slug: "soul", label: "Soul" },
  { slug: "country", label: "Country" },
  { slug: "blues", label: "Blues" },
  { slug: "reggae", label: "Reggae" },
  { slug: "indie-rock", label: "Indie Rock" },
  { slug: "post-rock", label: "Post-Rock" },
  { slug: "shoegaze", label: "Shoegaze" },
  { slug: "dream-pop", label: "Dream Pop" },
  { slug: "house", label: "House" },
  { slug: "techno", label: "Techno" },
  { slug: "idm", label: "IDM" },
  { slug: "drone", label: "Drone" },
];

export const RYM_DECADES = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s", "1950s"] as const;

export function rymChartUrl(opts: {
  type?: "top" | "popular" | "esoteric";
  release?: "album" | "ep" | "single" | "song";
  year?: string; // all-time | 2024 | 2020s
  genre?: string;
}) {
  const type = opts.type || "top";
  const release = opts.release || "album";
  const year = opts.year || "all-time";
  const base = `https://rateyourmusic.com/charts/${type}/${release}/${year}/`;
  if (opts.genre) return `${base}g:${encodeURIComponent(opts.genre)}/`;
  return base;
}

export function rymSearchUrl(q: string) {
  const text = q.trim();
  if (!text) return "https://rateyourmusic.com/";
  return `https://rateyourmusic.com/search?searchterm=${encodeURIComponent(text)}&searchtype=l`;
}

export function rymAlbumUrl(path: string) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return `https://rateyourmusic.com/release/album/${clean}/`;
}

export function rymGenreChartUrl(genreSlug: string, year = "all-time") {
  return rymChartUrl({ type: "top", release: "album", year, genre: genreSlug });
}

/** Well-known highly rated albums for offline discovery (not live RYM data). */
export const RYM_CURATED: RymPick[] = [
  {
    artist: "Radiohead",
    album: "OK Computer",
    year: "1997",
    rating: "4.23",
    genres: ["Art Rock", "Alternative Rock"],
    path: "radiohead/ok-computer",
  },
  {
    artist: "Pink Floyd",
    album: "Wish You Were Here",
    year: "1975",
    rating: "4.29",
    genres: ["Progressive Rock", "Art Rock"],
    path: "pink-floyd/wish-you-were-here",
  },
  {
    artist: "King Crimson",
    album: "In the Court of the Crimson King",
    year: "1969",
    rating: "4.30",
    genres: ["Progressive Rock", "Art Rock"],
    path: "king-crimson/in-the-court-of-the-crimson-king",
  },
  {
    artist: "My Bloody Valentine",
    album: "Loveless",
    year: "1991",
    rating: "4.24",
    genres: ["Shoegaze", "Noise Pop"],
    path: "my-bloody-valentine/loveless",
  },
  {
    artist: "Kendrick Lamar",
    album: "To Pimp a Butterfly",
    year: "2015",
    rating: "4.27",
    genres: ["Conscious Hip Hop", "Jazz Rap"],
    path: "kendrick-lamar/to-pimp-a-butterfly",
  },
  {
    artist: "The Velvet Underground & Nico",
    album: "The Velvet Underground & Nico",
    year: "1967",
    rating: "4.24",
    genres: ["Art Rock", "Experimental Rock"],
    path: "the-velvet-underground-nico/the-velvet-underground-nico",
  },
  {
    artist: "Miles Davis",
    album: "Kind of Blue",
    year: "1959",
    rating: "4.28",
    genres: ["Modal Jazz", "Cool Jazz"],
    path: "miles-davis/kind-of-blue",
  },
  {
    artist: "Talking Heads",
    album: "Remain in Light",
    year: "1980",
    rating: "4.22",
    genres: ["New Wave", "Art Rock"],
    path: "talking-heads/remain-in-light",
  },
  {
    artist: "Björk",
    album: "Homogenic",
    year: "1997",
    rating: "4.15",
    genres: ["Art Pop", "Electronic"],
    path: "bjork/homogenic",
  },
  {
    artist: "Boards of Canada",
    album: "Music Has the Right to Children",
    year: "1998",
    rating: "4.12",
    genres: ["IDM", "Ambient"],
    path: "boards-of-canada/music-has-the-right-to-children",
  },
  {
    artist: "Massive Attack",
    album: "Mezzanine",
    year: "1998",
    rating: "4.05",
    genres: ["Trip Hop", "Downtempo"],
    path: "massive-attack/mezzanine",
  },
  {
    artist: "Burial",
    album: "Untrue",
    year: "2007",
    rating: "4.05",
    genres: ["UK Garage", "Dubstep"],
    path: "burial/untrue",
  },
];

export function filterCurated(genre?: string | null) {
  if (!genre) return RYM_CURATED;
  const g = genre.toLowerCase().replace(/-/g, " ");
  return RYM_CURATED.filter((p) =>
    p.genres.some((x) => x.toLowerCase().includes(g) || g.includes(x.toLowerCase().split(" ")[0] || "")),
  );
}
