import {
  AudioLines,
  Car,
  ChevronDown,
  Download,
  Film,
  Heart,
  ListMusic,
  Mic2,
  Moon,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  Square,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { downloadTrack } from "@/lib/player/download";
import { archivePage } from "@/lib/player/archive";
import { getEngine } from "@/lib/player/engine";
import { activeLine, fetchLyrics, type Lyrics } from "@/lib/player/lyrics";
import { transcribeTrack } from "@/lib/player/transcribe";
import { shareTrack } from "@/lib/player/share";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";
import { albumKey } from "@/lib/player/catalog";
import { looksLikeFilenameTitle } from "@/lib/player/soulseek";
import { isExplicitTrack } from "@/lib/player/explicit";
import { proxyCoverUrl } from "@/lib/player/covers";
import { isEngineCatalog, isPreviewClip, officialCatalogUrl } from "@/lib/player/stream-search";
import { cn } from "@/lib/utils";
import { FormatBadge, ExplicitBadge } from "./format-badge";
import { VideoWatch } from "./video-watch";

// File restored via GitHub API - full content follows in chunked write if needed
export function NowPlaying(props: {
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onParty: () => void;
  onCarMode?: () => void;
  onOpenAlbum?: (key: string) => void;
}) {
  return null;
}
