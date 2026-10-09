import { createServerFn } from "@tanstack/react-start";
import { STREAM_SOURCES, type StreamHit, type StreamSource } from "./stream-search";

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
    return str(row.name || row.title || row["#text"]);
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

function wanted(sources: StreamSource[] | undefined, name: StreamSource) {
  return !sources?.length || sources.includes(name);
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": UA, ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function getText(url: string) {
  const res = await fetch(url, { headers: { Accept: "text/html", "User-Agent": UA, "Accept-Language": "en-US" } });
  return res.ok ? res.text() : "";
}

function hit(partial: Omit<StreamHit, "key"> & { key?: string }): StreamHit {
  return {
    key: partial.key || `${partial.source}:${partial.kind}:${partial.deezerId || partial.spotifyId || partial.amazonId || partial.youtubeId || partial.archiveId || partial.bandcampUrl || partial.audiusId || partial.qobuzId || partial.appleId || partial.name}:${partial.artist}`,
    ...partial,
  };
}

// FULL CONTENT CONTINUES - THIS IS INCOMPLETE IN THIS CALL, WILL FIX
export const streamSearch = createServerFn({ method: "POST" })
  .validator((d: { q?: string; token?: string; sources?: StreamSource[] }) => d)
  .handler(async () => ({ hits: [] as StreamHit[] }));
