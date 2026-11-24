import { loadIbSession } from "./ibroadcast";

export function resolveIbUrl(track: {
  ibroadcastId?: string;
  ibFile?: string;
  url?: string;
}): string {
  const session = loadIbSession();
  let file = String(track.ibFile || "").trim();
  const id =
    track.ibroadcastId ||
    (typeof track.url === "string" && track.url.startsWith("ib:") ? track.url.slice(3) : "");

  // Recover file path from a previously baked stream URL if ibFile was lost
  if (!file && typeof track.url === "string") {
    try {
      if (track.url.includes("/api/ib-stream")) {
        const u = new URL(track.url, "https://local");
        file = u.searchParams.get("file") || "";
      } else if (track.url.includes("/api/stream")) {
        const outer = new URL(track.url, "https://local");
        const inner = outer.searchParams.get("u") || "";
        if (inner) {
          const u = new URL(inner);
          const path = u.pathname;
          if (path && path !== "/") file = path;
        }
      } else if (track.url.includes("streaming.ibroadcast.com")) {
        const u = new URL(track.url);
        const path = u.pathname;
        if (path && path !== "/") file = path;
      }
    } catch {
      /* ignore */
    }
  }

  if (!session || !id || !file) return "";

  const params = new URLSearchParams({
    file,
    file_id: String(id),
    user_id: String(session.userId),
    token: String(session.token),
    base: session.streaming || "https://streaming.ibroadcast.com",
  });
  // Dedicated proxy fixes content-type and signing for iOS
  return `/api/ib-stream?${params.toString()}`;
}
