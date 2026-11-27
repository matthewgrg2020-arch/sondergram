import type { IbSession, IbTrack } from "./ibroadcast";

export type IbSearchResult = {
  ok: boolean;
  tracks: IbTrack[];
  total: number;
  truncated?: boolean;
  error?: string;
};

/** Search iBroadcast library (server-backed with client entrypoint). */
export async function searchIbLibraryClient(
  session: IbSession,
  query: string,
  opts?: { maxHits?: number; onProgress?: (n: number) => void },
): Promise<IbSearchResult> {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: false, tracks: [], total: 0, error: "Query too short." };
  try {
    const res = await fetch("/api/ib-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.userId, token: session.token, q, maxHits: opts?.maxHits ?? 200 }),
    });
    const data = (await res.json()) as IbSearchResult;
    if (data?.ok && Array.isArray(data.tracks)) {
      opts?.onProgress?.(data.tracks.length);
      return data;
    }
    return { ok: false, tracks: [], total: 0, error: data?.error || "No matches." };
  } catch (err) {
    return {
      ok: false,
      tracks: [],
      total: 0,
      error: err instanceof Error ? err.message : "Search failed.",
    };
  }
}

export { fetchIbAlbumTracks, fetchIbArtistTracks } from "./ib-album-fetch";
