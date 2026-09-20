import { ChevronDown, Dices, Plus, Smartphone } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { groupAlbums, isCompilation, type AlbumGroup } from "@/lib/player/catalog";
import { AUDIO_ACCEPT } from "@/lib/player/format";
import { useLibraryView, type CoverSize, type TitleMode } from "@/lib/player/library-view";
import { homeGreeting, libraryMixes } from "@/lib/player/mixes";
import { usePlayer, type Track } from "@/lib/player/store";
import { AlbumTile, albumBadges } from "./album-tile";

type HomeTab = "home" | "new" | "picks" | "aoty";
type Size = CoverSize;
type Titles = TitleMode;

const TABS: { id: HomeTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "new", label: "Hot & New" },
  { id: "picks", label: "Editor's Picks" },
  { id: "aoty", label: "AOTY" },
];

const SIZE_OPTS: { id: Size; label: string }[] = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
];
const TITLE_OPTS: { id: Titles; label: string }[] = [
  { id: "on", label: "Show" },
  { id: "off", label: "Cover only" },
];

function tileSize(size: Size) {
  if (size === "s") return "8.5rem";
  if (size === "l") return "14.5rem";
  return "11.25rem";
}

function songsOf(album: AlbumGroup, tracks: Track[]) {
  return album.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));
}

export function ListenNow({
  onOpenLibrary,
  onOpenAlbum,
  onOpenAdd,
}: {
  onOpenLibrary: () => void;
  onOpenAlbum?: (key: string) => void;
  onOpenAdd?: () => void;
}) {
  const tracks = usePlayer((s) => s.tracks);
  const plays = usePlayer((s) => s.plays);
  const recent = usePlayer((s) => s.recent);
  const playIds = usePlayer((s) => s.playIds);
  const playlists = usePlayer((s) => s.playlists);
  const playPlaylist = usePlayer((s) => s.playPlaylist);
  const djMix = usePlayer((s) => s.djMix);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const removeTracks = usePlayer((s) => s.removeTracks);
  const addFiles = usePlayer((s) => s.addFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<HomeTab>("home");
  const { size, titles, setSize, setTitles } = useLibraryView();
  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const yearNow = String(new Date().getFullYear());

  const shown = useMemo(() => {
    if (tab === "new") {
      return [...albums].sort((a, b) => {
        const aa = Math.max(...songsOf(a, tracks).map((t) => t.addedAt ?? 0), 0);
        const bb = Math.max(...songsOf(b, tracks).map((t) => t.addedAt ?? 0), 0);
        return bb - aa;
      });
    }
    if (tab === "picks") {
      const liked = albums.filter((a) => songsOf(a, tracks).some((t) => t.liked));
      if (liked.length) return liked;
      return [...albums]
        .sort((a, b) => {
          const pa = songsOf(a, tracks).reduce((n, t) => n + (plays[t.id] ?? 0), 0);
          const pb = songsOf(b, tracks).reduce((n, t) => n + (plays[t.id] ?? 0), 0);
          return pb - pa;
        })
        .slice(0, 24);
    }
    if (tab === "aoty") {
      const year = albums.filter((a) => a.year === yearNow);
      if (year.length) return year;
      return [...albums].sort((a, b) => (b.year || "").localeCompare(a.year || ""));
    }
    if (recent.length) {
      const order = new Map(recent.map((id, i) => [id, i]));
      return [...albums].sort((a, b) => {
        const ia = Math.min(...a.trackIds.map((id) => order.get(id) ?? 999));
        const ib = Math.min(...b.trackIds.map((id) => order.get(id) ?? 999));
        return ia - ib;
      });
    }
    return albums;
  }, [albums, tab, tracks, plays, recent, yearNow]);

  const gems = useMemo(() => {
    return tracks.filter((t) => !plays[t.id] && !t.previewUrl).slice(0, 12);
  }, [tracks, plays]);

  const decades = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of tracks) {
      const year = Number.parseInt(track.year, 10);
      if (!year) continue;
      const label = `${Math.floor(year / 10) * 10}s`;
      const list = map.get(label) ?? [];
      list.push(track.id);
      map.set(label, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [tracks]);

  const mixes = useMemo(() => libraryMixes(tracks, plays, recent), [tracks, plays, recent]);
  const greeting = homeGreeting();

  const smart = useMemo(() => {
    const liked = tracks.filter((t) => t.liked).map((t) => t.id);
    const unplayed = tracks.filter((t) => !(plays[t.id] ?? 0)).map((t) => t.id);
    const lossless = tracks.filter((t) => t.lossless).map((t) => t.id);
    const stars = albums.filter((a) => a.rating >= 4.5).flatMap((a) => a.trackIds);
    const comps = albums.filter((a) => isCompilation(songsOf(a, tracks))).flatMap((a) => a.trackIds);
    const added = [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 40).map((t) => t.id);
    const soulseek = tracks.filter((t) => t.soulseekId).map((t) => t.id);
    return [
      { id: "unplayed", label: "Unplayed", ids: unplayed },
      { id: "liked", label: "Loved", ids: liked },
      { id: "stars", label: "5-star", ids: stars },
      { id: "lossless", label: "Lossless", ids: lossless },
      { id: "soulseek", label: "Soulseek", ids: soulseek },
      { id: "comps", label: "Compilations", ids: comps },
      { id: "added", label: "Just in", ids: added },
    ].filter((row) => row.ids.length > 0);
  }, [tracks, plays, albums]);

  return (
    <div className="px-4 pb-2 pt-1 sm:px-5">
      <a
        href="/sondergram.apk"
        download="sondergram.apk"
        className="mb-4 hidden items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-accent-fg md:flex"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Smartphone className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Download Android APK</span>
            <span className="block text-xs opacity-70">Install Sondergram on your phone</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-accent-fg/10 px-3 py-1 text-xs font-medium">Get file</span>
      </a>
      <div className="mb-4 flex items-center gap-4 overflow-x-auto border-b border-border sm:gap-5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "border-b-2 border-fg pb-2 text-sm font-medium text-fg"
                : "border-b-2 border-transparent pb-2 text-sm text-muted hover:text-fg"
            }
          >
            {item.label}
          </button>
        ))}
        {tracks.length > 0 ? (
          <div className="ml-auto mb-1 hidden items-center gap-2 sm:flex">
            <label className="relative inline-flex items-center">
              <select
                className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg"
                aria-label="Cover size"
                value={size}
                onChange={(e) => {
                  setSize(e.target.value as Size);
                }}
              >
                {SIZE_OPTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    Size: {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
            </label>
            <label className="relative inline-flex items-center">
              <select
                className="h-8 appearance-none rounded-full bg-raised py-0 pl-3 pr-7 text-xs text-fg"
                aria-label="Album name"
                value={titles}
                onChange={(e) => {
                  setTitles(e.target.value as Titles);
                }}
              >
                {TITLE_OPTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    Name: {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-subtle" strokeWidth={1.75} />
            </label>
            <button
              type="button"
              onClick={djMix}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg"
            >
              <Dices className="size-3.5" strokeWidth={1.75} />
              DJ mix
            </button>
          </div>
        ) : null}
      </div>

      {tracks.length === 0 ? (
        <div className="flex min-h-64 flex-col items-start justify-center">
          <p className="text-sm text-muted">Drop files here or add tracks to fill the shelf.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="relative inline-flex h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
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
            {onOpenAdd ? (
              <button
                type="button"
                onClick={onOpenAdd}
                className="inline-flex h-10 items-center rounded-full bg-raised px-4 text-sm font-medium"
              >
                Archive & more
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {onOpenAdd ? (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              <button
                type="button"
                onClick={onOpenAdd}
                className="h-9 shrink-0 rounded-full bg-raised px-3 text-xs font-medium"
              >
                Add Archive link
              </button>
              <label className="relative inline-flex h-9 shrink-0 cursor-pointer items-center overflow-hidden rounded-full bg-raised px-3 text-xs font-medium">
                Add files
                <input
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
            </div>
          ) : null}
          {tab === "home" && mixes.length > 0 ? (
            <div className="mb-6">
              <p className="mb-1 text-2xl font-semibold tracking-tight">{greeting}</p>
              <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Made for you</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {mixes.map((row) => {
                  const tiles = row.covers.slice(0, 4);
                  while (tiles.length < 4) tiles.push(tiles[0] ?? null);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => playIds(row.trackIds)}
                      className="w-36 shrink-0 text-left"
                    >
                      <div className="grid aspect-square grid-cols-2 overflow-hidden rounded-xl bg-raised">
                        {tiles.map((src, i) => (
                          <div key={`${row.id}-${i}`} className="bg-surface">
                            {src ? <img src={src} alt="" className="size-full object-cover" /> : null}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 truncate text-sm">{row.title}</p>
                      <p className="truncate text-xs text-muted">{row.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {tab === "home" && smart.length > 0 ? (
            <div className="mb-5">
              <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Smart playlists</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {smart.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => playIds(row.ids)}
                    className="h-9 shrink-0 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
                  >
                    {row.label}
                    <span className="ml-1.5 text-subtle">{row.ids.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {tab === "home" && playlists.length > 0 ? (
            <div className="mb-5">
              <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Your playlists</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {playlists.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => playPlaylist(row.id)}
                    className="h-9 shrink-0 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
                  >
                    {row.name}
                    <span className="ml-1.5 text-subtle">{row.trackIds.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {tab === "home" && decades.length > 0 ? (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
              {decades.map(([label, ids]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const next = [...ids];
                    for (let i = next.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [next[i], next[j]] = [next[j]!, next[i]!];
                    }
                    playIds(next);
                  }}
                  className="h-9 shrink-0 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
                >
                  {label} mix
                </button>
              ))}
            </div>
          ) : null}
          {tab === "home" && gems.length > 0 ? (
            <div className="mb-6">
              <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Hidden gems</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gems.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => playIds([track.id])}
                    className="w-28 shrink-0 text-left"
                  >
                    <div className="aspect-square overflow-hidden rounded-lg bg-raised">
                      {track.coverUrl ? <img src={track.coverUrl} alt="" className="size-full object-cover" /> : null}
                    </div>
                    <p className="mt-2 truncate text-sm">{track.name}</p>
                    <p className="truncate text-xs text-muted">{track.artist}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        <div
          className={titles === "on" ? "grid justify-start gap-x-4 gap-y-5" : "grid justify-start gap-x-4 gap-y-3"}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize(size)}, ${tileSize(size)}))` }}
        >
          {shown.map((album) => {
            const songs = songsOf(album, tracks);
            return (
              <AlbumTile
                key={album.key}
                title={album.title}
                artist={album.artist}
                year={album.year}
                cover={album.coverUrl}
                badges={albumBadges(songs)}
                explicit={album.explicit}
                showTitles={titles === "on"}
                onOpen={() => (onOpenAlbum ? onOpenAlbum(album.key) : onOpenLibrary())}
                onPlay={() => playIds(album.trackIds)}
                onQueue={() => queueNextMany(album.trackIds)}
                onRemove={() => removeTracks(album.trackIds)}
              />
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}