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
    client = null;
    loginKey = "";
  }
}

async function connect(user: string, pass: string) {
  const key = `${user}\0${pass}`;
  if (client && loginKey === key && client.username === user) return client;
  if (boot) {
    const existing = await boot;
    if (loginKey === key && existing.username === user) return existing;
  }
  boot = (async () => {
    if (client) {
      try {
        client.destroy();
      } catch {
        /* ignore */
      }
      client = null;
      loginKey = "";
    }
    const incomingPort = 21000 + Math.floor(Math.random() * 20000);
    const next = new SlskClient({
      timeout: 15000,
      downloadRetries: 3,
      downloadTimeout: 180000,
      incomingPort,
      uploads: false,
      reconnect: true,
    });
    try {
      await next.login(user, pass);
    } catch (err) {
      try {
        next.destroy();
      } catch {
        /* ignore */
      }
      const text = err instanceof Error ? err.message : "";
      if (/refus|invalid|password|username|credentials/i.test(text)) {
        throw new Error("Soulseek did not accept that username or password.");
      }
      throw new Error("Could not reach Soulseek. Try again in a moment.");
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
    if (a.lossless !== b.lossless) return a.lossless ? -1 : 1;
    if (a.free !== b.free) return a.free ? -1 : 1;
    const aHuge = a.size > 80_000_000;
    const bHuge = b.size > 80_000_000;
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

/** Start (or join) a progressive peer download. Shared by liveStart + liveStream. */
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
  lastError.delete(key);

  void (async () => {
    try {
      if (size > MAX_BYTES) throw new Error("That Soulseek file is over 400 MB. Pick a smaller copy (MP3 or FLAC).");
      const clientNow = await connect(user, pass);
      const download = clientNow.download({
        user: peer,
        file,
        size: size || undefined,
        timeout: 180000,
        signal,
      });
      dl.cancel = () => {
        try {
          download.cancel?.();
        } catch {
          /* ignore */
        }
      };
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            try {
              download.cancel?.();
            } catch {
              /* ignore */
            }
          },
          { once: true },
        );
      }
      download.on("data", (chunk: Buffer) => {
        dl.chunks.push(chunk);
        for (const fn of dl.listeners) {
          try {
            fn(chunk);
          } catch {
            /* ignore */
          }
        }
      });
      const result = await download;
      const buf = result.buffer?.length ? result.buffer : Buffer.concat(dl.chunks);
      if (!buf?.length) throw new Error("Could not get that file from the other user.");
      dl.chunks = [buf];
      dl.size = buf.length;
      dl.done = true;
      cachePut(key, buf, mime);
      for (const fn of dl.listeners) {
        try {
          fn(null);
        } catch {
          /* ignore */
        }
      }
      dl.listeners.clear();
      setTimeout(() => {
        if (liveDls.get(key) === dl) liveDls.delete(key);
      }, 60_000);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Could not get that file from the other user.");
      dl.failed = error;
      lastError.set(key, error.message);
      for (const fn of dl.listeners) {
        try {
          fn(null, error);
        } catch {
          /* ignore */
        }
      }
      dl.listeners.clear();
      setTimeout(() => {
        if (liveDls.get(key) === dl) liveDls.delete(key);
      }, 30_000);
    }
  })();

  return dl;
}

export function liveStart(user: string, pass: string, peer: string, file: string, size: number) {
  lastError.delete(fileKey(peer, file));
  ensureDownload(user, pass, peer, file, size);
  return { ok: true as const };
}

export function liveStatus(peer: string, file: string) {
  const key = fileKey(peer, file);
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    return { done: true, percent: 100, state: "complete", error: "", local: "", size: hit.buf.length };
  }
  const err = lastError.get(key);
  if (err) return { done: false, percent: 0, state: "failed", error: err, local: "", size: 0 };
  const live = liveDls.get(key);
  if (live) {
    if (live.failed) return { done: false, percent: 0, state: "failed", error: live.failed.message, local: "", size: 0 };
    const received = live.chunks.reduce((n, c) => n + c.length, 0);
    const total = live.size || 0;
    const percent = live.done
      ? 100
      : total > 0
        ? Math.min(99, Math.round((received / total) * 100))
        : received > 0
          ? 8
          : 1;
    return {
      done: live.done,
      percent,
      state: live.done ? "complete" : received > 0 ? "downloading" : "requested",
      error: "",
      local: "",
      size: total || received,
    };
  }
  const dl = client?.downloads.find((row) => row.user === peer && sameFile(row.file, file));
  if (!dl) {
    return { done: false, percent: 0, state: "Queued", error: "", local: "", size: 0 };
  }
  const total = dl.totalBytes || 0;
  const received = dl.receivedBytes || 0;
  const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : dl.status === "downloading" ? 8 : 1;
  const failed = dl.status === "failed" || dl.status === "cancelled";
  return {
    done: dl.status === "complete",
    percent: failed ? 0 : percent,
    state: dl.status,
    error: failed ? "Could not get that file from the other user." : "",
    local: dl.destination || "",
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
      return new Response(new Uint8Array(slice), { status: 206, headers });
    }
    headers["Content-Length"] = String(total);
    return new Response(new Uint8Array(buf), { status: 200, headers });
  }

  const dl = ensureDownload(opts.user, opts.pass, opts.peer, opts.file, opts.size, opts.signal);

  await new Promise<void>((resolve, reject) => {
    if (dl.failed) {
      reject(dl.failed);
      return;
    }
    if (dl.done || dl.chunks.length > 0) {
      resolve();
      return;
    }
    const onChunk = (_chunk: Buffer | null, err?: Error) => {
      dl.listeners.delete(onChunk);
      if (err) reject(err);
      else resolve();
    };
    dl.listeners.add(onChunk);
    opts.signal?.addEventListener(
      "abort",
      () => {
        dl.listeners.delete(onChunk);
        reject(new Error("Cancelled"));
      },
      { once: true },
    );
    setTimeout(() => {
      if (dl.chunks.length === 0 && !dl.done && !dl.failed) {
        dl.listeners.delete(onChunk);
        reject(new Error("Soulseek peer did not start sending data in time. Try another result."));
      }
    }, 55_000);
  });

  if (dl.failed) throw dl.failed;

  if (dl.done) {
    const buf = Buffer.concat(dl.chunks);
    cachePut(key, buf, dl.mime);
    const total = buf.length;
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
      "Accept-Ranges": "bytes",
      "Content-Type": dl.mime,
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
      return new Response(new Uint8Array(slice), { status: 206, headers });
    }
    headers["Content-Length"] = String(total);
    return new Response(new Uint8Array(buf), { status: 200, headers });
  }

  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of dl.chunks) {
        controller.enqueue(new Uint8Array(chunk));
        sent += chunk.length;
      }
      if (dl.done) {
        controller.close();
        return;
      }
      if (dl.failed) {
        controller.error(dl.failed);
        return;
      }
      const onChunk = (chunk: Buffer | null, err?: Error) => {
        if (err) {
          try {
            controller.error(err);
          } catch {
            /* ignore */
          }
          dl.listeners.delete(onChunk);
          return;
        }
        if (chunk) {
          const totalBuf = Buffer.concat(dl.chunks);
          if (totalBuf.length > sent) {
            const next = totalBuf.subarray(sent);
            controller.enqueue(new Uint8Array(next));
            sent = totalBuf.length;
          }
          return;
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
        dl.listeners.delete(onChunk);
      };
      dl.listeners.add(onChunk);
      opts.signal?.addEventListener(
        "abort",
        () => {
          dl.listeners.delete(onChunk);
          try {
            dl.cancel?.();
          } catch {
            /* ignore */
          }
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
    },
    cancel() {
      try {
        dl.cancel?.();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
      "Content-Type": dl.mime,
      "Cache-Control": "private, no-store",
    },
  });
}
