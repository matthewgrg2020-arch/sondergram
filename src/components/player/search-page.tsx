import { LoaderCircle, Music2, Play, Plus, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseArchiveId } from "@/lib/player/archive";
import { parseBandcampUrl } from "@/lib/player/bandcamp";
import { groupAlbums, groupArtists } from "@/lib/player/catalog";
import { proxyCoverUrl } from "@/lib/player/covers";
import { loadSlskSession } from "@/lib/player/soulseek";
import { streamSearch } from "@/lib/player/stream-search-api";
import type { StreamHit } from "@/lib/player/stream-search";
import { usePlayer, type Track } from "@/lib/player/store";
import { cn } from "@/lib/utils";
import { AddToPlaylist } from "./add-to-playlist";
import { MoreMenu } from "./more-menu";

type OnlineTab = "youtube-music" | "soundcloud" | "soulseek";

export function SearchPage({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const queueNext = usePlayer((s) => s.queueNext);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const importArchive = usePlayer((s) => s.importArchive);
  const importBandcamp = usePlayer((s) => s.importBandcamp);
  const importStreamHits = usePlayer((s) => s.importStreamHits);
  const [adding, setAdding] = useState(false);
  const [playlistIds, setPlaylistIds] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tab, setTab] = useState<OnlineTab>("youtube-music");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StreamHit | Track | null>(null);
  const [side, setSide] = useState<"details" | "lyrics" | "queue">("details");
  const [ytWarn, setYtWarn] = useState(true);
  const [losslessOnly, setLosslessOnly] = useState(false);
  const q = query.trim().toLowerCase();
  const archiveId = parseArchiveId(query);
  const bandcampUrl = parseBandcampUrl(query);
  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);
  const slsk = loadSlskSession();

  const songHits = q
    ? tracks.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      )
    : [];
  const albumHits = q ? albums.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) : [];
  const artistHits = q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : [];
  const libEmpty = Boolean(q) && artistHits.length + albumHits.length + songHits.length === 0;

  useEffect(() => {
    if (!q || q.length < 2) {
      setHits([]);
      return;
    }
    if (tab === "soulseek") {
      setHits([]);
      return;
    }
    let live = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      const sources =
        tab === "youtube-music" ? (["YouTube Music"] as const) : tab === "soundcloud" ? (["Audius"] as const) : undefined;
      void streamSearch({ data: { q: query.trim(), sources: sources as any } })
        .then((res) => {
          if (!live) return;
          let list = res.hits || [];
          if (tab === "youtube-music") {
            list = list.filter((h) => h.youtubeId || h.source === "YouTube Music" || h.source === "YouTube");
          }
          setHits(list);
        })
        .catch(() => {
          if (live) setHits([]);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 360);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, tab, query]);

  const playHit = async (hit: StreamHit) => {
    setAdding(true);
    setNote(null);
    try {
      const n = await importStreamHits([hit], true);
      setNote(n ? "Playing from search." : "Already in your library.");
      setSelected(hit);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not play that result.");
    } finally {
      setAdding(false);
    }
  };

  const addHit = async (hit: StreamHit) => {
    setAdding(true);
    setNote(null);
    try {
      const n = await importStreamHits([hit], false);
      setNote(n ? `Added ${n} to library.` : "Already in your library.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add that result.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Search</h2>
        <label className="relative mt-4 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Artists, songs, albums…"
            className="h-12 w-full rounded-xl bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-subtle"
          />
        </label>

        {bandcampUrl ? (
          <div className="mt-5 rounded-xl bg-surface p-4">
            <p className="text-sm">Bandcamp link</p>
            <p className="mt-1 truncate font-mono text-xs text-muted">{bandcampUrl}</p>
            <button
              type="button"
              disabled={adding}
              onClick={() => {
                setAdding(true);
                setNote(null);
                void importBandcamp(bandcampUrl, true)
                  .then((n) => setNote(n ? `Added ${n} tracks.` : "Already in your library."))
                  .catch((err) => setNote(err instanceof Error ? err.message : "Could not add that link."))
                  .finally(() => setAdding(false));
              }}
              className="mt-3 h-11 w-full rounded-full bg-hot text-sm font-semibold text-hot-fg disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add this album"}
            </button>
          </div>
        ) : null}

        {archiveId ? (
          <div className="mt-5 rounded-xl bg-surface p-4">
            <p className="text-sm">Internet Archive link</p>
            <p className="mt-1 truncate font-mono text-xs text-muted">{archiveId}</p>
            <button
              type="button"
              disabled={adding}
              onClick={() => {
                setAdding(true);
                setNote(null);
                void importArchive(archiveId, true, true)
                  .then((n) => setNote(n ? `Added ${n} tracks.` : "Already in your library."))
                  .catch((err) => setNote(err instanceof Error ? err.message : "Could not add that link."))
                  .finally(() => setAdding(false));
              }}
              className="mt-3 h-11 w-full rounded-full bg-hot text-sm font-semibold text-hot-fg disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add this recording"}
            </button>
          </div>
        ) : null}

        {q ? (
          <div className="mt-6">
            {libEmpty ? (
              <p className="mb-4 flex items-center gap-2 text-sm text-muted">
                <Music2 className="size-4 shrink-0" strokeWidth={1.75} />
                Nothing in your library for “{query.trim()}”
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted">In your library</p>
            )}

            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-subtle">Online</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["youtube-music", "YouTube Music"],
                    ["soundcloud", "SoundCloud"],
                    ["soulseek", "Soulseek"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs font-medium",
                      tab === id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {ytWarn && tab === "youtube-music" ? (
              <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-100/90">
                  <strong className="font-semibold">Downloads use yt-dlp.</strong> Only download what you own or are allowed to save; copyright rules depend on where you are and the source.
                </p>
                <button type="button" onClick={() => setYtWarn(false)} className="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-50">
                  Got it
                </button>
              </div>
            ) : null}

            {tab === "soulseek" && !slsk?.user ? (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-100">Sign in to Soulseek in Settings → Integrations first.</p>
                    <p className="mt-0.5 text-[11px] text-amber-100/70">Sign in with a Soulseek account in Settings → Integrations → Soulseek.</p>
                  </div>
                  <a href="#settings" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-50">
                    <Settings className="size-3" strokeWidth={2} />
                    Settings
                  </a>
                </div>
                <p className="mt-2 text-sm text-red-400">Sign in to Soulseek in Settings → Integrations first.</p>
              </div>
            ) : null}

            {tab === "soulseek" ? (
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLosslessOnly((v) => !v)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium",
                    losslessOnly ? "bg-accent text-accent-fg" : "bg-raised text-muted",
                  )}
                >
                  Lossless only
                </button>
                <p className="text-[11px] text-subtle">Files people share through Soulseek — not in your library</p>
              </div>
            ) : null}

            {note ? <p className="mb-3 text-sm text-muted">{note}</p> : null}

            {tab !== "soulseek" ? (
              <div className="space-y-2">
                {busy ? (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <LoaderCircle className="size-4 animate-spin" />
                    Searching {tab === "youtube-music" ? "YouTube Music" : "SoundCloud"}…
                  </p>
                ) : null}
                {!busy && hits.length === 0 && q.length >= 2 ? (
                  <p className="text-sm text-muted">No online matches for “{query.trim()}”.</p>
                ) : null}
                <ul className="divide-y divide-border/50">
                  {hits.map((hit) => (
                    <li key={hit.key} className="flex items-center gap-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(hit);
                          setSide("details");
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-raised">
                          {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{hit.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {hit.artist}
                            {hit.album ? ` · ${hit.album}` : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={adding}
                        onClick={() => void playHit(hit)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
                        aria-label={`Play ${hit.name}`}
                      >
                        <Play className="size-4 translate-x-px" strokeWidth={2} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        disabled={adding}
                        onClick={() => void addHit(hit)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted hover:text-fg disabled:opacity-40"
                        aria-label={`Add ${hit.name}`}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : slsk?.user ? (
              <p className="text-sm text-muted">
                Open the Soulseek panel from the sidebar to search peers for “{query.trim()}”
                {losslessOnly ? " (lossless preferred)" : ""}.
              </p>
            ) : null}

            {!libEmpty ? (
              <div className="mt-8 space-y-6">
                {artistHits.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-lg font-semibold">Artists</h3>
                    <div className="flex gap-4 overflow-x-auto pb-1">
                      {artistHits.map((artist) => (
                        <button key={artist.key} type="button" onClick={() => playIds(artist.albums.flatMap((a) => a.trackIds))} className="w-28 shrink-0 text-center">
                          <div className="mx-auto size-28 overflow-hidden rounded-full bg-raised">
                            {artist.coverUrl ? <img src={proxyCoverUrl(artist.coverUrl)} alt="" className="size-full object-cover" /> : null}
                          </div>
                          <p className="mt-2 truncate text-sm">{artist.name}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                {albumHits.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-lg font-semibold">Albums</h3>
                    <div className="flex gap-4 overflow-x-auto pb-1">
                      {albumHits.map((album) => (
                        <div key={album.key} className="group/cover relative w-32 shrink-0 text-left">
                          <button type="button" onClick={() => playIds(album.trackIds)} className="w-full text-left">
                            <div className="aspect-square overflow-hidden rounded-md bg-raised">
                              {album.coverUrl ? <img src={proxyCoverUrl(album.coverUrl)} alt="" className="size-full object-cover" /> : null}
                            </div>
                            <p className="mt-2 truncate text-sm">{album.title}</p>
                            <p className="truncate text-xs text-muted">{album.artist}</p>
                          </button>
                          <MoreMenu
                            className="absolute right-1 top-1"
                            label={`More for ${album.title}`}
                            items={[
                              { label: "Play", onClick: () => playIds(album.trackIds) },
                              { label: "Play next", onClick: () => queueNextMany(album.trackIds) },
                              { label: "Add to playlist", onClick: () => setPlaylistIds(album.trackIds) },
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {songHits.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-lg font-semibold">Songs</h3>
                    <ul>
                      {songHits.slice(0, 40).map((track) => (
                        <li key={track.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(track);
                              usePlayer.getState().playRest(track.id);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-raised"
                          >
                            <div className="size-10 overflow-hidden rounded-sm bg-raised">
                              {track.coverUrl ? <img src={proxyCoverUrl(track.coverUrl)} alt="" className="size-full object-cover" /> : null}
                            </div>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{track.name}</span>
                              <span className="block truncate text-xs text-muted">{track.artist}</span>
                            </span>
                          </button>
                          <MoreMenu
                            tone="plain"
                            label={`More for ${track.name}`}
                            items={[
                              { label: "Play next", onClick: () => queueNext(track.id) },
                              { label: "Add to queue", onClick: () => usePlayer.getState().queueLast(track.id) },
                              { label: "Add to playlist", onClick: () => setPlaylistIds([track.id]) },
                            ]}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted">Search your library, YouTube Music, SoundCloud, or Soulseek. Paste a Bandcamp or Archive link to add it.</p>
        )}
      </div>

      <aside className="hidden w-[22rem] shrink-0 border-l border-border bg-surface/40 lg:flex lg:flex-col">
        <div className="flex gap-1 border-b border-border p-2">
          {(["details", "lyrics", "queue"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSide(id)}
              className={cn(
                "h-8 flex-1 rounded-full text-xs font-semibold uppercase tracking-wide",
                side === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {id}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <>
              <div className="aspect-square overflow-hidden rounded-xl bg-raised">
                {"cover" in selected && selected.cover ? (
                  <img src={selected.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                ) : "coverUrl" in selected && selected.coverUrl ? (
                  <img src={proxyCoverUrl(selected.coverUrl)} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <h3 className="mt-4 text-lg font-semibold leading-tight">{selected.name}</h3>
              <p className="mt-1 text-sm text-muted">{selected.artist}</p>
              {"album" in selected && selected.album ? <p className="text-xs text-subtle">{selected.album}</p> : null}
              <p className="mt-2 text-[10px] uppercase tracking-widest text-subtle">
                {"source" in selected ? `Playing from search · ${selected.source}` : "In library"}
              </p>
              {side === "lyrics" ? (
                <p className="mt-6 text-sm leading-relaxed text-muted">Open Now Playing for full synced lyrics while the track plays.</p>
              ) : null}
              {side === "queue" ? <p className="mt-6 text-sm text-muted">Queue controls are on the Now Playing screen and mini player.</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted">Select a result to preview details here.</p>
          )}
        </div>
      </aside>

      <AddToPlaylist trackIds={playlistIds ?? []} open={Boolean(playlistIds)} onClose={() => setPlaylistIds(null)} />
    </div>
  );
}
