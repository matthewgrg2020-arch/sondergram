// @ts-nocheck
import { FileAttribute, SlskClient } from "slsk-client";
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
  startedAt: number;
};

const tickets = new Map<string, Ticket>();
const cache = new Map<string, Cached>();
const liveDls = new Map<string, LiveDl>();
const lastError = new Map<string, string>();

let client: any = null;
let loginKey = "";
let boot: Promise<any> | null = null;

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
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function issueTicket(user: string, pass: string) {
  const ticket = `${user}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  tickets.set(ticket, { user, pass });
  return ticket;
}

export function dropLive(name?: string) {
  if (name) {
    for (const [k, t] of tickets) {
      if (t.user === name) tickets.delete(k);
    }
    if (client?.username === name) {
      try { client.destroy(); } catch {}
      client = null;
      loginKey = "";
      boot = null;
    }
    return;
  }
  tickets.clear();
  if (client) {
    try { client.destroy(); } catch {}
  }
  client = null;
  loginKey = "";
  boot = null;
}

async function ensureClient(user: string, pass: string) {
  if (!user || !pass) throw new Error("Enter your Soulseek username and password.");
  const key = `${user}\0${pass}`;
  if (client && loginKey === key) return client;
  if (boot && loginKey === key) return boot;
  if (client) {
    try { client.destroy(); } catch {}
    client = null;
  }
  loginKey = key;
  boot = (async () => {
    const c = new (SlskClient as any)({ username: String(user), password: String(pass) });
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
  const bitRate = Number(attrs[FileAttribute?.Bitrate ?? 0] || attrs.bitrate || file.bitRate || 0);
  const length = Number(attrs[FileAttribute?.Duration ?? 1] || attrs.duration || file.length || 0);
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

export async function liveSearch(user: string, pass: string, q: string) {
  const c = await ensureClient(user, pass);
  const results: any[] = await new Promise((resolve, reject) => {
    const hits: any[] = [];
    const timer = setTimeout(() => resolve(hits), 12000);
    try {
      c.search(q, (res: any) => hits.push(res));
      setTimeout(() => {
        clearTimeout(timer);
        resolve(hits);
      }, 11000);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
  const out: any[] = [];
  for (const res of results) {
    const peer = String(res.username || res.user || "");
    const speed = Number(res.speed || res.avgSpeed || 0);
    const queue = Number(res.queueSize || res.queue || 0);
    const free = Boolean(res.freeUploadSlots ?? res.slotsFree ?? true);
    for (const f of res.files || res.fileList || []) {
      const mapped = mapResult(peer, f, speed, queue, free);
      if (mapped) out.push(mapped);
    }
  }
  out.sort((a, b) => {
    const aMp3 = /mp3/i.test(a.ext) ? 0 : a.lossless ? 2 : 1;
    const bMp3 = /mp3/i.test(b.ext) ? 0 : b.lossless ? 2 : 1;
    if (aMp3 !== bMp3) return aMp3 - bMp3;
    if (a.free !== b.free) return a.free ? -1 : 1;
    return b.bitRate - a.bitRate || a.queue - b.queue || a.size - b.size;
  });
  return out.slice(0, 400);
}

export async function liveFolder(user: string, pass: string, peer: string, folder: string, q?: string) {
  const hits = await liveSearch(
    user,
    pass,
    q || folder.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join(" "),
  );
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
      const stream = await c.download(peer, filename);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (chunk == null) continue;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer | string);
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
    return { done: true, size: cached.buf.length, percent: 100, error: "" };
  }
  if (!dl) {
    return { done: false, size: 0, percent: 0, error: lastError.get(k) || "" };
  }
  const got = dl.chunks.reduce((n, b) => n + b.length, 0);
  const total = dl.size || got;
  return {
    done: dl.done,
    size: got,
    percent: total ? Math.min(100, Math.round((got / total) * 100)) : 0,
    error: dl.failed?.message || "",
  };
}

export function liveStream(peer: string, filename: string, rangeHeader?: string) {
  const k = fileKey(peer, filename);
  const cached = cacheGet(k);
  if (cached) {
    return rangeResponse(cached.buf, cached.mime, rangeHeader);
  }
  const dl = liveDls.get(k);
  if (!dl) {
    return new Response("Not found", { status: 404 });
  }
  const mime = dl.mime;
  let start = 0;
  let end: number | null = null;
  if (rangeHeader?.startsWith("bytes=")) {
    const part = rangeHeader.slice(6);
    const [a, b] = part.split("-");
    start = parseInt(a || "0", 10) || 0;
    if (b) end = parseInt(b, 10);
  }
  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      const pushExisting = () => {
        for (const chunk of dl.chunks) {
          const next = offset + chunk.length;
          if (next <= start) {
            offset = next;
            continue;
          }
          let slice = chunk;
          if (offset < start) {
            slice = chunk.subarray(start - offset);
            offset = start;
          }
          if (end != null && offset + slice.length > end + 1) {
            slice = slice.subarray(0, end + 1 - offset);
          }
          if (slice.length) controller.enqueue(slice);
          offset += chunk.length;
          if (end != null && offset > end) {
            controller.close();
            return true;
          }
        }
        return false;
      };
      if (pushExisting()) return;
      if (dl.done) {
        controller.close();
        return;
      }
      const onChunk = (chunk: Buffer | null, err?: Error) => {
        if (err) {
          try { controller.error(err); } catch {}
          return;
        }
        if (chunk == null) {
          try { controller.close(); } catch {}
          return;
        }
        let slice = chunk;
        const next = offset + chunk.length;
        if (next <= start) {
          offset = next;
          return;
        }
        if (offset < start) {
          slice = chunk.subarray(start - offset);
          offset = start;
        }
        if (end != null && offset + slice.length > end + 1) {
          slice = slice.subarray(0, end + 1 - offset);
        }
        if (slice.length) {
          try { controller.enqueue(slice); } catch {}
        }
        offset += chunk.length;
        if (end != null && offset > end) {
          try { controller.close(); } catch {}
          dl.listeners.delete(onChunk);
        }
      };
      dl.listeners.add(onChunk);
    },
  });
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (dl.size) {
    const knownTotal = dl.size;
    if (rangeHeader?.startsWith("bytes=")) {
      const endByte = end != null ? end : knownTotal - 1;
      headers["Content-Range"] = `bytes ${start}-${endByte}/${knownTotal}`;
      headers["Content-Length"] = String(Math.max(0, endByte - start + 1));
      return new Response(stream, { status: 206, headers });
    }
    headers["Content-Length"] = String(knownTotal);
  }
  return new Response(stream, { status: 200, headers });
}

function rangeResponse(buf: Buffer, mime: string, rangeHeader?: string) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }
  const part = rangeHeader.slice(6);
  const [a, b] = part.split("-");
  const start = parseInt(a || "0", 10) || 0;
  const end = b ? parseInt(b, 10) : buf.length - 1;
  const slice = buf.subarray(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(slice.length),
      "Content-Range": `bytes ${start}-${end}/${buf.length}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
