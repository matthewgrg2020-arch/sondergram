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
  if (fromEl > 0) return fromEl;
  return meta > 0 ? meta : 0;
}

export function PlayerApp() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const eq = usePlayer((s) => s.eq);
  const preamp = usePlayer((s) => s.preamp);
  const rate = usePlayer((s) => s.rate);
  const pitch = usePlayer((s) => s.pitch);
  const isolate = usePlayer((s) => s.isolate);
  const spatial = usePlayer((s) => s.spatial);
  const spatialAmount = usePlayer((s) => s.spatialAmount);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const setTimes = usePlayer((s) => s.setTimes);
  const playIndex = usePlayer((s) => s.playIndex);
  const nextIndex = usePlayer((s) => s.nextIndex);
  const prevIndex = usePlayer((s) => s.prevIndex);
  const hydrate = usePlayer((s) => s.hydrate);
  const quiet = usePlayer((s) => s.quiet);
  const bassLock = usePlayer((s) => s.bassLock);
  const mono = usePlayer((s) => s.mono);

/*__P1__*/
