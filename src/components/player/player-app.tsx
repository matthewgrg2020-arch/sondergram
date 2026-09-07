import { ChevronLeft, ChevronRight, Moon, Plus, Search, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EqPanel } from "./eq-panel";
import { ExtrasPanel } from "./extras-panel";
import { ApkCard } from "./apk-card";
import { SpotifyPanel } from "./spotify-panel";
import { DeezerPanel } from "./deezer-panel";
import { IbroadcastPanel } from "./ibroadcast-panel";
import { ArchivePanel } from "./archive-panel";
import { AmazonPanel } from "./amazon-panel";
import { FindAudioPanel } from "./find-audio-panel";
import { AddMusicCard } from "./add-music-card";
import { LastFmCard } from "./lastfm-card";
import { DuplicatesCard } from "./duplicates-card";
import { Library } from "./library";
import { LibraryBackup } from "./library-backup";
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
  setFadeMul,
  setIsolateMode,
  setMasterGain,
  setMonoMode,
  setRemaster,
  setNormalizeMul,
  setReplayGainDb,
  setPlaybackRate,
  setSpatialMode,
  unlockEngine,
} from "@/lib/player/engine";
import { loadIbSession, streamUrl } from "@/lib/player/ibroadcast";
import { nowPlayingTrack, scrobbleTrack } from "@/lib/player/lastfm";
import { usePlayer } from "@/lib/player/store";
import { applyTheme, loadTheme, type Theme } from "@/lib/player/theme";
import {
  loadYoutubeApi,
  parseYoutubeId,
  setYoutubeHandlers,
  youtubeDuration,
  youtubeLoad,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeSetRate,
  youtubeSetVolume,
  youtubeStop,
  youtubeTime,
} from "@/lib/player/youtube";

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
  const crossfade = usePlayer((s) => s.crossfade);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const setSleep = usePlayer((s) => s.setSleep);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const setTimes = usePlayer((s) => s.setTimes);
  const playIndex = usePlayer((s) => s.playIndex);
  const nextIndex = usePlayer((s) => s.nextIndex);
  const prevIndex = usePlayer((s) => s.prevIndex);
  const addFiles = usePlayer((s) => s.addFiles);
  const addYoutube = usePlayer((s) => s.addYoutube);
  const hydrate = usePlayer((s) => s.hydrate);
  const quiet = usePlayer((s) => s.quiet);
  const normalize = usePlayer((s) => s.normalize);
  const skipSilence = usePlayer((s) => s.skipSilence);
  const bassLock = usePlayer((s) => s.bassLock);
  const haptic = usePlayer((s) => s.haptic);
  const shakeSkip = usePlayer((s) => s.shakeSkip);
  const ready = usePlayer((s) => s.ready);
  const mono = usePlayer((s) => s.mono);
  const remaster = usePlayer((s) => s.remaster);
  const remasterAmt = usePlayer((s) => s.remasterAmt);
  const notice = usePlayer((s) => s.notice);
  const loopA = usePlayer((s) => s.loopA);
  const loopB = usePlayer((s) => s.loopB);
  const rememberPosition = usePlayer((s) => s.rememberPosition);
  const addListenMs = usePlayer((s) => s.addListenMs);
  const balance = usePlayer((s) => s.balance);

  const track = index >= 0 ? tracks[index] : undefined;
  const [view, setView] = useState<AppView>("listen");
  const [query, setQuery] = useState("");
  const [nowOpen, setNowOpen] = useState(false);
  const [party, setParty] = useState(false);
  const [car, setCar] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [libraryAlbum, setLibraryAlbum] = useState<string | null>(null);

  const boundRef = useRef(false);
  const gaplessRef = useRef<string | null>(null);
  const fadeSkipRef = useRef(false);
  const skipLockRef = useRef(false);
  const ignoreEndedRef = useRef(0);
  const startedAtRef = useRef(0);

  const goView = (next: AppView) => {
    setView(next);
    if (next !== "library") setLibraryAlbum(null);
  };

  const autoNext = useCallback(() => {
    const now = Date.now();
    if (now < ignoreEndedRef.current) return;
    if (skipLockRef.current) return;
    const state = usePlayer.getState();
    if (!state.playing && state.index < 0) return;
    const current = state.tracks[state.index];
    if (current?.youtubeId) {
      const left = youtubeDuration() - youtubeTime();
      if (Number.isFinite(left) && left > 1.5) return;
    }
    const lockMs = 900;
    skipLockRef.current = true;
    ignoreEndedRef.current = now + lockMs;
    window.setTimeout(() => {
      skipLockRef.current = false;
    }, lockMs);
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
    setYoutubeHandlers({
      onEnded: () => autoNext(),
      onMeta: (title, author) => {
        const current = usePlayer.getState();
        const item = current.tracks[current.index];
        if (!item?.youtubeId || item.metaEdited) return;
        const unlocked = item.name === "YouTube" || item.name === "" || item.artist === "YouTube";
        if (!unlocked) return;
        if (item.name === title && item.artist === author) return;
        current.patchTrack(item.id, { name: title, artist: author });
      },
    });
  }, [autoNext]);

  useEffect(() => {
    const { audio, bgAudio } = getEngine();
    if (boundRef.current) return;
    boundRef.current = true;

    const onTime = () => {
      const state = usePlayer.getState();
      if (state.tracks[state.index]?.youtubeId) return;
      const out = outputAudio();
      const duration = Number.isFinite(out.duration) ? out.duration : 0;
      setTimes(out.currentTime, duration);
      if (!state.playing) return;
      if (duration > 2 && out.currentTime > 2 && duration - out.currentTime <= 0.28) {
        if (gaplessRef.current === state.tracks[state.index]?.id) return;
        gaplessRef.current = state.tracks[state.index]?.id ?? null;
        fadeSkipRef.current = true;
        autoNext();
      }
    };
    const onEnded = (event: Event) => {
      if (event.target !== audio && event.target !== bgAudio) return;
      if (usePlayer.getState().tracks[usePlayer.getState().index]?.youtubeId) return;
      if (fadeSkipRef.current) {
        fadeSkipRef.current = false;
        return;
      }
      if (Date.now() - startedAtRef.current < 900 && outputAudio().currentTime < 0.8) {
        void outputAudio().play().catch(() => autoNext());
        return;
      }
      autoNext();
    };
    const onError = () => {
      const state = usePlayer.getState();
      if (state.tracks[state.index]?.youtubeId) return;
      if (Date.now() - startedAtRef.current < 400) return;
      autoNext();
    };
    for (const el of [audio, bgAudio]) {
      if (!el) continue;
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("loadedmetadata", onTime);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
    }
    return () => {
      for (const el of [audio, bgAudio]) {
        if (!el) continue;
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("loadedmetadata", onTime);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
      }
      boundRef.current = false;
    };
  }, [autoNext, setPlaying, setTimes]);

  useEffect(() => {
    const keepPlaying = () => {
      setAudioSessionPlayback();
      const state = usePlayer.getState();
      if (!state.playing) return;
      const current = state.tracks[state.index];
      setBackgroundOutput(true);
      if (current?.youtubeId) {
        youtubePlay();
        if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
        return;
      }
      void resumeEngine();
      const out = outputAudio();
      if (out.paused) void out.play().catch(() => {});
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
    };
    const onVis = () => keepPlaying();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", keepPlaying);
    window.addEventListener("pageshow", keepPlaying);
    window.addEventListener("focus", keepPlaying);
    window.addEventListener("blur", keepPlaying);
    window.addEventListener("freeze", keepPlaying as EventListener);
    window.addEventListener("resume", keepPlaying as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", keepPlaying);
      window.removeEventListener("pageshow", keepPlaying);
      window.removeEventListener("focus", keepPlaying);
      window.removeEventListener("blur", keepPlaying);
      window.removeEventListener("freeze", keepPlaying as EventListener);
      window.removeEventListener("resume", keepPlaying as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock
      ?.request("screen")
      .then((l) => {
        lock = l;
      })
      .catch(() => undefined);
    return () => {
      void lock?.release();
    };
  }, [playing]);

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
    fadeSkipRef.current = false;
    gaplessRef.current = null;
    startedAtRef.current = Date.now();
    ignoreEndedRef.current = Date.now() + 400;
    if (crossfade <= 0) {
      setFadeMul(1);
      return;
    }
    setFadeMul(0);
    const start = performance.now();
    const dur = Math.min(crossfade, 2) * 1000;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setFadeMul(t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [track?.id, crossfade]);

  useEffect(() => {
    if (!playing || crossfade <= 0) return;
    if (track?.youtubeId) return;
    const { audio } = getEngine();
    let raf = 0;
    const tick = () => {
      const d = audio.duration || 0;
      const left = d - audio.currentTime;
      if (d && left <= crossfade && left > 0) {
        setFadeMul(Math.max(0, left / crossfade));
        if (left <= 0.12 && !fadeSkipRef.current) {
          fadeSkipRef.current = true;
          autoNext();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, crossfade, autoNext, track?.id]);

  useEffect(() => {
    if (!sleepUntil) return;
    const id = window.setInterval(() => {
      const left = sleepUntil - Date.now();
      if (left <= 0) {
        setPlaying(false);
        setSleep(null);
        setFadeMul(1);
        pauseOutput();
        youtubePause();
        return;
      }
      if (left < 20_000) setFadeMul(left / 20_000);
    }, 400);
    return () => window.clearInterval(id);
  }, [sleepUntil, setPlaying, setSleep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const state = usePlayer.getState();
      if (e.code === "Space") {
        e.preventDefault();
        if (state.index >= 0) state.setPlaying(!state.playing);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const next = state.nextIndex(true);
        if (next !== null) state.playIndex(next);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const { audio } = getEngine();
        if (audio.currentTime > 3) audio.currentTime = 0;
        else {
          const prev = state.prevIndex();
          if (prev !== null) state.playIndex(prev);
        }
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        state.setVolume(Math.min(1, state.volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        state.setVolume(Math.max(0, state.volume - 0.05));
      } else if (e.key === "l" || e.key === "L") {
        const id = state.tracks[state.index]?.id;
        if (id) state.toggleLike(id);
      } else if (e.key === "s" || e.key === "S") {
        state.toggleShuffle();
      } else if (e.key === "r" || e.key === "R") {
        state.toggleRadio();
      } else if (e.key === "[") {
        state.markLoop("a");
      } else if (e.key === "]") {
        state.markLoop("b");
      } else if (e.key === "\\") {
        state.clearLoop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!track) {
      pauseOutput();
      youtubeStop();
      return;
    }
    if (track.youtubeId) {
      pauseOutput();
      void youtubeLoad(track.youtubeId, playing);
      return;
    }
    youtubePause();
    if (!playing) {
      pauseOutput();
      return;
    }
    const out = outputAudio();
    if (out.paused && out.src && !out.src.startsWith("data:")) {
      void resumeEngine();
      void out.play().catch(() => {});
    }
  }, [track?.id, playing]);

  useEffect(() => {
    if (!track?.youtubeId || !playing) return;
    const id = window.setInterval(() => {
      const time = youtubeTime();
      const duration = youtubeDuration();
      setTimes(time, duration);
      if (duration > 3 && time > 2 && duration - time <= 0.35) autoNext();
    }, 400);
    return () => window.clearInterval(id);
  }, [track?.youtubeId, playing, setTimes, autoNext]);

  useEffect(() => {
    if (!playing || track?.youtubeId) return;
    const id = window.setInterval(() => {
      const out = outputAudio();
      const duration = Number.isFinite(out.duration) ? out.duration : 0;
      if (out.ended) {
        autoNext();
        return;
      }
      if (duration > 2 && out.currentTime > 2 && duration - out.currentTime <= 0.2) {
        autoNext();
      }
    }, 450);
    return () => window.clearInterval(id);
  }, [playing, track?.id, autoNext]);

  useEffect(() => {
    if (loopA == null || loopB == null || loopB <= loopA) return;
    const { audio } = getEngine();
    const onTime = () => {
      if (audio.currentTime >= loopB - 0.04) audio.currentTime = loopA;
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [loopA, loopB]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      addListenMs(now - last);
      last = now;
    }, 5000);
    return () => window.clearInterval(id);
  }, [playing, addListenMs]);

  useEffect(() => {
    if (!playing || !normalize || !getEngine().graphActive || typeof track?.replayGain === "number") {
      if (typeof track?.replayGain === "number" && normalize) setNormalizeMul(1);
      else if (!playing || !normalize || !getEngine().graphActive) setNormalizeMul(1);
      return;
    }
    const wave = new Uint8Array(256);
    let raf = 0;
    let last = 0;
    const tick = (stamp: number) => {
      raf = requestAnimationFrame(tick);
      if (stamp - last < 80) return;
      last = stamp;
      getEngine().analyser.getByteTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / wave.length);
      const target = 0.12;
      const next = rms > 0.01 ? Math.min(1.8, Math.max(0.65, target / rms)) : 1;
      setNormalizeMul(next);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setNormalizeMul(1);
    };
  }, [playing, normalize, track?.id, track?.replayGain]);

  useEffect(() => {
    setReplayGainDb(normalize && typeof track?.replayGain === "number" ? track.replayGain : 0);
  }, [normalize, track?.id, track?.replayGain]);

  useEffect(() => {
    if (!normalize || !playing || !track || track.youtubeId || typeof track.replayGain === "number") return;
    const samples: number[] = [];
    const id = window.setInterval(() => {
      if (!getEngine().graphActive) return;
      const wave = new Uint8Array(256);
      getEngine().analyser.getByteTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128;
        sum += v * v;
      }
      samples.push(Math.sqrt(sum / wave.length));
      if (samples.length < 18) return;
      window.clearInterval(id);
      const rms = samples.reduce((a, b) => a + b, 0) / samples.length;
      if (rms > 0.012) {
        const db = Math.max(-9, Math.min(9, 20 * Math.log10(0.12 / rms)));
        usePlayer.getState().setReplayGain(track.id, Math.round(db * 10) / 10);
      }
    }, 220);
    return () => window.clearInterval(id);
  }, [normalize, playing, track?.id, track?.replayGain, track]);

  useEffect(() => {
    if (!playing || !skipSilence || !track || track.youtubeId || track.deezerId || !getEngine().graphActive) return;
    const wave = new Uint8Array(256);
    const id = window.setInterval(() => {
      const out = outputAudio();
      if (out.currentTime > 2.5 || out.currentTime < 0.05) return;
      getEngine().analyser.getByteTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128;
        sum += v * v;
      }
      if (Math.sqrt(sum / wave.length) < 0.006) seekOutput(out.currentTime + 0.2);
    }, 280);
    return () => window.clearInterval(id);
  }, [playing, skipSilence, track]);

  useEffect(() => {
    if (!track || !playing) return;
    const id = window.setInterval(() => {
      const t = track.youtubeId ? youtubeTime() : outputAudio().currentTime;
      if (t > 5) rememberPosition(track.id, t);
    }, 4000);
    return () => window.clearInterval(id);
  }, [track, playing, rememberPosition]);

  useEffect(() => {
    if (!track || !playing) return;
    void nowPlayingTrack(track.artist, track.name);
    const started = Date.now();
    const id = window.setTimeout(() => {
      void scrobbleTrack(track.artist, track.name, started);
    }, 32_000);
    return () => window.clearTimeout(id);
  }, [track?.id, playing]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing && track ? "playing" : "paused";
    if (!track) return;
    const artwork = track.coverUrl
      ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: track.album || [track.genre, track.year].filter(Boolean).join(" · ") || undefined,
      artwork,
    });
    const playNow = () => {
      setAudioSessionPlayback();
      setPlaying(true);
      if (track.youtubeId) {
        youtubePlay();
        return;
      }
      const out = outputAudio();
      void resumeEngine();
      void out.play().catch(() => {
        void beginPlayback(track.url).catch(() => setPlaying(false));
      });
    };
    navigator.mediaSession.setActionHandler("play", playNow);
    navigator.mediaSession.setActionHandler("pause", () => {
      pauseOutput();
      youtubePause();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const prev = usePlayer.getState().prevIndex();
      if (prev !== null) usePlayer.getState().playIndex(prev);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const next = usePlayer.getState().nextIndex(true);
      if (next !== null) usePlayer.getState().playIndex(next);
    });
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") onSeek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => onSeek(Math.max(0, outputAudio().currentTime - 10)));
      navigator.mediaSession.setActionHandler("seekforward", () => onSeek(outputAudio().currentTime + 10));
    } catch {
      /* older safari */
    }
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [track, playing, setPlaying]);

  useEffect(() => {
    if (!shakeSkip || !playing) return;
    let last = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      if (mag < 26) return;
      const now = Date.now();
      if (now - last < 1200) return;
      last = now;
      const next = usePlayer.getState().nextIndex(true);
      if (next !== null) usePlayer.getState().playIndex(next);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [shakeSkip, playing]);

  useEffect(() => {
    if (!haptic || !playing) return;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* no haptic */
    }
  }, [track?.id, haptic, playing]);

  const togglePlay = useCallback(() => {
    if (!track) return;
    if (playing) {
      pauseOutput();
      youtubePause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (track.youtubeId) {
      void youtubeLoad(track.youtubeId, true);
      return;
    }
    const out = outputAudio();
    if (out.src && !out.src.startsWith("data:")) {
      void resumeEngine();
      void out.play().catch(() => {
        const keep = out.currentTime || 0;
        void beginPlayback(track.url, keep).catch(() => setPlaying(false));
      });
      return;
    }
    if (track.ibroadcastId && track.ibFile) {
      const session = loadIbSession();
      if (session) {
        void beginPlayback(streamUrl(session, track.ibFile, track.ibroadcastId)).catch(() => setPlaying(false));
        return;
      }
    }
    if (track.url.startsWith("http") || track.previewUrl) {
      void beginPlayback(track.previewUrl || track.url).catch(() => setPlaying(false));
      return;
    }
    void beginPlayback(track.url).catch(() => setPlaying(false));
  }, [playing, setPlaying, track]);

  const goNext = useCallback(() => {
    ignoreEndedRef.current = Date.now() + 800;
    const next = nextIndex(true);
    if (next !== null) playIndex(next);
  }, [nextIndex, playIndex]);

  const goPrev = useCallback(() => {
    ignoreEndedRef.current = Date.now() + 800;
    if (track?.youtubeId) {
      if (youtubeTime() > 3) {
        youtubeSeek(0);
        return;
      }
    } else if (outputAudio().currentTime > 3) {
      seekOutput(0);
      return;
    }
    const prev = prevIndex();
    if (prev !== null) playIndex(prev);
  }, [playIndex, prevIndex, track]);

  const onSeek = useCallback(
    (t: number) => {
      if (track?.youtubeId) {
        youtubeSeek(t);
        setTimes(t, youtubeDuration());
        return;
      }
      seekOutput(t);
      setTimes(t, outputAudio().duration || 0);
    },
    [setTimes, track],
  );

  return (
    <div
      className="flex min-h-dvh flex-col bg-bg text-fg pt-[env(safe-area-inset-top)] lg:flex-row"
      onPointerDown={unlockEngine}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const text = e.dataTransfer.getData("text");
        if (parseYoutubeId(text)) {
          void addYoutube(text);
          return;
        }
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Sidebar view={view} onView={goView} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 py-2 lg:px-5">
          <button
            type="button"
            aria-label="Back"
            onClick={() => goView("listen")}
            className="flex size-8 items-center justify-center rounded-full text-muted hover:text-fg lg:hidden"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => goView("search")}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-raised px-4 text-sm text-muted"
          >
            <Search className="size-4" strokeWidth={1.75} />
            <span className="truncate">{query || "Search"}</span>
          </button>
          <button
            type="button"
            aria-label="Add music"
            onClick={() => goView("settings")}
            className="flex size-8 items-center justify-center rounded-full bg-raised text-muted hover:text-fg lg:hidden"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Forward"
            className="hidden size-8 items-center justify-center rounded-full text-muted hover:text-fg lg:flex"
          >
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Theme"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="flex size-8 items-center justify-center rounded-full bg-raised text-muted hover:text-fg"
          >
            {theme === "dark" ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
          </button>
        </header>

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
            <section className="space-y-4 px-5 py-4">
              <h2 className="text-xl font-semibold tracking-tight">YouTube</h2>
              <YoutubeForm />
            </section>
          ) : null}
          {view === "ibroadcast" ? <IbroadcastPanel /> : null}
          {view === "deezer" ? <DeezerPanel /> : null}
          {view === "spotify" ? <SpotifyPanel /> : null}
          {view === "amazon" ? <AmazonPanel /> : null}
          {view === "find" ? <FindAudioPanel /> : null}
          {view === "archive" ? <ArchivePanel /> : null}
          {view === "stats" ? <StatsPage /> : null}
          {view === "studio" ? (
            <section className="grid gap-4 px-5 py-4">
              <h2 className="text-xl font-semibold tracking-tight">Sound</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                <TempoPitch />
                <RemasterPanel />
                <SpatialCard />
                <ListenCard />
                <EqPanel />
                <ExtrasPanel onCarMode={() => setCar(true)} />
              </div>
            </section>
          ) : null}
          {view === "settings" ? (
            <section className="grid gap-4 px-5 py-4">
              <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
              <AddMusicCard onView={goView} />
              <ApkCard />
              <LibraryBackup />
              <LastFmCard />
              <DuplicatesCard />
              <ExtrasPanel onCarMode={() => setCar(true)} />
            </section>
          ) : null}

          <div className={view === "youtube" ? "px-5 pb-28" : ""}>
            <YoutubeStage active={view === "youtube" && Boolean(track?.youtubeId)} />
          </div>
        </main>

        {track ? (
          <MiniPlayer
            onTogglePlay={togglePlay}
            onPrev={goPrev}
            onNext={goNext}
            onSeek={onSeek}
            onExpand={() => setNowOpen(true)}
            onLyrics={() => setNowOpen(true)}
          />
        ) : null}
        <MobileDock view={view} onView={goView} />
      </div>

      {nowOpen ? (
        <NowPlaying
          onClose={() => setNowOpen(false)}
          onTogglePlay={togglePlay}
          onPrev={goPrev}
          onNext={goNext}
          onSeek={onSeek}
          onParty={() => setParty(true)}
          onCarMode={() => setCar(true)}
        />
      ) : null}
      {party ? <PartyViz onClose={() => setParty(false)} /> : null}
      {car ? (
        <CarMode
          onClose={() => setCar(false)}
          onTogglePlay={togglePlay}
          onPrev={goPrev}
          onNext={goNext}
          onSeek={onSeek}
        />
      ) : null}

      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
          <p className="rounded-full bg-accent px-4 py-2 text-sm text-accent-fg shadow-lg">{notice}</p>
        </div>
      ) : null}
      {!ready ? <div className="pointer-events-none fixed inset-0 z-30 bg-bg/40" /> : null}
    </div>
  );
}
