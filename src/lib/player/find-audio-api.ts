import { createServerFn } from "@tanstack/react-start";
import { audioExt, type FoundAudio } from "./find-audio";
import { parseArchiveId } from "./archive";

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

async function getJson(url: string): Promise<Json> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error("Search did not return JSON.");
  }
}

function archiveCover(id: string) {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

export const findAudioSearch = createServerFn({ method: "POST" })
  .validator((d: { q: string }) => d)
  .handler(async ({ data }) => {
    const q = data.q.trim();
    if (!q) return { hits: [] as FoundAudio[] };
    const hits: FoundAudio[] = [];
    const id = parseArchiveId(q);
    const iaQuery = [
      "(mediatype:audio OR mediatype:etree)",
      "(format:Flac OR format:MP3 OR format:WAVE OR format:\"VBR MP3\")",
      id ? `identifier:${id}` : `(${q})`,
    ].join(" AND ");
    const iaUrl = new URL("https://archive.org/advancedsearch.php");
    iaUrl.searchParams.set("q", iaQuery);
    iaUrl.searchParams.set("output", "json");
    iaUrl.searchParams.set("rows", "16");
    iaUrl.searchParams.append("fl[]", "identifier");
    iaUrl.searchParams.append("fl[]", "title");
    iaUrl.searchParams.append("fl[]", "creator");
    iaUrl.searchParams.append("fl[]", "year");
    iaUrl.searchParams.append("fl[]", "date");
    iaUrl.searchParams.append("sort[]", "downloads desc");
    try {
      const ia = await getJson(iaUrl.toString());
      const docs = Array.isArray(asJson(ia.response).docs) ? (asJson(ia.response).docs as Json[]) : [];
      for (const row of docs) {
        const identifier = str(row.identifier);
        if (!identifier) continue;
        hits.push({
          id: `ia:${identifier}`,
          name: str(row.title) || identifier,
          artist: str(row.creator) || "Internet Archive",
          album: str(row.title) || identifier,
          year: str(row.year) || str(row.date).slice(0, 4),
          cover: archiveCover(identifier),
          url: `https://archive.org/details/${identifier}`,
          format: "IA",
          lossless: true,
          source: "Internet Archive",
          duration: 0,
          trackNo: 1,
        });
      }
    } catch {
      /* archive optional */
    }

    try {
      const jam = await getJson(
        `https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&format=json&limit=16&search=${encodeURIComponent(q)}&include=musicinfo&audioformat=mp32`,
      );
      const headers = asJson(jam.headers);
      const results = Array.isArray(jam.results) ? (jam.results as Json[]) : [];
      if (str(headers.status) !== "failed") {
        for (const row of results) {
          const audio = str(row.audio);
          if (!audio) continue;
          const album = asJson(row.album);
          hits.push({
            id: `jm:${str(row.id)}`,
            name: str(row.name),
            artist: str(row.artist_name),
            album: str(album.name) || str(row.album_name),
            year: str(row.releasedate).slice(0, 4),
            cover: str(row.album_image) || str(row.image),
            url: audio,
            format: "MP3",
            lossless: false,
            source: "Jamendo",
            duration: num(row.duration),
            trackNo: num(row.position) || 1,
          });
        }
      }
    } catch {
      /* jamendo optional */
    }

    return { hits };
  });

export const scanAudioPage = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => d)
  .handler(async ({ data }) => {
    const input = data.url.trim();
    if (!/^https?:\/\//i.test(input)) throw new Error("Need a full http(s) link.");
    const direct = audioExt(input);
    if (direct) {
      return {
        hits: [
          {
            id: input,
            name: decodeURIComponent(input.split("/").pop()?.replace(/\.[^.]+$/, "") || "Audio"),
            artist: "",
            album: "",
            year: "",
            cover: "",
            url: input,
            format: direct,
            lossless: /flac|wav|aiff/i.test(direct),
            source: "Link",
            duration: 0,
            trackNo: 1,
          } satisfies FoundAudio,
        ],
      };
    }
    const res = await fetch(input, { headers: { Accept: "text/html" }, redirect: "follow" });
    if (!res.ok) throw new Error("That page could not be opened.");
    const html = await res.text();
    const base = new URL(res.url);
    const found = new Set<string>();
    const hits: FoundAudio[] = [];
    const add = (raw: string) => {
      try {
        const href = new URL(raw.replace(/&/g, "&"), base).toString();
        const format = audioExt(href);
        if (!format || found.has(href)) return;
        found.add(href);
        const file = decodeURIComponent(href.split("/").pop()?.split("?")[0] || "Audio");
        hits.push({
          id: href,
          name: file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
          artist: base.hostname.replace(/^www\./, ""),
          album: "",
          year: "",
          cover: "",
          url: href,
          format,
          lossless: /flac|wav|aiff/i.test(format),
          source: base.hostname.replace(/^www\./, ""),
          duration: 0,
          trackNo: hits.length + 1,
        });
      } catch {
        /* skip */
      }
    };
    for (const match of html.matchAll(/(?:href|src)=["']([^"']+\.(?:mp3|flac|wav|aiff|aif|ogg|oga|m4a|aac)(?:\?[^"']*)?)["']/gi)) {
      add(match[1]);
    }
    for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+?\.(?:mp3|flac|wav|aiff|ogg|m4a)(?:\?[^\s"'<>]*)?/gi)) {
      add(match[0]);
    }
    if (hits.length === 0) throw new Error("No MP3, FLAC, or WAV files were linked on that page.");
    return { hits: hits.slice(0, 40) };
  });
