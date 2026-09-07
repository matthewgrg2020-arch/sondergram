import { createServerFn } from "@tanstack/react-start";
import type { AmTrack, AmTarget } from "./amazon";

type Json = Record<string, unknown>;

function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(value: unknown) {
  const text = str(value);
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

async function fetchText(url: string, cookie?: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/json",
      "User-Agent": "Mozilla/5.0 Sondergram",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  return { ok: res.ok, status: res.status, text: await res.text(), url: res.url };
}

function cookieFromArl(arl: string) {
  const raw = arl.trim();
  if (raw.includes("=") && raw.includes(";")) return raw;
  return `at-acbus=${raw}; at-main=${raw}`;
}

function decodeEntities(value: string) {
  return value
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function metaTag(html: string, key: string) {
  const prop = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const prop2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i");
  return decodeEntities(html.match(prop)?.[1] || html.match(prop2)?.[1] || "");
}

function jsonLd(html: string): Json[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: Json[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] || "") as unknown;
      if (Array.isArray(parsed)) parsed.forEach((row) => out.push(asJson(row)));
      else out.push(asJson(parsed));
    } catch {
      /* skip */
    }
  }
  return out;
}

function splitTitle(title: string) {
  const parts = title.split(/\s+[–—|-]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), album: parts.slice(1).join(" - ").replace(/\s*\(.*Amazon.*\)$/i, "").trim() };
  return { artist: "", album: title.replace(/\s*\(.*Amazon.*\)$/i, "").trim() };
}

async function itunesFill(artist: string, name: string, album: string) {
  try {
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", [artist, name || album].filter(Boolean).join(" "));
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", name ? "song" : "album");
    url.searchParams.set("limit", "8");
    const res = await fetch(url.toString());
    if (!res.ok) return [] as AmTrack[];
    const data = (await res.json()) as {
      results?: {
        trackId?: number;
        collectionId?: number;
        trackName?: string;
        collectionName?: string;
        artistName?: string;
        artworkUrl100?: string;
        previewUrl?: string;
        trackTimeMillis?: number;
        trackNumber?: number;
        discNumber?: number;
        releaseDate?: string;
        trackExplicitness?: string;
      }[];
    };
    return (data.results ?? []).map((row, i) => ({
      id: String(row.trackId || row.collectionId || `${name}-${i}`),
      name: row.trackName || name || row.collectionName || "Track",
      artist: row.artistName || artist,
      album: row.collectionName || album,
      year: yearOf(row.releaseDate),
      cover: (row.artworkUrl100 || "").replace(/\/\d+x\d+bb/, "/1200x1200bb"),
      preview: row.previewUrl || "",
      duration: row.trackTimeMillis ? Math.round(row.trackTimeMillis / 1000) : 0,
      trackNo: row.trackNumber || i + 1,
      diskNo: row.discNumber || 1,
      explicit: row.trackExplicitness === "explicit",
      source: "Amazon",
    }));
  } catch {
    return [];
  }
}

async function fromPage(url: string, cookie?: string): Promise<AmTrack[]> {
  const page = await fetchText(url, cookie);
  if (!page.ok) throw new Error("Amazon Music did not return that page.");
  const title = metaTag(page.text, "og:title") || metaTag(page.text, "twitter:title");
  const image = metaTag(page.text, "og:image");
  const desc = metaTag(page.text, "og:description");
  const split = splitTitle(title);
  const nodes = jsonLd(page.text);
  const tracks: AmTrack[] = [];
  for (const node of nodes) {
    const graph = Array.isArray(node["@graph"]) ? node["@graph"] : [node];
    for (const raw of graph) {
      const item = asJson(raw);
      const type = str(item["@type"]).toLowerCase();
      if (type.includes("musicrecording") || type.includes("song")) {
        const by = asJson(item.byArtist);
        tracks.push({
          id: str(item.isrc) || str(item.sku) || `${str(item.name)}-${tracks.length}`,
          name: str(item.name) || split.album,
          artist: str(by.name) || split.artist,
          album: str(asJson(item.inAlbum).name) || split.album,
          year: yearOf(item.datePublished),
          cover: str(asJson(item.image).url) || image,
          preview: str(item.audio) || str(item.url),
          duration: num(item.duration),
          trackNo: tracks.length + 1,
          diskNo: 1,
          explicit: false,
          source: "Amazon",
        });
      }
      if (type.includes("musicalbum")) {
        const by = asJson(item.byArtist);
        const artist = str(by.name) || split.artist;
        const album = str(item.name) || split.album;
        const filled = await itunesFill(artist, "", album);
        if (filled.length) return filled.map((t) => ({ ...t, cover: t.cover || image, source: "Amazon" }));
        tracks.push({
          id: str(item.sku) || album,
          name: album,
          artist,
          album,
          year: yearOf(item.datePublished),
          cover: image,
          preview: "",
          duration: 0,
          trackNo: 1,
          diskNo: 1,
          explicit: false,
          source: "Amazon",
        });
      }
    }
  }
  if (tracks.length) return tracks;
  const filled = await itunesFill(split.artist, "", split.album || desc);
  if (filled.length) return filled.map((t) => ({ ...t, cover: t.cover || image, source: "Amazon" }));
  if (!title) throw new Error("Could not read that Amazon Music link.");
  return [
    {
      id: url,
      name: split.album || title,
      artist: split.artist || "Amazon Music",
      album: split.album || title,
      year: "",
      cover: image,
      preview: "",
      duration: 0,
      trackNo: 1,
      diskNo: 1,
      explicit: false,
      source: "Amazon",
    },
  ];
}

export const amImport = createServerFn({ method: "POST" })
  .validator((d: { input?: string; arl?: string; target?: AmTarget }) => d)
  .handler(async ({ data }) => {
    const { parseAmazonInput } = await import("./amazon");
    const target = data.target || (data.input ? parseAmazonInput(data.input) : null);
    const arl = data.arl?.trim();
    const cookie = arl ? cookieFromArl(arl) : undefined;
    if (!target) throw new Error("Paste an Amazon Music album, artist, or playlist link.");
    if (target.kind === "search") {
      const hits = await itunesFill("", target.q, target.q);
      if (!hits.length) throw new Error("Nothing matched that Amazon search.");
      return { tracks: hits, count: hits.length, name: "Amazon" };
    }
    const path =
      target.kind === "album"
        ? `https://music.amazon.com/albums/${target.id}`
        : target.kind === "artist"
          ? `https://music.amazon.com/artists/${target.id}`
          : target.kind === "playlist"
            ? `https://music.amazon.com/playlists/${target.id}`
            : `https://music.amazon.com/tracks/${target.id}`;
    const tracks = await fromPage(path, cookie);
    for (const track of tracks) {
      if (!track.preview) {
        const filled = await itunesFill(track.artist, track.name, track.album);
        const match = filled.find((row) => row.name.toLowerCase() === track.name.toLowerCase()) || filled[0];
        if (match?.preview) track.preview = match.preview;
        if (!track.cover && match?.cover) track.cover = match.cover;
        if (!track.year && match?.year) track.year = match.year;
      }
    }
    return { tracks, count: tracks.length, name: tracks[0]?.artist || "Amazon" };
  });

export const amArlLibrary = createServerFn({ method: "POST" })
  .validator((d: { arl: string }) => d)
  .handler(async ({ data }) => {
    const arl = data.arl.trim();
    if (arl.length < 12) throw new Error("That ARL looks too short.");
    const cookie = cookieFromArl(arl);
    const page = await fetchText("https://music.amazon.com/library/albums", cookie);
    if (!page.ok || /signin|ap\/signin|auth-error/i.test(page.text.slice(0, 4000))) {
      throw new Error("Amazon did not accept that ARL. Copy a fresh at-acbus / at-main cookie while signed in.");
    }
    const titles = [...page.text.matchAll(/"title"\s*:\s*"([^"]{2,120})"/g)].map((m) => m[1]);
    const unique = [...new Set(titles.map((t) => decodeEntities(t)))].filter((t) => !/amazon music|library|playlist/i.test(t)).slice(0, 24);
    const tracks: AmTrack[] = [];
    for (const title of unique.slice(0, 12)) {
      const filled = await itunesFill("", "", title);
      tracks.push(...filled.slice(0, 8));
    }
    if (tracks.length === 0) {
      throw new Error("Signed in, but no albums were readable from that library page.");
    }
    return { tracks, count: tracks.length, name: "Amazon library" };
  });
