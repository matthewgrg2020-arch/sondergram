import { createFileRoute } from "@tanstack/react-router";

export const maxDuration = 120;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/ib-library-stream")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        try {
          let body: { userId?: string; token?: string } = {};
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return json({ error: "Invalid JSON body." }, 400);
          }
          const userId = String(body.userId || "").trim();
          const token = String(body.token || "").trim();
          if (!userId || !token) return json({ error: "Sign in to iBroadcast first." }, 401);

          const uidNum = Number(userId);
          const uid = Number.isFinite(uidNum) && uidNum > 0 ? uidNum : userId;
          const payload = {
            _token: token,
            _userid: uid,
            user_id: uid,
            token,
            client: "Sondergram",
            version: "1.0",
            device_name: "Sondergram Web",
            user_agent: "Sondergram/1.0",
            mode: "library",
            supported_types: false,
            url: "//library.ibroadcast.com",
          };

          const upstream = await fetch("https://library.ibroadcast.com/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "Sondergram/1.0",
            },
            body: JSON.stringify(payload),
          });

          if (!upstream.ok || !upstream.body) {
            return json({ error: `iBroadcast library HTTP ${upstream.status}` }, 502);
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (err) {
          const message =
            err instanceof Error && /abort/i.test(err.message)
              ? "Library stream timed out. Try again or use a more specific search."
              : err instanceof Error
                ? err.message
                : "Could not stream iBroadcast library.";
          return json({ error: message }, 504);
        }
      },
    },
  },
});
