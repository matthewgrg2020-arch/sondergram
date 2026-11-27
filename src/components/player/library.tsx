import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Flame, Globe, Pencil, Plus, Shuffle, Trash2, X } from "lucide-react";
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

function similarAlbums(album: { key: string; title: string; artist: string; genre: string; tags: string[] }, all: ReturnType<typeof groupAlbums>, limit = 8) {
  const genreParts = new Set(
    String(album.genre || "")
      .split(/[/|,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const tags = new Set((album.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
  const artistKey = (album.artist || "").trim().toLowerCase();
  const titleKey = (album.title || "").trim().toLowerCase();
  const scored = all
    .filter((a) => a.key !== album.key)
    .map((a) => {
      let score = 0;
      const aGenre = new Set(
        String(a.genre || "")
          .split(/[/|,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
      const aTags = new Set((a.tags || []).map((t) => String(t).toLowerCase()).filter(Boolean));
      for (const g of genreParts) if (aGenre.has(g)) score += 3;
      for (const t of tags) if (aTags.has(t)) score += 2;
      if (artistKey && (a.artist || "").trim().toLowerCase() === artistKey) score += 4;
      const tokens = titleKey.split(/\s+/).filter((w) => w.length > 3);
      const aTitle = (a.title || "").toLowerCase();
      for (const w of tokens) if (aTitle.includes(w)) score += 1;
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
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const queueLast = usePlayer((s) => s.queueLast);
  const addFiles = usePlayer((s) => s.addFiles);
  const setCover = usePlayer((s) => s.setCover);
  const updateAlbumMeta = usePlayer((s) => s.updateAlbumMeta);
  const updateMeta = usePlayer((s) => s.updateMeta);
  const removeTracks = usePlayer((s) => s.removeTracks);
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
  const [_continue": true}