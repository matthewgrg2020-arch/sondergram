import { loadIbSession, streamUrl as ibStreamUrl } from "./ibroadcast";

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
  if (!file && typeof track.url === "string" && track.url.includes("streaming.ibroadcast.com")) {
    try {
      const u = new URL(track.url.includes("/api/stream") ? new URL(track.url, "https://x").searchParams.get("u") || "" : track.url);
      const path = u.pathname.replace(/^\//, "");
      if (path) file = path.startsWith("/") ? path : `/${path}`;
    } catch {
      /* ignore */
    }
  }
  if (!file && typeof track.url === "string" && track.url.includes("/api/stream")) {
    try {
      const outer = new URL(track.url, "https://local");
      const inner = outer.searchParams.get("u") || "";
      if (inner) {
        const u = new URL(inner);
        const path = u.pathname;
        if (path && path !== "/") file = path;
      }
    } catch {
      /* ignore */
    }
  }

  if (!session || !id || !file) return "";
  try {
    const direct = ibStreamUrl(session, file, id);
    if (!direct) return "";
    // Always rebuild so expires/signature stay valid
    return `/api/stream?u=${encodeURIComponent(direct)}&ref=${encodeURIComponent("https://media.ibroadcast.com/")}`;
  } catch {
    return "";
  }
}
