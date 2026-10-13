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

function mapFile(username: string, row: Json, speed: number, queue: number, free: boolean, folderHint = ""): SlsKFile | null {
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
      } satisfies SlsKSession;
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
