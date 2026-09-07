export type LyricLine = { t: number; text: string };

export type Lyrics = {
  plain: string;
  synced: LyricLine[];
};

const cache = new Map<string, Lyrics | null>();

function keyOf(artist: string, title: string) {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function parseSynced(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of raw.split("\n")) {
    const match = row.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
    if (!match) continue;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const frac = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ t: min * 60 + sec + frac / 1000, text });
  }
  return lines;
}

export async function fetchLyrics(artist: string, title: string): Promise<Lyrics | null> {
  const key = keyOf(artist, title);
  if (cache.has(key)) return cache.get(key) ?? null;
  if (!artist.trim() || !title.trim()) {
    cache.set(key, null);
    return null;
  }
  try {
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("artist_name", artist);
    url.searchParams.set("track_name", title);
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as { plainLyrics?: string; syncedLyrics?: string };
    const plain = (data.plainLyrics ?? "").trim();
    const synced = data.syncedLyrics ? parseSynced(data.syncedLyrics) : [];
    if (!plain && synced.length === 0) {
      cache.set(key, null);
      return null;
    }
    const lyrics = { plain: plain || synced.map((l) => l.text).join("\n"), synced };
    cache.set(key, lyrics);
    return lyrics;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function activeLine(synced: LyricLine[], time: number) {
  let i = 0;
  for (let n = 0; n < synced.length; n += 1) {
    if (synced[n].t <= time) i = n;
  }
  return i;
}