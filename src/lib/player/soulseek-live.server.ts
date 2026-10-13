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
      } catch {
        /* ignore */
      }
      client = null;
      loginKey = "";
    }
    return;
  }
  tickets.clear();
  if (client) {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
  }
  client = null;
  loginKey = "";
}

async function connect(user: string, pass: string) {
  const key = `${user}\0${pass}`;
  if (client && loginKey === key) return client;
  if (boot) return boot;
  boot = (async () => {
    if (client) {
      try {
        client.destroy();
      } catch {
        /* ignore */
      }
      client = null;
    }
    const next = new SlskClient({
      timeout: 15000,
    });
    try {
      await next.login(user, pass);
    } catch (err) {
      try {
        next.destroy();
      } catch {
        /* ignore */
      }
      const text = err instanceof Error ? err.message : String(err || "");
      const lower = text.toLowerCase();
      const bad =
        /login\s*refus/i.test(text) ||
        /invalid\s*(user|pass|credential)/i.test(text) ||
        /wrong\s*(user|pass)/i.test(text) ||
        /bad\s*password/i.test(text) ||
        /unknown\s*user/i.test(text);
      throw new Error(bad ? "Soulseek did not accept that username or password." : text || "Could not sign in to Soulseek.");
    }
    client = next;
    loginKey = key;
    return next;
  })();
  try {
    return await boot;
  } finally {
    boot = null;
  }
}

export async function liveConnect(user: string, pass: string) {
  const name = user.trim();
  const secret = pass.trim();
  if (!name || !secret) throw new Error("Enter your Soulseek username and password.");
  await connect(name, secret);
  return { ticket: issueTicket(name, secret), name };
}

export function mapLiveHit(row: SearchResult): SlskFile | null {
  const filename = row.file || "";
  if (!filename || !isAudioFile(filename)) return null;
  const parsed = parseSlskFilename(filename);
  const ext = fileExt(filename);
  const bitRate = Number(row.attribs[FileAttribute.Bitrate] ?? row.attribs[0] ?? 0) || 0;
  const length = Number(row.attribs[FileAttribute.Duration] ?? row.attribs[1] ?? 0) || 0;
  return {
    username: row.user,
    filename,
    size: row.size || 0,
    bitRate,
    length,
    ext,
    name: parsed.name,
    artist: parsed.artist,
    album: parsed.album,
    lossless: /flac|alac|wav|aiff/i.test(ext),
    locked: false,
    speed: row.speed || 0,
    queue: row.queueLength || 0,
    free: Boolean(row.slots),
    folder: parsed.folder,
    trackNo: parsed.trackNo,
    year: parsed.year,
  };
}

export async function liveSearch(user: string, pass: string, q: string) {
  const clientNow = await connect(user, pass);
  const rows = await clientNow.search({ req: q, timeout: 7000 });
  const hits: SlskFile[] = [];
  for (const row of rows) {
    const mapped = mapLiveHit(row);
    if (mapped) hits.push(mapped);
  }
  hits.sort((a, b) => {
    // Prefer lossy/MP3 (faster start) over large lossless by default
    const aMp3 = /mp3/i.test(a.ext) ? 0 : a.lossless ? 2 : 1;
    const bMp3 = /mp3/i.test(b.ext) ? 0 : b.lossless ? 2 : 1;
    if (aMp3 !== bMp3) return aMp3 - bMp3;
    if (a.free !== b.free) return a.free ? -1 : 1;
    const aHuge = a.size > 40_000_000;
    const bHuge = b.size > 40_000_000;
    if (aHuge !== bHuge) return aHuge ? 1 : -1;
    return b.bitRate - a.bitRate || a.queue - b.queue || a.size - b.size;
  });
  const seen = new Set<string>();
  return hits
    .filter((hit) => {
      const key = `${hit.username}|${hit.filename}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 400);
}

export async function liveFolder(user: string, pass: string, peer: string, folder: string, q: string) {
  const rows = await liveSearch(user, pass, q || folder.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join(" "));
  const want = folder.replace(/\\/g, "/").toLowerCase();
  return rows.filter((hit) => {
    if (hit.username !== peer) return false;
    const have = (hit.folder || "").replace(/\\/g, "/").toLowerCase();
    return have === want || have.endsWith("/" + want) || want.endsWith("/" + have);
  });
}

function ensureDownload(
  user: string,
  pass: string,
  peer: string,
  file: string,
  size: number,
  signal?: AbortSignal,
): LiveDl {
  const key = fileKey(peer, file);
  const existing = liveDls.get(key);
  if (existing && !existing.failed) return existing;

  const mime = mimeOf(file);
  const dl: LiveDl = {
    chunks: [],
    size: size || 0,
    mime,
    done: false,
    failed: null,
    listeners: new Set(),
    startedAt: Date.now(),
  };
  liveDls.set(key, dl);

  (async () => {
    try {
      if (size > MAX_BYTES) throw new Error("That Soulseek file is over 400 MB. Pick a smaller copy (MP3 or FLAC).");
      const c = await connect(user, pass);
      const stream = await c.download({ file: { user: peer, file }, timeout: 120000 });
      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error("Aborted");
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
        dl.chunks.push(buf);
        for (const fn of dl.listeners) fn(buf);
      }
      dl.done = true;
      const full = Buffer.concat(dl.chunks);
      cachePut(key, full, mime);
      for (const fn of dl.listeners) fn(null);
    } catch (err) {
      dl.failed = err instanceof Error ? err : new Error(String(err));
      lastError.set(key, dl.failed.message);
      for (const fn of dl.listeners) fn(null, dl.failed);
    }
  })();

  return dl;
}

export function liveStart(user: string, pass: string, peer: string, file: string, size: number) {
  ensureDownload(user, pass, peer, file, size);
  return { ok: true };
}

export function liveStatus(peer: string, file: string) {
  const key = fileKey(peer, file);
  const cached = cacheGet(key);
  if (cached) return { state: "Completed", percent: 100, done: true, local: "", size: cached.buf.length, error: "" };
  const dl = liveDls.get(key);
  if (!dl) return { state: "Queued", percent: 0, done: false, local: "", size: 0, error: lastError.get(key) || "" };
  if (dl.failed) return { state: "Failed", percent: 0, done: false, local: "", size: dl.size, error: dl.failed.message };
  const got = dl.chunks.reduce((n, b) => n + b.length, 0);
  const total = dl.size || got;
  const percent = total > 0 ? Math.min(99.9, (got / total) * 100) : 0;
  return { state: dl.done ? "Completed" : "Transferring", percent: dl.done ? 100 : percent, done: dl.done, local: "", size: total, error: "" };
}

export async function liveStream(
  user: string,
  pass: string,
  peer: string,
  file: string,
  size: number,
  rangeHeader?: string | null,
): Promise<Response> {
  const key = fileKey(peer, file);
  const cached = cacheGet(key);
  if (cached) {
    const buf = cached.buf;
    const total = buf.length;
    if (rangeHeader) {
      const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : total - 1;
        const slice = buf.subarray(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            "Content-Type": cached.mime,
            "Content-Length": String(slice.length),
            "Content-Range": `bytes ${start}-${start + slice.length - 1}/${total}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store",
          },
        });
      }
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": cached.mime,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const dl = ensureDownload(user, pass, peer, file, size);
  const knownTotal = size || dl.size || 0;

  let start = 0;
  let end = knownTotal > 0 ? knownTotal - 1 : Infinity;
  let isRange = false;
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (m) {
      isRange = true;
      start = Number(m[1]);
      if (m[2]) end = Number(m[2]);
    }
  }

  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const onChunk = (chunk: Buffer | null, err?: Error) => {
        if (err) {
          try {
            controller.error(err);
          } catch {
            /* closed */
          }
          return;
        }
        if (chunk) {
          const next = offset + chunk.length;
          if (next > start && offset <= end) {
            const from = Math.max(0, start - offset);
            const to = Math.min(chunk.length, end - offset + 1);
            if (to > from) controller.enqueue(chunk.subarray(from, to));
          }
          offset = next;
          return;
        }
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      // Replay buffered chunks first
      for (const buf of dl.chunks) {
        onChunk(buf);
      }
      if (dl.done) {
        onChunk(null);
        return;
      }
      if (dl.failed) {
        onChunk(null, dl.failed);
        return;
      }
      dl.listeners.add(onChunk);
    },
    cancel() {
      /* keep download going for other listeners */
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": dl.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  if (knownTotal > 0) headers["Content-Length"] = String(isRange ? Math.max(0, Math.min(end, knownTotal - 1) - start + 1) : knownTotal);
  if (isRange && knownTotal > 0) {
    headers["Content-Range"] = `bytes ${start}-${Math.min(end, knownTotal - 1)}/${knownTotal}`;
    return new Response(stream, { status: 206, headers });
  }
  return new Response(stream, { status: 200, headers });
}
