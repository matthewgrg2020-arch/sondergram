import { useEffect, useMemo, useRef, useState } from "react";
import { ArchivePanel } from "./archive-panel";
import { ApkCard } from "./apk-card";
import { BandcampPanel } from "./bandcamp-panel";
import { DatabasePanel } from "./database-panel";
import { DeezerPanel } from "./deezer-panel";
import { EqPanel } from "./eq-panel";
import { ExtrasPanel } from "./extras-panel";
import { IbroadcastPanel } from "./ibroadcast-panel";
import { RymPanel } from "./rym-panel";
import { SpotifyPanel } from "./spotify-panel";
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
import { applyTheme, applyAccent, loadTheme, loadAccent, ACCENT_PRESETS, type Theme, type AccentId } from "@/lib/player/theme";
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

export function PlayerApp() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const eq = usePlayer((s) => s.eq);
  const preamp = usePlayer((s) => s.preamp);
  const spatial = usePlayer((s) => s.spatial);
  const spatialAmount = usePlayer((s) => s.spatialAmount);
  const remaster = usePlayer((s) => s.remaster);
  const remasterAmt = usePlayer((s) => s.remasterAmt);
  const bassLock = usePlayer((s) => s.bassLock);
  const rate = usePlayer((s) => s.rate);
  const mono = usePlayer((s) => s.mono);
  const balance = usePlayer((s) => s.balance);
  const isolate = usePlayer((s) => s.isolate);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const flash = usePlayer((s) => s.flash);
  const notice = usePlayer((s) => s.notice);
  const current = tracks[index] as Track | undefined;

  const [view, setView] = useState<AppView>("home");
  const [query, setQuery] = useState("");
  const [nowOpen, setNowOpen] = useState(false);
  const [car, setCar] = useState(false);
  const [party, setParty] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [accent, setAccent] = useState<AccentId>(() => loadAccent());
  const goView = (v: AppView) => setView(v);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyAccent(accent); }, [accent]);

  // Engine / media wiring (kept from existing app shell)
  useEffect(() => {
    void loadYoutubeApi().catch(() => {});
  }, []);

  useEffect(() => {
    setMasterGain(muted ? 0 : volume);
  }, [volume, muted]);

  useEffect(() => {
    applyEq(eq);
    applyPreamp(preamp);
  }, [eq, preamp]);

  useEffect(() => {
    setSpatialMode(spatial, spatialAmount);
  }, [spatial, spatialAmount]);

  useEffect(() => {
    setRemaster(remaster, remasterAmt);
  }, [remaster, remasterAmt]);

  useEffect(() => {
    setBassLock(Boolean(bassLock));
  }, [bassLock]);

  useEffect(() => {
    setPlaybackRate(rate || 1);
    youtubeSetRate(rate || 1);
  }, [rate]);

  useEffect(() => {
    setMonoMode(Boolean(mono));
    setBalance(balance || 0);
    setIsolateMode(Boolean(isolate));
  }, [mono, balance, isolate]);

  const togglePlay = async () => {
    try {
      await unlockEngine();
      if (playing) {
        pauseOutput();
        youtubePause();
        setPlaying(false);
      } else {
        await resumeEngine();
        setAudioSessionPlayback();
        setBackgroundOutput(true);
        if (current && isYoutubePlayback(current)) youtubePlay();
        else beginPlayback();
        setPlaying(true);
      }
    } catch {
      flash?.("Playback blocked — tap play again");
    }
  };

  const onPrev = () => prev();
  const onNext = () => next();
  const onSeek = (t: number) => {
    seek(t);
    seekOutput(t);
    youtubeSeek(t);
  };

  if (car) return <CarMode onExit={() => setCar(false)} />;
  if (party) return <PartyViz onClose={() => setParty(false)} />;

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
          {view === "rym" ? <RymPanel /> : null}
          {view === "database" ? <DatabasePanel /> : null}
          {view === "soundcloud" ? <SoundcloudPanel /> : null}
          {view === "soulseek" ? <SoulseekPanel /> : null}
          {view === "studio" ? (
            <div className="space-y-4 px-5 py-4">
              <EqPanel />
              <RemasterPanel />
              <ListenCard />
              <SpatialCard />
              <TempoPitch />
              <ExtrasPanel onCarMode={() => setCar(true)} />
            </div>
          ) : null}
          {view === "stats" ? <StatsPage /> : null}
          {view === "settings" ? (
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-2xl bg-raised p-4">
                <p className="mb-3 text-sm font-semibold">Appearance</p>
                <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Mode</p>
                <div className="mb-4 flex gap-2">
                  {(["dark", "light"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTheme(mode)}
                      className={`h-10 flex-1 rounded-full text-sm font-medium capitalize ${
                        theme === mode ? "bg-accent text-accent-fg" : "bg-surface text-muted hover:text-fg"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Accent color</p>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      onClick={() => setAccent(p.id)}
                      className={`flex h-10 items-center gap-2 rounded-full px-3 text-xs font-medium ring-2 ${
                        accent === p.id ? "ring-fg" : "ring-transparent"
                      }`}
                      style={{ background: p.color, color: p.id === "mint" || p.id === "amber" || p.id === "mono" ? "#111" : "#fff" }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <ExtrasPanel onCarMode={() => setCar(true)} />
              <AccountSync />
              <AddMusicCard onView={goView} />
              <LibraryBackup />
              <LibraryClear />
              <LastFmCard />
              <DuplicatesCard />
              <ApkCard />
              {notice ? <p className="text-sm text-muted">{notice}</p> : null}
            </div>
          ) : null}
          <div className="hidden"><YoutubeStage active={false} /></div>
        </main>
        <MiniPlayer onTogglePlay={togglePlay} onPrev={onPrev} onNext={onNext} onSeek={onSeek} onExpand={() => setNowOpen(true)} onLyrics={() => setNowOpen(true)} />
        <MobileDock view={view} onView={goView} />
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
    </div>
  );
}
