import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Archive, Check, ChevronDown, ChevronLeft, Film, Flame, Globe, Play, Plus, Shuffle, SlidersHorizontal, Square, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { albumKey, groupAlbums, groupArtists, groupGenres, groupTags, similarAlbums, similarArtistsForAlbum, similarArtistsForArtist } from "@/lib/player/catalog";
import { albumHasDownloads, downloadAlbum } from "@/lib/player/download";
import { AUDIO_ACCEPT, creditLine } from "@/lib/player/format";
import { shareTrack } from "@/lib/player/share";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer, type Track } from "@/lib/player/store";
import { makeDemoTone, unlockEngine } from "@/lib/player/engine";
import { ArtworkPanel } from "./cover-search";
import { CoverTitle } from "./cover-title";
import { ExplicitBadge, FormatBadge } from "./format-badge";
import { LibraryTransfer } from "./library-backup";
import { BatchAlbumBar, BatchAlbumEditor } from "./batch-albums";
import { Field } from "./metadata-panel";
import { MoreMenu } from "./more-menu";
import { RemoveAlbumButton } from "./album-tile";
import { StarRating } from "./star-rating";
import { TagEditor } from "./tag-editor";
import { YoutubeForm } from "./youtube-form";
import { VideoWatch } from "./video-watch";
import type { AlbumHit } from "@/lib/player/lookup";
import { proxyCoverUrl } from "@/lib/player/covers";
import { isExplicitTrack } from "@/lib/player/explicit";
import { useLibraryView, type CoverSize, type LibSort, type LibTab, type TitleMode } from "@/lib/player/library-view";

type Tab = LibTab;
type Size = CoverSize;
type SortId = LibSort;
type Titles = TitleMode;

const SIZE_OPTS: { id: Size; label: string }[] = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
];
const TITLE_OPTS: { id: Titles; label: string }[] = [
  { id: "on", label: "Show" },
  { id: "off", label: "Cover only" },
];
const ALBUM_SORTS: { id: SortId; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "year", label: "Year" },
  { id: "songs", label: "Songs" },
];
const ARTIST_SORTS: { id: SortId; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "albums", label: "Albums" },
  { id: "songs", label: "Songs" },
];
const SONG_SORTS: { id: SortId; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "year", label: "Year" },
];
const ADDED_SORTS: { id: SortId; label: string }[] = [
  { id: "year", label: "Newest" },
];
const TAG_SORTS: { id: SortId; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "albums", label: "Albums" },
];
const GENRE_CHIPS = ["Pop", "Hip-Hop", "R&B", "Rock", "Jazz", "Soul", "Electronic", "Metal", "Folk", "Country", "Punk", "Indie", "Funk", "Blues"];

function shelfTile(size: Size) {
  if (size === "s") return "8.5rem";
  if (size === "l") return "14.5rem";
  return "11.25rem";
}
function sortAlbums(albums: ReturnType<typeof groupAlbums>, sort: SortId) {
  const next = [...albums];
  if (sort === "artist") next.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  else if (sort === "year") next.sort((a, b) => (b.year || "").localeCompare(a.year || "") || a.title.localeCompare(b.title));
  else if (sort === "songs") next.sort((a, b) => b.trackIds.length - a.trackIds.length);
  else next.sort((a, b) => a.title.localeCompare(b.title));
  return next;
}
function sortArtists(artists: ReturnType<typeof groupArtists>, sort: SortId) {
  const next = [...artists];
  if (sort === "albums") next.sort((a, b) => b.albumCount - a.albumCount || a.name.localeCompare(b.name));
  else if (sort === "songs") next.sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
  else next.sort((a, b) => a.name.localeCompare(b.name));
  return next;
}
function sortTracks(tracks: Track[], sort: SortId) {
  const next = [...tracks];
  if (sort === "artist") next.sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name));
  else if (sort === "year") next.sort((a, b) => (b.year || "").localeCompare(a.year || "") || a.name.localeCompare(b.name));
  else next.sort((a, b) => a.name.localeCompare(b.name));
  return next;
}

function decadeOf(year: string) {
  const n = Number.parseInt(year, 10);
  if (!Number.isFinite(n) || n < 1900) return "";
  return `${Math.floor(n / 10) * 10}s`;
}

function matchFilters(
  track: Track,
  filters: {
    genre: string;
    decade: string;
    format: string;
    rating: string;
    lossless: boolean;
    liked: boolean;
    unplayed: boolean;
  },
  plays: Record<string, number>,
) {
  if (filters.genre && !(track.genre || track.artistGenre || "").toLowerCase().includes(filters.genre.toLowerCase())) return false;
  if (filters.decade && decadeOf(track.year) !== filters.decade) return false;
  if (filters.format && track.format.toLowerCase() !== filters.format.toLowerCase()) return false;
  if (filters.rating && (track.albumRating || 0) < Number(filters.rating)) return false;
  if (filters.lossless && !track.lossless) return false;
  if (filters.liked && !track.liked) return false;
  if (filters.unplayed && (plays[track.id] ?? 0) > 0) return false;
  return true;
}

function Menu({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex min-w-0 items-center">
      <select
        className="h-9 max-w-full appearance-none rounded-full bg-raised py-0 pl-3 pr-8 text-xs text-fg"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {label}: {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-subtle" strokeWidth={1.75} />
    </label>
  );
}

function FilterBar({
  tracks,
  filters,
  onChange,
}: {
  tracks: Track[];
  filters: {
    genre: string;
    decade: string;
    format: string;
    rating: string;
    lossless: boolean;
    liked: boolean;
    unplayed: boolean;
  };
  onChange: (next: typeof filters) => void;
}) {
  const genres = [...new Set(tracks.flatMap((t) => [t.genre, t.artistGenre].filter(Boolean) as string[]))]
    .flatMap((g) => g.split(/[/|,;]+/).map((x) => x.trim()).filter(Boolean))
    .filter((v, i, all) => all.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
    .sort((a, b) => a.localeCompare(b));
  const decades = [...new Set(tracks.map((t) => decadeOf(t.year)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const formats = [...new Set(tracks.map((t) => t.format).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const active = Object.values(filters).some(Boolean);
  return (
    <div className="mb-4 rounded-2xl bg-raised p-3">
      <div className="flex flex-wrap gap-2">
        <Menu
          label="Genre"
          value={filters.genre}
          options={[{ id: "", label: "All" }, ...genres.map((g) => ({ id: g, label: g }))]}
          onChange={(genre) => onChange({ ...filters, genre })}
        />
        <Menu
          label="Decade"
          value={filters.decade}
          options={[{ id: "", label: "All" }, ...decades.map((d) => ({ id: d, label: d }))]}
          onChange={(decade) => onChange({ ...filters, decade })}
        />
        <Menu
          label="Format"
          value={filters.format}
          options={[{ id: "", label: "All" }, ...formats.map((f) => ({ id: f, label: f }))]}
          onChange={(format) => onChange({ ...filters, format })}
        />
        <Menu
          label="Rating"
          value={filters.rating}
          options={[
            { id: "", label: "Any" },
            { id: "5", label: "5★" },
            { id: "4", label: "4★+" },
            { id: "3", label: "3★+" },
          ]}
          onChange={(rating) => onChange({ ...filters, rating })}
        />
        {(
          [
            ["lossless", "Lossless"],
            ["liked", "Liked"],
            ["unplayed", "Unplayed"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...filters, [key]: !filters[key] })}
            className={cn(
              "h-9 rounded-full px-3 text-xs",
              filters[key] ? "bg-accent text-accent-fg" : "bg-surface text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
        {active ? (
          <button
            type="button"
            onClick={() =>
              onChange({ genre: "", decade: "", format: "", rating: "", lossless: false, liked: false, unplayed: false })
            }
            className="h-9 rounded-full px-3 text-xs text-hot"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Library({ startTab, startAlbum }: { startTab?: Tab; startAlbum?: string | null } = {}) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playIds = usePlayer((s) => s.playIds);
  const queueNext = usePlayer((s) => s.queueNext);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const queueLast = usePlayer((s) => s.queueLast);
  const playRest = usePlayer((s) => s.playRest);
  const addFiles = usePlayer((s) => s.addFiles);
  const addDemo = usePlayer((s) => s.addDemo);
  const removeTrack = usePlayer((s) => s.removeTrack);
  const removeTracks = usePlayer((s) => s.removeTracks);
  const updateAlbumTags = usePlayer((s) => s.updateAlbumTags);
  const updateAlbumMeta = usePlayer((s) => s.updateAlbumMeta);
  const updateArtistMeta = usePlayer((s) => s.updateArtistMeta);
  const setCover = usePlayer((s) => s.setCover);
  const recent = usePlayer((s) => s.recent);
  const plays = usePlayer((s) => s.plays);
  const inputRef = useRef<HTMLInputElement>(null);
  const view = useLibraryView();
  const [tab, setTab] = useState<Tab>(startTab ?? view.tab);
  const [openAlbum, setOpenAlbum] = useState<string | null>(startAlbum ?? null);
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [openGenre, setOpenGenre] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    genre: "",
    decade: "",
    format: "",
    rating: "",
    lossless: false,
    liked: false,
    unplayed: false,
  });
  const size = view.size;
  const titles = view.titles;
  const sort = view.sort;

  useEffect(() => {
    if (startTab) setTab(startTab);
  }, [startTab]);
  useEffect(() => {
    if (startAlbum) {
      setTab("albums");
      setOpenAlbum(startAlbum);
    }
  }, [startAlbum]);

  const scoped = useMemo(
    () => tracks.filter((t) => matchFilters(t, filters, plays)),
    [tracks, filters, plays],
  );
  const albums = useMemo(() => sortAlbums(groupAlbums(scoped), sort === "name" ? "title" : sort), [scoped, sort]);
  const artists = useMemo(
    () => sortArtists(groupArtists(scoped), sort === "title" || sort === "artist" || sort === "year" ? "name" : sort),
    [scoped, sort],
  );
  const tags = useMemo(() => {
    const list = groupTags(albums);
    const next = [...list];
    if (sort === "albums") next.sort((a, b) => b.albums.length - a.albums.length || a.name.localeCompare(b.name));
    else next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [albums, sort]);
  const genres = useMemo(() => {
    const list = groupGenres(albums);
    const next = [...list];
    if (sort === "albums" || sort === "songs") next.sort((a, b) => b.albums.length - a.albums.length || a.name.localeCompare(b.name));
    else next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [albums, sort]);
  const songs = useMemo(
    () => sortTracks(scoped, sort === "name" || sort === "albums" || sort === "songs" ? "title" : sort),
    [scoped, sort],
  );
  const addedAlbums = useMemo(() => {
    return [...groupAlbums(scoped)].sort((a, b) => {
      const aa = Math.max(...a.trackIds.map((id) => scoped.find((t) => t.id === id)?.addedAt ?? 0), 0);
      const bb = Math.max(...b.trackIds.map((id) => scoped.find((t) => t.id === id)?.addedAt ?? 0), 0);
      return bb - aa;
    });
  }, [scoped]);
  const addedSongs = useMemo(
    () => [...scoped].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 80),
    [scoped],
  );
  const album = albums.find((a) => a.key === openAlbum) ?? null;
  const artist = artists.find((a) => a.key === openArtist) ?? null;
  const tag = tags.find((t) => t.name.toLowerCase() === openTag) ?? null;
  const genre = genres.find((g) => g.name.toLowerCase() === openGenre) ?? null;
  const browsing = !openAlbum && !openArtist && !openTag && !openGenre;
  const sortOpts =
    tab === "artists"
      ? ARTIST_SORTS
      : tab === "songs" || tab === "liked"
        ? SONG_SORTS
        : tab === "tags" || tab === "genres"
          ? TAG_SORTS
          : tab === "added"
            ? ADDED_SORTS
            : ALBUM_SORTS;
  const showSize = tab === "albums" || tab === "artists" || tab === "tags" || tab === "genres" || tab === "added";
  const showSelect =
    (tab === "albums" && !album) ||
    tab === "added" ||
    (tab === "artists" && Boolean(artist) && !album) ||
    (tab === "tags" && Boolean(tag) && !album) ||
    (tab === "genres" && Boolean(genre) && !album);
  const pickedAlbums = albums.filter((item) => picked.has(item.key));
  const togglePick = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelecting(true);
  };
  const clearPicked = () => {
    setPicked(new Set());
    setSelecting(false);
    setBatchOpen(false);
  };
  const gridSelect = {
    selecting,
    selected: picked,
    onToggleSelect: togglePick,
  };
  const letteredArtists = letter ? artists.filter((a) => a.name.toUpperCase().startsWith(letter)) : artists;
  const letteredGenres = letter ? genres.filter((g) => g.name.toUpperCase().startsWith(letter)) : genres;
  const playId = (id: string) => {
    playRest(id);
  };
  const playAlbumFrom = (ids: string[], startId?: string) => {
    const from = startId ? ids.indexOf(startId) : 0;
    playIds(ids.slice(from >= 0 ? from : 0));
  };

  const albumView = album ? (
    <AlbumDetail
      album={album}
      albums={albums}
      artists={artists}
      tracks={tracks}
      index={index}
      onBack={() => setOpenAlbum(null)}
      onPlay={(id) => playAlbumFrom(album.trackIds, id)}
      onQueue={queueNext}
      onQueueMany={queueNextMany}
      onQueueLast={queueLast}
      onPlayRest={playRest}
      onRemove={removeTrack}
      onTags={(next) => updateAlbumTags(album.trackIds, next)}
      onMeta={(patch) => {
        updateAlbumMeta(album.trackIds, patch);
        const first = usePlayer.getState().tracks.find((t) => t.id === album.trackIds[0]);
        if (first) setOpenAlbum(albumKey(first));
      }}
      onCover={(file) => setCover(album.trackIds, file)}
      onRemoveAlbum={() => {
        removeTracks(album.trackIds);
        setOpenAlbum(null);
      }}
      onOpenAlbum={setOpenAlbum}
      onOpenArtist={(key) => {
        setTab("artists");
        view.setTab("artists");
        setOpenArtist(key);
        setOpenAlbum(null);
      }}
    />
  ) : null;

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
          <p className="mt-1 text-xs tracking-wide text-subtle">
            {tracks.length === 0
              ? "A quiet shelf"
              : `${artists.length} artists  ·  ${albums.length} albums  ·  ${genres.length} genres  ·  ${tags.length} tags`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tracks.length > 0 ? <LibraryTransfer compact /> : null}
          <label className="relative inline-flex h-10 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full bg-raised px-3 text-sm text-fg transition-colors duration-150 hover:bg-accent hover:text-accent-fg">
            <Plus className="size-4" strokeWidth={1.75} />
            Add
            <input
              ref={inputRef}
              type="file"
              accept={`${AUDIO_ACCEPT},.zip,application/zip`}
              multiple
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {browsing ? <YoutubeForm /> : null}
      {tracks.length > 0 && browsing ? (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-raised p-1">
          {(["albums", "artists", "genres", "tags", "songs", "added", "liked"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                view.setTab(id);
                setOpenAlbum(null);
                setOpenArtist(null);
                setOpenTag(null);
                setOpenGenre(null);
                setLetter(null);
                clearPicked();
              }}
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-xs capitalize transition-colors duration-150 sm:text-sm",
                tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}
      {tracks.length > 0 && browsing ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Menu
            label="Sort by"
            value={sortOpts.some((o) => o.id === sort) ? sort : sortOpts[0].id}
            options={sortOpts}
            onChange={(value) => {
              view.setSort(value as SortId);
            }}
          />
          {showSize ? (
            <>
              <Menu
                label="Cover size"
                value={size}
                options={SIZE_OPTS}
                onChange={(value) => {
                  view.setSize(value as Size);
                }}
              />
              <Menu
                label="Album name"
                value={titles}
                options={TITLE_OPTS}
                onChange={(value) => {
                  view.setTitles(value as Titles);
                }}
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs",
              filtersOpen || Object.values(filters).some(Boolean) ? "bg-accent text-accent-fg" : "bg-raised text-fg",
            )}
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={1.75} />
            Filters
          </button>
          {showSelect ? (
            <button
              type="button"
              onClick={() => {
                if (selecting) clearPicked();
                else setSelecting(true);
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs",
                selecting ? "bg-accent text-accent-fg" : "bg-raised text-fg",
              )}
            >
              {selecting ? <Check className="size-3.5" strokeWidth={2} /> : <Square className="size-3.5" strokeWidth={1.75} />}
              {selecting ? "Done" : "Select"}
            </button>
          ) : null}
        </div>
      ) : null}
      {tracks.length > 0 && browsing && filtersOpen ? (
        <FilterBar tracks={tracks} filters={filters} onChange={setFilters} />
      ) : null}
      {tracks.length === 0 ? (
        <Empty addDemo={addDemo} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "albums" && !album && recent.length > 0 ? (
            <RecentRow
              tracks={recent
                .map((id) => tracks.find((t) => t.id === id))
                .filter((t): t is Track => Boolean(t))
                .slice(0, 8)}
              onPlay={playId}
            />
          ) : null}
          {tab === "albums" && !album ? (
            <AlbumGrid albums={albums} tracks={tracks} size={size} showTitles={titles === "on"} onOpen={setOpenAlbum} onPlayAlbum={playIds} onQueueMany={queueNextMany} {...gridSelect} />
          ) : null}
          {tab === "albums" && album ? albumView : null}
          {tab === "artists" && !artist ? (
            <>
              <AzBar names={artists.map((a) => a.name)} value={letter} onChange={setLetter} />
              <ArtistList
                artists={letteredArtists}
                size={size}
                onOpen={(key) => {
                  setOpenArtist(key);
                  setOpenAlbum(null);
                }}
              />
            </>
          ) : null}
          {tab === "artists" && artist && !album ? (
            <ArtistDetail
              artist={artist}
              artists={artists}
              tracks={tracks}
              size={size}
              showTitles={titles === "on"}
              onBack={() => setOpenArtist(null)}
              onOpenAlbum={setOpenAlbum}
              onOpenArtist={(key) => {
                setOpenArtist(key);
                setOpenAlbum(null);
              }}
              onPlayAll={() => playIds(artist.albums.flatMap((a) => a.trackIds))}
              onQueueAll={() => queueNextMany(artist.albums.flatMap((a) => a.trackIds))}
              onQueueMany={queueNextMany}
              onPlayAlbum={playIds}
              onArtistMeta={(patch) =>
                updateArtistMeta(
                  artist.albums.flatMap((a) => a.trackIds),
                  patch,
                )
              }
              {...gridSelect}
            />
          ) : null}
          {tab === "artists" && artist && album ? albumView : null}
          {tab === "tags" && !tag && !album ? <TagList tags={tags} onOpen={setOpenTag} /> : null}
          {tab === "tags" && tag && !album ? (
            <TagDetail
              tag={tag}
              tracks={tracks}
              size={size}
              showTitles={titles === "on"}
              onBack={() => setOpenTag(null)}
              onOpenAlbum={setOpenAlbum}
              onPlayAlbum={playIds}
              onQueueMany={queueNextMany}
              {...gridSelect}
            />
          ) : null}
          {tab === "tags" && album ? albumView : null}
          {tab === "genres" && !genre && !album ? (
            <>
              <AzBar names={genres.map((g) => g.name)} value={letter} onChange={setLetter} />
              {letteredGenres.length === 0 ? (
                <p className="py-6 text-sm leading-relaxed text-muted">
                  Add a genre on an album or artist and it will collect here.
                </p>
              ) : (
                <GenreList genres={letteredGenres} onOpen={setOpenGenre} onPlay={(ids) => playIds(ids)} />
              )}
            </>
          ) : null}
          {tab === "genres" && genre && !album ? (
            <GenreDetail
              genre={genre}
              tracks={tracks}
              size={size}
              showTitles={titles === "on"}
              onBack={() => setOpenGenre(null)}
              onOpenAlbum={setOpenAlbum}
              onPlayAlbum={playIds}
              onQueueMany={queueNextMany}
              {...gridSelect}
            />
          ) : null}
          {tab === "genres" && album ? albumView : null}
          {tab === "songs" ? (
            <SongList
              tracks={songs}
              index={index}
              onPlay={(i) => playId(songs[i].id)}
              onQueue={queueNext}
              onQueueLast={queueLast}
              onPlayRest={playRest}
              onRemove={removeTrack}
            />
          ) : null}
          {tab === "added" ? (
            <div>
              <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Recently added</p>
              <AlbumGrid albums={addedAlbums} tracks={scoped} size={size} showTitles={titles === "on"} onOpen={setOpenAlbum} onPlayAlbum={playIds} onQueueMany={queueNextMany} {...gridSelect} />
              <p className="mb-3 mt-8 text-xs uppercase tracking-widest text-subtle">New tracks</p>
              <SongList
                tracks={addedSongs}
                index={index}
                global
                allTracks={tracks}
                onPlay={(i) => playId(addedSongs[i].id)}
                onQueue={queueNext}
                onQueueLast={queueLast}
                onPlayRest={playRest}
                onRemove={removeTrack}
              />
            </div>
          ) : null}
          {tab === "liked" ? (
            tracks.some((t) => t.liked) ? (
              <SongList
                tracks={sortTracks(
                  scoped.filter((t) => t.liked),
                  sort === "name" || sort === "albums" || sort === "songs" ? "title" : sort,
                )}
                index={index}
                global
                allTracks={tracks}
                onPlay={(i) => {
                  const liked = sortTracks(
                    tracks.filter((t) => t.liked),
                    sort === "name" || sort === "albums" || sort === "songs" ? "title" : sort,
                  );
                  playId(liked[i].id);
                }}
                onQueue={queueNext}
                onQueueLast={queueLast}
                onPlayRest={playRest}
                onRemove={removeTrack}
              />
            ) : (
              <p className="py-6 text-sm leading-relaxed text-muted">Heart a song while it plays. Liked tracks collect here.</p>
            )
          ) : null}
          {picked.size > 0 ? (
            <BatchAlbumBar
              count={picked.size}
              onEdit={() => setBatchOpen(true)}
              onPlay={() => {
                playIds(pickedAlbums.flatMap((item) => item.trackIds));
                clearPicked();
              }}
              onRemove={() => {
                removeTracks(pickedAlbums.flatMap((item) => item.trackIds));
                clearPicked();
              }}
              onClear={clearPicked}
            />
          ) : null}
        </div>
      )}
      {batchOpen && pickedAlbums.length > 0 ? (
        <BatchAlbumEditor
          albums={pickedAlbums}
          onClose={() => {
            setBatchOpen(false);
            clearPicked();
          }}
        />
      ) : null}
    </section>
  );
}

function Empty({ addDemo }: { addDemo: (track: Track, audio: Blob) => void }) {
  const importLibrary = usePlayer((s) => s.importLibrary);
  const restoreRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
      <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted">
        Drop albums in, or restore a Sondergram library zip after a republish. Music stays in this browser — it is not
        uploaded with the website.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-sm text-hot underline-offset-4 hover:underline" onClick={() => restoreRef.current?.click()}>
          Restore library zip
        </button>
        <button
          type="button"
          className="text-sm text-accent underline-offset-4 hover:underline"
          onClick={() => {
            const demo = makeDemoTone();
            addDemo(
              {
                id: crypto.randomUUID(),
                name: demo.name,
                artist: "Sondergram",
                album: "Listening Room",
                genre: "Studio",
                tags: ["Studio"],
                year: "2026",
                url: URL.createObjectURL(demo.blob),
                coverUrl: null,
                format: "WAV",
                sampleRate: 44100,
                bitDepth: 16,
                bitrate: null,
                channels: 1,
                lossless: true,
                liked: false,
                starred: false,
              },
              demo.blob,
            );
          }}
        >
          Play studio tone
        </button>
      </div>
      <input
        ref={restoreRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importLibrary(file);
        }}
      />
    </div>
  );
}

/* LIBRARY_REST */

function Cover({
  src,
  rounded = "lg",
  label,
  compact,
  explicit,
}: {
  src: string | null;
  rounded?: "md" | "lg" | "full";
  label?: string;
  compact?: boolean;
  explicit?: boolean;
}) {
  const letter = (label ?? "S").trim().slice(0, 1).toUpperCase() || "S";
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden bg-raised",
        rounded === "full" ? "rounded-full" : "rounded-md",
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-full items-center justify-center bg-raised">
          <span className={cn("font-display text-subtle", compact ? "text-lg" : "text-3xl")}>{letter}</span>
        </div>
      )}
      {explicit && rounded !== "full" ? (
        <span className="absolute bottom-1.5 left-1.5">
          <ExplicitBadge onArt />
        </span>
      ) : null}
    </div>
  );
}

function AlbumGrid({
  albums,
  tracks,
  onOpen,
  onPlayAlbum,
  onQueueMany,
  size = "m",
  showTitles = true,
  selecting = false,
  selected,
  onToggleSelect,
}: {
  albums: ReturnType<typeof groupAlbums>;
  tracks: Track[];
  onOpen: (key: string) => void;
  onPlayAlbum?: (ids: string[]) => void;
  onQueueMany?: (ids: string[]) => void;
  size?: Size;
  showTitles?: boolean;
  selecting?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
}) {
  const compact = size === "s";
  const dense = size === "s";
  const tile = shelfTile(size);
  return (
    <div
      className={cn("grid justify-start gap-x-4", showTitles ? "gap-y-6" : "gap-y-3")}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}, ${tile}))` }}
    >
      {albums.map((album) => {
        const songs = album.trackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter((t): t is Track => Boolean(t));
        const canDownload = albumHasDownloads(songs);
        const on = Boolean(selected?.has(album.key));
        const openOrToggle = () => {
          if (selecting && onToggleSelect) onToggleSelect(album.key);
          else onOpen(album.key);
        };
        return (
          <div key={album.key} className="min-w-0 text-left">
            <div className="group/cover relative">
              <button
                type="button"
                onClick={openOrToggle}
                className="w-full text-left"
                aria-label={selecting ? `${on ? "Deselect" : "Select"} ${album.title}` : `${album.title} — ${album.artist}`}
                aria-pressed={selecting ? on : undefined}
              >
                <Cover src={album.coverUrl} label={album.title} compact={compact} explicit={album.explicit} />
              </button>
              {selecting ? (
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={openOrToggle}
                  className={cn(
                    "absolute right-1.5 top-1.5 z-20 flex items-center justify-center rounded-full shadow-sm",
                    dense ? "size-7" : "size-8",
                    on ? "bg-hot text-hot-fg" : "bg-bg/80 text-fg",
                  )}
                >
                  {on ? <Check className="size-3.5" strokeWidth={2.5} /> : <Square className="size-3.5" strokeWidth={1.75} />}
                </button>
              ) : (
                <>
                  {onPlayAlbum ? (
                    <button
                      type="button"
                      aria-label={`Play ${album.title}`}
                      onPointerDown={() => unlockEngine()}
                      onClick={() => onPlayAlbum(album.trackIds)}
                      className={cn(
                        "absolute flex items-center justify-center rounded-full bg-hot text-hot-fg shadow-sm sm:opacity-0 sm:group-hover/cover:opacity-100",
                        dense ? "bottom-1 right-1 size-8" : "bottom-1.5 right-1.5 size-9",
                      )}
                    >
                      <Play className="ml-0.5 size-3.5" strokeWidth={2} fill="currentColor" />
                    </button>
                  ) : null}
                  <MoreMenu
                    className={cn(
                      "absolute left-1.5 top-1.5 z-10 sm:opacity-0 sm:group-hover/cover:opacity-100",
                      dense && "left-1 top-1",
                    )}
                    label={`More for ${album.title}`}
                    items={[
                      ...(onPlayAlbum ? [{ label: "Play", onClick: () => onPlayAlbum(album.trackIds) }] : []),
                      ...(onQueueMany ? [{ label: "Play next", onClick: () => onQueueMany(album.trackIds) }] : []),
                      ...(onToggleSelect ? [{ label: "Select", onClick: () => onToggleSelect(album.key) }] : []),
                      ...(canDownload
                        ? [{ label: "Download", onClick: () => void downloadAlbum({ title: album.title, artist: album.artist, tracks: songs }) }]
                        : []),
                      {
                        label: "Remove album",
                        danger: true,
                        onClick: () => usePlayer.getState().removeTracks(album.trackIds),
                      },
                    ]}
                  />
                  <RemoveAlbumButton
                    title={album.title}
                    dense={dense}
                    onRemove={() => usePlayer.getState().removeTracks(album.trackIds)}
                  />
                </>
              )}
            </div>
            {showTitles ? (
              <button type="button" onClick={openOrToggle} className="mt-2 w-full text-left">
                <p className={cn("flex items-center gap-1.5 text-fg", compact ? "text-xs" : "text-sm font-medium")}>
                  <span className="min-w-0 truncate">{album.title}</span>
                  {album.explicit ? <ExplicitBadge /> : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">{album.artist}</p>
                {album.rating ? <div className="mt-1"><StarRating value={album.rating} size="sm" /></div> : null}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ArtistList({
  artists,
  onOpen,
  size = "m",
}: {
  artists: ReturnType<typeof groupArtists>;
  onOpen: (key: string) => void;
  size?: Size;
}) {
  const compact = size === "s";
  const tile = shelfTile(size);
  return (
    <div
      className="grid justify-start gap-x-2.5 gap-y-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}, ${tile}))` }}
    >
      {artists.map((artist) => (
        <button key={artist.key} type="button" onClick={() => onOpen(artist.key)} className="group/cover min-w-0 text-center">
          <Cover src={artist.coverUrl} rounded="full" label={artist.name} compact={compact} />
          <span className={cn("mt-1.5 block truncate text-fg", compact ? "text-xs" : "text-sm")}>{artist.name}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted">
            {artist.genre ? `${artist.genre} · ` : ""}
            {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
          </span>
        </button>
      ))}
    </div>
  );
}

function ArtistDetail({
  artist,
  artists,
  tracks,
  size,
  showTitles = true,
  selecting,
  selected,
  onToggleSelect,
  onBack,
  onOpenAlbum,
  onOpenArtist,
  onPlayAll,
  onQueueAll,
  onQueueMany,
  onPlayAlbum,
  onArtistMeta,
}: {
  artist: ReturnType<typeof groupArtists>[number];
  artists: ReturnType<typeof groupArtists>;
  tracks: Track[];
  size: Size;
  showTitles?: boolean;
  selecting?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onBack: () => void;
  onOpenAlbum: (key: string) => void;
  onOpenArtist: (key: string) => void;
  onPlayAll: () => void;
  onQueueAll?: () => void;
  onQueueMany?: (ids: string[]) => void;
  onPlayAlbum?: (ids: string[]) => void;
  onArtistMeta?: (patch: { genre?: string; tags?: string[] }) => void;
}) {
  const related = similarArtistsForArtist(artist, artists);
  return (
    <div>
      <Back onClick={onBack} label="Artists" />
      <div className="mb-5 flex items-center gap-4">
        <div className="size-24 shrink-0">
          <Cover src={artist.coverUrl} rounded="full" label={artist.name} />
        </div>
        <div className="min-w-0">
          <h3 className="text-2xl font-semibold tracking-tight">{artist.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {artist.genre ? `${artist.genre} · ` : ""}
            {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
          </p>
          <button type="button" onClick={onPlayAll} className="mt-3 h-9 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg">
            Play
          </button>
          {onQueueAll ? (
            <button type="button" onClick={onQueueAll} className="ml-2 mt-3 h-9 rounded-lg bg-raised px-4 text-sm">
              Play next
            </button>
          ) : null}
        </div>
      </div>
      {onArtistMeta ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Field label="Genre" value={artist.genre} placeholder="Jazz, Hip-Hop…" onSave={(value) => onArtistMeta({ genre: value })} />
          <div className="sm:col-span-2">
            <GenreChips
              value={artist.genre}
              onPick={(name) => onArtistMeta({ genre: name })}
            />
          </div>
          <div className="sm:col-span-2">
            <TagEditor tags={artist.tags} onChange={(tags) => onArtistMeta({ tags })} placeholder="Add an artist tag" />
          </div>
        </div>
      ) : null}
      <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Albums</p>
      <AlbumGrid albums={artist.albums} tracks={tracks} size={size} showTitles={showTitles} onOpen={onOpenAlbum} onPlayAlbum={onPlayAlbum} onQueueMany={onQueueMany} selecting={selecting} selected={selected} onToggleSelect={onToggleSelect} />
      {related.length > 0 ? <SimilarArtists artists={related} onOpen={onOpenArtist} /> : null}
    </div>
  );
}

function AlbumDetail({
  album,
  albums,
  artists,
  tracks,
  index,
  onBack,
  onPlay,
  onQueue,
  onQueueMany,
  onQueueLast,
  onPlayRest,
  onRemove,
  onTags,
  onMeta,
  onCover,
  onOpenAlbum,
  onOpenArtist,
  onRemoveAlbum,
}: {
  album: ReturnType<typeof groupAlbums>[number];
  albums: ReturnType<typeof groupAlbums>;
  artists: ReturnType<typeof groupArtists>;
  tracks: Track[];
  index: number;
  onBack: () => void;
  onPlay: (id: string) => void;
  onQueue: (id: string) => void;
  onQueueMany: (ids: string[]) => void;
  onQueueLast: (id: string) => void;
  onPlayRest: (id: string) => void;
  onRemove: (id: string) => void;
  onTags: (tags: string[]) => void;
  onMeta: (patch: Partial<Pick<Track, "album" | "year" | "albumArtist" | "genre">>) => void;
  onCover: (file: File) => void;
  onOpenAlbum: (key: string) => void;
  onOpenArtist: (key: string) => void;
  onRemoveAlbum?: () => void;
}) {
  const songs = album.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));
  const relatedAlbums = similarAlbums(album, albums);
  const relatedArtists = similarArtistsForAlbum(album, artists);
  const canDownload = albumHasDownloads(songs);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const searchAlbumOnline = usePlayer((s) => s.searchAlbumOnline);
  const applyAlbumHit = usePlayer((s) => s.applyAlbumHit);
  const lookupAlbumHits = usePlayer((s) => s.lookupAlbumHits);
  const playIds = usePlayer((s) => s.playIds);
  const findOnArchive = usePlayer((s) => s.findOnArchive);
  const [archiving, setArchiving] = useState(false);
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);

  const openLookup = () => {
    setAlbumHits([]);
    setLooking(true);
    void searchAlbumOnline(album.trackIds)
      .then((hits) => setAlbumHits(hits))
      .catch(() => setAlbumHits([]))
      .finally(() => setLooking(false));
  };
  const listed = expanded || songs.length <= 12 ? songs : songs.slice(0, 12);
  const totalSec = songs.reduce((n, t) => n + (t.durationSec || 0), 0);
  const totalBytes = songs.reduce((n, t) => n + (t.bytes || 0), 0);
  const [watch, setWatch] = useState<{ title: string; youtubeId?: string; url: string } | null>(null);
  const singles = songs.filter((t) => t.single);
  const popular = [...songs].filter((t) => t.popular).sort((a, b) => (b.chartRank || 0) - (a.chartRank || 0));
  const videos = songs.filter((t) => (t.single || t.popular) && (t.mvId || (t.mvUrl && t.mvThumb)));

  useEffect(() => {
    if (!album.title || /^unknown/i.test(album.title)) return;
    void lookupAlbumHits(album.trackIds);
  }, [album.key]);
  const metaBits = [
    album.genre || album.tags[0],
    album.year,
    songs.some((s) => (s.tags || []).some((tag) => /atmos/i.test(tag))) ? "Dolby Atmos" : "",
    album.lossless ? "Lossless" : "",
  ].filter(Boolean);

  return (
    <div>
      <Back onClick={onBack} label="Back" />
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="w-full max-w-[18rem] shrink-0 sm:w-64">
          <ArtworkPanel
            src={album.coverUrl}
            artist={album.artist}
            album={album.title}
            trackIds={album.trackIds}
            onFile={onCover}
            onRemoveAlbum={onRemoveAlbum}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <CoverTitle title={album.title} coverUrl={album.coverUrl} className="min-w-0 flex-1" />
            {album.explicit ? <ExplicitBadge className="mt-2 size-5 text-xs" /> : null}
          </div>
          <button type="button" onClick={() => onOpenArtist(album.artist.toLowerCase())} className="mt-2 text-xl font-semibold text-hot hover:underline">
            {album.artist}
          </button>
          {metaBits.length > 0 ? <p className="mt-2 text-sm text-muted">{metaBits.join("  ·  ")}</p> : null}
          <div className="mt-3">
            <StarRating
              value={album.rating}
              onChange={(next) => usePlayer.getState().setAlbumRating(album.trackIds, next)}
            />
          </div>
          {album.note ? (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{album.note}</p>
          ) : looking ? (
            <p className="mt-4 text-sm text-subtle">Looking up album notes…</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onPointerDown={() => unlockEngine()}
              onClick={() => playIds(album.trackIds)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-hot px-5 text-sm font-semibold text-hot-fg"
            >
              <Play className="size-4" strokeWidth={2} fill="currentColor" />
              Play
            </button>
            <button
              type="button"
              onClick={() => {
                const ids = [...album.trackIds];
                for (let i = ids.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
                }
                playIds(ids);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-hot px-5 text-sm font-semibold text-hot-fg"
            >
              <Shuffle className="size-4" strokeWidth={2} />
              Shuffle
            </button>
            <button
              type="button"
              disabled={archiving}
              onClick={() => {
                setArchiving(true);
                void findOnArchive(album.artist, album.title).finally(() => setArchiving(false));
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-raised px-4 text-sm font-medium"
            >
              <Archive className="size-4" strokeWidth={1.75} />
              {archiving ? "Archive…" : "Find on Archive"}
            </button>
            <button
              type="button"
              disabled={looking}
              onClick={openLookup}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-raised px-4 text-sm font-medium"
            >
              <Globe className="size-4" strokeWidth={1.75} />
              {looking ? "Looking up…" : "Look up online"}
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                disabled={!canDownload || saving}
                aria-label={`Download ${album.title}`}
                onClick={() => {
                  setSaving(true);
                  void downloadAlbum({ title: album.title, artist: album.artist, tracks: songs }).finally(() => setSaving(false));
                }}
                className="flex size-10 items-center justify-center rounded-full text-hot hover:bg-raised disabled:opacity-40"
              >
                <ArrowDownToLine className="size-5" strokeWidth={1.75} />
              </button>
              <MoreMenu
                tone="plain"
                label={`More for ${album.title}`}
                items={[
                  { label: "Play next", onClick: () => onQueueMany(album.trackIds) },
                  { label: "Clean titles", onClick: () => usePlayer.getState().cleanTitles(album.trackIds) },
                  {
                    label: "Match tracklist",
                    onClick: () => {
                      void usePlayer.getState().matchTracklist(album.trackIds);
                    },
                  },
                  {
                    label: looking ? "Looking up…" : "Look up online",
                    onClick: openLookup,
                  },
                  ...(onRemoveAlbum ? [{ label: "Remove album", onClick: onRemoveAlbum, danger: true }] : []),
                ]}
              />
            </div>
          </div>
        </div>
      </div>
      {popular.length > 0 ? (
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Popular tracks</p>
          <ul className="divide-y divide-fg/5">
            {popular.slice(0, 5).map((track, i) => (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => onPlay(track.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-raised/80"
                >
                  <span className="w-6 text-center text-sm text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{track.name}</span>
                      <Flame className="size-3.5 shrink-0 text-hot" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs text-muted">Best known</span>
                  </span>
                  {track.durationSec ? (
                    <span className="font-mono text-xs tabular-nums text-subtle">{formatTime(track.durationSec)}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {singles.length > 0 ? (
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Singles</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {singles.map((track) => (
              <div key={track.id} className="w-32 shrink-0">
                <button type="button" onClick={() => onPlay(track.id)} className="block w-full text-left">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-raised">
                    {track.coverUrl || album.coverUrl ? (
                      <img src={track.coverUrl || album.coverUrl || ""} alt="" className="size-full object-cover" />
                    ) : null}
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg">
                      Single
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">{track.name}</p>
                </button>
                {track.mvId || track.mvUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setWatch({
                        title: track.name,
                        youtubeId: track.mvId,
                        url: track.mvUrl || `https://www.youtube.com/watch?v=${track.mvId}`,
                      })
                    }
                    className="mt-1 inline-flex items-center gap-1 text-xs text-hot"
                  >
                    <Film className="size-3.5" strokeWidth={1.75} />
                    Video
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {videos.length > 0 ? (
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Music videos</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {videos.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() =>
                  setWatch({
                    title: track.name,
                    youtubeId: track.mvId,
                    url: track.mvUrl || `https://www.youtube.com/watch?v=${track.mvId}`,
                  })
                }
                className="w-52 shrink-0 text-left"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl bg-raised">
                  <img
                    src={track.mvThumb || track.coverUrl || album.coverUrl || ""}
                    alt=""
                    className="size-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black">
                      <Play className="ml-0.5 size-6" strokeWidth={2} fill="currentColor" />
                    </span>
                  </span>
                  {track.single ? (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      Single
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 truncate text-sm font-medium">{track.name}</p>
                <p className="truncate text-xs text-muted">{track.artist}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <SongList
        tracks={listed}
        index={index}
        global
        numbered
        allTracks={tracks}
        onPlay={(i) => onPlay(listed[i].id)}
        onQueue={onQueue}
        onQueueLast={onQueueLast}
        onPlayRest={onPlayRest}
        onRemove={onRemove}
        onWatch={(track) => {
          if (track.mvId || track.mvUrl) {
            setWatch({ title: track.name, youtubeId: track.mvId, url: track.mvUrl || `https://www.youtube.com/watch?v=${track.mvId}` });
            return;
          }
          setWatch({
            title: track.name,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.name} official video`)}`,
          });
        }}
      />
      <p className="mt-4 text-sm text-muted">
        {songs.length} {songs.length === 1 ? "item" : "items"}
        {totalSec > 0 ? `, ${Math.max(1, Math.round(totalSec / 60))} minutes` : ""}
        {totalBytes > 0 ? `, ${(totalBytes / 1_000_000).toFixed(1)} MB` : ""}
      </p>
      {songs.length > 12 && !expanded ? (
        <button type="button" onClick={() => setExpanded(true)} className="mt-3 text-sm font-medium text-hot">
          Show Complete Album
        </button>
      ) : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Field label="Album" value={album.title === "Unknown album" ? "" : album.title} placeholder="Album title" onSave={(value) => onMeta({ album: value })} />
        <Field label="Album artist" value={album.artist === "Unknown artist" ? "" : album.artist} placeholder="Album artist" onSave={(value) => onMeta({ albumArtist: value })} />
        <Field label="Year" value={album.year} placeholder="1998" onSave={(value) => onMeta({ year: value })} />
        <Field label="Genre" value={album.genre} placeholder="Jazz" onSave={(value) => onMeta({ genre: value })} />
      </div>
      <div className="mt-3">
        <GenreChips value={album.genre} onPick={(name) => onMeta({ genre: name })} />
      </div>
      <div className="mt-5">
        <TagEditor tags={album.tags} onChange={onTags} />
      </div>
      {relatedAlbums.length > 0 ? <SimilarAlbums albums={relatedAlbums} onOpen={onOpenAlbum} /> : null}
      {relatedArtists.length > 0 ? <SimilarArtists artists={relatedArtists} onOpen={onOpenArtist} /> : null}
      {albumHits ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-semibold">Choose the album</p>
              <button type="button" aria-label="Close" onClick={() => setAlbumHits(null)} className="flex size-10 items-center justify-center rounded-full bg-raised">
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
                  No album match. Edit the title or artist below, then look up again.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {albumHits.map((hit) => (
                  <button
                    key={`${hit.artist}-${hit.title}-${hit.year}`}
                    type="button"
                    onClick={() => {
                      void applyAlbumHit(album.trackIds, hit).then(() => setAlbumHits(null));
                    }}
                    className="text-left"
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
                      {hit.artist}
                      {hit.year ? ` · ${hit.year}` : ""}
                      {hit.trackCount ? ` · ${hit.trackCount} tracks` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {watch ? <VideoWatch title={watch.title} youtubeId={watch.youtubeId} url={watch.url} onClose={() => setWatch(null)} /> : null}
    </div>
  );
}

function TagList({ tags, onOpen }: { tags: ReturnType<typeof groupTags>; onOpen: (name: string) => void }) {
  if (tags.length === 0) {
    return <p className="py-6 text-sm leading-relaxed text-muted">Open an album and add tags. Those albums will collect here.</p>;
  }
  return (
    <ul className="space-y-1">
      {tags.map((tag) => (
        <li key={tag.name}>
          <button type="button" onClick={() => onOpen(tag.name.toLowerCase())} className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-raised">
            <div className="flex size-14 shrink-0 items-center -space-x-3">
              {tag.albums.slice(0, 2).map((item) => (
                <div key={item.key} className="size-10 overflow-hidden rounded-sm">
                  {item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-cover" /> : <div className="size-full bg-raised" />}
                </div>
              ))}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{tag.name}</span>
              <span className="block truncate text-xs text-muted">
                {tag.albums.length} {tag.albums.length === 1 ? "album" : "albums"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TagDetail({
  tag,
  tracks,
  size,
  showTitles = true,
  selecting,
  selected,
  onToggleSelect,
  onBack,
  onOpenAlbum,
  onPlayAlbum,
  onQueueMany,
}: {
  tag: ReturnType<typeof groupTags>[number];
  tracks: Track[];
  size: Size;
  showTitles?: boolean;
  selecting?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onBack: () => void;
  onOpenAlbum: (key: string) => void;
  onPlayAlbum: (ids: string[]) => void;
  onQueueMany: (ids: string[]) => void;
}) {
  return (
    <div>
      <Back onClick={onBack} label="Tags" />
      <h3 className="mb-1 text-2xl font-semibold tracking-tight">{tag.name}</h3>
      <p className="mb-5 text-sm text-muted">
        {tag.albums.length} {tag.albums.length === 1 ? "album" : "albums"}
      </p>
      <AlbumGrid albums={tag.albums} tracks={tracks} size={size} showTitles={showTitles} onOpen={onOpenAlbum} onPlayAlbum={onPlayAlbum} onQueueMany={onQueueMany} selecting={selecting} selected={selected} onToggleSelect={onToggleSelect} />
    </div>
  );
}

function SimilarAlbums({ albums, onOpen }: { albums: ReturnType<typeof groupAlbums>; onOpen: (key: string) => void }) {
  return (
    <div className="mt-8">
      <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Similar albums</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {albums.map((item) => (
          <button key={item.key} type="button" onClick={() => onOpen(item.key)} className="w-28 shrink-0 text-left">
            <Cover src={item.coverUrl} />
            <p className="mt-2 truncate text-sm text-fg">{item.title}</p>
            <p className="truncate text-xs text-muted">{item.artist}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function SimilarArtists({ artists, onOpen }: { artists: ReturnType<typeof groupArtists>; onOpen: (key: string) => void }) {
  return (
    <div className="mt-8">
      <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Similar artists</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {artists.map((item) => (
          <button key={item.key} type="button" onClick={() => onOpen(item.key)} className="w-24 shrink-0 text-left">
            <Cover src={item.coverUrl} rounded="full" label={item.name} />
            <p className="mt-2 truncate text-center text-sm text-fg">{item.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecentRow({ tracks, onPlay }: { tracks: Track[]; onPlay: (id: string) => void }) {
  return (
    <div className="mb-6">
      <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Recently played</p>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {tracks.map((track) => (
          <button key={track.id} type="button" onClick={() => onPlay(track.id)} className="group/cover w-24 shrink-0 text-left sm:w-28">
            <Cover src={track.coverUrl} label={track.name} />
            <p className="mt-2 truncate text-xs text-fg">{track.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveRemain() {
  const { current, duration } = useAudioClock();
  return (
    <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-subtle">
      {formatRemain(current, duration)}
    </span>
  );
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 inline-flex h-10 items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function SongList({
  tracks,
  index,
  onPlay,
  onQueue,
  onQueueLast,
  onPlayRest,
  onRemove,
  global,
  numbered,
  allTracks,
  onWatch,
}: {
  tracks: Track[];
  index: number;
  onPlay: (i: number) => void;
  onQueue: (id: string) => void;
  onQueueLast: (id: string) => void;
  onPlayRest: (id: string) => void;
  onRemove: (id: string) => void;
  global?: boolean;
  numbered?: boolean;
  allTracks?: Track[];
  onWatch?: (track: Track) => void;
}) {
  const upNext = usePlayer((s) => s.upNext);
  const toggleStar = usePlayer((s) => s.toggleStar);
  const warmTrack = usePlayer((s) => s.warmTrack);
  return (
    <ul className="divide-y divide-fg/5">
      {tracks.map((track, i) => {
        const activeIndex = global && allTracks ? allTracks.findIndex((t) => t.id === track.id) : i;
        const active = activeIndex === index;
        const queued = upNext[0] === track.id;
        const number = track.trackNo || i + 1;
        return (
          <li key={track.id} className="group flex items-center gap-0.5 py-0.5">
            <button
              type="button"
              aria-label={track.starred ? `Unmark ${track.name}` : `Mark ${track.name} as a standout`}
              aria-pressed={track.starred}
              onClick={() => toggleStar(track.id)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-subtle hover:text-hot"
            >
              <Star className={cn("size-4", track.starred && "fill-hot text-hot")} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onPointerDown={() => {
                unlockEngine();
                warmTrack(track.id);
              }}
              onClick={() => onPlay(i)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left",
                active ? "bg-raised text-fg" : "text-fg hover:bg-raised/80",
              )}
            >
              {numbered ? (
                <span className="w-6 shrink-0 text-right text-sm text-muted">{number}</span>
              ) : track.coverUrl ? (
                <img src={track.coverUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-raised text-sm text-subtle">{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm tracking-tight">{track.name}</span>
                  {isExplicitTrack(track) ? <ExplicitBadge /> : null}
                  {track.popular ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-hot/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-hot">
                      <Flame className="size-3" strokeWidth={2} />
                      Popular
                    </span>
                  ) : track.single ? (
                    <span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Single
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{numbered ? track.artist : creditLine(track)}</span>
                {track.mvId || track.mvUrl ? (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-hot">
                    <Film className="size-3" strokeWidth={1.75} />
                    Video
                  </span>
                ) : null}
              </span>
              {active ? (
                <ActiveRemain />
              ) : numbered && track.durationSec ? (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <FormatBadge
                    label={track.format}
                    lossless={track.lossless}
                    sampleRate={track.sampleRate}
                    bitDepth={track.bitDepth}
                    bitrate={track.bitrate}
                    tags={track.tags}
                  />
                  <span className="w-11 text-right font-mono text-xs tabular-nums text-subtle">{formatTime(track.durationSec)}</span>
                </span>
              ) : (
                <FormatBadge
                  label={track.format}
                  lossless={track.lossless}
                  sampleRate={track.sampleRate}
                  bitDepth={track.bitDepth}
                  bitrate={track.bitrate}
                  tags={track.tags}
                />
              )}
            </button>
            {onWatch ? (
              <button
                type="button"
                aria-label={`Video for ${track.name}`}
                onClick={() => onWatch(track)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
              >
                <Film className={cn("size-4", (track.mvId || track.mvUrl) && "text-hot")} strokeWidth={1.75} />
              </button>
            ) : null}
            <MoreMenu
              className="shrink-0"
              tone="plain"
              label={`More for ${track.name}`}
              items={[
                { label: queued ? "Playing next" : "Play next", onClick: () => onQueue(track.id), active: queued },
                { label: "Add to queue", onClick: () => onQueueLast(track.id) },
                { label: "Play rest of album", onClick: () => onPlayRest(track.id) },
                ...(onWatch ? [{ label: track.mvId || track.mvUrl ? "Watch video" : "Find video", onClick: () => onWatch(track) }] : []),
                { label: "Share", onClick: () => void shareTrack(track) },
                { label: "Remove", onClick: () => onRemove(track.id), danger: true },
              ]}
            />
          </li>
        );
      })}
    </ul>
  );
}

function AzBar({
  names,
  value,
  onChange,
}: {
  names: string[];
  value: string | null;
  onChange: (letter: string | null) => void;
}) {
  const letters = [...new Set(names.map((n) => n[0]?.toUpperCase() ?? "").filter((c) => /[A-Z]/.test(c)))].sort();
  if (letters.length < 8) return null;
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn("h-7 shrink-0 rounded-full px-2.5 text-[11px]", value ? "text-muted" : "bg-raised text-fg")}
      >
        All
      </button>
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          onClick={() => onChange(value === letter ? null : letter)}
          className={cn("h-7 w-7 shrink-0 rounded-full text-[11px]", value === letter ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function GenreChips({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {GENRE_CHIPS.map((name) => {
        const on = value.toLowerCase() === name.toLowerCase();
        return (
          <button
            key={name}
            type="button"
            onClick={() => onPick(on ? "" : name)}
            className={cn(
              "h-7 rounded-full px-2.5 text-[11px]",
              on ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
            )}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function GenreList({
  genres,
  onOpen,
  onPlay,
}: {
  genres: ReturnType<typeof groupGenres>;
  onOpen: (name: string) => void;
  onPlay: (ids: string[]) => void;
}) {
  return (
    <ul className="space-y-1">
      {genres.map((genre) => {
        const ids = genre.albums.flatMap((a) => a.trackIds);
        return (
          <li key={genre.name} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(genre.name.toLowerCase())}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-raised"
            >
              <div className="grid size-14 shrink-0 grid-cols-2 overflow-hidden rounded-md">
                {genre.albums.slice(0, 4).map((item) =>
                  item.coverUrl ? (
                    <img key={item.key} src={item.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div key={item.key} className="size-full bg-raised" />
                  ),
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{genre.name}</span>
                <span className="block truncate text-xs text-muted">
                  {genre.albums.length} {genre.albums.length === 1 ? "album" : "albums"}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`Play ${genre.name}`}
              onPointerDown={() => unlockEngine()}
              onClick={() => onPlay(ids)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-hot hover:bg-raised"
            >
              <Play className="ml-0.5 size-4" strokeWidth={2} fill="currentColor" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function GenreDetail({
  genre,
  tracks,
  size,
  showTitles = true,
  selecting,
  selected,
  onToggleSelect,
  onBack,
  onOpenAlbum,
  onPlayAlbum,
  onQueueMany,
}: {
  genre: ReturnType<typeof groupGenres>[number];
  tracks: Track[];
  size: Size;
  showTitles?: boolean;
  selecting?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onBack: () => void;
  onOpenAlbum: (key: string) => void;
  onPlayAlbum: (ids: string[]) => void;
  onQueueMany: (ids: string[]) => void;
}) {
  const ids = genre.albums.flatMap((a) => a.trackIds);
  return (
    <div>
      <Back onClick={onBack} label="Genres" />
      <h3 className="mb-1 text-2xl font-semibold tracking-tight">{genre.name}</h3>
      <p className="mb-4 text-sm text-muted">
        {genre.albums.length} {genre.albums.length === 1 ? "album" : "albums"}
      </p>
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onPointerDown={() => unlockEngine()}
          onClick={() => onPlayAlbum(ids)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg"
        >
          <Play className="size-4" strokeWidth={2} fill="currentColor" />
          Play
        </button>
        <button
          type="button"
          onPointerDown={() => unlockEngine()}
          onClick={() => {
            const next = [...ids];
            for (let i = next.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [next[i], next[j]] = [next[j]!, next[i]!];
            }
            onPlayAlbum(next);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-raised px-4 text-sm"
        >
          <Shuffle className="size-4" strokeWidth={2} />
          Shuffle
        </button>
        <button type="button" onClick={() => onQueueMany(ids)} className="inline-flex h-10 items-center rounded-lg bg-raised px-4 text-sm">
          Play next
        </button>
      </div>
      <AlbumGrid albums={genre.albums} tracks={tracks} size={size} showTitles={showTitles} onOpen={onOpenAlbum} onPlayAlbum={onPlayAlbum} onQueueMany={onQueueMany} selecting={selecting} selected={selected} onToggleSelect={onToggleSelect} />
    </div>
  );
}
