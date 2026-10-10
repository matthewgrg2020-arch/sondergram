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
import { YoutubeForm } from "./youtube-form";
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
  if (fromEl > 0) return fromEl;
  const meta = Number(track?.durationSec) || 0;
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
  const remaster = usePlayer((s) => s.remaster);
  const remasterAmt = usePlayer((s) => s.remasterAmt);
  const balance = usePlayer((s) => s.balance);
  const notice = usePlayer((s) => s.notice);

  const track = index >= 0 ? tracks[index] : undefined;
  const [view, setView] = useState<AppView>("listen");
  const [query, setQuery] = useState("");
  const [nowOpen, setNowOpen] = useState(false);
  const [party, setParty] = useState(false);
  const [car, setCar] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [libraryAlbum, setLibraryAlbum] = useState<string | null>(null);

  const boundRef = useRef(false);
  const skipLockRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const lastProgressRef = useRef({ t: 0, at: 0 });

  const goView = (next: AppView) => {
    setView(next);
    if (next !== "library") setLibraryAlbum(null);
  };

  const autoNext = useCallback(() => {
    if (skipLockRef.current) return;
    skipLockRef.current = true;
    window.setTimeout(() => {
      skipLockRef.current = false;
    }, 900);
    const state = usePlayer.getState();
    if (!state.playing) return;
    const next = state.nextIndex(false);
    if (next === null) {
      setPlaying(false);
      return;
    }
    playIndex(next, false);
  }, [playIndex, setPlaying]);

  useEffect(() => {
    void hydrate();
    void loadYoutubeApi();
  }, [hydrate]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const arm = () => {
      unlockEngine();
      primePlayback();
    };
    document.addEventListener("pointerdown", arm, { passive: true });
    document.addEventListener("touchstart", arm, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", arm);
      document.removeEventListener("touchstart", arm);
    };
  }, []);

  useEffect(() => {
    const { audio, bgAudio } = getEngine();
    if (boundRef.current) return;
    boundRef.current = true;

    const onEnded = (event: Event) => {
      if (event.target !== outputAudio()) return;
      const current = usePlayer.getState().tracks[usePlayer.getState().index];
      if (isYoutubePlayback(current)) return;
      if (Date.now() - startedAtRef.current < 1200) return;
      autoNext();
    };

    const onError = (event: Event) => {
      if (event.target !== outputAudio()) return;
      const state = usePlayer.getState();
      const current = state.tracks[state.index];
      if (isYoutubePlayback(current)) return;
      // Soulseek / Bandcamp often error while the real stream is still being fetched.
      // Do not clear playing — playIndex owns that lifecycle and will start audio when ready.
      if (needsDeferredStream(current)) return;
      if (current?.bandcampId && !(current.url || "").includes("bcbits.com")) return;
      if (current?.soulseekId || current?.bandcampId || (current?.tags || []).includes("SoundCloud")) {
        // Only fail hard if we already had a real stream going for a bit
        if (Date.now() - startedAtRef.current < 2500) return;
        usePlayer.getState().flash("That stream did not start. Try the song again.");
        usePlayer.getState().setPlaying(false);
        return;
      }
      if (Date.now() - startedAtRef.current < 800) return;
      autoNext();
    };

    for (const el of [audio, bgAudio]) {
      if (!el) continue;
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
    }

    const onVis = () => {
      setAudioSessionPlayback();
      const hidden = document.visibilityState === "hidden";
      const state = usePlayer.getState();
      if (!state.playing) return;
      if (isYoutubePlayback(state.tracks[state.index])) return;
      if (hidden) {
        setBackgroundOutput(true);
        void getEngine().ctx.resume().catch(() => undefined);
        return;
      }
      setBackgroundOutput(false);
      void resumeEngine();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", () => {
      if (usePlayer.getState().playing) setBackgroundOutput(true);
    });
    window.addEventListener("pageshow", () => {
      if (usePlayer.getState().playing) {
        setBackgroundOutput(false);
        void resumeEngine();
      }
    });

    return () => {
      for (const el of [audio, bgAudio]) {
        if (!el) continue;
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
      }
      document.removeEventListener("visibilitychange", onVis);
      boundRef.current = false;
    };
  }, [autoNext]);

  useEffect(() => {
    applyEq(eq);
  }, [eq]);
  useEffect(() => {
    applyPreamp(preamp);
  }, [preamp]);
  useEffect(() => {
    setMasterGain(muted ? 0 : quiet ? Math.min(volume, 0.38) : volume);
    youtubeSetVolume(quiet ? Math.min(volume, 0.38) : volume, muted);
  }, [volume, muted, quiet]);
  useEffect(() => {
    const next = rate * Math.pow(2, pitch / 12);
    setPlaybackRate(next);
    youtubeSetRate(next);
  }, [rate, pitch]);
  useEffect(() => {
    setIsolateMode(isolate);
  }, [isolate]);
  useEffect(() => {
    setSpatialMode(spatial, spatialAmount);
  }, [spatial, spatialAmount]);
  useEffect(() => {
    setBassLock(bassLock ? 6 : 0);
  }, [bassLock]);
  useEffect(() => {
    setMonoMode(mono);
  }, [mono]);
  useEffect(() => {
    setRemaster(remaster, remasterAmt);
  }, [remaster, remasterAmt]);
  useEffect(() => {
    setBalance(balance);
  }, [balance]);

  useEffect(() => {
    setYoutubeHandlers({ onEnded: () => autoNext() });
  }, [autoNext]);

  useEffect(() => {
    if (!track) return;
    if (lastTrackIdRef.current === track.id) return;
    lastTrackIdRef.current = track.id;
    startedAtRef.current = Date.now();
    lastProgressRef.current = { t: 0, at: Date.now() };

    void (async () => {
      unlockEngine();
      setAudioSessionPlayback();
      if (isYoutubePlayback(track)) {
        pauseOutput();
        if (track.youtubeId) void youtubeLoad(track.youtubeId, usePlayer.getState().playing);
        return;
      }
      youtubePause();
      // Soulseek: playIndex fetches the peer file and calls beginPlayback itself.
      // Starting here with a stale/empty URL races and aborts that fetch.
      if (needsDeferredStream(track)) return;
      if (track.url) {
        try {
          await beginPlayback(track.url, 0);
          if (usePlayer.getState().playing) {
            void resumeEngine();
          } else {
            pauseOutput();
          }
        } catch {
          /* stream fail — playIndex / onError handle recovery */
        }
      }
    })();
  }, [track?.id]);

  // When Soulseek finishes downloading and patches url, start playback if still on this track.
  useEffect(() => {
    if (!track?.soulseekId) return;
    const src = track.url || "";
    if (!src.includes("/api/soulseek")) return;
    if (!usePlayer.getState().playing) return;
    if (lastTrackIdRef.current !== track.id) return;
    void (async () => {
      try {
        await beginPlayback(src, 0);
        if (usePlayer.getState().playing && usePlayer.getState().tracks[usePlayer.getState().index]?.id === track.id) {
          void resumeEngine();
        }
      } catch {
        /* playIndex also calls beginPlayback */
      }
    })();
  }, [track?.id, track?.url]);

  useEffect(() => {
    if (!track) return;
    if (isYoutubePlayback(track)) {
      if (playing) youtubePlay();
      else youtubePause();
      return;
    }
    if (playing) {
      setAudioSessionPlayback();
      void resumeEngine();
    } else {
      pauseOutput();
    }
  }, [playing]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isYoutubePlayback(track)) {
        setTimes(youtubeTime(), youtubeDuration());
        return;
      }
      const out = outputAudio();
      const current = out.currentTime || 0;
      const duration = mediaDuration(out, track);
      setTimes(current, duration);

      const state = usePlayer.getState();
      if (!state.playing) return;
      if (Date.now() - startedAtRef.current < 1500) return;

      // Near end using element or metadata duration
      if (duration > 3 && current > 2 && duration - current <= 0.45) {
        autoNext();
        return;
      }

      // Stalled stream (common when Soulseek/proxy ends without a clean "ended" event)
      const prog = lastProgressRef.current;
      if (current > prog.t + 0.15) {
        lastProgressRef.current = { t: current, at: Date.now() };
      } else if (current > 2 && Date.now() - prog.at > 4000) {
        // No progress for 4s after having played — treat as finished / broken and advance
        lastProgressRef.current = { t: current, at: Date.now() };
        if (out.ended || out.paused || (duration > 0 && current >= duration - 1)) {
          autoNext();
        } else if (out.ended || (duration > 0 && Math.abs(duration - current) < 1.5)) {
          autoNext();
        } else if (out.readyState >= 2 && out.paused && !out.ended && current > 1) {
          // Unexpected pause at end of buffer
          if (duration > 0 && current >= duration * 0.92) autoNext();
        }
      }

      if (out.ended && current > 1) {
        autoNext();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [track?.id, track?.durationSec, setTimes, autoNext]);

  const togglePlay = () => {
    unlockEngine();
    setPlaying(!playing);
  };
  const onSeek = (t: number) => {
    if (isYoutubePlayback(track)) youtubeSeek(t);
    else seekOutput(t);
  };
  const onPrev = () => {
    const p = prevIndex();
    if (p !== null) playIndex(p, true);
  };
  const onNext = () => {
    const n = nextIndex(true);
    if (n !== null) playIndex(n, true);
  };

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg lg:flex-row">
      <Sidebar view={view} onView={goView} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">
          {view === "listen" ? (
            <ListenNow
              onOpenLibrary={() => goView("library")}
              onOpenAlbum={(key) => {
                setLibraryAlbum(key);
                goView("library");
              }}
              onOpenAdd={() => goView("archive")}
            />
          ) : null}
          {view === "library" ? <Library startAlbum={libraryAlbum} /> : null}
          {view === "recent" ? <RecentPage /> : null}
          {view === "liked" ? <Library startTab="liked" /> : null}
          {view === "radio" ? <RadioPage /> : null}
          {view === "search" ? <SearchPage query={query} onQuery={setQuery} /> : null}
          {view === "youtube" ? (
            <div className="space-y-4 px-5 py-4">
              <YoutubeForm />
            </div>
          ) : null}
          {view === "ibroadcast" ? <IbroadcastPanel /> : null}
          {view === "deezer" ? <DeezerPanel /> : null}
          {view === "spotify" ? <SpotifyPanel /> : null}
          {view === "amazon" ? <AmazonPanel /> : null}
          {view === "find" ? <FindAudioPanel /> : null}
          {view === "archive" ? <ArchivePanel /> : null}
          {view === "bandcamp" ? <BandcampPanel /> : null}
          {view === "rym" ? <RymPanel /> : null}
          {view === "database" ? <DatabasePanel /> : null}
          {view === "soundcloud" ? <SoundcloudPanel /> : null}
          {view === "soulseek" ? <SoulseekPanel /> : null}
          {view === "stats" ? <StatsPage /> : null}
          {view === "studio" ? (
            <div className="space-y-4 px-5 py-4">
              <EqPanel />
              <RemasterPanel />
              <ListenCard />
              <SpatialCard />
              <TempoPitch />
              <ExtrasPanel />
            </div>
          ) : null}
          {view === "settings" ? (
            <div className="space-y-4 px-5 py-4">
              <AccountSync />
              <AddMusicCard onView={goView} />
              <LibraryBackup />
              <LibraryClear />
              <LastFmCard />
              <DuplicatesCard />
              <ApkCard />
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-10 rounded-full bg-raised px-4 text-sm"
              >
                Theme: {theme}
              </button>
              {notice ? <p className="text-sm text-muted">{notice}</p> : null}
            </div>
          ) : null}
          <div className={view === "youtube" ? "px-5 pb-28" : ""}>
            <YoutubeStage active={(view === "youtube" || Boolean(track?.forceYoutube)) && Boolean(track?.youtubeId)} />
          </div>
        </main>
        <MiniPlayer
          onTogglePlay={togglePlay}
          onPrev={onPrev}
          onNext={onNext}
          onSeek={onSeek}
          onExpand={() => setNowOpen(true)}
          onLyrics={() => setNowOpen(true)}
        />
        <MobileDock view={view} onView={goView} />
      </div>
      {nowOpen ? (
        <NowPlaying
          onClose={() => setNowOpen(false)}
          onTogglePlay={togglePlay}
          onPrev={onPrev}
          onNext={onNext}
          onSeek={onSeek}
          onParty={() => setParty(true)}
          onCarMode={() => setCar(true)}
          onOpenAlbum={(key) => {
            setNowOpen(false);
            setLibraryAlbum(key);
            goView("library");
          }}
        />
      ) : null}
      {party ? <PartyViz onClose={() => setParty(false)} /> : null}
      {car ? (
        <CarMode
          onClose={() => setCar(false)}
          onTogglePlay={togglePlay}
          onPrev={onPrev}
          onNext={onNext}
          onSeek={onSeek}
        />
      ) : null}
    </div>
  );
}
