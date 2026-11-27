import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { isYoutubePlayback } from "@/lib/player/stream-search";
import {
  applyEq,
  applyPreamp,
  beginPlayback,
  pauseOutput,
  resumeEngine,
  seekOutput,
  setAudioSessionPlayback,
  setBalance,
  setBassLock,
  setIsolateMode,
  setMonoMode,
  setRemaster,
  setPlaybackRate,
  setSpatialMode,
  unlockEngine,
} from "@/lib/player/engine";
import {
  youtubeLoad,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeSetRate,
  setYoutubeHandlers,
} from "@/lib/player/youtube";
import { Library } from "./library";
import { ListenNow } from "./listen-now";
import { MiniPlayer } from "./mini-player";
import { NowPlaying } from "./now-playing";
import { PartyViz } from "./party-viz";
import { QueueSheet } from "./queue-sheet";
import { RadioPage } from "./radio-page";
import { RecentPage } from "./recent-page";
import { SearchPage } from "./search-page";
import { Sidebar, MobileDock, type AppView } from "./sidebar";
import { SettingsPage } from "./settings-page";
import { StatsPage } from "./stats-page";
import { CarMode } from "./car-mode";
import { YoutubeMusicPanel } from "./youtube-music-panel";
import { YoutubeStage } from "./youtube-stage";
import { IbroadcastPanel } from "./ibroadcast-panel";
import { DeezerPanel } from "./deezer-panel";
import { SpotifyPanel } from "./spotify-panel";
import { AmazonPanel } from "./amazon-panel";
import { FindAudioPanel } from "./find-audio-panel";
import { ArchivePanel } from "./archive-panel";
import { BandcampPanel } from "./bandcamp-panel";
import { EqPanel } from "./eq-panel";
import { MixPanel } from "./mix-panel";
import { RemasterPanel } from "./remaster-panel";

export function PlayerApp() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const eq = usePlayer((s) => s.eq);
  const preamp = usePlayer((s) => s.preamp);
  const spatial = usePlayer((s) => s.spatial);
  const spatialAmount = usePlayer((s) => s.spatialAmount);
  const remaster = usePlayer((s) => s.remaster);
  const remasterAmt = usePlayer((s) => s.remasterAmt);
  const bassLock = usePlayer((s) => s.bassLock);
  const mono = usePlayer((s) => s.mono);
  const balance = usePlayer((s) => s.balance);
  const isolate = usePlayer((s) => s.isolate);
  const rate = usePlayer((s) => s.rate);
  const hydrate = usePlayer((s) => s.hydrate);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const playIndex = usePlayer((s) => s.playIndex);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const nextIndex = usePlayer((s) => s.nextIndex);

  const [view, setView] = useState<AppView>("home");
  const [nowOpen, setNowOpen] = useState(false);
  const [party, setParty] = useState(false);
  const [car, setCar] = useState(false);
  const [query, setQuery] = useState("");
  const hydrated = useRef(false);

  const current = index >= 0 && index < tracks.length ? tracks[index] : null;

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void hydrate();
  }, [hydrate]);

  const goView = useCallback((v: AppView) => setView(v), []);

  const autoNext = useCallback(() => {
    const n = nextIndex(false);
    if (n === null) {
      setPlaying(false);
      return;
    }
    void playIndex(n, false);
  }, [nextIndex, playIndex, setPlaying]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        try {
          setAudioSessionPlayback();
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    setYoutubeHandlers({ onEnded: () => autoNext() });
  }, [autoNext]);

  useEffect(() => {
    const track = current;
    if (!track) return;
    let cancelled = false;
    (async () => {
      try {
        await unlockEngine();
        if (cancelled) return;
        if (isYoutubePlayback(track)) {
          youtubeLoad(track.url || track.previewUrl || "");
          if (playing) youtubePlay();
          return;
        }
        const src = track.url || track.previewUrl || "";
        if (!src) return;
        await beginPlayback(src, 0);
        if (!playing) pauseOutput();
      } catch {
        /* stream errors surfaced elsewhere */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    if (playing) {
      void resumeEngine();
      try {
        if (isYoutubePlayback(current)) youtubePlay();
      } catch {
        /* ignore */
      }
    } else {
      try {
        pauseOutput();
      } catch {
        /* ignore */
      }
      try {
        youtubePause();
      } catch {
        /* ignore */
      }
    }
  }, [playing, current?.id]);

  useEffect(() => {
    applyEq(eq);
  }, [eq]);
  useEffect(() => {
    applyPreamp(preamp);
  }, [preamp]);
  useEffect(() => {
    setSpatialMode(spatial, spatialAmount);
  }, [spatial, spatialAmount]);
  useEffect(() => {
    setRemaster(remaster, remasterAmt);
  }, [remaster, remasterAmt]);
  useEffect(() => {
    setBassLock(bassLock ? 6 : 0);
  }, [bassLock]);
  useEffect(() => {
    setMonoMode(mono);
  }, [mono]);
  useEffect(() => {
    setBalance(balance);
  }, [balance]);
  useEffect(() => {
    setIsolateMode(isolate);
  }, [isolate]);
  useEffect(() => {
    setPlaybackRate(rate || 1);
    youtubeSetRate(rate || 1);
  }, [rate]);

  const togglePlay = () => {
    unlockEngine();
    setPlaying(!playing);
  };
  const onPrev = () => prev();
  const onNext = () => next();
  const onSeek = (t: number) => {
    seek(t);
    seekOutput(t);
    youtubeSeek(t);
  };

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <Sidebar view={view} onView={goView} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-24">
          {view === "home" ? <ListenNow onView={goView} /> : null}
          {view === "library" ? <Library /> : null}
          {view === "recent" ? <RecentPage /> : null}
          {view === "radio" ? <RadioPage /> : null}
          {view === "search" ? <SearchPage query={query} onQuery={setQuery} /> : null}
          {view === "youtube" ? <YoutubeMusicPanel /> : null}
          {view === "ibroadcast" ? <IbroadcastPanel /> : null}
          {view === "deezer" ? <DeezerPanel /> : null}
          {view === "spotify" ? <SpotifyPanel /> : null}
          {view === "amazon" ? <AmazonPanel /> : null}
          {view === "find" ? <FindAudioPanel /> : null}
          {view === "archive" ? <ArchivePanel /> : null}
          {view === "bandcamp" ? <BandcampPanel /> : null}
          {view === "eq" || view === "studio" ? (
            <div className="space-y-4 p-4">
              <EqPanel />
              <MixPanel />
              <RemasterPanel />
            </div>
          ) : null}
          {view === "stats" ? <StatsPage /> : null}
          {view === "settings" ? <SettingsPage onView={goView} onCarMode={() => setCar(true)} /> : null}
          <YoutubeStage />
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
        <QueueSheet />
      </div>
      {nowOpen ? (
        <NowPlaying
          onClose={() => setNowOpen(false)}
          onTogglePlay={togglePlay}
          onPrev={onPrev}
          onNext={onNext}
          onSeek={onSeek}
          onParty={() => { setNowOpen(false); setParty(true); }}
        />
      ) : null}
      {car ? <CarMode onClose={() => setCar(false)} onTogglePlay={togglePlay} onPrev={onPrev} onNext={onNext} onSeek={onSeek} /> : null}
      {party ? <PartyViz onClose={() => setParty(false)} /> : null}
    </div>
  );
}
