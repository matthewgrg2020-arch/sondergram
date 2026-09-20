import { createFileRoute } from "@tanstack/react-router";
import { isNativeSlsk, normalizeSlskBase, type SlskSession } from "@/lib/player/soulseek";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, X-API-Key",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  };
}

function b64path(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function streamNative(request: Request, url: URL) {
  const live = await import("@/lib/player/soulseek-live.server");
  const ticket = url.searchParams.get("ticket") || "";
  const creds = ticket ? live.ticketSession(ticket) : null;
  const user = creds?.user || url.searchParams.get("name") || "";
  const pass = creds?.pass || url.searchParams.get("key") || "";
  const peer = url.searchParams.get("user") || "";
  const file = url.searchParams.get("file") || "";
  const size = Number(url.searchParams.get("size") || 0);
  if (!user || !pass || !peer || !file) {
    return new Response("Missing Soulseek file", { status: 400, headers: cors() });
  }
  try {
    return await live.liveStream({
      user,
      pass,
      peer,
      file,
      size: Number.isFinite(size) ? size : 0,
      range: request.headers.get("Range"),
      signal: request.signal,
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : "Could not get that file from the other user.";
    return new Response(text, { status: 502, headers: cors() });
  }
}

async function streamSlskd(request: Request, url: URL) {
  const base = normalizeSlskBase(url.searchParams.get("base") || "");
  const key = url.searchParams.get("key") || "";
  const token = url.searchParams.get("token") || "";
  const file = url.searchParams.get("file") || "";
  const local = url.searchParams.get("local") || "";
  if (!base || !file) return new Response("Missing Soulseek file", { status: 400, headers: cors() });

  const headers: Record<string, string> = { Accept: "*/*" };
  if (key) headers["X-API-Key"] = key;
  if (token) headers.Authorization = `Bearer ${token}`;
  const range = request.headers.get("Range");
  if (range) headers.Range = range;

  const candidates = [
    local ? `${base}/api/v0/files/${b64path(local)}` : "",
    `${base}/api/v0/files/${b64path(file)}`,
    `${base}/api/v0/files/downloads/${b64path(file.replace(/\\/g, "/").split("/").pop() || file)}`,
    local ? `${base}/api/v0/files/downloads/${b64path(local)}` : "",
  ].filter(Boolean);

  let last = 404;
  for (const href of candidates) {
    const res = await fetch(href, { headers, redirect: "follow" });
    last = res.status;
    if (!res.ok || !res.body) continue;
    const out = new Headers(cors());
    out.set("Content-Type", res.headers.get("Content-Type") || "audio/mpeg");
    out.set("Accept-Ranges", res.headers.get("Accept-Ranges") || "bytes");
    const length = res.headers.get("Content-Length");
    if (length) out.set("Content-Length", length);
    const cr = res.headers.get("Content-Range");
    if (cr) out.set("Content-Range", cr);
    out.set("Cache-Control", "private, max-age=60");
    return new Response(res.body, { status: res.status, headers: out });
  }
  return new Response(`Soulseek file is not ready (${last}).`, { status: 409, headers: cors() });
}

async function stream(request: Request) {
  const url = new URL(request.url);
  const session = {
    kind: (url.searchParams.get("kind") as SlskSession["kind"]) || undefined,
    base: url.searchParams.get("base") || "",
    key: url.searchParams.get("key") || "",
    token: url.searchParams.get("token") || "",
    name: url.searchParams.get("name") || "",
    ticket: url.searchParams.get("ticket") || "",
  } satisfies SlskSession;
  if (isNativeSlsk(session) || (!session.base && (session.name || session.ticket))) {
    return streamNative(request, url);
  }
  return streamSlskd(request, url);
}

export const Route = createFileRoute("/api/soulseek")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: cors() }),
      HEAD: ({ request }) => stream(request),
      GET: ({ request }) => stream(request),
    },
  },
});
