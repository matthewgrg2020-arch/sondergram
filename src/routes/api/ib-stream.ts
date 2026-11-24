import { createFileRoute } from "@tanstack/react-router";

export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition",
    "Access-Control-Max-Age": "86400",
  };
}

function buildStreamUrl(opts: {
  file: string;
  fileId: string;
  userId: string;
  token: string;
  base?: string;
}) {
  let path = String(opts.file || "").trim();
  path = path.replace(/\{bitrate\}/gi, "128");
  path = path.replace(/^\//, "");
  if (!path) return "";
  const base = (opts.base || "https://streaming.ibroadcast.com").replace(/\/$/, "");
  const expires = Math.floor(Date.now() / 1000);
  // Match LMS / music-assistant query param names (lowercase)
  const qs =
    `expires=${expires}` +
    `&signature=${encodeURIComponent(opts.token)}` +
    `&user_id=${encodeURIComponent(opts.userId)}` +
    `&file_id=${encodeURIComponent(opts.fileId)}` +
    `&platform=${encodeURIComponent("Sondergram")}` +
    `&version=1.0`;
  return `${base}/${path}?${qs}`;
}

function fixContentType(ct: string | null): string {
  if (!ct) return "audio/mpeg";
  const lower = ct.toLowerCase();
  if (lower.includes("mpeg3") || lower.includes("mp3")) return "audio/mpeg";
  if (lower.includes("flac")) return "audio/flac";
  if (lower.includes("ogg")) return "audio/ogg";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "audio/mp4";
  if (lower.startsWith("text/") || lower.includes("json") || lower.includes("html"))
    return "audio/mpeg";
  return ct;
}

async function handle(request: Request) {
  const params = new URL(request.url).searchParams;
  const file = params.get("file") || params.get("f") || "";
  const fileId = params.get("file_id") || params.get("id") || "";
  const userId = params.get("user_id") || params.get("userId") || "";
  const token = params.get("token") || params.get("signature") || "";
  const base = params.get("base") || "https://streaming.ibroadcast.com";

  if (!file || !fileId || !userId || !token) {
    return new Response("Missing file, file_id, user_id, or token", {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const target = buildStreamUrl({ file, fileId, userId, token, base });
  if (!target) {
    return new Response("Bad file path", { status: 400, headers: corsHeaders() });
  }

  const headers: Record<string, string> = {
    Accept: "audio/*,*/*;q=0.8",
    "User-Agent": UA,
    Referer: "https://media.ibroadcast.com/",
    Origin: "https://media.ibroadcast.com",
  };
  const range = request.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: "follow",
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502, headers: corsHeaders() });
  }

  // Retry once with capitalized CloudFront-style params if unauthorized
  if (upstream.status === 403 || upstream.status === 401) {
    try {
      const path = String(file).replace(/\{bitrate\}/gi, "128").replace(/^\//, "");
      const expires = Math.floor(Date.now() / 1000);
      const alt =
        `${base.replace(/\/$/, "")}/${path}` +
        `?Expires=${expires}&Signature=${encodeURIComponent(token)}` +
        `&file_id=${encodeURIComponent(fileId)}&user_id=${encodeURIComponent(userId)}` +
        `&platform=Sondergram&version=1.0`;
      upstream = await fetch(alt, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "follow",
      });
    } catch {
      /* keep original */
    }
  }

  if (!upstream.ok && upstream.status !== 206) {
    const msg = `iBroadcast stream HTTP ${upstream.status}`;
    return new Response(msg, { status: upstream.status, headers: corsHeaders() });
  }

  const out = new Headers(corsHeaders());
  out.set("Content-Type", fixContentType(upstream.headers.get("content-type")));
  for (const key of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  if (!out.has("Accept-Ranges")) out.set("Accept-Ranges", "bytes");
  out.set("Cache-Control", "private, max-age=60");

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, headers: out });
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/api/ib-stream")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders() }),
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
});
