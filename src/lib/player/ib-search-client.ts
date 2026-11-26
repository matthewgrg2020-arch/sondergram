import type { IbSession, IbTrack } from "./ibroadcast";

function artworkUrl(artId: string) {
  const id = String(artId || "").trim();
  if (!id || id === "0") return "";
  return `https://artwork.ibroadcast.com/artwork/${id}-500`;
}

export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<{ ok: boolean; tracks: IbTrack[]; total: number; truncated?: boolean; error?: string }> {
  // Temporary recovery stub — full search restored in follow-up if this lands alone.
  return { ok: false, tracks: [], total: 0, error: "Search module updating. Refresh in a moment." };
}
