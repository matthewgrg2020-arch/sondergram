import { FileAttribute, SlskClient, type SearchResult } from "slsk-client";
import { fileExt, isAudioFile, parseSlskFilename, type SlskFile } from "./soulseek";

const MAX_BYTES = 420_000_000;
const CACHE_LIMIT = 4;
const CACHE_MAX = 80_000_000;

type Ticket = { user: string; pass: string };
type Cached = { buf: Buffer; mime: string; at: number };

const tickets = new Map<string, Ticket>();
const cache = new Map<string, Cached>();
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

function sameFile(a: string, b: string) {
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
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

export function issueTicket(user: string, pass: string) {
  const ticket = `${user}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  tickets.set(ticket, { user, pass });
  return ticket;
}

export function ticketSession(id: string) {
  return tickets.get(id) || null;
}

export function dropLive(user?: string) {
  if (user) {
    for (const [k, t] of tickets) {
      if (t.user === user) tickets.delete(k);
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
    client = null;
    loginKey = "";
  }
}

function loginErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err || "");
  const lower = text.toLowerCase();
  const hardCredential =
    /login\s*refus/i.test(text) ||
    /invalid\s*(user|pass|credential)/i.test(text) ||
    /wrong\s*(user|pass)/i.test(text) ||
    /bad\s*password/i.test(text) ||
    /unknown\s*user/i.test(text);
  if (hardCredential) {
    return "Soulseek did not accept that username or password. Confirm they work in SoulseekQt, then try again.";
  }
  const networkish =
    /timeout|timed\s*out|econn|enotfound|ehost|network|socket|reset|refused|unreachable|abort|epipe|etimedout/i.test(lower) ||
    /could not connect|connection failed|server did not/i.test(lower);
  if (networkish) {
    return "Could not reach Soulseek from this server (common on Vercel). Try again, or use an slskd instance instead of native login.";
  }
  return "Soulseek login failed from this server. If the same credentials work in SoulseekQt, use an slskd instance (more reliable on Vercel) or try again in a moment.";
}

async function connect(user: string, pass: string) {
  const key = `${user}\0${pass}`;
  if (client && loginKey === key && client.username === user) return client;
  if (boot && loginKey === key) return boot;
  if (client) {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
    client = null;
  }
  loginKey = key;
  boot = (async () => {
    const next = new (SlskClient as any)();
    try {
      await next.login(user, pass);
      client = next;
      return next;
    } catch (err) {
      try {
        next.destroy();
      } catch {
        /* ignore */
      }
      throw new Error(loginErrorMessage(err));
    }
  })();
  try {
    return await boot;
  } catch (err) {
    loginKey = "";
    client = null;
    throw err;
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
  const attrs = (row as any).attribs || {};
  const bitRate = Number(attrs[FileAttribute.Bitrate] ?? attrs[0] ?? 0) || 0;
  const length = Number(attrs[FileAttribute.Duration] ?? attrs[1] ?? 0) || 0;
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
  const c = await connect(user, pass);
  // slsk-client v2: search({ req, timeout }) returns Promise<SearchResult[]>
  let results: SearchResult[] = [];
  try {
    const raw = await c.search({ req: q.trim(), timeout: 16000 });
    results = Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn("liveSearch failed", err);
    results = [];
  }
  const out: SlskFile[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    const mapped = mapLiveHit(row);
    if (!mapped) continue;
    const key = `${mapped.username}|${mapped.filename}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
  }
  out.sort((a, b) => {
    const aMp3 = /mp3/i.test(a.ext) ? 0 : a.lossless ? 2 : 1;
    const bMp3 = /mp3/i.test(b.ext) ? 0 : b.lossless ? 2 : 1;
    if (aMp3 !== bMp3) return aMp3 - bMp3;
    if (a.free !== b.free) return a.free ? -1 : 1;
    return b.bitRate - a.bitRate || a.queue - b.queue || a.size - b.size;
  });
  return out.slice(0, 500);
}

export async function liveFolder(user: string, pass: string, peer: string, folder: string, q: string) {
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

export function liveStart(user: string, pass: string, peer: string, file: string, size: number) {
  void (async () => {
    try {
      const c = await connect(user, pass);
      const dl = c.download({ user: peer, file, expectedSize: size || undefined });
      await dl;
    } catch (err) {
      lastError.set(fileKey(peer, file), err instanceof Error ? err.message : String(err));
    }
  })();
}

export function liveStatus(peer: string, file: string) {
  const key = fileKey(peer, file);
  const cached = cacheGet(key);
  if (cached) {
    return { done: true, percent: 100, state: "complete", error: "", local: "", size: cached.buf.length };
  }
  const dl = client?.downloads?.find((row: any) => row.user === peer && sameFile(row.file, file));
  if (!dl) {
    return { done: false, percent: 0, state: "Queued", error: lastError.get(key) || "", local: "", size: 0 };
  }
  const total = dl.totalBytes || dl.expectedSize || 0;
  const received = dl.receivedBytes || 0;
  const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : dl.status === "downloading" ? 8 : 1;
  const failed = dl.status === "failed" || dl.status === "cancelled";
  return {
    done: dl.status === "complete",
    percent: failed ? 0 : percent,
    state: dl.status,
    error: failed ? "Could not get that file from the other user." : "",
    local: dl.path || "",
    size: total,
  };
}

export async function liveStream(opts: {
  user: string;
  pass: string;
  peer: string;
  file: string;
  size: number;
  range: string | null;
  signal?: AbortSignal;
}) {
  const key = fileKey(opts.peer, opts.file);
  const cached = cacheGet(key);
  if (cached) {
    const buf = cached.buf;
    const mime = mimeOf(opts.file);
    const total = buf.length;
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
      "Accept-Ranges": "bytes",
      "Content-Type": mime,
      "Cache-Control": "private, max-age=120",
    };
    const range = opts.range?.match(/bytes=(\d+)-(\d*)/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : total - 1;
      if (!Number.isFinite(start) || start >= total) {
        headers["Content-Range"] = `bytes */${total}`;
        return new Response(null, { status: 416, headers });
      }
      const to = Math.min(Number.isFinite(end) ? end : total - 1, total - 1);
      const slice = buf.subarray(start, to + 1);
      headers["Content-Range"] = `bytes ${start}-${to}/${total}`;
      headers["Content-Length"] = String(slice.length);
      return new Response(slice, { status: 206, headers });
    }
    headers["Content-Length"] = String(total);
    return new Response(buf, { status: 200, headers });
  }

  const c = await connect(opts.user, opts.pass);
  const mime = mimeOf(opts.file);
  let download: any;
  try {
    download = c.download({
      user: opts.peer,
      file: opts.file,
      expectedSize: opts.size || undefined,
      signal: opts.signal,
      timeout: 120_000,
    });
  } catch (err) {
    lastError.set(key, err instanceof Error ? err.message : String(err));
    return new Response("Download failed", { status: 502 });
  }

  const chunks: Buffer[] = [];
  const nodeStream = download.stream || download;
  const readable = new ReadableStream({
    async start(controller) {
      try {
        if (nodeStream && typeof nodeStream[Symbol.asyncIterator] === "function") {
          for await (const chunk of nodeStream as AsyncIterable<Buffer | Uint8Array | string>) {
            if (opts.signal?.aborted) break;
            if (chunk == null) continue;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer | string);
            chunks.push(buf);
            controller.enqueue(buf);
          }
        } else {
          const result = await download;
          const data = result?.buffer || result;
          if (data) {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            chunks.push(buf);
            controller.enqueue(buf);
          }
        }
        if (chunks.length) {
          const full = Buffer.concat(chunks);
          cachePut(key, full, mime);
        }
        controller.close();
      } catch (err) {
        lastError.set(key, err instanceof Error ? err.message : String(err));
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "Content-Type": mime,
      "Cache-Control": "no-store",
    },
  });
}
