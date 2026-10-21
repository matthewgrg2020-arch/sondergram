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
    const wantNative = data.kind === "native" || (!str(data.base) && Boolean(username && password));
    if (wantNative) {
      if (!username || !password) {
        throw new Error("Enter your Soulseek username and password.");
      }
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
  .validator((d: {
    q?: string;
    base?: string;
    key?: string;
    token?: string;
    name?: string;
    timeoutMs?: number;
  }) => d)
  .handler(async ({ data }) => {
    const q = str(data.q);
    if (q.length < 2) return { files: [] as SlskFile[], hits: [] as SlskFile[] };
    const sessionLike = { base: data.base, key: data.key, token: data.token, name: data.name } as SlskSession;
    if (isNativeSlsk(sessionLike)) {
      const liveApi = await live();
      const files = (await liveApi.liveSearch(str(data.name), str(data.key), q)) || [];
      return { files, hits: files };
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) return { files: [] as SlskFile[], hits: [] as SlskFile[] };
    const session = { key: str(data.key), token: str(data.token) };
    const searchId = crypto.randomUUID();
    await slskFetch(base, "/api/v0/searches", session, {
      method: "POST",
      body: JSON.stringify({ id: searchId, searchText: q }),
    });
    const deadline = Date.now() + Math.min(Math.max(num(data.timeoutMs) || 8000, 2000), 20000);
    let files: SlskFile[] = [];
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        const body = asJson(await slskFetch(base, `/api/v0/searches/${encodeURIComponent(searchId)}`, session));
        const responses = Array.isArray(body.responses) ? (body.responses as unknown[]) : [];
        const out: SlskFile[] = [];
        for (const row of responses) {
          const item = asJson(row);
          const username = str(item.username || item.Username || item.userName);
          const speed = num(item.uploadSpeed || item.UploadSpeed);
          const queue = num(item.queueLength || item.QueueLength);
          const free = Boolean(item.hasFreeUploadSlot ?? item.HasFreeUploadSlot ?? true);
          const fileRows = Array.isArray(item.files) ? (item.files as unknown[]) : [];
          for (const fr of fileRows) {
            const mapped = mapFile(username, asJson(fr), speed, queue, free);
            if (mapped) out.push(mapped);
          }
        }
        files = out;
        if (files.length >= 40) break;
      } catch {
        /* keep polling */
      }
    }
    try {
      await slskFetch(base, `/api/v0/searches/${encodeURIComponent(searchId)}`, session, { method: "DELETE" });
    } catch {}
    return { files, hits: files };
  });

export const slskExpandFolder = createServerFn({ method: "POST" })
  .validator((d: {
    base?: string;
    key?: string;
    token?: string;
    name?: string;
    username?: string;
    folder?: string;
    q?: string;
    speed?: number;
    queue?: number;
    free?: boolean;
  }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const folder = str(data.folder);
    if (!username || !folder) return { hits: [] as SlskFile[] };
    const sessionLike = { base: data.base, key: data.key, token: data.token, name: data.name } as SlskSession;
    if (isNativeSlsk(sessionLike)) {
      const liveApi = await live();
      const hits = await liveApi.liveFolder(str(data.name), str(data.key), username, folder, str(data.q) || undefined);
      return { hits };
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) return { hits: [] as SlskFile[] };
    const session = { key: str(data.key), token: str(data.token) };
    try {
      const body = await slskFetch(base, `/api/v0/users/${encodeURIComponent(username)}/directory`, session, {
        method: "POST",
        body: JSON.stringify({ directory: folder }),
      });
      const files = Array.isArray(body) ? body : Array.isArray((body as any)?.files) ? (body as any).files : [];
      const out: SlskFile[] = [];
      const speed = num(data.speed);
      const queue = num(data.queue);
      const free = Boolean(data.free);
      for (const file of files) {
        const mapped = mapFile(username, asJson(file), speed, queue, free, folder);
        if (mapped) out.push(mapped);
      }
      return { hits: out };
    } catch {
      return { hits: [] as SlskFile[] };
    }
  });

export const slskEnqueue = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; token?: string; account?: string; username: string; filename: string; size?: number }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const filename = str(data.filename);
    if (!username || !filename) throw new Error("Missing Soulseek file.");
    const sessionLike = { base: data.base, key: data.key, token: data.token, name: data.account } as any;
    if (isNativeSlsk(sessionLike) || (!str(data.base) && str(data.account))) {
      const liveApi = await live();
      liveApi.liveStart(str(data.account), str(data.key), username, filename, num(data.size));
      return { ok: true };
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) throw new Error("Soulseek not connected.");
    const session = { key: str(data.key), token: str(data.token) };
    await slskFetch(base, `/api/v0/transfers/downloads/${encodeURIComponent(username)}`, session, {
      method: "POST",
      body: JSON.stringify({ filename, size: num(data.size) }),
    });
    return { ok: true };
  });

export const slskStatus = createServerFn({ method: "POST" })
  .validator((d: { base?: string; key?: string; token?: string; account?: string; username: string; filename: string }) => d)
  .handler(async ({ data }) => {
    const username = str(data.username);
    const filename = str(data.filename);
    if (!username || !filename) return { id: "", state: "Queued", percent: 0, done: false, local: "", size: 0, error: "" };
    const sessionLike = { base: data.base, key: data.key, token: data.token, name: data.account } as any;
    if (isNativeSlsk(sessionLike) || (!str(data.base) && str(data.account))) {
      const liveApi = await live();
      const status = liveApi.liveStatus(username, filename);
      return {
        id: `${username}|${filename}`,
        state: status.done ? "Completed" : status.error ? "Failed" : "InProgress",
        percent: status.percent,
        done: status.done,
        local: "",
        size: status.size,
        error: status.error || "",
      };
    }
    const base = normalizeSlskBase(data.base || "");
    if (!base) return { id: "", state: "Queued", percent: 0, done: false, local: "", size: 0, error: "" };
    const session = { key: str(data.key), token: str(data.token) };
    try {
      const body = asJson(await slskFetch(base, "/api/v0/transfers/downloads", session));
      const list = Array.isArray(body) ? body : Array.isArray((body as any)?.downloads) ? (body as any).downloads : [];
      for (const row of list) {
        const peer = asJson(row);
        if (str(peer.username || peer.Username) !== username) continue;
        const files = Array.isArray(peer.files) ? peer.files : [peer];
        for (const f of files) {
          const file = asJson(f);
          if (str(file.filename || file.Filename) !== filename) continue;
          const state = str(file.state || file.State || peer.state);
          const percent = num(file.percentComplete ?? file.PercentComplete ?? file.progress);
          const size = num(file.bytesTransferred || file.size || file.Size);
          const done = /succeed|complete/i.test(state) || percent >= 100;
          return {
            id: str(file.id || file.Id),
            state,
            percent,
            done,
            local: str(file.filename || filename),
            size,
            error: /fail|error|timeout|reject|cancel/i.test(state) && !/succeed/i.test(state) ? "Could not get that file from the other user." : "",
          };
        }
      }
    } catch {}
    return { id: "", state: "Queued", percent: 0, done: false, local: "", size: 0, error: "" };
  });
