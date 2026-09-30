import { createServerFn } from "@tanstack/react-start";
import { genreSlug, normalizeCover, parseBandcampUrl, type BcAlbum, type BcHit, type BcTrack } from "./bandcamp";

type Json = Record<string, unknown>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const row = asJson(value);
    return str(row.name || row.title || row["@value"] || row.content);
  }
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(value: unknown) {
  const match = str(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function decodeHtml(value: string) {
  const amp = String.fromCharCode(38);
  return value
    .replace(new RegExp(`${amp}quot;`, "gi"), '"')
    .replace(new RegExp(`${amp}#34;`, "g"), '"')
    .replace(new RegExp(`${amp}#39;`, "g"), "'")
    .replace(new RegExp(`${amp}apos;`, "gi"), "'")
    .replace(new RegExp(`${amp}lt;`, "gi"), "<")
    .replace(new RegExp(`${amp}gt;`, "gi"), ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(new RegExp(`${amp}amp;`, "gi"), "&");
}

function meta(html: string, key: string) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"));
  return decodeHtml(a?.[1] || b?.[1] || "");
}

async function fetchHtml(url: string, loose = false) {
  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": UA,
    Referer: "https://bandcamp.com/",
  };
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bandcamp returned ${res.status}.`);
  if (/cdn-cgi\/challenge|just a moment|attention required/i.test(text) && !/data-tralbum|bandcamp/i.test(text)) {
    throw new Error("Bandcamp blocked this request. Try the album link again.");
  }
  if (!loose && !/bandcamp|tralbum|MusicAlbum/i.test(text)) throw new Error("That page is not a Bandcamp album.");
  return { html: text, url: res.url };
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

function attrJson(html: string, name: string): Json | null {
  const re = new RegExp(`(?:^|[\\s])${name}="([^"]*)"`, "i");
  const match = html.match(re);
  if (!match?.[1]) return null;
  try {
    return asJson(JSON.parse(decodeHtml(match[1])));
  } catch {
    return null;
  }
}

function streamUrl(file: unknown) {
  if (!file) return "";
  if (typeof file === "string") return file.startsWith("//") ? `https:${file}` : file;
  const row = asJson(file);
  const mp3 =
    str(row["mp3-128"] || row["mp3-v0"] || row["mp3-320"] || row["mp3"] || row["streaming_url"] || row.url);
  if (!mp3) return "";
  return mp3.startsWith("//") ? `https:${mp3}` : mp3;
}

function durationOf(value: unknown) {
  const n = num(value);
  if (n > 0) return n > 1000 ? n / 1000 : n;
  const iso = str(value).match(/P(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!iso) return 0;
  return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
}

function ldTracks(ld: Json, artist: string, album: string, year: string, cover: string, tags: string[], note: string, pageUrl: string): BcTrack[] {
  const list = asJson(ld.track);
  const rows = Array.isArray(list.itemListElement)
    ? list.itemListElement
    : Array.isArray(ld.track)
      ? (ld.track as unknown[])
      : [];
  return rows.map((row, i) => {
    const item = asJson(asJson(row).item || row);
    const props = Array.isArray(item.additionalProperty) ? item.additionalProperty : [];
    const trackId =
      str(
        props.find((p) => str(asJson(p).name) === "track_id")
          ? asJson(props.find((p) => str(asJson(p).name) === "track_id") as Json).value
          : "",
      ) ||
      str(item["@id"]) ||
      `${pageUrl}#${i + 1}`;
    return {
      id: trackId,
      name: str(item.name) || `Track ${i + 1}`,
      artist: str(asJson(item.byArtist).name) || artist,
      album,
      year,
      genre: tags[1] || "Bandcamp",
      tags,
      cover,
      url: "",
      duration: durationOf(item.duration),
      trackNo: num(asJson(row).position) || i + 1,
      note,
      page: str(item["@id"] || item.mainEntityOfPage) || pageUrl,
    };
  });
}

function mapAlbum(html: string, pageUrl: string): BcAlbum {
  const tralbum = attrJson(html, "data-tralbum") || {};
  const embed = attrJson(html, "data-embed") || {};
  const ld = jsonLd(html).find((row) => /MusicAlbum|MusicRecording/i.test(str(row["@type"]))) || {};
  const current = asJson(tralbum.current);
  const artist =
    str(tralbum.artist) ||
    str(asJson(ld.byArtist).name) ||
    str(embed.artist) ||
    meta(html, "og:site_name") ||
    "Unknown artist";
  const album =
    str(current.title) ||
    str(ld.name) ||
    str(embed.album_title) ||
    str(tralbum.album_title) ||
    meta(html, "og:title").replace(/\s+\|\s+.*$/, "") ||
    "Untitled";
  const year = yearOf(current.release_date || tralbum.album_release_date || ld.datePublished);
  const cover = normalizeCover(
    str(ld.image) || meta(html, "og:image") || str(tralbum.artFullsizeUrl) || str(embed.album_art),
    tralbum.art_id || embed.art_id,
  );
  const note = str(current.about) || str(ld.description) || meta(html, "og:description");
  const keywords = str(ld.keywords)
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const tags = [...new Set(["Bandcamp", ...keywords])].slice(0, 8);
  const info = Array.isArray(tralbum.trackinfo) ? (tralbum.trackinfo as unknown[]) : [];
  let tracks: BcTrack[] = info.map((row, i) => {
    const item = asJson(row);
    const href = str(item.title_link);
    return {
      id: str(item.track_id) || `${pageUrl}#${i + 1}`,
      name: str(item.title) || `Track ${i + 1}`,
      artist: str(item.artist) || artist,
      album,
      year,
      genre: keywords[0] || "Bandcamp",
      tags,
      cover,
      url: streamUrl(item.file) || streamUrl(item.streaming_url) || streamUrl(item.file_mp3),
      duration: durationOf(item.duration),
      trackNo: num(item.track_num) || i + 1,
      note,
      page: href ? new URL(href, pageUrl).toString() : pageUrl,
    };
  });
  if (tracks.length === 0) tracks = ldTracks(ld, artist, album, year, cover, tags, note, pageUrl);
  if (tracks.length === 0 && /\/track\//i.test(pageUrl)) {
    tracks = [
      {
        id: pageUrl,
        name: album,
        artist,
        album,
        year,
        genre: keywords[0] || "Bandcamp",
        tags,
        cover,
        url: "",
        duration: 0,
        trackNo: 1,
        note,
        page: pageUrl,
      },
    ];
  }
  return { url: pageUrl, artist, album, year, cover, note, tags, tracks };
}

function albumLinks(html: string, pageUrl: string) {
  const origin = new URL(pageUrl).origin;
  const hrefs = [...html.matchAll(/href=["'](\/album\/[^"'?#]+)/gi)].map((m) => `${origin}${m[1]}`);
  return [...new Set(hrefs)].slice(0, 12);
}

async function loadAlbum(url: string): Promise<BcAlbum> {
  const page = await fetchHtml(url);
  const path = new URL(page.url).pathname;
  const isRelease = /\/(album|track)\//i.test(path);
  if (!isRelease) {
    const links = albumLinks(page.html, page.url);
    if (!links.length) throw new Error("No albums found on that Bandcamp page.");
    const albums: BcAlbum[] = [];
    for (const link of links) {
      try {
        albums.push(await loadAlbum(link));
      } catch {
        /* skip one */
      }
    }
    if (!albums.length) throw new Error("No albums found on that Bandcamp page.");
    return {
      url: page.url,
      artist: albums[0]!.artist,
      album: albums[0]!.artist,
      year: albums[0]!.year,
      cover: albums[0]!.cover,
      note: `Imported ${albums.length} Bandcamp albums.`,
      tags: ["Bandcamp"],
      tracks: albums.flatMap((a) => a.tracks),
    };
  }
  const album = mapAlbum(page.html, page.url);
  if (!album.tracks.length) throw new Error("No tracks found on that Bandcamp page.");
  return album;
}

async function searchHits(q: string): Promise<BcHit[]> {
  if (!q) return [];
  const res = await fetch("https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": UA,
      Referer: "https://bandcamp.com/search",
    },
    body: JSON.stringify({
      search_text: q,
      search_filter: "a",
      full_page: false,
      fan_id: null,
    }),
  });
  const body = asJson(await res.json().catch(() => ({})));
  const auto = asJson(body.auto);
  const rows = Array.isArray(auto.results) ? auto.results : Array.isArray(body.results) ? body.results : [];
  const hits: BcHit[] = [];
  for (const row of rows) {
    const item = asJson(row);
    const url = str(item.item_url_path || item.url || item.item_url);
    if (!url) continue;
    const kind = str(item.type) === "b" ? "artist" : str(item.type) === "t" ? "track" : "album";
    hits.push({
      url: url.startsWith("http") ? url : `https://${url.replace(/^\/\//, "")}`,
      title: str(item.name || item.item_title),
      artist: str(item.band_name || item.artist),
      cover: normalizeCover(str(item.img || item.image), item.art_id),
      kind,
    });
  }
  return hits.slice(0, 18);
}

function parseTagPageHits(html: string, label: string): BcHit[] {
  const hits: BcHit[] = [];
  const seen = new Set<string>();
  const push = (hit: BcHit) => {
    const key = hit.url.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    hits.push({ ...hit, genre: label });
  };

  const albumHrefs = [
    ...html.matchAll(/href=["'](https?:\/\/[^"']+\/album\/[^"'?#]+)/gi),
    ...html.matchAll(/href=["'](\/album\/[^"'?#]+)/gi),
  ];
  for (const m of albumHrefs) {
    let url = m[1] || "";
    if (url.startsWith("/")) url = `https://bandcamp.com${url}`;
    if (!/\/album\//i.test(url)) continue;
    push({
      url: url.replace(/\/$/, ""),
      title: "Album",
      artist: "",
      cover: "",
      kind: "album",
      genre: label,
    });
  }

  const cardRe =
    /href=["'](https?:\/\/[^"']+\.bandcamp\.com\/album\/[^"'?#]+)["'][^>]*>[\s\S]{0,400}?alt=["']([^"']+)["']/gi;
  let cm: RegExpExecArray | null;
  while ((cm = cardRe.exec(html))) {
    const url = (cm[1] || "").replace(/\/$/, "");
    const alt = decodeHtml(cm[2] || "");
    if (!url) continue;
    const existing = hits.find((h) => h.url === url);
    if (existing && existing.title === "Album" && alt) existing.title = alt;
    else
      push({
        url,
        title: alt || "Album",
        artist: "",
        cover: "",
        kind: "album",
        genre: label,
      });
  }

  const artRe =
    /href=["'](https?:\/\/[^"']+\.bandcamp\.com\/album\/[^"'?#]+)["'][\s\S]{0,600}?\/img\/a(\d+)_\d+\.jpg/gi;
  while ((cm = artRe.exec(html))) {
    const url = (cm[1] || "").replace(/\/$/, "");
    const artId = cm[2];
    const existing = hits.find((h) => h.url === url);
    if (existing && !existing.cover) existing.cover = normalizeCover("", artId);
  }

  // Result list items with band + title
  const listRe =
    /href=["'](https?:\/\/[^"']+\.bandcamp\.com\/album\/[^"'?#]+)["'][\s\S]{0,800}?<div[^>]*class=["'][^"']*itemtitle[^"']*["'][^>]*>([^<]+)<\/div>[\s\S]{0,400}?<div[^>]*class=["'][^"']*itemsubtext[^"']*["'][^>]*>([^<]+)/gi;
  while ((cm = listRe.exec(html))) {
    const url = (cm[1] || "").replace(/\/$/, "");
    const title = decodeHtml(cm[2] || "").trim();
    const artist = decodeHtml(cm[3] || "").trim();
    const existing = hits.find((h) => h.url === url);
    if (existing) {
      if (title) existing.title = title;
      if (artist) existing.artist = artist;
    } else if (url) {
      push({ url, title: title || "Album", artist, cover: "", kind: "album", genre: label });
    }
  }

  return hits;
}

/** Bandcamp dig_deeper API — returns structured album results for a tag. */
async function digDeeperPage(tag: string, page: number): Promise<BcHit[]> {
  try {
    const res = await fetch("https://bandcamp.com/api/discover/1/discover", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: `https://bandcamp.com/discover/${encodeURIComponent(tag)}`,
        Origin: "https://bandcamp.com",
      },
      body: JSON.stringify({
        category_id: 0,
        tag_norm_names: [tag],
        geoname_id: 0,
        slice: "top",
        time: "now",
        cursor: null,
        size: 48,
        include_result_types: ["a"],
        page,
      }),
    });
    if (!res.ok) {
      // fallback dig_deeper hub endpoint
      const res2 = await fetch("https://bandcamp.com/api/hub/2/dig_deeper", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": UA,
          Referer: `https://bandcamp.com/tag/${encodeURIComponent(tag)}`,
          Origin: "https://bandcamp.com",
        },
        body: JSON.stringify({
          filters: { format: "all", location: 0, sort: "pop", tags: [tag] },
          page,
        }),
      });
      if (!res2.ok) return [];
      const body2 = asJson(await res2.json().catch(() => ({})));
      return mapDigItems(body2, tag);
    }
    const body = asJson(await res.json().catch(() => ({})));
    return mapDigItems(body, tag);
  } catch {
    return [];
  }
}

function mapDigItems(body: Json, label: string): BcHit[] {
  const results = Array.isArray(body.results)
    ? body.results
    : Array.isArray(body.items)
      ? body.items
      : Array.isArray(asJson(body.data).results)
        ? (asJson(body.data).results as unknown[])
        : [];
  const hits: BcHit[] = [];
  for (const row of results) {
    const item = asJson(row);
    const band = asJson(item.band || item.artist);
    const url =
      str(item.item_url || item.url || item.tralbum_url) ||
      (str(item.band_url) && str(item.item_url_path)
        ? `${str(item.band_url).replace(/\/$/, "")}${str(item.item_url_path)}`
        : "");
    if (!url || !/\/album\//i.test(url)) continue;
    const full = url.startsWith("http") ? url : `https://${url.replace(/^\/\//, "")}`;
    hits.push({
      url: full.replace(/\/$/, ""),
      title: str(item.title || item.item_title || item.name) || "Album",
      artist: str(band.name || item.artist || item.band_name),
      cover: normalizeCover(str(item.art_url || item.image_url || item.img), item.art_id),
      kind: "album",
      genre: label,
    });
  }
  return hits;
}

/** Discover albums by Bandcamp tag / genre across multiple pages. */
async function discoverGenre(genre: string, page = 1, pageCount = 3): Promise<{ hits: BcHit[]; page: number; hasMore: boolean }> {
  const label = str(genre);
  if (!label) return { hits: [], page: 1, hasMore: false };
  const slug = genreSlug(label);
  const hits: BcHit[] = [];
  const seen = new Set<string>();

  const push = (hit: BcHit) => {
    const key = hit.url.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    hits.push({ ...hit, genre: label });
  };

  const start = Math.max(1, page);
  const end = start + Math.max(1, pageCount) - 1;

  // 1) dig_deeper / discover API pages (best structured results)
  for (let p = start; p <= end; p++) {
    const dig = await digDeeperPage(slug, p);
    for (const h of dig) push(h);
  }

  // 2) Tag HTML pages (bandcamp.com/tag/x?page=N)
  await Promise.all(
    Array.from({ length: end - start + 1 }, (_, i) => start + i).map(async (p) => {
      try {
        const qs = p <= 1 ? "" : `?page=${p}`;
        const pageRes = await fetchHtml(`https://bandcamp.com/tag/${encodeURIComponent(slug)}${qs}`, true);
        for (const h of parseTagPageHits(pageRes.html, label)) push(h);
      } catch {
        /* skip page */
      }
    }),
  );

  // 3) Search fallback only on first request if still thin
  if (start === 1 && hits.length < 12) {
    const searched = await searchHits(label);
    for (const hit of searched) push({ ...hit, genre: label });
  }

  const albums = hits.filter((h) => h.kind === "album");
  const rest = hits.filter((h) => h.kind !== "album");
  const ordered = [...albums, ...rest];
  // Assume more pages exist if we got a healthy batch
  const hasMore = ordered.length >= 8 || end < start + 8;
  return { hits: ordered, page: end, hasMore };
}

export const bcImport = createServerFn({ method: "POST" })
  .validator((d: { url?: string }) => d)
  .handler(async ({ data }) => {
    const url = parseBandcampUrl(data.url || "") || (data.url || "").trim();
    if (!url) throw new Error("Paste a Bandcamp album, track, or artist link.");
    return loadAlbum(url);
  });

export const bcSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string }) => d)
  .handler(async ({ data }) => ({ hits: await searchHits(str(data.q)) }));

export const bcDiscover = createServerFn({ method: "POST" })
  .validator((d: { genre?: string; page?: number; pageCount?: number }) => d)
  .handler(async ({ data }) => {
    const page = Math.max(1, Number(data.page) || 1);
    const pageCount = Math.min(5, Math.max(1, Number(data.pageCount) || 3));
    return discoverGenre(str(data.genre), page, pageCount);
  });

export const bcStream = createServerFn({ method: "POST" })
  .validator((d: { url?: string; id?: string; name?: string; artist?: string; album?: string }) => d)
  .handler(async ({ data }) => {
    let page = parseBandcampUrl(data.url || "") || "";
    if (page && !/\/(album|track)\//i.test(page) && !/bandcamp\.com/i.test(page)) page = "";
    if (!page || /bcbits\.com/i.test(page)) {
      const q = [str(data.artist), str(data.album) || str(data.name)].filter(Boolean).join(" ");
      const hits = await searchHits(q);
      const want = `${str(data.artist)} ${str(data.album)}`.toLowerCase();
      const hit =
        hits.find(
          (h) =>
            h.kind === "album" &&
            want &&
            `${h.artist} ${h.title}`.toLowerCase().includes(str(data.album).toLowerCase()),
        ) ||
        hits.find((h) => h.kind === "album") ||
        hits.find((h) => h.kind === "track") ||
        hits[0];
      if (!hit?.url) throw new Error("Couldn’t find that Bandcamp release.");
      page = hit.url;
    }
    const album = await loadAlbum(page);
    const id = str(data.id);
    const name = str(data.name).toLowerCase();
    const match =
      album.tracks.find((t) => t.id === id) ||
      album.tracks.find((t) => t.name.toLowerCase() === name) ||
      album.tracks.find((t) => name && t.name.toLowerCase().includes(name)) ||
      album.tracks[0];
    if (!match?.url) throw new Error("Bandcamp has no stream for that track.");
    return {
      url: match.url,
      duration: match.duration,
      cover: match.cover || album.cover,
      page: match.page || album.url,
    };
  });
