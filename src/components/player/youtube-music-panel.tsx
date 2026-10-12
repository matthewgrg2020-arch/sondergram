import { LoaderCircle, Play, Plus, Youtube } from "lucide-react";
import { useMemo, useState } from "react";
import { streamSearch, resolveFullTrack } from "@/lib/player/stream-search-api";
import type { StreamHit } from "@/lib/player/stream-search";
import { parseYoutubeId } from "@/lib/player/youtube";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

export function YoutubeMusicPanel() {
  const hydrate = usePlayer((s) => s.hydrate);
  const playIds = usePlayer((s) => s.playIds);
  const tracks = usePlayer((s) => s.tracks);
  const flash = usePlayer((s) => s.flash);
  const importStreamHits = usePlayer((s) => s.importStreamHits);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const inLib = useMemo(
    () =>
      tracks.filter(
        (t) =>
          Boolean(t.youtubeId) ||
          (t.tags || []).includes("YouTube Music") ||
          (t.tags || []).includes("YouTube") ||
          /music\.youtube\.com|youtu\.be|youtube\.com/i.test(t.previewUrl || t.url || ""),
      ),
    [tracks],
  );

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;

    const ytId = parseYoutubeId(q);
    if (ytId) {
      await addHits(
        [
          {
            key: `ytm:${ytId}`,
            source: "YouTube Music",
            kind: "track",
            name: "YouTube Music track",
            artist: "YouTube Music",
            album: "YouTube Music",
            year: "",
            cover: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            preview: "",
            duration: 0,
            trackNo: 0,
            youtubeId: ytId,
            page: `https://music.youtube.com/watch?v=${ytId}`,
          },
        ],
        true,
      );
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await streamSearch({
        data: { q, sources: ["YouTube Music"] },
      });
      const list = (result.hits || []).filter((h) => h.youtubeId || h.source === "YouTube Music" || h.source === "YouTube");
      setHits(list);
      if (!list.length) setMessage("Nothing matched on YouTube Music.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  const resolveStream = async (hit: StreamHit) => {
    const full = await resolveFullTrack({
      data: {
        artist: hit.artist,
        name: hit.name,
        album: hit.album,
        duration: hit.duration,
        youtubeId: hit.youtubeId,
      },
    });
    return {
      url: full.url || "",
      youtubeId: full.youtubeId || hit.youtubeId || "",
      duration: full.duration || hit.duration || 0,
    };
  };

  const addHits = async (list: StreamHit[], play: boolean) => {
    if (!list.length) return;
    setAdding(list[0]!.key);
    setMessage(null);
    try {
      if (importStreamHits) {
        const enriched: StreamHit[] = [];
        for (const hit of list) {
          try {
            const stream = await resolveStream(hit);
            enriched.push({
              ...hit,
              source: "YouTube Music",
              preview: stream.url || hit.preview,
              youtubeId: stream.youtubeId || hit.youtubeId,
              duration: stream.duration || hit.duration,
              page: hit.page || (stream.youtubeId ? `https://music.youtube.com/watch?v=${stream.youtubeId}` : hit.page),
            });
          } catch {
            enriched.push({ ...hit, source: "YouTube Music" });
          }
        }
        const n = await importStreamHits(enriched, play);
        setMessage(play ? `Playing ${n || enriched.length} from YouTube Music.` : `Added ${n || enriched.length} to your library.`);
        flash(play ? "Playing from YouTube Music." : `Added ${n || enriched.length} YouTube Music track(s).`);
        return;
      }

      // Fallback path when full store import is unavailable
      const ids: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const hit = list[i]!;
        const stream = await resolveStream(hit);
        const id = crypto.randomUUID();
        const name = hit.name || "YouTube Music track";
        const artist = hit.artist || "YouTube Music";
        const album = hit.album || "YouTube Music";
        await putStoredTrack({
          id,
          name,
          artist,
          album,
          genre: "YouTube Music",
          tags: ["YouTube Music"],
          year: hit.year || "",
          format: "YTM",
          sampleRate: null,
          bitDepth: null,
          bitrate: null,
          channels: 2,
          lossless: false,
          trackNo: hit.trackNo || i + 1,
          duration: stream.duration || hit.duration || 0,
          bytes: undefined,
          albumArtist: artist,
          previewUrl: stream.url || undefined,
          coverRemote: hit.cover || undefined,
          audio: new Blob([`ytm:${stream.youtubeId || id}`], { type: "text/plain" }),
          cover: null,
          addedAt: Date.now(),
        });
        await hydrate();
        usePlayer.getState().patchTrack?.(id, {
          youtubeId: stream.youtubeId || undefined,
          url: stream.url || "",
          previewUrl: stream.url || "",
          coverUrl: hit.cover || null,
          tags: ["YouTube Music"],
          format: "YTM",
        });
        ids.push(id);
      }
      if (play && ids.length) playIds(ids);
      setMessage(play ? "Playing from YouTube Music." : `Added ${ids.length} to your library.`);
      flash(play ? "Playing from YouTube Music." : `Added ${ids.length} YouTube Music track(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add from YouTube Music.");
    } finally {
      setAdding(null);
    }
  };

  const addAlbumFromResults = async () => {
    if (!hits.length) return;
    // Treat current result set as an album batch (shared album label when possible)
    const albumName =
      hits.find((h) => h.album && h.album !== "YouTube Music")?.album ||
      hits[0]?.name ||
      query.trim() ||
      "YouTube Music";
    const artist = hits[0]?.artist || "YouTube Music";
    const batch = hits.map((h, i) => ({
      ...h,
      source: "YouTube Music" as const,
      kind: "track" as const,
      album: albumName,
      artist: h.artist || artist,
      trackNo: h.trackNo || i + 1,
    }));
    await addHits(batch, false);
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <div className="flex items-center gap-2">
        <Youtube className="size-5 text-fg" strokeWidth={1.75} />
        <h2 className="text-xl font-semibold tracking-tight">YouTube Music</h2>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Search YouTube Music, paste a music.youtube.com link, add single tracks, or add the whole result set as an album.
        Playback uses the audio engine when a stream is available (EQ works).
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-fg outline-none placeholder:text-subtle"
          value={query}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Search or paste music.youtube.com / youtu.be link"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy || !query.trim()} className="h-11 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40">
          {busy ? "…" : parseYoutubeId(query) ? "Add link" : "Search"}
        </button>
      </form>

      {hits.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(adding)}
            onClick={() => void addHits(hits, false)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium disabled:opacity-40"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            Add all tracks
          </button>
          <button
            type="button"
            disabled={Boolean(adding)}
            onClick={() => void addAlbumFromResults()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            Add as album
          </button>
          <button
            type="button"
            disabled={Boolean(adding)}
            onClick={() => void addHits(hits, true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium disabled:opacity-40"
          >
            <Play className="size-3.5" strokeWidth={2} />
            Play all
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {hits.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {hits.map((hit) => (
            <li key={hit.key} className="flex gap-3 rounded-xl bg-surface p-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{hit.name}</p>
                <p className="truncate text-xs text-muted">{hit.artist}</p>
                {hit.album ? <p className="truncate text-[11px] text-subtle">{hit.album}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={adding === hit.key}
                    onClick={() => void addHits([hit], true)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] text-accent-fg disabled:opacity-40"
                  >
                    {adding === hit.key ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" strokeWidth={2} />}
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={adding === hit.key}
                    onClick={() => void addHits([hit], false)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-raised px-2.5 text-[11px] disabled:opacity-40"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    Add
                  </button>
                  {hit.page ? (
                    <a
                      href={hit.page}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-full px-2.5 text-[11px] text-muted hover:text-fg"
                    >
                      Source
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {inLib.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In your library</p>
          <button
            type="button"
            onClick={() => playIds(inLib.map((t) => t.id))}
            className="h-9 rounded-full bg-raised px-3 text-xs"
          >
            Play {inLib.length} YouTube Music tracks
          </button>
        </div>
      ) : null}
    </section>
  );
}
