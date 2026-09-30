import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Globe, Pencil, Plus, Shuffle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { albumKey, groupAlbums, groupArtists, groupGenres } from "@/lib/player/catalog";
import { AUDIO_ACCEPT, formatDuration, formatTrackTime } from "@/lib/player/format";
import { usePlayer, type Track } from "@/lib/player/store";
import { proxyCoverUrl } from "@/lib/player/covers";
import type { AlbumHit } from "@/lib/player/lookup";
import { useLibraryView, type CoverSize, type LibTab, type TitleMode } from "@/lib/player/library-view";
import { ArtworkPanel } from "./cover-search";
import { Field } from "./metadata-panel";
import { TagEditor } from "./tag-editor";
import { FormatBadge } from "./format-badge";
import { MoreMenu } from "./more-menu";

type Tab = LibTab;
type Size = CoverSize;
const TAB_IDS: Tab[] = ["albums", "artists", "genres", "years", "songs", "liked", "added"];

function shuffleList(ids: string[]) {
  const list = ids.filter(Boolean);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function Library({ startTab, startAlbum }: { startTab?: Tab; startAlbum?: string | null } = {}) {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const playRest = usePlayer((s) => s.playRest);
  const queueNext = usePlayer((s) => s.queueNext);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const queueLast = usePlayer((s) => s.queueLast);
  const addFiles = usePlayer((s) => s.addFiles);
  const setCover = usePlayer((s) => s.setCover);
  const updateAlbumMeta = usePlayer((s) => s.updateAlbumMeta);
  const updateMeta = usePlayer((s) => s.updateMeta);
  const removeTracks = usePlayer((s) => s.removeTracks);
  const searchAlbumOnline = usePlayer((s) => s.searchAlbumOnline);
  const applyAlbumHit = usePlayer((s) => s.applyAlbumHit);
  const inputRef = useRef<HTMLInputElement>(null);
  const view = useLibraryView();
  const [tab, setTab] = useState<Tab>(startTab ?? view.tab);
  const [openAlbum, setOpenAlbum] = useState<string | null>(startAlbum ?? null);
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [openYear, setOpenYear] = useState<string | null>(null);
  const [openGenre, setOpenGenre] = useState<string | null>(null);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);
  const [applying, setApplying] = useState(false);
  const size = view.size;
  const titles = view.titles;

  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]);
  useEffect(() => { if (startAlbum) { setTab("albums"); setOpenAlbum(startAlbum); } }, [startAlbum]);

  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);
  const years = useMemo(() => {
    const map = new Map<string, typeof albums>();
    for (const album of albums) {
      const y = (album.year || "").trim() || "Unknown";
      const list = map.get(y) ?? [];
      list.push(album);
      map.set(y, list);
    }
    return [...map.entries()]
      .map(([name, list]) => ({ name, albums: list, trackIds: list.flatMap((a) => a.trackIds) }))
      .sort((a, b) => (a.name === "Unknown" ? 1 : b.name === "Unknown" ? -1 : b.name.localeCompare(a.name)));
  }, [albums]);
  const genres = useMemo(() => {
    const list = groupGenres(albums);
    const covered = new Set(list.flatMap((g) => g.albums.map((a) => a.key)));
    const unknownAlbums = albums.filter((a) => !covered.has(a.key) && !(a.genre || "").trim());
    if (unknownAlbums.length) {
      list.push({ name: "Unknown", albums: unknownAlbums, trackCount: unknownAlbums.reduce((n, a) => n + a.trackIds.length, 0) });
    }
    return list;
  }, [albums]);

  const album = albums.find((a) => a.key === openAlbum) ?? null;
  const artist = artists.find((a) => a.key === openArtist) ?? null;
  const yearGroup = years.find((y) => y.name === openYear) ?? null;
  const genreGroup = genres.find((g) => g.name === openGenre) ?? null;
  const liked = useMemo(() => tracks.filter((t) => t.liked), [tracks]);
  const added = useMemo(() => [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 120), [tracks]);
  const songsOf = (ids: string[]) => ids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => Boolean(t));
  const albumDuration = (ids: string[]) => songsOf(ids).reduce((sum, t) => sum + (Number(t.durationSec) > 0 ? Number(t.durationSec) : 0), 0);
  const songMenu = (id: string) => [
    { label: "Play next", onClick: () => queueNext(id) },
    { label: "Add to queue", onClick: () => queueLast(id) },
  ];
  const shufflePlay = (ids: string[]) => {
    const list = shuffleList(ids);
    if (list.length) playIds(list);
  };

  const goTab = (id: Tab) => {
    setTab(id);
    if (id !== "liked") view.setTab(id);
    setOpenAlbum(null); setOpenArtist(null); setOpenYear(null); setOpenGenre(null); setEditTrackId(null);
  };
  const patchAlbumMeta = (ids: string[], patch: Partial<Pick<Track, "album" | "year" | "albumArtist" | "genre" | "artist" | "tags">>) => {
    updateAlbumMeta(ids, patch);
    const first = usePlayer.getState().tracks.find((t) => t.id === ids[0]);
    if (first) setOpenAlbum(albumKey(first));
  };
  const openLookup = () => {
    if (!album) return;
    setAlbumHits([]);
    setLooking(true);
    void searchAlbumOnline(album.trackIds).then((hits) => setAlbumHits(hits)).catch(() => setAlbumHits([])).finally(() => setLooking(false));
  };
  const pickHit = async (hit: AlbumHit) => {
    if (!album) return;
    setApplying(true);
    try {
      await applyAlbumHit(album.trackIds, hit);
      setAlbumHits(null);
      const first = usePlayer.getState().tracks.find((t) => t.id === album.trackIds[0]);
      if (first) setOpenAlbum(albumKey(first));
    } finally { setApplying(false); }
  };

  const gridClass = size === "s" ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" : size === "l" ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  const AlbumGrid = ({ list }: { list: typeof albums }) => (
    <div className={cn("grid w-full gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-5", gridClass)}>
      {list.map((item) => (
        <button key={item.key} type="button" onClick={() => setOpenAlbum(item.key)} className="min-w-0 text-left">
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-raised">{item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
          {titles === "on" ? (<><p className="mt-2 truncate text-sm">{item.title}</p><p className="truncate text-xs text-muted">{item.artist}</p>{item.year ? <p className="truncate text-[11px] text-subtle">{item.year}</p> : null}</>) : null}
        </button>
      ))}
    </div>
  );
  const ShuffleBtn = ({ ids, label = "Shuffle" }: { ids: string[]; label?: string }) => ids.length ? (
    <button type="button" onClick={() => shufflePlay(ids)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
      <Shuffle className="size-4" strokeWidth={1.75} />{label}
    </button>
  ) : null;
  const ShuffleIcon = ({ ids, label }: { ids: string[]; label: string }) => (
    <button type="button" aria-label={label} onClick={() => shufflePlay(ids)} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-muted hover:bg-white/10 hover:text-fg">
      <Shuffle className="size-4" strokeWidth={1.75} />
    </button>
  );

  if (tracks.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-2 text-sm text-muted">A quiet shelf — add music to get started.</p>
        <label className="relative mt-4 inline-flex h-10 w-fit cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
          <Plus className="size-4" strokeWidth={1.75} />Add files
          <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
        </label>
      </section>
    );
  }

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-xs tracking-wide text-subtle">{artists.length} artists · {albums.length} albums · {genres.length} genres · {tracks.length} songs</p>
      </div>
      {!openAlbum && !openArtist && !openYear && !openGenre ? (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-raised p-1">
          {TAB_IDS.map((id) => (
            <button key={id} type="button" onClick={() => goTab(id)} className={cn("h-9 shrink-0 rounded-full px-3 text-xs capitalize transition-colors sm:text-sm", tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{id}</button>
          ))}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative inline-flex items-center">
          <select className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg" value={size} aria-label="Cover size" onChange={(e) => view.setSize(e.target.value as Size)}>
            <option value="s">Size: Small</option><option value="m">Size: Medium</option><option value="l">Size: Large</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
        </label>
        <label className="relative inline-flex items-center">
          <select className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg" value={titles} aria-label="Titles" onChange={(e) => view.setTitles(e.target.value as TitleMode)}>
            <option value="on">Name: Show</option><option value="off">Name: Cover only</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
        </label>
      </div>

      {openAlbum && album ? (
        <div>
          <button type="button" onClick={() => { setOpenAlbum(null); setEditTrackId(null); setAlbumHits(null); }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />Back
          </button>
          <div className="mb-6 grid gap-5 lg:grid-cols-[14rem_1fr]">
            <ArtworkPanel src={album.coverUrl} artist={album.artist} album={album.title} trackIds={album.trackIds} onFile={(file) => setCover(album.trackIds, file)} onRemoveAlbum={() => { removeTracks(album.trackIds); setOpenAlbum(null); }} />
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => playIds(album.trackIds)} className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg">Play</button>
                <ShuffleBtn ids={album.trackIds} />
                <button type="button" onClick={() => queueNextMany(album.trackIds)} className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">Play next</button>
                <button type="button" onClick={() => album.trackIds.forEach((id) => queueLast(id))} className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">Add to queue</button>
                <button type="button" disabled={looking} onClick={openLookup} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10 disabled:opacity-60">
                  <Globe className="size-4" strokeWidth={1.75} />{looking ? "Looking up…" : "Look up online"}
                </button>
                <p className="text-xs text-subtle">{[album.year, `${album.trackIds.length} song${album.trackIds.length === 1 ? "" : "s"}`, formatDuration(albumDuration(album.trackIds))].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-raised/60 p-4">
                <div className="mb-3 flex items-center gap-2"><Pencil className="size-4 text-accent" strokeWidth={2} /><h3 className="text-sm font-semibold tracking-tight">Edit metadata</h3></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Album" value={album.title} placeholder="Album title" onSave={(title) => patchAlbumMeta(album.trackIds, { album: title })} />
                  <Field label="Artist" value={album.artist} placeholder="Artist name" onSave={(artistName) => patchAlbumMeta(album.trackIds, { artist: artistName, albumArtist: artistName })} />
                  <Field label="Year" value={album.year || ""} placeholder="1998" onSave={(year) => patchAlbumMeta(album.trackIds, { year })} />
                  <Field label="Genre" value={songsOf(album.trackIds)[0]?.genre || ""} placeholder="Genre" onSave={(genre) => patchAlbumMeta(album.trackIds, { genre })} />
                </div>
                <div className="mt-3"><TagEditor tags={songsOf(album.trackIds)[0]?.tags || []} onChange={(tags) => patchAlbumMeta(album.trackIds, { tags })} /></div>
              </div>
            </div>
          </div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-subtle">Tracks</h3>
          <div className="divide-y divide-border">
            {songsOf(album.trackIds).map((t) => {
              const editing = editTrackId === t.id;
              return (
                <div key={t.id} className="py-2">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90">
                      <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">{t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                      {t.durationSec ? <span className="shrink-0 text-xs tabular-nums text-subtle">{formatTrackTime(t.durationSec)}</span> : null}
                    </button>
                    <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
                    <button type="button" aria-label="Edit track" onClick={() => setEditTrackId(editing ? null : t.id)} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", editing ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg")}>
                      <Pencil className="size-3.5" strokeWidth={2} />
                    </button>
                  </div>
                  {editing ? (
                    <div className="mt-2 grid gap-2 rounded-xl bg-raised p-3 sm:grid-cols-2">
                      <Field label="Title" value={t.name} placeholder="Song title" onSave={(name) => updateMeta(t.id, { name })} />
                      <Field label="Artist" value={t.artist} placeholder="Artist" onSave={(artistName) => updateMeta(t.id, { artist: artistName })} />
                      <Field label="Album" value={t.album} placeholder="Album" onSave={(albumName) => updateMeta(t.id, { album: albumName })} />
                      <Field label="Year" value={t.year || ""} placeholder="1998" onSave={(year) => updateMeta(t.id, { year })} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {albumHits !== null ? (
            <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
              <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
                <div className="flex items-center justify-between px-4 py-3">
                  <h3 className="text-sm font-semibold">Online matches</h3>
                  <button type="button" onClick={() => setAlbumHits(null)} className="flex size-8 items-center justify-center rounded-full hover:bg-raised"><X className="size-4" /></button>
                </div>
                <div className="overflow-y-auto p-4">
                  {looking ? <p className="py-6 text-center text-sm text-muted">Searching iTunes and catalogs…</p> : null}
                  {!looking && albumHits.length === 0 ? <p className="py-8 text-center text-sm text-muted">No album match. Edit the title or artist, then look up again.</p> : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {albumHits.map((hit) => (
                      <button key={`${hit.artist}-${hit.title}-${hit.year}-${hit.artwork}`} type="button" disabled={applying} onClick={() => void pickHit(hit)} className="text-left disabled:opacity-60">
                        <div className="aspect-square overflow-hidden rounded-lg bg-raised">{hit.artwork ? <img src={proxyCoverUrl(hit.artwork)} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}</div>
                        <p className="mt-1.5 truncate text-xs font-medium">{hit.title}</p>
                        <p className="truncate text-[10px] text-muted">{[hit.artist, hit.year, hit.genre].filter(Boolean).join(" · ")}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {openArtist && artist && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenArtist(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} />Artists</button>
          <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="mr-2 text-2xl font-semibold tracking-tight">{artist.name}</h3><ShuffleBtn ids={albums.filter((a) => a.artist === artist.name).flatMap((a) => a.trackIds)} /></div>
          <AlbumGrid list={albums.filter((a) => a.artist === artist.name)} />
        </div>
      ) : null}
      {openYear && yearGroup && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenYear(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} />Years</button>
          <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="mr-2 text-2xl font-semibold tracking-tight">{yearGroup.name}</h3><ShuffleBtn ids={yearGroup.trackIds} /></div>
          <AlbumGrid list={yearGroup.albums} />
        </div>
      ) : null}
      {openGenre && genreGroup && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenGenre(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} />Genres</button>
          <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="mr-2 text-2xl font-semibold tracking-tight">{genreGroup.name}</h3><ShuffleBtn ids={genreGroup.albums.flatMap((a) => a.trackIds)} /></div>
          <AlbumGrid list={genreGroup.albums} />
        </div>
      ) : null}

      {!openAlbum && !openArtist && !openYear && !openGenre ? (
        <>
          {tab === "albums" ? (<><div className="mb-3"><ShuffleBtn ids={albums.flatMap((a) => a.trackIds)} label="Shuffle all" /></div><AlbumGrid list={albums} /></>) : null}
          {tab === "artists" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {artists.map((row) => (
                <button key={row.key} type="button" onClick={() => setOpenArtist(row.key)} className="rounded-xl bg-raised px-4 py-3 text-left hover:bg-accent hover:text-accent-fg">
                  <span className="block truncate text-sm font-semibold">{row.name}</span>
                  <span className="text-xs opacity-70">{row.albums.length} albums</span>
                </button>
              ))}
            </div>
          ) : null}
          {tab === "genres" ? (
            <div className="space-y-2">
              {genres.map((row) => (
                <div key={row.name} className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpenGenre(row.name)} className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-accent hover:text-accent-fg">
                    <span className="text-lg font-semibold tracking-tight">{row.name}</span>
                    <span className="text-xs opacity-70">{row.albums.length} albums</span>
                  </button>
                  <ShuffleIcon ids={row.albums.flatMap((a) => a.trackIds)} label={`Shuffle ${row.name}`} />
                </div>
              ))}
            </div>
          ) : null}
          {tab === "years" ? (
            <div className="space-y-2">
              {years.map((row) => (
                <div key={row.name} className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpenYear(row.name)} className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-accent hover:text-accent-fg">
                    <span className="text-lg font-semibold tracking-tight">{row.name}</span>
                    <span className="text-xs opacity-70">{row.albums.length} albums</span>
                  </button>
                  <ShuffleIcon ids={row.trackIds} label={`Shuffle ${row.name}`} />
                </div>
              ))}
            </div>
          ) : null}
          {tab === "songs" || tab === "liked" || tab === "added" ? (
            <div>
              <div className="mb-3"><ShuffleBtn ids={(tab === "songs" ? tracks : tab === "liked" ? liked : added).map((t) => t.id)} label={tab === "liked" ? "Shuffle liked" : tab === "added" ? "Shuffle recent" : "Shuffle songs"} /></div>
              <div className="divide-y divide-border">
                {(tab === "songs" ? tracks : tab === "liked" ? liked : added).map((t) => (
                  <div key={t.id} className="flex items-center gap-1 px-1 py-2 hover:bg-raised">
                    <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">{t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                      {t.durationSec ? <span className="shrink-0 text-xs tabular-nums text-subtle">{formatTrackTime(t.durationSec)}</span> : t.year ? <span className="text-xs text-subtle">{t.year}</span> : null}
                    </button>
                    <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
