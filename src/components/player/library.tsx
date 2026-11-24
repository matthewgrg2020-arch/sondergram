import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Flame, Globe, Pencil, Plus, Shuffle, Trash2, X } from "lucide-react";
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
import { AddToPlaylist } from "./add-to-playlist";
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
  const [playlistIds, setPlaylistIds] = useState<string[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [albumSort, setAlbumSort] = useState<"title" | "artist" | "year" | "added">("title");
  const size = view.size;
  const titles = view.titles;

  useEffect(() => {
    if (startTab) setTab(startTab);
  }, [startTab]);
  useEffect(() => {
    if (startAlbum) setOpenAlbum(startAlbum);
  }, [startAlbum]);

  const goTab = (id: Tab) => {
    setTab(id);
    view.setTab(id);
    setOpenAlbum(null);
    setOpenArtist(null);
    setOpenYear(null);
    setOpenGenre(null);
    setEditTrackId(null);
    setAlbumHits(null);
  };

  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);
  const genres = useMemo(() => {
    const list = groupGenres(albums);
    const unknownAlbums = albums.filter((a) => !a.genre || !String(a.genre).trim());
    if (unknownAlbums.length) {
      list.push({
        name: "Unknown",
        albums: unknownAlbums,
        trackCount: unknownAlbums.reduce((n, a) => n + a.trackIds.length, 0),
      });
    }
    return list;
  }, [albums]);

  const songsOf = (ids: string[]) =>
    ids.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];

  const albumDuration = (ids: string[]) =>
    songsOf(ids).reduce((sum, t) => sum + (t.durationSec || 0), 0);

  const newest = (ids: string[]) =>
    Math.max(0, ...songsOf(ids).map((t) => t.addedAt || 0));

  const sortedAlbums = useMemo(() => {
    const list = [...albums];
    list.sort((a, b) => {
      if (albumSort === "artist") return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
      if (albumSort === "year") return (b.year || "").localeCompare(a.year || "") || a.title.localeCompare(b.title);
      if (albumSort === "added") return newest(b.trackIds) - newest(a.trackIds);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [albums, albumSort, tracks]);

  const shufflePlay = (ids: string[]) => {
    const list = shuffleList(ids);
    if (list.length) playIds(list);
  };

  const patchAlbumMeta = (ids: string[], patch: Partial<Track>) => {
    updateAlbumMeta(ids, patch);
  };

  const songMenu = (id: string) => [
    { label: "Play", onClick: () => playRest(id) },
    { label: "Play next", onClick: () => queueNext(id) },
    { label: "Add to queue", onClick: () => queueLast(id) },
    { label: "Add to playlist", onClick: () => setPlaylistIds([id]) },
    { label: "Remove", onClick: () => removeTracks([id]), danger: true },
  ];

  const ShuffleBtn = ({ ids, label = "Shuffle" }: { ids: string[]; label?: string }) => (
    <button type="button" onClick={() => shufflePlay(ids)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
      <Shuffle className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );

  const ShuffleIcon = ({ ids, label }: { ids: string[]; label: string }) => (
    <button type="button" aria-label={label} onClick={() => shufflePlay(ids)} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised text-muted hover:bg-white/10 hover:text-fg">
      <Shuffle className="size-4" strokeWidth={1.75} />
    </button>
  );

  if (tracks.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-2 text-sm text-muted">A quiet shelf — add music from your phone or computer to get started.</p>
        <label className="relative mt-4 inline-flex h-10 w-fit cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
          <Plus className="size-4" strokeWidth={1.75} />
          Add files
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </label>
      </section>
    );
  }

  const album = albums.find((a) => a.key === openAlbum) ?? null;
  const artist = openArtist ? artists.find((a) => a.name === openArtist) : null;
  const genreGroup = openGenre ? genres.find((g) => g.name === openGenre) : null;
  const yearGroup = openYear
    ? { name: openYear, albums: albums.filter((a) => (a.year || "Unknown") === openYear) }
    : null;

  const AlbumGrid = ({ list }: { list: typeof albums }) => (
    <div
      className={cn(
        "grid gap-3",
        size === "s"
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
          : size === "m"
            ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
      )}>
      {list.map((item) => (
        <button key={item.key} type="button" onClick={() => setOpenAlbum(item.key)} className="text-left">
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-raised">
            {item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}
          </div>
          {titles === "on" ? (
            <>
              <p className="mt-2 truncate text-sm">{item.title}</p>
              <p className="truncate text-xs text-muted">{item.artist}</p>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-xs tracking-wide text-subtle">
          {artists.length} artists · {albums.length} albums · {genres.length} genres · {tracks.length} songs
        </p>
      </div>

      {!openAlbum && !openArtist && !openYear && !openGenre ? (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-raised p-1">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => goTab(id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-xs capitalize transition-colors sm:text-sm",
                tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full bg-accent px-3 text-xs font-medium text-accent-fg">
          <Plus className="size-3.5" strokeWidth={1.75} />
          Add files
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </label>
        <label className="relative inline-flex items-center">
          <select
            className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg"
            value={size}
            aria-label="Cover size"
            onChange={(e) => view.setSize(e.target.value as Size)}
          >
            <option value="s">Size: Small</option>
            <option value="m">Size: Medium</option>
            <option value="l">Size: Large</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
        </label>
        <label className="relative inline-flex items-center">
          <select
            className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg"
            value={titles}
            aria-label="Titles"
            onChange={(e) => view.setTitles(e.target.value as TitleMode)}
          >
            <option value="on">Name: Show</option>
            <option value="off">Name: Cover only</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
        </label>
      </div>

      {openAlbum && album ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setOpenAlbum(null);
              setEditTrackId(null);
              setAlbumHits(null);
            }}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Back
          </button>

          <div className="mb-6 grid gap-5 lg:grid-cols-[14rem_1fr]">
            <ArtworkPanel
              src={album.coverUrl}
              artist={album.artist}
              album={album.title}
              trackIds={album.trackIds}
              onFile={(file) => setCover(album.trackIds, file)}
              onRemoveAlbum={() => {
                removeTracks(album.trackIds);
                setOpenAlbum(null);
              }}
            />

            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => playIds(album.trackIds)}
                  className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg"
                >
                  Play
                </button>
                <ShuffleBtn ids={album.trackIds} />
                <button
                  type="button"
                  onClick={() => queueNextMany(album.trackIds)}
                  className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"
                >
                  Play next
                </button>
                <button
                  type="button"
                  onClick={() => album.trackIds.forEach((id) => queueLast(id))}
                  className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"
                >
                  Add to queue
                </button>
                <button
                  type="button"
                  onClick={() => setPlaylistIds(album.trackIds)}
                  className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"
                >
                  Add to playlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && !window.confirm(`Delete album “${album.title}” and its ${album.trackIds.length} tracks from Sondergram?`)) return;
                    removeTracks(album.trackIds);
                    setOpenAlbum(null);
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium text-muted hover:bg-hot hover:text-hot-fg"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                  Delete album
                </button>
                <button
                  type="button"
                  disabled={looking}
                  onClick={async () => {
                    setLooking(true);
                    try {
                      const hits = await searchAlbumOnline(album.artist, album.title);
                      setAlbumHits(Array.isArray(hits) ? hits : []);
                    } finally {
                      setLooking(false);
                    }
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
                >
                  <Globe className="size-4" strokeWidth={1.75} />
                  {looking ? "Looking up…" : "Look up online"}
                </button>
              </div>

              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{album.title}</h3>
                <p className="text-sm text-muted">{album.artist}</p>
                <p className="mt-1 text-xs text-subtle">
                  {[album.year, `${album.trackIds.length} song${album.trackIds.length === 1 ? "" : "s"}`, formatDuration(albumDuration(album.trackIds))]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="mt-1">
                <TagEditor
                  tags={songsOf(album.trackIds)[0]?.tags || []}
                  onChange={(tags) => patchAlbumMeta(album.trackIds, { tags })}
                />
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
                    <button
                      type="button"
                      onClick={() => playRest(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
                    >
                      <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">
                        {t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm">{t.name}</span>
                          {t.popular || t.chartRank ? (
                            <Flame className="size-3.5 shrink-0 text-hot" strokeWidth={2} aria-label="Popular" />
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                      {t.durationSec ? (
                        <span className="shrink-0 text-xs tabular-nums text-subtle">{formatTrackTime(t.durationSec)}</span>
                      ) : null}
                    </button>
                    <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
                    <button
                      type="button"
                      aria-label="Edit track"
                      onClick={() => setEditTrackId(editing ? null : t.id)}
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        editing ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
                      )}
                    >
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
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Online matches</p>
                  <button type="button" onClick={() => setAlbumHits(null)} className="flex size-9 items-center justify-center rounded-full bg-raised">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {albumHits.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">No matches found.</p>
                  ) : (
                    <div className="space-y-2">
                      {albumHits.map((hit, i) => (
                        <button
                          key={`${hit.title}-${i}`}
                          type="button"
                          disabled={applying}
                          onClick={async () => {
                            setApplying(true);
                            try {
                              await applyAlbumHit(album.trackIds, hit);
                              setAlbumHits(null);
                            } finally {
                              setApplying(false);
                            }
                          }}
                          className="flex w-full items-center gap-3 rounded-xl bg-raised p-3 text-left hover:bg-white/10 disabled:opacity-50"
                        >
                          <div className="size-12 shrink-0 overflow-hidden rounded bg-surface">
                            {hit.coverUrl ? <img src={proxyCoverUrl(hit.coverUrl)} alt="" className="size-full object-cover" /> : null}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{hit.title}</span>
                            <span className="block truncate text-xs text-muted">{hit.artist}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : openArtist && artist ? (
        <div>
          <button type="button" onClick={() => setOpenArtist(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Back
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold tracking-tight">{artist.name}</h3>
            <ShuffleBtn ids={artist.albums.flatMap((a) => a.trackIds)} />
          </div>
          <AlbumGrid list={artist.albums} />
        </div>
      ) : openGenre && genreGroup ? (
        <div>
          <button type="button" onClick={() => setOpenGenre(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Back
          </button>
          <h3 className="mb-4 text-2xl font-semibold tracking-tight">{genreGroup.name}</h3>
          <AlbumGrid list={genreGroup.albums} />
        </div>
      ) : openYear && yearGroup ? (
        <div>
          <button type="button" onClick={() => setOpenYear(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Back
          </button>
          <h3 className="mb-4 text-2xl font-semibold tracking-tight">{yearGroup.name}</h3>
          <AlbumGrid list={yearGroup.albums} />
        </div>
      ) : tab === "albums" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative inline-flex items-center">
              <select
                className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg"
                value={albumSort}
                aria-label="Sort albums"
                onChange={(e) => setAlbumSort(e.target.value as typeof albumSort)}
              >
                <option value="title">Sort: Title</option>
                <option value="artist">Sort: Artist</option>
                <option value="year">Sort: Year</option>
                <option value="added">Sort: Recently added</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
            </label>
          </div>
          <AlbumGrid list={sortedAlbums} />
        </div>
      ) : tab === "artists" ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
          {artists.map((a) => (
            <button key={a.key} type="button" onClick={() => setOpenArtist(a.name)} className="text-left">
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-raised">
                {a.coverUrl ? <img src={proxyCoverUrl(a.coverUrl)} alt="" className="size-full object-cover" /> : null}
              </div>
              <p className="mt-2 truncate text-sm">{a.name}</p>
              <p className="truncate text-xs text-muted">{a.albumCount} albums</p>
            </button>
          ))}
        </div>
      ) : tab === "genres" ? (
        <div className="space-y-2">
          {genres.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => setOpenGenre(g.name)}
              className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"
            >
              <span className="text-sm font-medium">{g.name}</span>
              <span className="text-xs text-muted">{g.albums.length} albums</span>
            </button>
          ))}
        </div>
      ) : tab === "years" ? (
        <div className="space-y-2">
          {[...new Set(albums.map((a) => a.year || "Unknown"))].sort((a, b) => b.localeCompare(a)).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setOpenYear(y)}
              className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"
            >
              <span className="text-sm font-medium">{y}</span>
              <span className="text-xs text-muted">{albums.filter((a) => (a.year || "Unknown") === y).length} albums</span>
            </button>
          ))}
        </div>
      ) : tab === "songs" || tab === "liked" || tab === "added" ? (
        <div className="divide-y divide-border">
          {(tab === "liked"
            ? tracks.filter((t) => t.liked)
            : tab === "added"
              ? [...tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
              : tracks
          ).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2">
              <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">
                  {t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{t.artist}</span>
                </span>
              </button>
              <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
            </div>
          ))}
        </div>
      ) : null}

      {playlistIds ? <AddToPlaylist trackIds={playlistIds} onClose={() => setPlaylistIds(null)} /> : null}
    </section>
  );
}
