import { LoaderCircle, Play, Plus } from "lucide-react";
import { useState } from "react";
import { scResolve, scSearch } from "@/lib/player/soundcloud-api";
import { parseSoundCloudUrl, scStreamProxy, type ScHit } from "@/lib/player/soundcloud";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

export function SoundcloudPanel() {
  const hydrate = usePlayer((s) => s.hydrate);
  const playIds = usePlayer((s) => s.playIds);
  const tracks = usePlayer((s) => s.tracks);
  const flash = usePlayer((s) => s.flash);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ScHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inLib = tracks.filter((t) => (t.tags || []).includes("SoundCloud") || /soundcloud\.com/i.test(t.previewUrl || t.url || ""));

  const runSearch = async () => {
    const link = parseSoundCloudUrl(query);
    if (link) {
      await addHit({ id: link, name: "", artist: "", album: "SoundCloud", genre: "SoundCloud", cover: "", duration: 0, url: link, streamUrl: "", page: link }, true);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await scSearch({ data: { q: query } });
      setHits(result.hits);
      if (!result.hits.length) setMessage("Nothing matched that search.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  const addHit = async (hit: ScHit, play: boolean) => {
    setAdding(hit.id || hit.page);
    setMessage(null);
    try {
      const resolved = await scResolve({
        data: {
          url: hit.page || hit.url,
          id: hit.id,
          streamUrl: hit.streamUrl,
        },
      });
      const stream = resolved.streamUrl || hit.streamUrl;
      if (!stream) throw new Error("No stream for that track.");
      const name = resolved.name || hit.name || "SoundCloud track";
      const artist = resolved.artist || hit.artist || "Unknown artist";
      const cover = resolved.cover || hit.cover || "";
      const page = resolved.page || hit.page || hit.url;
      const duration = resolved.duration || hit.duration || 0;
      const existing = usePlayer.getState().tracks.find((t) => t.previewUrl === stream || t.url === page || (t.name === name && t.artist === artist));
      let id = existing?.id;
      if (!id) {
        id = crypto.randomUUID();
        const proxy = scStreamProxy(stream, page);
        await putStoredTrack({
          id,
          name,
          artist,
          album: resolved.album || hit.album || "SoundCloud",
          genre: resolved.genre || hit.genre || "SoundCloud",
          tags: ["SoundCloud"],
          year: "",
          format: "SC",
          sampleRate: null,
          bitDepth: null,
          bitrate: null,
          channels: 2,
          lossless: false,
          trackNo: undefined,
          duration,
          bytes: undefined,
          albumArtist: artist,
          previewUrl: stream,
          coverRemote: cover || undefined,
          audio: new Blob([`sc:${id}`], { type: "text/plain" }),
          cover: null,
          addedAt: Date.now(),
        });
        await hydrate();
        const after = usePlayer.getState().tracks.find((t) => t.id === id);
        if (after) {
          usePlayer.getState().patchTrack?.(id, { url: proxy, previewUrl: stream, coverUrl: cover || after.coverUrl });
        }
      }
      if (play && id) playIds([id]);
      setMessage(play ? "Playing from SoundCloud." : "Added to your library.");
      flash(play ? "Playing from SoundCloud." : "Added SoundCloud track.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that track.");
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="text-xl font-semibold tracking-tight">SoundCloud</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Search tracks or paste a SoundCloud link to stream and add them to your library.
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
          placeholder="Search or paste soundcloud.com/…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40">
          {busy ? "…" : parseSoundCloudUrl(query) ? "Add link" : "Search"}
        </button>
      </form>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {hits.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {hits.map((hit) => (
            <li key={hit.id} className="flex gap-3 rounded-xl bg-surface p-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{hit.name}</p>
                <p className="truncate text-xs text-muted">{hit.artist}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={adding === hit.id}
                    onClick={() => void addHit(hit, true)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] text-accent-fg disabled:opacity-40"
                  >
                    {adding === hit.id ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" strokeWidth={2} />}
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={adding === hit.id}
                    onClick={() => void addHit(hit, false)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-raised px-2.5 text-[11px] disabled:opacity-40"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    Add
                  </button>
                  <a href={hit.page} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-full px-2.5 text-[11px] text-muted hover:text-fg">
                    Source
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {inLib.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In your library</p>
          <button type="button" onClick={() => playIds(inLib.map((t) => t.id))} className="h-9 rounded-full bg-raised px-3 text-xs">
            Play {inLib.length} SoundCloud tracks
          </button>
        </div>
      ) : null}
    </section>
  );
}
