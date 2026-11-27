import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Flame, GitMerge, Globe, Heart, Pencil, Plus, Shuffle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { albumKey, cleanAlbumTitle, groupAlbums, groupArtists, groupGenres, groupTracksByDisc, resolveDiskNo } from "@/lib/player/catalog";
import { AUDIO_ACCEPT, formatDuration, formatTrackTime } from "@/lib/player/format";
import { usePlayer, type Track } from "@/lib/player/store";
import { proxyCoverUrl } from "@/lib/player/covers";
import type { AlbumHit } from "@/lib/player/lookup";
import { refineGenre } from "@/lib/player/genre-refine";
import { useLibraryView, type CoverSize, type LibTab, type TitleMode } from "@/lib/player/library-view";
import { ArtworkPanel } from "./cover-search";
import { Field } from "./metadata-panel";
import { TagEditor } from "./tag-editor";
import { FormatBadge } from "./format-badge";
import { AddToPlaylist } from "./add-to-playlist";
import { MoreMenu } from "./more-menu";
import { OnlineMatchesSheet } from "./online-matches-sheet";

type Tab = LibTab;
const TAB_IDS: Tab[] = ["albums", "artists", "genres", "years", "songs", "liked", "added"];

function shuffleList(ids: string[]) {
  const list = ids.filter(Boolean);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function similarAlbums(
  album: { key: string; title: string; artist: string; genre: string; tags: string[] },
  all: ReturnType<typeof groupAlbums>,
  limit = 8,
) {
  const genreParts = new Set(String(album.genre || "").split(/[/|,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const tags = new Set((album.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
  const artistKey = (album.artist || "").trim().toLowerCase();
  const titleKey = (album.title || "").trim().toLowerCase();
  const scored = all
    .filter((a) => a.key !== album.key)
    .map((a) => {
      let score = 0;
      const aGenre = new Set(String(a.genre || "").split(/[/|,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
      const aTags = new Set((a.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
      for (const g of genreParts) if (aGenre.has(g)) score += 3;
      for (const t of tags) if (aTags.has(t)) score += 2;
      if (artistKey && (a.artist || "").trim().toLowerCase() === artistKey) score += 4;
      for (const w of titleKey.split(/\s+/).filter((x) => x.length > 3)) if ((a.title || "").toLowerCase().includes(w)) score += 1;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title));
  return scored.slice(0, limit).map((x) => x.a);
}

export function Library({ startTab, startAlbum }: { startTab?: Tab; startAlbum?: string | null } = {}) {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const playRest = usePlayer((s) => s.playRest);
  const queueNext = usePlayer((s) => s.queueNext);
  const queueLast = usePlayer((s) => s.queueLast);
  const addFiles = usePlayer((s) => s.addFiles);
  const setCover = usePlayer((s) => s.setCover);
  const updateAlbumMeta = usePlayer((s) => s.updateAlbumMeta);
  const updateMeta = usePlayer((s) => s.updateMeta);
  const removeTracks = usePlayer((s) => s.removeTracks);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const searchAlbumOnline = usePlayer((s) => s.searchAlbumOnline);
  const applyAlbumHit = usePlayer((s) => s.applyAlbumHit);
  const flash = usePlayer((s) => s.flash);
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
  const [lookingGenre, setLookingGenre] = useState(false);
  const [albumEdit, setAlbumEdit] = useState(false);
  const [combineQ, setCombineQ] = useState("");
  const [albumHits, setAlbumHits] = useState<AlbumHit[] | null>(null);
  const [applying, setApplying] = useState(false);
  const lookGen = useRef(0);
  const size = view.size;
  const titles = view.titles;
  const albumSort: "title" | "artist" | "year" | "added" =
    view.sort === "artist" ? "artist" : view.sort === "year" ? "year" : view.sort === "songs" ? "added" : "title";

  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]);
  useEffect(() => { if (startAlbum) setOpenAlbum(startAlbum); }, [startAlbum]);

  const goTab = (id: Tab) => {
    setTab(id);
    view.setTab(id);
    setOpenAlbum(null);
    setOpenArtist(null);
    setOpenYear(null);
    setOpenGenre(null);
    setEditTrackId(null);
    setAlbumHits(null);
    setAlbumEdit(false);
    setCombineQ("");
  };

  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);
  const genres = useMemo(() => {
    const list = groupGenres(albums);
    const unknownAlbums = albums.filter((a) => !a.genre || !String(a.genre).trim());
    if (unknownAlbums.length) list.push({ name: "Unknown", albums: unknownAlbums, trackCount: unknownAlbums.reduce((n, a) => n + a.trackIds.length, 0) });
    return list;
  }, [albums]);
  const years = useMemo(() => {
    const map = new Map<string, { name: string; albums: typeof albums; trackCount: number }>();
    for (const a of albums) {
      const name = (a.year || "").trim() || "Unknown";
      const row = map.get(name);
      if (row) { row.albums.push(a); row.trackCount += a.trackIds.length; }
      else map.set(name, { name, albums: [a], trackCount: a.trackIds.length });
    }
    return [...map.values()].sort((a, b) => (a.name === "Unknown" ? 1 : b.name === "Unknown" ? -1 : b.name.localeCompare(a.name)));
  }, [albums]);

  const songsOf = (ids: string[]) => ids.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];
  const albumDuration = (ids: string[]) => songsOf(ids).reduce((sum, t) => sum + (t.durationSec || 0), 0);
  const newest = (ids: string[]) => Math.max(0, ...songsOf(ids).map((t) => t.addedAt || 0));
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

  const shufflePlay = (ids: string[]) => { const list = shuffleList(ids); if (list.length) playIds(list); };
  const patchAlbumMeta = (ids: string[], patch: Partial<Track>) => { updateAlbumMeta(ids, patch); };

  const songMenu = (id: string) => {
    const track = tracks.find((t) => t.id === id);
    const liked = Boolean(track?.liked);
    return [
      { label: "Play", onClick: () => playRest(id) },
      { label: "Play next", onClick: () => { queueNext(id); flash?.("Playing next"); } },
      { label: "Add to queue", onClick: () => { queueLast(id); flash?.("Added to queue"); } },
      { label: liked ? "Remove from favorites" : "Add to favorites", onClick: () => toggleLike(id) },
      { label: "Add to playlist", onClick: () => setPlaylistIds([id]) },
      { label: "Remove", onClick: () => removeTracks([id]), danger: true },
    ];
  };

  const ShuffleBtn = ({ ids, label = "Shuffle" }: { ids: string[]; label?: string }) => (
    <button type="button" onClick={() => shufflePlay(ids)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10">
      <Shuffle className="size-4" strokeWidth={1.75} />{label}
    </button>
  );

  if (tracks.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Library</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">Add files or import from iBroadcast to build your library.</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg"><Plus className="size-4" /> Add music</button>
        <input ref={inputRef} type="file" accept={AUDIO_ACCEPT} multiple className="hidden" onChange={(e) => { const files = e.target.files; if (files?.length) void addFiles(Array.from(files)); e.target.value = ""; }} />
      </section>
    );
  }

  const album = openAlbum ? albums.find((a) => a.key === openAlbum) : null;
  const artist = openArtist ? artists.find((a) => a.name === openArtist) : null;

  const AlbumGrid = ({ list }: { list: typeof albums }) => {
    if (titles === "list") {
      return (
        <div className="divide-y divide-border">
          {list.map((item) => {
            const dur = albumDuration(item.trackIds);
            const meta = [
              item.artist,
              item.year || null,
              item.genre || null,
              `${item.trackIds.length} track${item.trackIds.length === 1 ? "" : "s"}`,
              item.discCount > 1 ? `${item.discCount} discs` : null,
              dur ? formatDuration(dur) : null,
              item.lossless ? "Lossless" : null,
            ].filter(Boolean).join(" · ");
            return (
              <button key={item.key} type="button" onClick={() => setOpenAlbum(item.key)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-raised">{item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted">{meta}</p>
                </div>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div className={cn("grid gap-3", size === "s" ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6" : size === "m" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3")}>
        {list.map((item) => (
          <button key={item.key} type="button" onClick={() => setOpenAlbum(item.key)} className="text-left">
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-raised">{item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
            {titles === "on" ? (<><p className="mt-2 truncate text-sm">{item.title}</p><p className="truncate text-xs text-muted">{item.artist}{item.discCount > 1 ? ` · ${item.discCount} discs` : ""}</p></>) : null}
          </button>
        ))}
      </div>
    );
  };

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-xs tracking-wide text-subtle">{artists.length} artists · {albums.length} albums · {tracks.length} songs</p>
      </div>

      {!openAlbum && !openArtist && !openYear && !openGenre ? (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-raised p-1">
          {TAB_IDS.map((id) => (
            <button key={id} type="button" onClick={() => goTab(id)} className={cn("h-9 shrink-0 rounded-full px-3 text-xs capitalize transition-colors sm:text-sm", tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{id}</button>
          ))}
        </div>
      ) : null}

      {!openAlbum && !openArtist && !openYear && !openGenre && tab === "albums" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-raised p-1">
            {([["title", "Title"], ["artist", "Artist"], ["year", "Year"], ["songs", "Added"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => view.setSort(id)} className={cn("h-8 rounded-full px-3 text-xs font-medium transition-colors", (id === "title" ? albumSort === "title" : view.sort === id) ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-raised p-1">
            <button type="button" onClick={() => view.setTitles("on")} className={cn("h-8 rounded-full px-3 text-xs font-medium transition-colors", titles === "on" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>Titles</button>
            <button type="button" onClick={() => view.setTitles("off")} className={cn("h-8 rounded-full px-3 text-xs font-medium transition-colors", titles === "off" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>Cover only</button>
            <button type="button" onClick={() => view.setTitles("list")} className={cn("h-8 rounded-full px-3 text-xs font-medium transition-colors", titles === "list" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>List</button>
          </div>
          {titles !== "list" ? (
            <div className="flex items-center gap-1 rounded-full bg-raised p-1">
              {(["s", "m", "l"] as const).map((s) => (
                <button key={s} type="button" onClick={() => view.setSize(s)} className={cn("h-8 rounded-full px-3 text-xs font-medium uppercase transition-colors", size === s ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{s}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {openAlbum && album ? (
        <div>
          <button type="button" onClick={() => { setOpenAlbum(null); setEditTrackId(null); setAlbumHits(null); setAlbumEdit(false); setCombineQ(""); }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} /> Back</button>
          <div className="mb-6 grid gap-5 lg:grid-cols-[14rem_1fr]">
            <ArtworkPanel src={album.coverUrl} artist={album.artist} album={album.title} trackIds={album.trackIds} onFile={(file) => setCover(album.trackIds, file)} />
            <div className="flex flex-col justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => playIds(album.trackIds)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg">Play</button>
                <ShuffleBtn ids={album.trackIds} />
                <button type="button" onClick={async () => {
                  if (looking) { lookGen.current += 1; setLooking(false); return; }
                  const mine = ++lookGen.current; setLooking(true);
                  try { const hits = await searchAlbumOnline(album.artist, album.title); if (mine !== lookGen.current) return; setAlbumHits(Array.isArray(hits) ? hits : []); }
                  finally { if (mine === lookGen.current) setLooking(false); }
                }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"><Globe className="size-4" strokeWidth={1.75} />{looking ? "Cancel" : "Look up online"}</button>
                <button type="button" onClick={() => setAlbumEdit((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"><Pencil className="size-4" strokeWidth={1.75} />{albumEdit ? "Close edit" : "Edit album"}</button>
                <button type="button" onClick={() => { setAlbumEdit(true); setTimeout(() => document.getElementById("merge-albums")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium hover:bg-white/10"><GitMerge className="size-4" strokeWidth={1.75} />Merge albums</button>
                <button type="button" onClick={() => {
                  if (!confirm(`Delete album “${album.title}” and its ${album.trackIds.length} tracks?`)) return;
                  void removeTracks(album.trackIds);
                  setOpenAlbum(null);
                  setAlbumEdit(false);
                  flash?.("Album deleted");
                }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium text-hot hover:bg-white/10"><Trash2 className="size-4" strokeWidth={1.75} />Delete album</button>
              </div>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{album.title}</h3>
                <p className="text-sm text-muted">{album.artist}</p>
                <p className="mt-1 text-xs text-subtle">{[album.year, album.genre, album.discCount > 1 ? `${album.discCount} discs` : null, `${album.trackIds.length} songs`, formatDuration(albumDuration(album.trackIds))].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          </div>

          {albumEdit ? (
            <div className="mb-6 space-y-4 rounded-2xl bg-raised p-4">
              <p className="text-sm font-semibold">Edit album</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Album title</span>
                  <input key={`title-${album.key}-${album.title}`} type="text" defaultValue={album.title} className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" onBlur={(e) => {
                    const next = e.target.value.trim(); if (!next || next === album.title) return;
                    patchAlbumMeta(album.trackIds, { album: next }); flash?.("Album title updated");
                    const sample = tracks.find((t) => t.id === album.trackIds[0]);
                    if (sample) setOpenAlbum(albumKey({ ...sample, album: next }));
                  }} /></label>
                <label className="block"><span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Album artist</span>
                  <input key={`artist-${album.key}-${album.artist}`} type="text" defaultValue={album.artist} className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" onBlur={(e) => {
                    const next = e.target.value.trim(); if (!next || next === album.artist) return;
                    patchAlbumMeta(album.trackIds, { albumArtist: next }); flash?.("Album artist updated");
                    const sample = tracks.find((t) => t.id === album.trackIds[0]);
                    if (sample) setOpenAlbum(albumKey({ ...sample, albumArtist: next, album: album.title }));
                  }} /></label>
                <label className="block"><span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Year</span>
                  <input key={`year-${album.key}-${album.year}`} type="text" defaultValue={album.year || ""} className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" onBlur={(e) => {
                    const next = e.target.value.trim(); if (next === (album.year || "")) return;
                    patchAlbumMeta(album.trackIds, { year: next }); flash?.("Year updated");
                  }} /></label>
              </div>
              <div id="merge-albums" className="border-t border-border pt-4">
                <p className="mb-1 text-sm font-semibold">Merge albums</p>
                <p className="mb-3 text-xs text-muted">Merge another album into this one. Incoming discs are added after the current discs.</p>
                <input type="search" value={combineQ} onChange={(e) => setCombineQ(e.target.value)} placeholder="Search albums to combine…" className="mb-3 h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" />
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {albums.filter((a) => a.key !== album.key).filter((a) => {
                    const q = combineQ.trim().toLowerCase(); if (!q) return true;
                    return a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q);
                  }).slice(0, 40).map((other) => (
                    <button key={other.key} type="button" className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left hover:bg-white/10" onClick={() => {
                      const baseDisc = Math.max(1, ...songsOf(album.trackIds).map((t) => resolveDiskNo(t)));
                      const otherSongs = songsOf(other.trackIds);
                      const otherDiscs = [...new Set(otherSongs.map((t) => resolveDiskNo(t)))].sort((a, b) => a - b);
                      const discMap = new Map<number, number>();
                      otherDiscs.forEach((d, i) => discMap.set(d, baseDisc + 1 + i));
                      for (const t of otherSongs) {
                        const diskNo = discMap.get(resolveDiskNo(t)) ?? baseDisc + 1;
                        updateMeta(t.id, { album: album.title, albumArtist: album.artist, diskNo });
                      }
                      flash?.(`Combined “${other.title}” into “${album.title}”`);
                      setCombineQ("");
                      const sample = tracks.find((t) => t.id === album.trackIds[0]);
                      if (sample) setOpenAlbum(albumKey({ ...sample, album: album.title, albumArtist: album.artist }));
                    }}>
                      <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">{other.coverUrl ? <img src={proxyCoverUrl(other.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm">{other.title}</span><span className="block truncate text-xs text-muted">{other.artist} · {other.trackIds.length} tracks</span></span>
                      <span className="shrink-0 text-xs font-medium text-accent">Merge</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-subtle">Tracks{album.discCount > 1 ? <span className="ml-2 font-normal normal-case tracking-normal text-muted">· {album.discCount} discs</span> : null}</h3>
          <div className="space-y-5">
            {groupTracksByDisc(songsOf(album.trackIds)).map(([disc, discTracks]) => (
              <div key={`disc-${disc}`}>
                {album.discCount > 1 ? <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Disc {disc}</p> : null}
                <div className="divide-y divide-border">
                  {discTracks.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 py-1.5">
                      <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left hover:opacity-90">
                        <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">{t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.trackNo ? <span className="mr-2 tabular-nums text-subtle">{t.trackNo}</span> : null}{t.name}</span><span className="block truncate text-xs text-muted">{t.artist}</span></span>
                        {t.durationSec ? <span className="shrink-0 text-xs tabular-nums text-subtle">{formatTrackTime(t.durationSec)}</span> : null}
                      </button>
                      <button type="button" aria-label={t.liked ? "Unlike" : "Like"} onClick={() => toggleLike(t.id)} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><Heart className={cn("size-4", t.liked && "fill-hot text-hot")} strokeWidth={1.75} /></button>
                      <MoreMenu label="Song options" tone="plain" items={songMenu(t.id)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {similarAlbums(album, albums).length ? (<div className="mt-8"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-subtle">Similar albums</h3><AlbumGrid list={similarAlbums(album, albums)} /></div>) : null}
          {albumHits ? (<OnlineMatchesSheet hits={albumHits} applying={applying} onClose={() => setAlbumHits(null)} onPick={async (hit) => { setApplying(true); try { await applyAlbumHit(album.trackIds, { ...hit, genre: refineGenre(hit.genre || "", album.artist, album.title, hit.description || "") }); setAlbumHits(null); } finally { setApplying(false); } }} />) : null}
        </div>
      ) : openArtist && artist ? (
        <div><button type="button" onClick={() => setOpenArtist(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} /> Back</button><h3 className="mb-4 text-2xl font-semibold tracking-tight">{artist.name}</h3><AlbumGrid list={artist.albums} /></div>
      ) : openGenre ? (
        <div><button type="button" onClick={() => setOpenGenre(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} /> Back</button><h3 className="mb-4 text-2xl font-semibold tracking-tight">{openGenre}</h3><AlbumGrid list={(genres.find((g) => g.name === openGenre)?.albums) || []} /></div>
      ) : openYear ? (
        <div><button type="button" onClick={() => setOpenYear(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft className="size-4" strokeWidth={1.75} /> Back</button><h3 className="mb-4 text-2xl font-semibold tracking-tight">{openYear}</h3><AlbumGrid list={(years.find((y) => y.name === openYear)?.albums) || []} /></div>
      ) : tab === "albums" ? (
        <AlbumGrid list={sortedAlbums} />
      ) : tab === "artists" ? (
        <div className="space-y-2">{artists.map((a) => (<button key={a.name} type="button" onClick={() => setOpenArtist(a.name)} className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"><span className="truncate text-sm font-medium">{a.name}</span><span className="text-xs text-muted">{a.albums.length} albums</span></button>))}</div>
      ) : tab === "genres" ? (
        <div className="space-y-2">{genres.length === 0 ? <p className="text-sm text-muted">No genres yet.</p> : genres.map((g) => (<button key={g.name} type="button" onClick={() => setOpenGenre(g.name)} className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"><span className="truncate text-sm font-medium">{g.name}</span><span className="text-xs text-muted">{g.albums.length} albums · {g.trackCount} tracks</span></button>))}</div>
      ) : tab === "years" ? (
        <div className="space-y-2">{years.map((y) => (<button key={y.name} type="button" onClick={() => setOpenYear(y.name)} className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-left hover:bg-white/10"><span className="truncate text-sm font-medium">{y.name}</span><span className="text-xs text-muted">{y.albums.length} albums · {y.trackCount} tracks</span></button>))}</div>
      ) : tab === "songs" || tab === "liked" || tab === "added" ? (
        <div className="divide-y divide-border">{(tab === "liked" ? tracks.filter((t) => t.liked) : tab === "added" ? [...tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)) : tracks).map((t) => (
          <div key={t.id} className="flex items-center gap-1 py-1.5">
            <button type="button" onClick={() => playRest(t.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
              <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">{t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}</div>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.name}</span><span className="block truncate text-xs text-muted">{t.artist}</span></span>
            </button>
            <button type="button" aria-label={t.liked ? "Unlike" : "Like"} onClick={() => toggleLike(t.id)} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><Heart className={cn("size-4", t.liked && "fill-hot text-hot")} strokeWidth={1.75} /></button>
            <MoreMenu label="Song options" tone="plain" items={songMenu(t.id)} />
          </div>
        ))}</div>
      ) : (
        <AlbumGrid list={sortedAlbums} />
      )}
      {playlistIds ? <AddToPlaylist trackIds={playlistIds} onClose={() => setPlaylistIds(null)} /> : null}
    </section>
  );
}
