import { createFileRoute } from "@tanstack/react-router";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function allowedHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "bandcamp.com" ||
    h.endsWith(".bandcamp.com") ||
    h.endsWith(".bcbits.com") ||
    h === "archive.org" ||
    h.endsWith(".archive.org") ||
    h.endsWith(".deezercdn.com") ||
    h.endsWith(".deezer.com") ||
    h.endsWith(".dzcdn.net") ||
    h === "dzcdn.net" ||
    h === "itunes.apple.com" ||
    h.endsWith(".itunes.apple.com") ||
    h === "mzstatic.com" ||
    h.endsWith(".mzstatic.com") ||
    h.endsWith(".ibroadcast.com") ||
    h.endsWith(".scdn.co") ||
    h.endsWith(".spotifycdn.com") ||
    h.endsWith(".audius.co") ||
    h === "audius.co" ||
    h.endsWith(".googlevideo.com") ||
    h.endsWith(".youtube.com") ||
    h.includes("piped") ||
    h.includes("invidious") ||
    h.includes("nadeko")
  );
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition",
    "Access-Control-Max-Age": "86400",
  };
}

function refererFor(url: URL) {
  const h = url.hostname.toLowerCase();
  if (h.endsWith(".bcbits.com") || h.endsWith(".bandcamp.com")) return "https://bandcamp.com/";
  if (h.endsWith("archive.org")) return "https://archive.org/";
  if (h.endsWith(".dzcdn.net") || h.endsWith(".deezer.com") || h.endsWith(".deezercdn.com")) return "https://www.deezer.com/";
  if (h.endsWith(".itunes.apple.com") || h === "itunes.apple.com" || h.endsWith(".mzstatic.com")) return "https://www.apple.com/";
  if (h.endsWith(".scdn.co") || h.endsWith(".spotifycdn.com")) return "https://open.spotify.com/";
  if (h.endsWith(".googlevideo.com") || h.endsWith(".youtube.com") || h.includes("piped")) return "https://www.youtube.com/";
  return url.origin + "/";
}

async function proxy(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = params.get("u") || params.get("url") || "";
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("Bad stream", { status: 400, headers: corsHeaders() });
  }
  if (!/^https?:$/i.test(url.protocol) || !allowedHost(url.hostname)) {
    return new Response("Host not allowed", { status: 403, headers: corsHeaders() });
  }

  const ref = params.get("ref") || "";
  const headers: Record<string, string> = {
    Accept: "audio/*,*/*;q=0.8",
    "User-Agent": UA,
    Referer: ref.startsWith("https://") && /bandcamp\.com/i.test(ref) ? ref : refererFor(url),
  };
  if (url.hostname.toLowerCase().endsWith(".googlevideo.com") || url.hostname.toLowerCase().endsWith(".youtube.com")) {
    headers.Origin = "https://www.youtube.com";
  }
  const range = request.headers.get("Range");
  if (range) headers.Range = range;

  const upstream = await fetch(url.toString(), { headers, redirect: "follow" });
  const out = new Headers(corsHeaders());
  const type = upstream.headers.get("Content-Type") || "audio/mpeg";
  out.set("Content-Type", type);
  out.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  const length = upstream.headers.get("Content-Length");
  if (length) out.set("Content-Length", length);
  const crange = upstream.headers.get("Content-Range");
  if (crange) out.set("Content-Range", crange);
  out.set("Cache-Control", "private, max-age=120");
  out.set("X-Content-Type-Options", "nosniff");

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, headers: out });
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/api/stream")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders() }),
      HEAD: ({ request }) => proxy(request),
      GET: ({ request }) => proxy(request),
    },
  },
});
