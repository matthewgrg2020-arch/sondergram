import { createFileRoute } from "@tanstack/react-router";
import { pullCoverBytes } from "@/lib/player/cover-fetch";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

async function proxy(request: Request) {
  const target = new URL(request.url).searchParams.get("u") || "";
  if (!target) return new Response("Missing image", { status: 400, headers: corsHeaders() });
  const pulled = await pullCoverBytes(target);
  if (!pulled) return new Response("Cover unavailable", { status: 404, headers: corsHeaders() });
  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", pulled.type);
  headers.set("Cache-Control", "private, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Length", String(pulled.buf.length));
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(new Uint8Array(pulled.buf), { status: 200, headers });
}

export const Route = createFileRoute("/api/cover")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders() }),
      HEAD: ({ request }) => proxy(request),
      GET: ({ request }) => proxy(request),
    },
  },
});
