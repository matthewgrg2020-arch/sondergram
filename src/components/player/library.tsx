import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Globe, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { albumKey, groupAlbums, groupArtists } from "@/lib/player/catalog";
import { AUDIO_ACCEPT } from "@/lib/player/format";
import { usePlayer, type Track } from "@/lib/player/store";
import { proxyCoverUrl } from "@/lib/player/covers";
import type { AlbumHit } from "@/lib/player/lookup";
import { useLibraryView, type CoverSize, type LibTab, type TitleMode } from "@/lib/player/library-view";
import { ArtworkPanel } from "./cover-search";
import { Field } from "./metadata-panel";
import { TagEditor } from "./tag-editor";

type Tab = LibTab;
type Size = CoverSize;

const TAB_IDS: Tab[] = ["albums", "artists", "years", "songs", "liked", "added"];

function shelfTile(size: Size) {
  if (size === "s") return "8.5rem";
  if (size === "l") return "14.5rem";
  return "11.25rem";
}

export function Library({ startTab, startAlbum }: { startTab?: Tab; startAlbum?: string | null } = {}) {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const playRest = usePlayer((s) => s.playRest);
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
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);
  const [applying, setApplying] = useState(false);
  const size = view.size;
  const titles = view.titles;

  useEffect(() => {
    if (startTab) setTab(startTab);
  }, [startTab]);
  useEffect(() => {
    if (startAlbum) {
      setTab("albums");
      setOpenAlbum(startAlbum);
    }
  }, [startAlbum]);

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
      .map(([name, list]) => ({
        name,
        albums: list,
        trackIds: list.flatMap((a) => a.trackIds),
      }))
      .sort((a, b) => {
        if (a.name === "Unknown") return 1;
        if (b.name === "Unknown") return -1;
        return b.name.localeCompare(a.name);
      });
  }, [albums]);

  const album = albums.find((a) => a.key === openAlbum) ?? null;
  const artist = artists.find((a) => a.key === openArtist) ?? null;
  const yearGroup = years.find((y) => y.name === openYear) ?? null;
  const liked = useMemo(() => tracks.filter((t) => t.liked), [tracks]);
  const added = useMemo(
    () => [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 120),
    [tracks],
  );

  const songsOf = (ids: string[]) =>
    ids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => Boolean(t));

  const goTab = (id: Tab) => {
    setTab(id);
    if (id !== "liked") view.setTab(id);
    setOpenAlbum(null);
    setOpenArtist(null);
    setOpenYear(null);
    setEditTrackId(null);
  };

  const patchAlbumMeta = (
    ids: string[],
    patch: Partial<Pick<Track, "album" | "year" | "albumArtist" | "genre" | "artist" | "tags">>,
  ) => {
    updateAlbumMeta(ids, patch);
    const first = usePlayer.getState().tracks.find((t) => t.id === ids[0]);
    if (first) setOpenAlbum(albumKey(first));
  };

  const openLookup = () => {
    if (!album) return;
    setAlbumHits([]);
    setLooking(true);
    void searchAlbumOnline(album.trackIds)
      .then((hits) => setAlbumHits(hits))
      .catch(() => setAlbumHits([]))
      .finally(() => setLooking(false));
  };

  const pickHit = async (hit: AlbumHit) => {
    if (!album) return;
    setApplying(true);
    try {
      await applyAlbumHit(album.trackIds, hit);
      setAlbumHits(null);
      const first = usePlayer.getState().tracks.find((t) => t.id === album.trackIds[0]);
      if (first) setOpenAlbum(albumKey(first));
    } finally {
      setApplying(false);
    }
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${shelfTile(size)}, ${shelfTile(size)}))`,
  } as const;

  const AlbumGrid = ({ list }: { list: typeof albums }) => (
    <div className="grid justify-start gap-x-4 gap-y-5" style={gridStyle}>
      {list.map((item) => (
        <button key={item.key} type="button" onClick={() => setOpenAlbum(item.key)} className="text-left">
          <div className="aspect-square overflow-hidden rounded-lg bg-raised">
            {item.coverUrl ? (
              <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          {titles === "on" ? (
            <>
              <p className="mt-2 truncate text-sm">{item.title}</p>
              <p className="truncate text-xs text-muted">{item.artist}</p>
              {item.year ? <p className="truncate text-[11px] text-subtle">{item.year}</p> : null}
            </>
          ) : null}
        </button>
      ))}
    </div>
  );

  if (tracks.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-2 text-sm text-muted">A quiet shelf — add music to get started.</p>
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

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-xs tracking-wide text-subtle">
          {artists.length} artists · {albums.length} albums · {tracks.length} songs
        </p>
      </div>

      {!openAlbum && !openArtist && !openYear ? (
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
                <button
                  type="button"
                  disabled={looking}
                  onClick={openLookup}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10 disabled:opacity-60"
                >
                  <Globe className="size-4" strokeWidth={1.75} />
                  {looking ? "Looking up…" : "Look up online"}
                </button>
                <p className="text-xs text-subtle">
                  {[album.year, `${album.trackIds.length} songs`].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-raised/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Pencil className="size-4 text-accent" strokeWidth={2} />
                  <h3 className="text-sm font-semibold tracking-tight">Edit metadata</h3>
                  <span className="text-[11px] text-subtle">Applies to all tracks on this album</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Album"
                    value={album.title}
                    placeholder="Album title"
                    onSave={(title) => patchAlbumMeta(album.trackIds, { album: title })}
                  />
                  <Field
                    label="Artist"
                    value={album.artist}
                    placeholder="Artist name"
                    onSave={(artistName) =>
                      patchAlbumMeta(album.trackIds, { artist: artistName, albumArtist: artistName })
                    }
                  />
                  <Field
                    label="Year"
                    value={album.year || ""}
                    placeholder="1998"
                    onSave={(year) => patchAlbumMeta(album.trackIds, { year })}
                  />
                  <Field
                    label="Genre"
                    value={songsOf(album.trackIds)[0]?.genre || ""}
                    placeholder="Genre"
                    onSave={(genre) => patchAlbumMeta(album.trackIds, { genre })}
                  />
                </div>
                <div className="mt-3">
                  <TagEditor
                    tags={songsOf(album.trackIds)[0]?.tags || []}
                    onChange={(tags) => patchAlbumMeta(album.trackIds, { tags })}
                  />
                </div>
                <p className="mt-3 text-[11px] text-subtle">
                  Tip: fix the title/artist first, then use <strong className="text-fg">Look up online</strong> to pull
                  artwork and catalog metadata from iTunes and other sources.
                </p>
              </div>
            </div>
          </div>

          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-subtle">Tracks</h3>
          <p className="mb-2 text-xs text-subtle">Tap the pencil to edit a song title or artist</p>
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
                        {t.coverUrl ? (
                          <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                    </button>
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
                      <Field
                        label="Title"
                        value={t.name}
                        placeholder="Song title"
                        onSave={(name) => updateMeta(t.id, { name })}
                      />
                      <Field
                        label="Artist"
                        value={t.artist}
                        placeholder="Artist"
                        onSave={(artistName) => updateMeta(t.id, { artist: artistName })}
                      />
                      <Field
                        label="Album"
                        value={t.album}
                        placeholder="Album"
                        onSave={(albumName) => updateMeta(t.id, { album: albumName })}
                      />
                      <Field
                        label="Year"
                        value={t.year || ""}
                        placeholder="1998"
                        onSave={(year) => updateMeta(t.id, { year })}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {albumHits !== null ? (
            <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
              <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm font-semibold">Choose the album</p>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setAlbumHits(null)}
                    className="flex size-10 items-center justify-center rounded-full bg-raised"
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
                <p className="px-4 pb-3 text-xs text-muted">
                  Pick the match for {album.artist} — {album.title}. Artwork and metadata apply only after you choose.
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {looking && albumHits.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">Searching iTunes and catalogs…</p>
                  ) : null}
                  {!looking && albumHits.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">
                      No album match. Edit the title or artist, then look up again.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {albumHits.map((hit) => (
                      <button
                        key={`${hit.artist}-${hit.title}-${hit.year}-${hit.artwork}`}
                        type="button"
                        disabled={applying}
                        onClick={() => void pickHit(hit)}
                        className="text-left disabled:opacity-60"
                      >
                        <div className="aspect-square overflow-hidden rounded-lg bg-raised">
                          {hit.artwork ? (
                            <img
                              src={proxyCoverUrl(hit.artwork)}
                              alt=""
                              className="size-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium">{hit.title}</p>
                        <p className="truncate text-[10px] text-muted">
                          {[hit.artist, hit.year, hit.genre].filter(Boolean).join(" · ")}
                        </p>
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
          <button
            type="button"
            onClick={() => setOpenArtist(null)}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Artists
          </button>
          <h3 className="mb-4 text-2xl font-semibold tracking-tight">{artist.name}</h3>
          <AlbumGrid list={albums.filter((a) => a.artist === artist.name)} />
        </div>
      ) : null}

      {openYear && yearGroup && !openAlbum ? (
        <div>
          <button
            type="button"
            onClick={() => setOpenYear(null)}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
            Years
          </button>
          <h3 className="mb-4 text-2xl font-semibold tracking-tight">{yearGroup.name}</h3>
          <AlbumGrid list={yearGroup.albums} />
        </div>
      ) : null}

      {!openAlbum && !openArtist && !openYear ? (
        <>
          {tab === "albums" ? <AlbumGrid list={albums} /> : null}
          {tab === "artists" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {artists.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setOpenArtist(a.key)}
                  className="flex items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"
                >
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="text-xs text-subtle">{a.albumCount} albums</span>
                </button>
              ))}
            </div>
          ) : null}
          {tab === "years" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {years.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  onClick={() => setOpenYear(row.name)}
                  className="flex items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-accent hover:text-accent-fg"
                >
                  <span className="text-lg font-semibold tracking-tight">{row.name}</span>
                  <span className="text-xs opacity-70">{row.albums.length} albums</span>
                </button>
              ))}
            </div>
          ) : null}
          {tab === "songs" || tab === "liked" || tab === "added" ? (
            <div className="divide-y divide-border">
              {(tab === "songs" ? tracks : tab === "liked" ? liked : added).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => playRest(t.id)}
                  className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-raised"
                >
                  <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">
                    {t.coverUrl ? (
                      <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.name}</span>
                    <span className="block truncate text-xs text-muted">{t.artist}</span>
                  </span>
                  {t.year ? <span className="text-xs text-subtle">{t.year}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
