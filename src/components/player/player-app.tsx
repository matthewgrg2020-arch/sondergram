import { useCallback, useEffect, useRef, useState } from "react";
import { EqPanel } from "./eq-panel";
import { ExtrasPanel } from "./extras-panel";
import { ApkCard } from "./apk-card";
import { SpotifyPanel } from "./spotify-panel";
import { DeezerPanel } from "./deezer-panel";
import { IbroadcastPanel } from "./ibroadcast-panel";
import { ArchivePanel } from "./archive-panel";
import { BandcampPanel } from "./bandcamp-panel";
import { RymPanel } from "./rym-panel";
import { DatabasePanel } from "./database-panel";
import { SoundcloudPanel } from "./soundcloud-panel";
import { SoulseekPanel } from "./soulseek-panel";
import { AmazonPanel } from "./amazon-panel";
import { FindAudioPanel } from "./find-audio-panel";
import { AddMusicCard } from "./add-music-card";
import { LastFmCard } from "./lastfm-card";
import { DuplicatesCard } from "./duplicates-card";
import { Library } from "./library";
import { AccountSync } from "./account-sync";
import { LibraryBackup, LibraryClear } from "./library-backup";
import { ListenCard, SpatialCard, TempoPitch } from "./mix-panel";
import { RemasterPanel } from "./remaster-panel";
import { CarMode } from "./car-mode";
import { ListenNow } from "./listen-now";
import { MiniPlayer } from "./mini-player";
import { NowPlaying } from "./now-playing";
import { PartyViz } from "./party-viz";
import { RadioPage } from "./radio-page";
import { RecentPage } from "./recent-page";
import { SearchPage } from "./search-page";
import { Sidebar, MobileDock, type AppView } from "./sidebar";
import { StatsPage } from "./stats-page";
import { YoutubeMusicPanel } from "./youtube-music-panel";
import { YoutubeStage } from "./youtube-stage";
import {
  applyEq,
  applyPreamp,
  beginPlayback,
  getEngine,
  outputAudio,
  pauseOutput,
  primePlayback,
  resumeEngine,
  seekOutput,
  setAudioSessionPlayback,
  setBackgroundOutput,
  setBalance,
  setBassLock,
  setIsolateMode,
  setMasterGain,
  setMonoMode,
  setRemaster,
  setPlaybackRate,
  setSpatialMode,
  unlockEngine,
} from "@/lib/player/engine";
import { usePlayer, type Track } from "@/lib/player/store";
import { isYoutubePlayback } from "@/lib/player/stream-search";
import { applyTheme, loadTheme, type Theme } from "@/lib/player/theme";
import {
  loadYoutubeApi,
  setYoutubeHandlers,
  youtubeLoad,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeSetRate,
  youtubeSetVolume,
  youtubeTime,
  youtubeDuration,
} from "@/lib/player/youtube";

/** Soulseek (and similar) need playIndex to fetch a stream before audio can start. */
function needsDeferredStream(track?: Track | null) {
  if (!track) return false;
  if (track.soulseekId) {
    const src = track.url || track.previewUrl || "";
    return !src.includes("/api/soulseek");
  }
  return false;
}

function mediaDuration(out: HTMLAudioElement, track?: Track | null) {
  const fromEl = Number.isFinite(out.duration) && out.duration > 0 && out.duration !== Infinity ? out.duration : 0;
  const meta = Number(track?.durationSec) || 0;
  // Prefer real element duration; fall back to stored metadata (iBroadcast length)
  if (fromEl > 0) return fromEl;
  return meta > 0 ? meta : 0;
}

export function PlayerApp() {

/*__SP1__*/
