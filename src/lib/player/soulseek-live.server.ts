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
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

function parseRangeHeader(range: string | null | undefined, total: number) {
  if (!range || !range.startsWith("bytes=") || total <= 0) return null;
  const spec = range.slice(6).split(",")[0]?.trim() || "";
  const [a, b] = spec.split("-");
  const start = a === "" ? 0 : Number(a);
  const end = b === "" || b == null ? total - 1 : Number(b);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return null;
  return { start: Math.min(start, total - 1), end: Math.min(end, total - 1) };
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
  const key = `${user}\0${pass}`;
  if (client && loginKey === key) return client;
  if (boot && loginKey === key) return boot;
  if (client) {
    try { client.destroy(); } catch {}
    client = null;
  }
  loginKey = key;
  boot = (async () => {
    const c = new (SlskClient as any)({ username: user, password: pass });
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

function mapResult(peer: string, file: any, speed: number, queue: number, free: boolean): SlsKFile | null {
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
  if (cached) return { state: "Completed", percent: 100, done: true, local: "", size: cached.buf.length, error: "" };
  if (!dl) return { state: "Queued", percent: 0, done: false, local: "", size: 0, error: lastError.get(k) || "" };
  const got = dl.chunks.reduce((s, c) => s + c.length, 0);
  const total = dl.size || got;
  const percent = total > 0 ? Math.min(99.9, (got / total) * 100) : 0;
  if (dl.failed) return { state: "Failed", percent, done: false, local: "", size: total, error: dl.failed.message };
  if (dl.done) return { state: "Completed", percent: 100, done: true, local: "", size: total, error: "" };
  return { state: "Transferring", percent, done: false, local: "", size: total, error: "" };
}

export async function liveStream(opts: {
  user?: string;
  pass?: string;
  account?: string;
  key?: string;
  peer: string;
  file?: string;
  filename?: string;
  size?: number;
  signal?: AbortSignal;
  range?: string | null | { start: number; end?: number };
}): Promise<Response> {
  const account = opts.account || opts.user || "";
  const key = opts.key || opts.pass || "";
  const peer = opts.peer;
  const filename = opts.filename || opts.file || "";
  const signal = opts.signal;
  const k = fileKey(peer, filename);
  const mime = mimeOf(filename);

  let rangeObj: { start: number; end?: number } | null = null;
  if (opts.range && typeof opts.range === "object" && "start" in opts.range) rangeObj = opts.range;

  const cached = cacheGet(k);
  if (cached) {
    const buf = cached.buf;
    const total = buf.length;
    if (!rangeObj && typeof opts.range === "string") rangeObj = parseRangeHeader(opts.range, total);
    if (rangeObj && rangeObj.start > 0) {
      const start = Math.min(rangeObj.start, total);
      const end = rangeObj.end != null ? Math.min(rangeObj.end, total - 1) : total - 1;
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

  if (!liveDls.has(k)) liveStart(account, key, peer, filename, opts.size || 0);
  const dl = liveDls.get(k)!;

  const startWait = Date.now();
  while (!dl.done && !dl.failed && dl.chunks.length === 0 && Date.now() - startWait < 25000) {
    if (signal?.aborted) return new Response("aborted", { status: 499 });
    await new Promise((r) => setTimeout(r, 100));
  }
  if (dl.failed && dl.chunks.length === 0) {
    return new Response(dl.failed.message || "download failed", { status: 502 });
  }

  const knownTotal = dl.size || 0;
  if (!rangeObj && typeof opts.range === "string") rangeObj = parseRangeHeader(opts.range, knownTotal || 1);
  const start = rangeObj?.start || 0;

  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      for (const chunk of dl.chunks) {
        const end = offset + chunk.length;
        if (end > start) controller.enqueue(chunk.subarray(Math.max(0, start - offset)));
        offset = end;
      }
      if (dl.done) {
        controller.close();
        return;
      }
      const onChunk = (chunk: Buffer | null, err?: Error) => {
        if (err) {
          try { controller.error(err); } catch {}
          dl.listeners.delete(onChunk);
          return;
        }
        if (chunk) {
          if (offset >= start) controller.enqueue(chunk);
          else if (offset + chunk.length > start) controller.enqueue(chunk.subarray(start - offset));
          offset += chunk.length;
        } else {
          try { controller.close(); } catch {}
          dl.listeners.delete(onChunk);
        }
      };
      dl.listeners.add(onChunk);
      signal?.addEventListener("abort", () => {
        dl.listeners.delete(onChunk);
        try { controller.close(); } catch {}
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
      headers["Content-Range"] = `bytes ${start}-${knownTotal - 1}/${knownTotal}`;
      headers["Content-Length"] = String(Math.max(0, knownTotal - start));
      return new Response(stream, { status: 206, headers });
    }
    headers["Content-Length"] = String(knownTotal);
  }
  return new Response(stream, { status: 200, headers });
}
