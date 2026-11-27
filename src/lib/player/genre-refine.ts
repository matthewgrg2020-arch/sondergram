/** Prefer specific subgenres over broad parent labels. */

const SUBGENRES: { re: RegExp; genre: string; weight: number }[] = [
  // Metal
  { re: /\btechnical\s+death\s*metal\b/i, genre: "Technical Death Metal", weight: 12 },
  { re: /\bbrutal\s+death\s*metal\b/i, genre: "Brutal Death Metal", weight: 12 },
  { re: /\bmelodic\s+death\s*metal\b/i, genre: "Melodic Death Metal", weight: 12 },
  { re: /\bdeath\s*metal\b/i, genre: "Death Metal", weight: 10 },
  { re: /\bblack\s*metal\b/i, genre: "Black Metal", weight: 10 },
  { re: /\bthrash\s*metal\b/i, genre: "Thrash Metal", weight: 10 },
  { re: /\bdoom\s*metal\b/i, genre: "Doom Metal", weight: 10 },
  { re: /\bsludge\s*metal\b/i, genre: "Sludge Metal", weight: 10 },
  { re: /\bprogressive\s*metal\b/i, genre: "Progressive Metal", weight: 10 },
  { re: /\bpower\s*metal\b/i, genre: "Power Metal", weight: 10 },
  { re: /\bgroove\s*metal\b/i, genre: "Groove Metal", weight: 10 },
  { re: /\bnu[\s-]?metal\b/i, genre: "Nu Metal", weight: 9 },
  { re: /\bmetalcore\b/i, genre: "Metalcore", weight: 9 },
  { re: /\bdeathcore\b/i, genre: "Deathcore", weight: 9 },
  // Electronic / funk / R&B
  { re: /\bsynth[\s-]?funk\b/i, genre: "Synth Funk", weight: 11 },
  { re: /\belectro[\s-]?funk\b/i, genre: "Electro Funk", weight: 10 },
  { re: /\bp[\s-]?funk\b/i, genre: "P-Funk", weight: 10 },
  { re: /\bboogie\b/i, genre: "Boogie", weight: 8 },
  { re: /\bsynth[\s-]?pop\b/i, genre: "Synth-Pop", weight: 10 },
  { re: /\bsynthwave\b/i, genre: "Synthwave", weight: 10 },
  { re: /\bdarkwave\b/i, genre: "Darkwave", weight: 9 },
  { re: /\bindustrial\b/i, genre: "Industrial", weight: 8 },
  { re: /\btechno\b/i, genre: "Techno", weight: 8 },
  { re: /\bhouse\b/i, genre: "House", weight: 7 },
  { re: /\bdrum\s*(and|&)\s*bass\b|\bdnb\b/i, genre: "Drum & Bass", weight: 9 },
  { re: /\btrip[\s-]?hop\b/i, genre: "Trip Hop", weight: 9 },
  // Hip-hop
  { re: /\bg[\s-]?funk\b/i, genre: "G-Funk", weight: 10 },
  { re: /\bboom\s*bap\b/i, genre: "Boom Bap", weight: 9 },
  { re: /\btrap\b/i, genre: "Trap", weight: 7 },
  { re: /\bchopped\s*(and|&)\s*screwed\b|\bscrew\b/i, genre: "Chopped & Screwed", weight: 10 },
  { re: /\bcloud\s*rap\b/i, genre: "Cloud Rap", weight: 9 },
  // Soul / R&B / jazz
  { re: /\bneo[\s-]?soul\b/i, genre: "Neo-Soul", weight: 10 },
  { re: /\bquiet\s*storm\b/i, genre: "Quiet Storm", weight: 9 },
  { re: /\bcontemporary\s*r&?b\b/i, genre: "Contemporary R&B", weight: 9 },
  { re: /\bsmooth\s*jazz\b/i, genre: "Smooth Jazz", weight: 9 },
  { re: /\bfree\s*jazz\b/i, genre: "Free Jazz", weight: 9 },
  { re: /\bbebop\b|\bbop\b/i, genre: "Bebop", weight: 8 },
  // Rock
  { re: /\bpsychedelic\s*rock\b/i, genre: "Psychedelic Rock", weight: 10 },
  { re: /\bprog(ressive)?\s*rock\b/i, genre: "Progressive Rock", weight: 10 },
  { re: /\bpost[\s-]?rock\b/i, genre: "Post-Rock", weight: 9 },
  { re: /\bgarage\s*rock\b/i, genre: "Garage Rock", weight: 9 },
  { re: /\bindie\s*rock\b/i, genre: "Indie Rock", weight: 8 },
  { re: /\balternative\s*rock\b/i, genre: "Alternative Rock", weight: 8 },
  // Other
  { re: /\bambient\b/i, genre: "Ambient", weight: 8 },
  { re: /\bshoegaze\b/i, genre: "Shoegaze", weight: 9 },
  { re: /\bdream\s*pop\b/i, genre: "Dream Pop", weight: 9 },
  { re: /\bafrobeat\b/i, genre: "Afrobeat", weight: 9 },
  { re: /\breggaeton\b/i, genre: "Reggaeton", weight: 8 },
  { re: /\bgrime\b/i, genre: "Grime", weight: 8 },
];

const BROAD = new Set(
  ["rock", "pop", "metal", "hip-hop", "hip hop", "rap", "r&b", "rnb", "electronic", "jazz", "funk", "soul", "alternative", "soundtrack", "ibroadcast"].map((s) =>
    s.toLowerCase(),
  ),
);

function specificity(genre: string): number {
  const g = genre.trim();
  if (!g) return 0;
  const words = g.split(/[\s/-]+/).filter(Boolean).length;
  let score = words * 2 + Math.min(g.length, 40) / 10;
  if (BROAD.has(g.toLowerCase())) score -= 4;
  for (const row of SUBGENRES) {
    if (row.re.test(g)) score += row.weight;
  }
  return score;
}

/** Scan text for known subgenre phrases. */
export function detectSubgenres(...parts: string[]): string[] {
  const blob = parts.filter(Boolean).join(" \n ");
  if (!blob.trim()) return [];
  const found: { genre: string; weight: number }[] = [];
  for (const row of SUBGENRES) {
    if (row.re.test(blob)) found.push({ genre: row.genre, weight: row.weight });
  }
  found.sort((a, b) => b.weight - a.weight);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of found) {
    const key = row.genre.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.genre);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Prefer a deeper genre label.
 * Uses online genre when specific; otherwise detects from metadata text;
 * joins up to two complementary labels (e.g. "Death Metal / Technical Death Metal" avoided — keeps best).
 */
export function refineGenre(
  onlineGenre: string,
  artist: string,
  album: string,
  extra?: string,
): string {
  const online = (onlineGenre || "").trim();
  const detected = detectSubgenres(online, artist, album, extra || "");

  const candidates = [online, ...detected].filter(Boolean);
  if (!candidates.length) return online;

  candidates.sort((a, b) => specificity(b) - specificity(a));
  const best = candidates[0]!.trim();

  // If best is still broad but we detected a subgenre, prefer subgenre
  if (BROAD.has(best.toLowerCase()) && detected.length) return detected[0]!;

  // Pair a strong subgenre with a different online tag when useful
  if (detected.length && online && !BROAD.has(online.toLowerCase())) {
    const d0 = detected[0]!;
    if (d0.toLowerCase() !== online.toLowerCase() && !online.toLowerCase().includes(d0.toLowerCase())) {
      // Keep the more specific single label rather than concatenating noise
      return specificity(d0) >= specificity(online) ? d0 : online;
    }
  }

  return best;
}

export function pickBestGenre(genres: string[]): string {
  const cleaned = genres.map((g) => (g || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  return [...cleaned].sort((a, b) => specificity(b) - specificity(a))[0] || "";
}
