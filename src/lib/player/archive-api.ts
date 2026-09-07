import { createServerFn } from "@tanstack/react-start";
import {
  archiveCover,
  formatRank,
  isAudioFormat,
  isLosslessFormat,
  parseArchiveId,
  type IaHit,
  type IaTrack,
} from "./archive";

type Json = Record<string, unknown>;

function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function str(value: unknown): string {
  if (Array.isArray(value)) return value.map(str).filter(Boolean).join(", ");
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function yearOf(value: unknown) {
  const match = str(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? match[0] : "";
}

async function getJson(url: string): Promise<Json> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error("Internet Archive did not return JSON.");
  }
}

function pickFiles(files: Json[], preferLossy: boolean) {
  const audio = files.filter((file) => {
    const name = str(file.name);
    const format = str(file.format);
    if (!name || !isAudioFormat(format, name)) return false;
    if (/\.(png|jpg|jpeg|gif|xml|sqlite|m3u|txt|pdf|cue|log)$/i.test(name)) return false;
    if (/_spectrogram|_itemimage|thumb|sample/i.test(name)) return false;
    return true;
  });
  const byKey = new Map<string, Json>();
  for (const file of audio) {
    const name = str(file.name);
    const stem = name.replace(/\.[^.]+$/, "").replace(/_(64kb|vbr|128kb|320kb)$/i, "");
    const key = str(file.track) || stem.toLowerCase();
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, file);
      continue;
    }
    const nextRank = formatRank(str(file.format), name, preferLossy);
    const curRank = formatRank(str(current.format), str(current.name), preferLossy);
    if (nextRank > curRank) byKey.set(key, file);
  }
  return [...byKey.values()].sort((a, b) => {
    const ta = num(a.track);
    const tb = num(b.track);
    if (ta && tb && ta !== tb) return ta - tb;
    return str(a.name).localeCompare(str(b.name), undefined, { numeric: true });
  });
}

function mapHit(row: Json): IaHit | null {
  const identifier = str(row.identifier);
  if (!identifier) return null;
  return {
    identifier,
    title: str(row.title) || identifier,
    creator: str(row.creator) || str(row.artist) || "Unknown artist",
    year: yearOf(row.year || row.date),
    description: str(row.description).replace(/<[^>]+>/g, " ").slice(0, 280),
    cover: archiveCover(identifier),
    downloads: num(row.downloads),
  };
}

export const iaSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string; collection?: string }) => d)
  .handler(async ({ data }) => {
  const input = asJson(data);
  const q = str(input.q);
  const collection = str(input.collection);
  if (!q && !collection) return { hits: [] as IaHit[] };
  const parts = ["(mediatype:audio OR mediatype:etree)"];
  if (collection) parts.push(`collection:${collection}`);
  if (q) {
    const id = parseArchiveId(q);
    parts.push(id ? `identifier:${id}` : `(${q})`);
  }
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", parts.join(" AND "));
  url.searchParams.set("output", "json");
  url.searchParams.set("rows", "24");
  url.searchParams.set("page", "1");
  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "year");
  url.searchParams.append("fl[]", "date");
  url.searchParams.append("fl[]", "description");
  url.searchParams.append("fl[]", "downloads");
  url.searchParams.append("sort[]", "downloads desc");
  const json = await getJson(url.toString());
  const response = asJson(json.response);
  const docs = Array.isArray(response.docs) ? response.docs : [];
  const hits = docs.map((row) => mapHit(asJson(row))).filter((row): row is IaHit => Boolean(row));
  return { hits };
});

export const iaItem = createServerFn({ method: "POST" })
  .validator((d: { identifier?: string; q?: string; lossless?: boolean }) => d)
  .handler(async ({ data }) => {
  const input = asJson(data);
  const identifier = parseArchiveId(str(input.identifier) || str(input.q));
  if (!identifier) throw new Error("Paste an archive.org/details link or identifier.");
  const preferLossy = Boolean(input.lossy);
  const lossless = input.lossless !== false && !preferLossy;
  const json = await getJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  const meta = asJson(json.metadata);
  const files = Array.isArray(json.files) ? json.files.map(asJson) : [];
  const chosen = pickFiles(files, !lossless);
  if (chosen.length === 0) throw new Error("No playable audio on that Archive item.");
  const host = str(json.d1) || str(json.server);
  const dir = str(json.dir);
  const album = str(meta.title) || identifier;
  const artist = str(meta.creator) || str(meta.artist) || "Internet Archive";
  const year = yearOf(meta.year || meta.date);
  const genre = str(meta.subject).split(/[,;]/)[0]?.trim() || "";
  const note = str(meta.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600);
  const cover = archiveCover(identifier);
  const tracks: IaTrack[] = chosen.map((file, i) => {
    const filename = str(file.name);
    const encoded = filename.split("/").map(encodeURIComponent).join("/");
    const direct = host && dir ? `https://${host}${dir}/${encoded}` : "";
    const download = `https://archive.org/download/${encodeURIComponent(identifier)}/${encoded}`;
    const name = str(file.title) || filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    const format = str(file.format);
    const losslessFile = isLosslessFormat(format, filename);
    const label = losslessFile
      ? /wav|aiff/i.test(format) || /\.wav$/i.test(filename)
        ? "WAV"
        : "FLAC"
      : /ogg/i.test(format)
        ? "OGG"
        : "MP3";
    return {
      identifier,
      name,
      artist: str(file.artist) || artist,
      album,
      year,
      genre,
      note,
      cover,
      url: direct || download,
      format: label,
      lossless: losslessFile,
      trackNo: num(file.track) || i + 1,
      duration: num(file.length),
      bytes: num(file.size),
    };
  });
  return {
    identifier,
    title: album,
    creator: artist,
    year,
    description: note,
    cover,
    tracks,
  };
});