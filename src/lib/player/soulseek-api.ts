import { createServerFn } from "@tanstack/react-start";
import {
  fileExt,
  isAudioFile,
  isNativeSlsk,
  normalizeSlskBase,
  parseSlskFilename,
  type SlskFile,
  type SlskSession,
} from "./soulseek";

type Json = Record<string, unknown>;

function asJson(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function headers(session: Pick<SlskSession, "key" | "token">) {
  const out: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (session.key) out["X-API-Key"] = session.key;
  if (session.token) out.Authorization = `Bearer ${session.token}`;
  return out;
}

async function slskFetch(base: string, path: string, session: Pick<SlskSession, "key" | "token">, init?: RequestInit) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(session), ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = asJson(body);
    throw new Error(str(err.message || err.title) || `Soulseek ${res.status}`);
  }
  return body;
}

function mapFile(username: string, row: Json, speed: number, queue: number, free: boolean, folderHint = ""): SlskFile | null {
  let filename = str(row.filename || row.Filename || row.name || row.Name);
  if (!filename) return null;
  if (folderHint && !filename.includes("/") && !filename.includes("\\")) {
    filename = `${folderHint.replace(/\\/g, "/")}/${filename}`;
  }
  if (!isAudioFile(filename)) return null;
  if (row.isLocked || row.locked) return null;
  const parsed = parseSlskFilename(filename);
  const ext = fileExt(filename);
  return {
    username,
    filename,
    size: num(row.size || row.Size),
    bitRate: num(row.bitRate || row.BitRate || row.bitrate),
    length: num(row.length || row.Length),
    ext,
    name: parsed.name,
    artist: parsed.artist,
    album: parsed.album,
    lossless: /flac|alac|wav|aiff/i.test(ext),
    locked: false,
    speed,
    queue,
    free,
    folder: parsed.folder || folderHint.replace(/\\/g, "/"),
    trackNo: parsed.trackNo,
    year: parsed.year,
  };
}

async function live() {
  return import("./soulseek-live.server");
}

export const slskConnect = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; username?: string; password?: string; kind?: "native" | "slskd" }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const password = str(data.password);
    const wantNative = data.kind === "native" || (!str(data.base) && username && password);
    if (wantNative) {
      const liveApi = await live();
      const next = await liveApi.liveConnect(username, password);
      return {
        kind: "native",
        base: "",
        key: password,
        name: next.name,
        ticket: next.ticket,
      } satisfies SlskSession;
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) throw new Error("Enter your Soulseek username and password.");
    const key = str(data.key);
    let token = "";
    if (username && password) {
      try {
        const body = asJson(
          await slskFetch(base, "/api/v0/session", { key, token: "" }, {
            method: "POST",
            body: JSON.stringify({ username, password }),
          }),
        );
        token = str(body.token || body.Token);
      } catch {
        /* API key only */
      }
    }
    const session = { key, token };
    try {
      await slskFetch(base, "/api/v0/session", session);
    } catch {
      await slskFetch(base, "/api/v0/application", session);
    }
    return { kind: "slskd", base, key, token, name: username || "slskd" } satisfies SlskSession;
  });

export const slskForget = createServerFn({ method: "POST" })
  .validator((d: { name?: string } = {}) => d)
  .handler(async ({ data }) => {
    const liveApi = await live();
    liveApi.dropLive(str(data.name));
    return { ok: true };
  });

export const slskSearch = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; token?: string; name?: string; q: string }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (!q) return { hits: [] as SlskFile[], id: "" };
    const session = { base: str(data.base), key: str(data.key), token: str(data.token), name: str(data.name) };
    if (isNativeSlsk(session) && session.name && session.key) {
      const liveApi = await live();
      const hits = await liveApi.liveSearch(session.name, session.key, q);
      return { hits, id: "native" };
    }
    const base = normalizeSlskBase(session.base);
    if (!base) return { hits: [] as SlskFile[], id: "" };
    const auth = { key: session.key, token: session.token };
    const id = crypto.randomUUID();
    await slskFetch(base, "/api/v0/searches", auth, {
      method: "POST",
      body: JSON.stringify({
        id,
        searchText: q,
        filterResponses: true,
        minimumPeerUploadSpeed: 0,
        searchTimeout: 12000,
        responseLimit: 80,
        fileLimit: 8000,
      }),
    });
    const started = Date.now();
    while (Date.now() - started < 14000) {
      await new Promise((r) => setTimeout(r, 900));
      try {
        const info = asJson(await slskFetch(base, `/api/v0/searches/${id}`, auth));
        if (info.isComplete || info.IsComplete || /complete/i.test(str(info.state || info.State))) break;
      } catch {
        break;
      }
    }
    const rows = await slskFetch(base, `/api/v0/searches/${id}/responses`, auth);
    const list = Array.isArray(rows) ? rows : [];
    const hits: SlskFile[] = [];
    for (const row of list) {
      const peer = asJson(row);
      const username = str(peer.username || peer.Username);
      const speed = num(peer.uploadSpeed || peer.UploadSpeed);
      const queue = num(peer.queueLength || peer.QueueLength);
      const free = Boolean(peer.hasFreeUploadSlot ?? peer.HasFreeUploadSlot);
      const files = Array.isArray(peer.files) ? peer.files : Array.isArray(peer.Files) ? peer.Files : [];
      for (const file of files) {
        const mapped = mapFile(username, asJson(file), speed, queue, free);
        if (mapped) hits.push(mapped);
      }
    }
    hits.sort((a, b) => {
      if (a.lossless !== b.lossless) return a.lossless ? -1 : 1;
      if (a.free !== b.free) return a.free ? -1 : 1;
      return b.bitRate - a.bitRate || a.queue - b.queue || b.size - a.size;
    });
    const seen = new Set<string>();
    const unique = hits.filter((hit) => {
      const key = `${hit.username}|${hit.filename}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { hits: unique.slice(0, 400), id };
  });

async function slskdDirectory(
  base: string,
  auth: Pick<SlskSession, "key" | "token">,
  username: string,
  folder: string,
  speed: number,
  queue: number,
  free: boolean,
): Promise<SlskFile[]> {
  const variants = [folder, folder.replace(/\//g, "\\"), folder.replace(/\\/g, "/")];
  for (const dir of [...new Set(variants.filter(Boolean))]) {
    try {
      const body = await slskFetch(base, `/api/v0/users/${encodeURIComponent(username)}/directory`, auth, {
        method: "POST",
        body: JSON.stringify({ directory: dir, dir }),
      });
      const row = asJson(body);
      const files = Array.isArray(row.files) ? row.files : Array.isArray(row.Files) ? row.Files : [];
      const name = str(row.name || row.Name || dir);
      const out: SlskFile[] = [];
      for (const file of files) {
        const mapped = mapFile(username, asJson(file), speed, queue, free, name);
        if (mapped) out.push(mapped);
      }
      if (out.length) return out;
    } catch {
      /* try next path style */
    }
  }
  return [];
}

export const slskExpandFolder = createServerFn({ method: "POST" })
  .validator(
    (d: {
      base?: string;
      key?: string;
      token?: string;
      name?: string;
      username: string;
      folder: string;
      artist?: string;
      album?: string;
      speed?: number;
      queue?: number;
      free?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const username = str(data.username);
    const folder = str(data.folder);
    if (!username || !folder) return { hits: [] as SlskFile[] };
    const session = { base: str(data.base), key: str(data.key), token: str(data.token), name: str(data.name) };
    const q = [str(data.artist), str(data.album)].filter(Boolean).join(" ") || folder.split("/").filter(Boolean).slice(-2).join(" ");
    if (isNativeSlsk(session) && session.name && session.key) {
      const liveApi = await live();
      const hits = await liveApi.liveFolder(session.name, session.key, username, folder, q);
      return { hits };
    }
    const base = normalizeSlskBase(session.base);
    if (!base) return { hits: [] as SlskFile[] };
    const auth = { key: session.key, token: session.token };
    const fromDir = await slskdDirectory(base, auth, username, folder, num(data.speed), num(data.queue), Boolean(data.free));
    return { hits: fromDir };
  });

export const slskEnqueue = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; token?: string; account?: string; username: string; filename: string; size?: number }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const filename = str(data.filename);
    const account = str(data.account);
    const key = str(data.key);
    if (!username || !filename) throw new Error("Missing Soulseek file.");
    if (account && key && !normalizeSlskBase(data.base || "")) {
      const liveApi = await live();
      liveApi.liveStart(account, key, username, filename, num(data.size));
      return { ok: true };
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) throw new Error("Missing Soulseek file.");
    const session = { key, token: str(data.token) };
    await slskFetch(base, `/api/v0/transfers/downloads/${encodeURIComponent(username)}`, session, {
      method: "POST",
      body: JSON.stringify([{ filename, size: num(data.size) }]),
    });
    return { ok: true };
  });

export const slskStatus = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; token?: string; account?: string; username: string; filename: string }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const filename = str(data.filename);
    const account = str(data.account);
    const key = str(data.key);
    if (account && key && !normalizeSlskBase(data.base || "")) {
      const liveApi = await live();
      const status = liveApi.liveStatus(username, filename);
      return { id: "", ...status };
    }
    const base = normalizeSlskBase(data.base || "");
    const session = { key, token: str(data.token) };
    const rows = await slskFetch(base, "/api/v0/transfers/downloads", session);
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      const peer = asJson(row);
      if (str(peer.username || peer.Username) !== username) continue;
      const dirs = Array.isArray(peer.directories) ? peer.directories : Array.isArray(peer.Directories) ? peer.Directories : [peer];
      for (const dir of dirs) {
        const files = Array.isArray(asJson(dir).files)
          ? (asJson(dir).files as unknown[])
          : Array.isArray(asJson(dir).Files)
            ? (asJson(dir).Files as unknown[])
            : [];
        for (const file of files) {
          const item = asJson(file);
          const name = str(item.filename || item.Filename);
          if (name !== filename && !name.endsWith(filename.replace(/\\/g, "/").split("/").pop() || "///")) continue;
          const state = str(item.state || item.State);
          const percent = num(item.percentComplete || item.PercentComplete);
          const id = str(item.id || item.Id);
          const local = str(item.filename || item.localFilename || item.LocalFilename);
          return {
            id,
            state,
            percent,
            done: percent >= 99.5 || /completed|succeeded/i.test(state),
            local,
            size: num(item.size || item.Size),
            error: /fail|error|timeout|reject|cancel/i.test(state) && !/succeed/i.test(state) ? "Could not get that file from the other user." : "",
          };
        }
      }
    }
    return { id: "", state: "Queued", percent: 0, done: false, local: "", size: 0, error: "" };
  });
