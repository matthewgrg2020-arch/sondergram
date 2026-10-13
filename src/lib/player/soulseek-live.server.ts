import { FileAttribute, SlskClient, type SearchResult } from "slsk-client";
import { fileExt, isAudioFile, parseSlskFilename, type SlskFile } from "./soulseek";

const MAX_BYTES = 420_000_000;
const CACHE_LIMIT = 4;
const CACHE_MAX = 80_000_000;

type Ticket = { user: string; pass: string };
type Cached = { buf: Buffer; mime: string; at: number };

type LiveDl = {
  chunks: Buffer[];
  size: number;
  mime: string;
  done: boolean;
  failed: Error | null;
  listeners: Set<(chunk: Buffer | null, err?: Error) => void>;
  cancel?: () => void;
  startedAt: number;
};

const tickets = new Map<string, Ticket>();
const cache = new Map<string, Cached>();
const liveDls = new Map<string, LiveDl>();
const lastError = new Map<string, string>();

let client: SlskClient | null = null;
let loginKey = "";
let boot: Promise<SlskClient> | null = null;

function mimeOf(filename: string) {
  const ext = fileExt(filename).toLowerCase();
  if (ext === "flac") return "audio/flac";
  if (ext === "wav" || ext === "aiff" || ext === "aif") return "audio/wav";
  if (ext === "m4a" || ext === "aac" || ext === "alac") return "audio/mp4";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  if (ext === "wma") return "audio/x-ms-wma";
  return "audio/mpeg";
}

function fileKey(peer: string, file: string) {
  return `${peer}|${file}`;
}

function sameFile(a: string, b: string) {
  if (a === b) return true;
  const left = a.replace(/\\/g, "/");
  const right = b.replace(/\\/g, "/");
  if (left === right) return true;
  const name = right.split("/").pop() || "";
  return Boolean(name) && left.endsWith("/" + name);
}

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cachePut(key: string, buf: Buffer, mime: string) {
  if (buf.length > CACHE_MAX) return;
  cache.set(key, { buf, mime, at: Date.now() });
  while (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

export function issueTicket(user: string, pass: string) {
  for (const [id, row] of tickets) {
    if (row.user === user && row.pass === pass) return id;
  }
  const id = crypto.randomUUID();
  tickets.set(id, { user, pass });
  if (tickets.size > 20) {
    const first = tickets.keys().next().value;
    if (first) tickets.delete(first);
  }
  return id;
}

export function ticketSession(id: string) {
  return tickets.get(id) || null;
}

export function dropLive(user?: string) {
  if (user) {
    for (const [id, row] of tickets) {
      if (row.user === user) tickets.delete(id);
    }
    if (client?.username === user) {
      try {
        client.destroy();
      } catch {}
      client = null;
      loginKey = "";
      boot = null;
    }
    return;
  }
  tickets.clear();
  if (client) {
    try {
      client.destroy();
    } catch {}
  }
  client = null;
  loginKey = "";
  boot = null;
}

async function ensureClient(user: string, pass: string): Promise<SlskClient> {
  const key = `${user}\0${pass}`;
  if (client && loginKey === key) return client;
  if (boot && loginKey === key) return boot;
  if (client) {
    try {
      client.destroy();
    } catch {}
    client = null;
  }
  loginKey = key;
  boot = (async () => {
    const c = new (SlskClient as any)({
      username: user,
      password: pass,
    });
    await c.login();
    client = c;
    return c;
  })();
  try {
    return await boot;
  } catch (err) {
    boot = null;
    loginKey = "";
    client = null;
    throw err;
  }
}

export async function liveConnect(user: string, pass: string) {
  const c = await ensureClient(user, pass);
  const ticket = issueTicket(user, pass);
  return { name: c.username || user, ticket };
}

function mapResult(peer: string, file: any, speed: number, queue: number, free: boolean): SlskFile | null {
  const filename = String(file.filename || file.Filename || "");
  if (!filename || !isAudioFile(filename)) return null;
  if (file.locked || file.isLocked) return null;
  const size = Number(file.size || file.Size || 0);
  if (size > MAX_BYTES) return null;
  const parsed = parseSlskFilename(filename);
  const ext = fileExt(filename);
  const attrs = file.attrs || file.attributes || {};
  let bitRate = Number(attrs[FileAttribute?.Bitrate ?? 0] || attrs.bitrate || file.bitRate || 0);
  let length = Number(attrs[FileAttribute?.Duration ?? 1] || attrs.duration || file.length || 0);
  return {
    username: peer,
    filename,
    size,
    bitRate,
    length,
    ext,
    name: parsed.name,
    artist: parsed.artist,
    album: parsed.album,
    lossless: /flac|alac|wav|aiff/i.test(ext),
    locked: false,
    speed,
    queue,
    free,
    folder: parsed.folder,
    trackNo: parsed.trackNo,
    year: parsed.year,
  };
}

export async function liveSearch(user: string, pass: string, q: string): Promise<SlskFile[]> {
  const c = await ensureClient(user, pass);
  const results: SearchResult[] = await new Promise((resolve, reject) => {
    const hits: SearchResult[] = [];
    const timer = setTimeout(() => resolve(hits), 12000);
    try {
      c.search(q, (res: SearchResult) => {
        hits.push(res);
      });
      setTimeout(() => {
        clearTimeout(timer);
        resolve(hits);
      }, 11000);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
  const out: SlskFile[] = [];
  for (const res of results) {
    const peer = String((res as any).username || (res as any).user || "");
    const speed = Number((res as any).speed || (res as any).avgSpeed || 0);
    const queue = Number((res as any).queueSize || (res as any).queue || 0);
    const free = Boolean((res as any).freeUploadSlots ?? (res as any).slotsFree ?? true);
    const files = (res as any).files || (res as any).fileList || [];
    for (const f of files) {
      const mapped = mapResult(peer, f, speed, queue, free);
      if (mapped) out.push(mapped);
    }
  }
  // Prefer MP3/lossy for faster starts
  out.sort((a, b) => {
    const aMp3 = /mp3/i.test(a.ext) ? 0 : a.lossless ? 2 : 1;
    const bMp3 = /mp3/i.test(b.ext) ? 0 : b.lossless ? 2 : 1;
    if (aMp3 !== bMp3) return aMp3 - bMp3;
    if (a.free !== b.free) return a.free ? -1 : 1;
    return b.bitRate - a.bitRate || a.queue - b.queue || a.size - b.size;
  });
  return out.slice(0, 400);
}

export async function liveFolder(
  user: string,
  pass: string,
  peer: string,
  folder: string,
  q?: string,
): Promise<SlskFile[]> {
  const hits = await liveSearch(user, pass, q || folder.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join(" "));
  const norm = folder.replace(/\\/g, "/").toLowerCase();
  return hits.filter((h) => {
    if (h.username !== peer) return false;
    const f = (h.folder || h.filename).replace(/\\/g, "/").toLowerCase();
    return f.includes(norm) || norm.includes(f);
  });
}

export function liveStart(account: string, key: string, peer: string, filename: string, size = 0) {
  const k = fileKey(peer, filename);
  if (liveDls.has(k)) return;
  const dl: LiveDl = {
    chunks: [],
    size,
    mime: mimeOf(filename),
    done: false,
    failed: null,
    listeners: new Set(),
    startedAt: Date.now(),
  };
  liveDls.set(k, dl);
  void (async () => {
    try {
      const c = await ensureClient(account, key);
      const stream = await (c as any).download(peer, filename);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buf);
        dl.chunks = chunks;
        for (const fn of dl.listeners) fn(buf);
      }
      dl.done = true;
      const full = Buffer.concat(chunks);
      dl.size = full.length;
      cachePut(k, full, dl.mime);
      for (const fn of dl.listeners) fn(null);
    } catch (err) {
      dl.failed = err instanceof Error ? err : new Error(String(err));
      lastError.set(k, dl.failed.message);
      for (const fn of dl.listeners) fn(null, dl.failed);
    }
  })();
}

export function liveStatus(peer: string, filename: string) {
  const k = fileKey(peer, filename);
  const dl = liveDls.get(k);
  const cached = cacheGet(k);
  if (cached) {
    return { state: "Completed", percent: 100, done: true, local: "", size: cached.buf.length, error: "" };
  }
  if (!dl) {
    return { state: "Queued", percent: 0, done: false, local: "", size: 0, error: lastError.get(k) || "" };
  }
  const got = dl.chunks.reduce((s, c) => s + c.length, 0);
  const total = dl.size || got;
  const percent = total > 0 ? Math.min(99.9, (got / total) * 100) : 0;
  if (dl.failed) return { state: "Failed", percent, done: false, local: "", size: total, error: dl.failed.message };
  if (dl.done) return { state: "Completed", percent: 100, done: true, local: "", size: total, error: "" };
  return { state: "Transferring", percent, done: false, local: "", size: total, error: "" };
}

export async function liveStream(opts: {
  account: string;
  key: string;
  peer: string;
  filename: string;
  size?: number;
  signal?: AbortSignal;
  range?: { start: number; end?: number };
}): Promise<Response> {
  const { account, key, peer, filename, signal, range } = opts;
  const k = fileKey(peer, filename);
  const mime = mimeOf(filename);

  const cached = cacheGet(k);
  if (cached) {
    const buf = cached.buf;
    const total = buf.length;
    if (range && range.start > 0) {
      const start = Math.min(range.start, total);
      const end = range.end != null ? Math.min(range.end, total - 1) : total - 1;
      const slice = buf.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!liveDls.has(k)) {
    liveStart(account, key, peer, filename, opts.size || 0);
  }
  const dl = liveDls.get(k)!;

  // Wait briefly for first bytes
  const startWait = Date.now();
  while (!dl.done && !dl.failed && dl.chunks.length === 0 && Date.now() - startWait < 25000) {
    if (signal?.aborted) return new Response("aborted", { status: 499 });
    await new Promise((r) => setTimeout(r, 100));
  }
  if (dl.failed && dl.chunks.length === 0) {
    return new Response(dl.failed.message || "download failed", { status: 502 });
  }

  const knownTotal = dl.size || 0;
  let sent = 0;
  const start = range?.start || 0;

  const stream = new ReadableStream({
    start(controller) {
      // Send already-buffered data from offset
      let offset = 0;
      for (const chunk of dl.chunks) {
        const end = offset + chunk.length;
        if (end > start) {
          const sliceFrom = Math.max(0, start - offset);
          const part = chunk.subarray(sliceFrom);
          controller.enqueue(part);
          sent += part.length;
        }
        offset = end;
      }
      if (dl.done) {
        controller.close();
        return;
      }
      const onChunk = (chunk: Buffer | null, err?: Error) => {
        if (err) {
          try {
            controller.error(err);
          } catch {}
          dl.listeners.delete(onChunk);
          return;
        }
        if (chunk) {
          // Simple path: if we already passed start, send all new chunks
          if (offset >= start) {
            controller.enqueue(chunk);
            sent += chunk.length;
          } else if (offset + chunk.length > start) {
            const part = chunk.subarray(start - offset);
            controller.enqueue(part);
            sent += part.length;
          }
          offset += chunk.length;
        } else {
          try {
            controller.close();
          } catch {}
          dl.listeners.delete(onChunk);
        }
      };
      dl.listeners.add(onChunk);
      signal?.addEventListener("abort", () => {
        dl.listeners.delete(onChunk);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": dl.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  if (knownTotal > 0) {
    if (start > 0) {
      const end = knownTotal - 1;
      headers["Content-Range"] = `bytes ${start}-${end}/${knownTotal}`;
      headers["Content-Length"] = String(Math.max(0, knownTotal - start));
      return new Response(stream, { status: 206, headers });
    }
    headers["Content-Length"] = String(knownTotal);
  }
  return new Response(stream, { status: 200, headers });
}
