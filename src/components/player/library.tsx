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
import { OnlineMatchesSheet } from "./online-matches-sheet";

// RESTORED_LIBRARY_MARKER
export function Library() {
  return <div className="p-4 text-sm text-muted">Library loading… refresh after deploy.</div>;
}
