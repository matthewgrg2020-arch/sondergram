import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Flame, Globe, Pencil, Plus, Shuffle, X } from "lucide-react";
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
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);
  const [looking, setLooking] = useState(false);
  const size = view.size;
  const titles = view.titles;
  const albumSort = view.albumSort;
  const setAlbumSort = view.setAlbumSort;

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
    { label: "Edit", onClick: () => setEditTrackId(id) },
    { label: "Remove", onClick: () => removeTracks([id]), danger: true },
  ];

  const ShuffleBtn = ({ ids, label = "Shuffle" }: { ids: string[]; label?: string }) => (
    <button type="button" onClick={() => shufflePlay(ids)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
      <Shuffle className="size-4" strokeWidth={1.75} />{label}
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
          <Plus className="size-4" strokeWidth={1.75} />Add files
          <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
        </label>
      </section>
    );
  }

  const album = albums.find((a) => a.key === openAlbum) ?? null;
  const artist = openArtist ? artists.find((a) => a.name === openArtist) : null;
  const genreGroup = openGenre ? genres.find((g) => g.name === openGenre) : null;
  const yearGroup = openYear
    ? {
        name: openYear,
        albums: albums.filter((a) => (a.year || "Unknown") === openYear),
      }
    : null;

  const AlbumGrid = ({ list }: { list: typeof albums }) => (
    <div
      className={cn(
        "grid gap-3",
        size === "s" ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6" : size === "m" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
      )}
    >
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
            <ChevronLeft className="size-4" strokeWidth={1.75} />Back
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
                <button type="button" onClick={() => playIds(album.trackIds)} className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg">
                  Play
                </button>
                <ShuffleBtn ids={album.trackIds} />
                <button type="button" onClick={() => queueNextMany(album.trackIds)} className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
                  Play next
                </button>
                <button type="button" onClick={() => album.trackIds.forEach((id) => queueLast(id))} className="h-10 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
                  Add to queue
                </button>
                <button
                  type="button"
                  disabled={looking}
                  onClick={async () => {
                    setLooking(true);
                    try {
                      const hits = await searchAlbumOnline(album.artist, album.title);
                      setAlbumHits(hits);
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
              <div className="mt-3">
                <TagEditor tags={songsOf(album.trackIds)[0]?.tags || []} onChange={(tags) => patchAlbumMeta(album.trackIds, { tags })} />
              </div>
              {albumHits && albumHits.length > 0 ? (
                <div className="space-y-2 rounded-xl bg-raised p-3">
                  <p className="text-xs font-medium text-subtle">Matches</p>
                  {albumHits.slice(0, 6).map((hit, i) => (
                    <button
                      key={`${hit.title}-${i}`}
                      type="button"
                      onClick={() => {
                        applyAlbumHit(album.trackIds, hit);
                        setAlbumHits(null);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                    >
                      {hit.coverUrl ? (
                        <img src={proxyCoverUrl(hit.coverUrl)} alt="" className="size-10 rounded object-cover" />
                      ) : (
                        <div className="size-10 rounded bg-black/30" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{hit.title}</span>
                        <span className="block truncate text-xs text-muted">{hit.artist}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="divide-y divide-border">
            {songsOf(album.trackIds).map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="w-6 text-xs text-subtle">{t.trackNo || ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.name}</span>
                    <span className="block truncate text-xs text-muted">{t.artist}</span>
                  </span>
                  <FormatBadge format={t.format} />
                  <span className="w-12 text-right text-xs text-subtle">{t.durationSec ? formatTrackTime(t.durationSec) : ""}</span>
                </button>
                <AddToPlaylist trackId={t.id} />
                <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
              </div>
            ))}
          </div>

          {editTrackId ? (
            <div className="mt-4 rounded-xl bg-raised p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Edit track</p>
                <button type="button" onClick={() => setEditTrackId(null)} className="text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
              {(() => {
                const t = tracks.find((x) => x.id === editTrackId);
                if (!t) return null;
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" value={t.name} onChange={(v) => updateMeta(t.id, { name: v })} />
                    <Field label="Artist" value={t.artist} onChange={(v) => updateMeta(t.id, { artist: v })} />
                    <Field label="Album" value={t.album} onChange={(v) => updateMeta(t.id, { album: v })} />
                    <Field label="Year" value={t.year || ""} onChange={(v) => updateMeta(t.id, { year: v })} />
                    <Field label="Genre" value={t.genre || ""} onChange={(v) => updateMeta(t.id, { genre: v })} />
                    <Field label="Track #" value={String(t.trackNo || "")} onChange={(v) => updateMeta(t.id, { trackNo: Number(v) || 0 })} />
                  </div>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}

      {openArtist && artist && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenArtist(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />Back
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-2xl font-semibold tracking-tight">{artist.name}</h3>
            <ShuffleBtn ids={albums.filter((a) => a.artist === artist.name).flatMap((a) => a.trackIds)} />
          </div>
          <AlbumGrid list={artist.albums} />
        </div>
      ) : null}

      {openYear && yearGroup && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenYear(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />Back
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-2xl font-semibold tracking-tight">{yearGroup.name}</h3>
            <ShuffleBtn ids={yearGroup.albums.flatMap((a) => a.trackIds)} />
          </div>
          <AlbumGrid list={yearGroup.albums} />
        </div>
      ) : null}

      {openGenre && genreGroup && !openAlbum ? (
        <div>
          <button type="button" onClick={() => setOpenGenre(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} />Back
          </button>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-2xl font-semibold tracking-tight">{genreGroup.name}</h3>
            <ShuffleBtn ids={genreGroup.albums.flatMap((a) => a.trackIds)} />
          </div>
          <AlbumGrid list={genreGroup.albums} />
        </div>
      ) : null}

      {!openAlbum && !openArtist && !openYear && !openGenre ? (
        <>
          {tab === "albums" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <ShuffleBtn ids={sortedAlbums.flatMap((a) => a.trackIds)} label="Shuffle all" />
                <label className="inline-flex items-center gap-2 text-sm text-muted">
                  Sort
                  <select
                    value={albumSort}
                    onChange={(e) => setAlbumSort(e.target.value as typeof albumSort)}
                    className="h-10 rounded-full bg-raised px-3 text-sm text-fg"
                  >
                    <option value="title">Title</option>
                    <option value="artist">Artist</option>
                    <option value="year">Year</option>
                    <option value="added">Recently added</option>
                  </select>
                </label>
              </div>
              <AlbumGrid list={sortedAlbums} />
            </>
          ) : null}

          {tab === "artists" ? (
            <div className="space-y-1">
              {artists.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => setOpenArtist(a.name)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-raised"
                >
                  <span className="text-sm">{a.name}</span>
                  <span className="text-xs text-subtle">{a.trackCount}</span>
                </button>
              ))}
            </div>
          ) : null}

          {tab === "genres" ? (
            <div className="space-y-1">
              {genres.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => setOpenGenre(g.name)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-raised"
                >
                  <span className="text-sm">{g.name}</span>
                  <span className="text-xs text-subtle">{g.trackCount}</span>
                </button>
              ))}
            </div>
          ) : null}

          {tab === "years" ? (
            <div className="space-y-1">
              {[...new Set(tracks.map((t) => t.year || "Unknown"))]
                .sort((a, b) => b.localeCompare(a))
                .map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setOpenYear(y)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-raised"
                  >
                    <span className="text-sm">{y}</span>
                  </button>
                ))}
            </div>
          ) : null}

          {(tab === "songs" || tab === "liked" || tab === "added") ? (
            <div className="divide-y divide-border">
              {(tab === "liked"
                ? tracks.filter((t) => t.liked)
                : tab === "added"
                  ? [...tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
                  : tracks
              ).map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2">
                  <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">
                      {t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.name}</span>
                      <span className="block truncate text-xs text-muted">{t.artist}</span>
                    </span>
                    <FormatBadge format={t.format} />
                  </button>
                  <AddToPlaylist trackId={t.id} />
                  <MoreMenu items={songMenu(t.id)} label={`More for ${t.name}`} tone="plain" />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
