import { loadIbSession, streamUrl as ibStreamUrl } from "./ibroadcast";

export function resolveIbUrl(track: {
  ibroadcastId?: string;
  ibFile?: string;
  url?: string;
}): string {
  const session = loadIbSession();
  const file = track.ibFile || "";
  const id =
    track.ibroadcastId ||
    (typeof track.url === "string" && track.url.startsWith("ib:") ? track.url.slice(3) : "");
  if (!session || !id || !file) return "";
  try {
    const direct = ibStreamUrl(session, file, id);
    if (!direct) return "";
    return `/api/stream?u=${encodeURIComponent(direct)}&ref=${encodeURIComponent("https://media.ibroadcast.com/")}`;
  } catch {
    return "";
  }
}
