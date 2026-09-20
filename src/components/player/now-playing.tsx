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

type Props = {
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onParty: () => void;
  onCarMode?: () => void;
  onOpenAlbum?: (key: string) => void;
};

export function NowPlaying({ onClose, onTogglePlay, onPrev, onNext, onSeek, onParty, onCarMode, onOpenAlbum }: Props) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const { current: currentTime, duration } = useAudioClock();
  const upNext = usePlayer((s) => s.upNext);
  const playIndex = usePlayer((s) => s.playIndex);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const playAlbum = usePlayer((s) => s.playAlbum);
  const skipAlbum = usePlayer((s) => s.skipAlbum);
  const clearQueue = usePlayer((s) => s.clearQueue);
  const radio = usePlayer((s) => s.radio);
  const toggleRadio = usePlayer((s) => s.toggleRadio);
  const playRadioFrom = usePlayer((s) => s.playRadioFrom);
  const playMoreLikeThis = usePlayer((s) => s.playMoreLikeThis);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const spatial = usePlayer((s) => s.spatial);
  const setSpatial = usePlayer((s) => s.setSpatial);
  const plays = usePlayer((s) => s.plays);
  const setSleep = usePlayer((s) => s.setSleep);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const stopAfter = usePlayer((s) => s.stopAfter);
  const setStopAfter = usePlayer((s) => s.setStopAfter);
  const cleanTitles = usePlayer((s) => s.cleanTitles);
  const track = index >= 0 ? tracks[index] : undefined;
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [watch, setWatch] = useState(false);
  const [pulse, setPulse] = useState(1);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const swipeX = useRef<number | null>(null);
  const tapRef = useRef(0);

  useEffect(() => {
    if (!playing) {
      setPulse(1);
      return;
    }
    const wave = new Uint8Array(64);
    const id = window.setInterval(() => {
      getEngine().analyser.getByteFrequencyData(wave);
      let bass = 0;
      for (let i = 0; i < 6; i++) bass += wave[i];
      setPulse(1 + Math.min(0.03, bass / 6 / 3200));
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const peaks: number[] = [];
    let last = 0;
    const wave = new Uint8Array(128);
    const id = window.setInterval(() => {
      getEngine().analyser.getByteFrequencyData(wave);
      let bass = 0;
      for (let i = 0; i < 8; i++) bass += wave[i];
      const now = performance.now();
      if (bass / 8 > 180 && now - last > 220) {
        last = now;
        peaks.push(now);
        if (peaks.length > 8) peaks.shift();
        if (peaks.length >= 4) {
          const spans = peaks.slice(1).map((t, i) => t - peaks[i]);
          const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
          const next = Math.round(60000 / avg);
          if (next >= 60 && next <= 200) setBpm(next);
        }
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, track?.id]);

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      setTranscribeError(null);
      return;
    }
    let live = true;
    void fetchLyrics(track.artist, track.name).then((next) => {
      if (live) setLyrics(next);
    });
    return () => {
      live = false;
    };
  }, [track?.id, track?.artist, track?.name]);

  const lines = useMemo(() => {
    if (lyrics?.synced.length) return lyrics.synced;
    if (lyrics?.plain) {
      return lyrics.plain
        .split(/\n+/)
        .filter(Boolean)
        .map((text, i, all) => ({
          t: duration ? (i / Math.max(all.length, 1)) * duration : i,
          text,
        }));
    }
    return [];
  }, [lyrics, duration]);

  const line = useMemo(() => (lines.length ? activeLine(lines, currentTime) : 0), [lines, currentTime]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [line]);

  const queue = upNext.map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
  const upcoming = queue[0] ?? tracks[(index + 1) % Math.max(tracks.length, 1)];
  const playCount = track ? plays[track.id] ?? 0 : 0;

  const onCoverPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (swipeX.current != null) {
      const dx = e.clientX - swipeX.current;
      swipeX.current = null;
      if (dx > 64) {
        onPrev();
        return;
      }
      if (dx < -64) {
        onNext();
        return;
      }
    }
    const now = Date.now();
    if (now - tapRef.current < 280 && track) {
      tapRef.current = 0;
      toggleLike(track.id);
      return;
    }
    tapRef.current = now;
    window.setTimeout(() => {
      if (tapRef.current === now) setShowLyrics((v) => !v);
    }, 280);
  };

  const runTranscribe = () => {
    if (!track || transcribing) return;
    setShowLyrics(true);
    setTranscribing(true);
    setTranscribeError(null);
    void transcribeTrack({
      id: track.id,
      artist: track.artist,
      title: track.name,
      url: track.previewUrl || (track.url.startsWith("http") ? track.url : undefined),
      youtube: Boolean(track.youtubeId),
      live: playing && !track.youtubeId,
    })
      .then((next) => {
        setLyrics(next);
      })
      .catch((err) => {
        setTranscribeError(err instanceof Error ? err.message : "Transcription failed.");
      })
      .finally(() => setTranscribing(false));
  };

  const lyricsPane = (
    <div className="max-h-full space-y-5 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTranscribe}
          disabled={transcribing || !track}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-xs text-muted hover:text-fg disabled:opacity-40"
        >
          <Mic2 className="size-3.5" strokeWidth={1.75} />
          {transcribing ? (playing && !track?.youtubeId ? "Listening…" : "Transcribing…") : "AI transcribe"}
        </button>
        {transcribeError ? <span className="text-xs text-hot">{transcribeError}</span> : null}
      </div>
      {lines.length === 0 ? (
        <p className="text-2xl font-semibold leading-tight text-subtle">
          {transcribing ? "Listening to the mix…" : "Lyrics will show here when they are found, or tap AI transcribe."}
        </p>
      ) : (
        lines.map((row, i) => {
          const dist = i - line;
          return (
            <p
              key={`${row.t}-${i}`}
              ref={i === line ? activeRef : undefined}
              className={cn(
                "text-3xl font-semibold leading-tight tracking-tight transition-all duration-300 lg:text-4xl",
                dist === 0 && "text-fg",
                dist === 1 && "text-muted",
                dist !== 0 && dist !== 1 && "text-subtle",
              )}
            >
              {row.text}
            </p>
          );
        })
      )}
    </div>
  );

  const coverSrc = track?.coverUrl ? proxyCoverUrl(track.coverUrl) : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-fg">
      {coverSrc ? (
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <img src={coverSrc} alt="" className="size-full scale-125 object-cover opacity-40 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
        </div>
      ) : null}

      <div className="relative flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4 lg:pt-3">
        <button type="button" aria-label="Close now playing" onClick={onClose} className="flex size-11 items-center justify-center rounded-full text-fg">
          <ChevronDown className="size-7" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 px-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-subtle">Now playing</p>
          {track && onOpenAlbum ? (
            <button type="button" onClick={() => onOpenAlbum(albumKey(track))} className="truncate text-xs text-muted hover:text-fg">
              {track.album || "Sondergram"}
            </button>
          ) : (
            <p className="truncate text-xs text-muted">{track?.album || "Sondergram"}</p>
          )}
        </div>
        <button type="button" aria-label="Party visualizer" onClick={onParty} className="flex size-11 items-center justify-center rounded-full text-muted hover:text-fg">
          <AudioLines className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:px-16 lg:pb-8 lg:pt-4">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-2 [container-type:size] lg:px-0">
            <div
              className="relative aspect-square size-[min(100cqw,100cqh)] max-h-full max-w-full overflow-hidden rounded-2xl bg-raised shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
              onPointerDown={(e) => {
                swipeX.current = e.clientX;
              }}
              onPointerUp={onCoverPointerUp}
              onPointerCancel={() => {
                swipeX.current = null;
              }}
            >
              {coverSrc ? (
                <img src={coverSrc} alt="" className="size-full object-cover" style={{ transform: `scale(${pulse})` }} />
              ) : (
                <div className="flex size-full items-center justify-center text-7xl font-semibold text-subtle">
                  {(track?.name ?? "S").slice(0, 1)}
                </div>
              )}
              {track && isExplicitTrack(track) ? (
                <span className="absolute bottom-3 left-3">
                  <ExplicitBadge onArt className="size-6 text-xs" />
                </span>
              ) : null}
            </div>
          </div>

          {showLyrics ? <div className="max-h-28 shrink-0 overflow-y-auto px-5 lg:hidden">{lyricsPane}</div> : null}

          <div className="relative z-10 shrink-0 bg-bg px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 truncate text-2xl font-bold tracking-tight">
                  <span className="min-w-0 truncate">
                    {track?.trackNo ? `${track.trackNo}. ` : ""}
                    {track?.name ?? "Nothing playing"}
                  </span>
                  {track && isExplicitTrack(track) ? <ExplicitBadge className="size-[18px] text-[11px]" /> : null}
                </h2>
                <p className="mt-0.5 truncate text-base text-muted">{track?.artist ?? ""}</p>
                {track && looksLikeFilenameTitle(track.name) ? (
                  <button type="button" onClick={() => cleanTitles([track.id])} className="mt-1 inline-flex items-center gap-1 text-xs text-hot">
                    <Wand2 className="size-3" strokeWidth={1.75} />
                    Use song title
                  </button>
                ) : null}
              </div>
              {track ? (
                <button type="button" aria-label={track.liked ? "Unlike" : "Like"} onClick={() => toggleLike(track.id)} className="mt-1 flex size-11 shrink-0 items-center justify-center">
                  <Heart className={cn("size-6", track.liked && "fill-hot text-hot")} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
            {track ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <FormatBadge
                  label={track.format}
                  lossless={track.lossless}
                  sampleRate={track.sampleRate}
                  bitDepth={track.bitDepth}
                  bitrate={track.bitrate}
                  tags={track.tags}
                />
                <p className="font-mono text-[10px] uppercase tracking-wide text-subtle">
                  {bpm ? `${bpm} BPM` : ""}
                  {playCount ? `${bpm ? " · " : ""}${playCount} ${playCount === 1 ? "play" : "plays"}` : ""}
                  {isEngineCatalog(track)
                    ? duration > 40 || track.forceYoutube
                      ? `${bpm || playCount ? " · " : ""}Full mix`
                      : officialCatalogUrl(track) || isPreviewClip(track.previewUrl, track.durationSec)
                        ? `${bpm || playCount ? " · " : ""}Preview · loading full track`
                        : `${bpm || playCount ? " · " : ""}Sound engine`
                    : ""}
                  {track.archiveId ? (
                    <>
                      {" · "}
                      <a href={archivePage(track.archiveId)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        Archive
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
              <span className="w-10 text-right font-mono text-[11px] tabular-nums text-subtle">{formatTime(currentTime)}</span>
              <input
                className="h-seek h-seek-touch w-full"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                disabled={!track}
                aria-label="Seek"
                onChange={(e) => onSeek(Number(e.target.value))}
              />
              <span className="w-11 font-mono text-[11px] tabular-nums text-subtle">{formatRemain(currentTime, duration)}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onSeek(Math.min(duration || 0, Math.max(12, (duration || 0) * 0.08)))} className="h-8 rounded-full bg-raised px-3 text-xs text-muted">
                Skip intro
              </button>
              <button type="button" onClick={() => onSeek(Math.max(0, (duration || 0) * 0.38))} className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs text-muted">
                <Zap className="size-3" strokeWidth={2} />
                Hook
              </button>
              {track ? (
                <button type="button" onClick={() => playAlbum(track.id)} className="h-8 rounded-full bg-raised px-3 text-xs text-muted">
                  Play album
                </button>
              ) : null}
              {track ? (
                <button type="button" onClick={() => void playMoreLikeThis()} className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs text-muted">
                  <AudioLines className="size-3" strokeWidth={2} />
                  More like this
                </button>
              ) : null}
              {track ? (
                <button
                  type="button"
                  onClick={() => (radio ? toggleRadio() : playRadioFrom(track.id))}
                  className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs", radio ? "bg-accent text-accent-fg" : "bg-raised text-muted")}
                >
                  <Radio className="size-3" strokeWidth={2} />
                  {radio ? "Station on" : "Song radio"}
                </button>
              ) : null}
              <button type="button" onClick={skipAlbum} className="h-8 rounded-full bg-raised px-3 text-xs text-muted">
                Next album
              </button>
              <button type="button" onClick={clearQueue} className="h-8 rounded-full bg-raised px-3 text-xs text-muted">
                Clear queue
              </button>
              <button
                type="button"
                onClick={() => setSleep(sleepUntil ? null : 15)}
                className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs", sleepUntil ? "bg-accent text-accent-fg" : "bg-raised text-muted")}
              >
                <Moon className="size-3" strokeWidth={2} />
                {sleepUntil ? "Sleep on" : "Sleep 15"}
              </button>
              <button
                type="button"
                onClick={() => setStopAfter(stopAfter === "track" ? "off" : "track")}
                className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs", stopAfter === "track" ? "bg-accent text-accent-fg" : "bg-raised text-muted")}
              >
                <Square className="size-3" strokeWidth={2} />
                Stop after song
              </button>
              <button
                type="button"
                onClick={() => setStopAfter(stopAfter === "album" ? "off" : "album")}
                className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs", stopAfter === "album" ? "bg-accent text-accent-fg" : "bg-raised text-muted")}
              >
                <Square className="size-3" strokeWidth={2} />
                Stop after album
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-raised p-1">
              {(["off", "room", "cinema", "overhead"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSpatial(mode)}
                  className={cn("h-8 rounded-full text-[11px] capitalize", spatial === mode ? "bg-accent text-accent-fg" : "text-muted")}
                >
                  {mode === "overhead" ? "Height" : mode}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between px-2">
              <button type="button" aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle} className={cn("flex size-11 items-center justify-center text-muted", shuffle && "text-fg")}>
                <Shuffle className="size-5" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Previous" onClick={onPrev} className="flex size-12 items-center justify-center text-fg">
                <SkipBack className="size-8" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={onTogglePlay} disabled={!track} className="flex size-16 items-center justify-center rounded-full bg-play text-play-fg disabled:opacity-40">
                {playing ? <Pause className="size-7" strokeWidth={2} /> : <Play className="ml-0.5 size-7" strokeWidth={2} />}
              </button>
              <button type="button" aria-label="Next" onClick={onNext} className="flex size-12 items-center justify-center text-fg">
                <SkipForward className="size-8" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Repeat" aria-pressed={repeat !== "off"} onClick={cycleRepeat} className={cn("flex size-11 items-center justify-center text-muted", repeat !== "off" && "text-fg")}>
                {repeat === "one" ? <Repeat1 className="size-5" strokeWidth={1.75} /> : <Repeat className="size-5" strokeWidth={1.75} />}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-center gap-5 text-muted lg:justify-start">
              <button type="button" aria-label="Replay 10 seconds" onClick={() => onSeek(Math.max(0, currentTime - 10))} className="flex size-10 items-center justify-center">
                <RotateCcw className="size-5" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Forward 10 seconds" onClick={() => onSeek(Math.min(duration || currentTime + 10, currentTime + 10))} className="flex size-10 items-center justify-center">
                <RotateCw className="size-5" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Lyrics" onClick={() => setShowLyrics((v) => !v)} className={cn("flex size-10 items-center justify-center lg:hidden", showLyrics && "text-fg")}>
                <Mic2 className="size-5" strokeWidth={1.75} />
              </button>
              {track ? (
                <>
                  <button type="button" aria-label="Share" onClick={() => void shareTrack(track)} className="flex size-10 items-center justify-center">
                    <Share2 className="size-5" strokeWidth={1.75} />
                  </button>
                  <button type="button" aria-label="Download" disabled={Boolean(track.youtubeId)} onClick={() => void downloadTrack(track)} className="flex size-10 items-center justify-center disabled:opacity-30">
                    <Download className="size-5" strokeWidth={1.75} />
                  </button>
                </>
              ) : null}
              <button type="button" aria-label="Queue" onClick={() => setShowQueue((v) => !v)} className={cn("flex size-10 items-center justify-center", showQueue && "text-fg")}>
                <ListMusic className="size-5" strokeWidth={1.75} />
              </button>
              {onCarMode ? (
                <button type="button" aria-label="Car mode" onClick={onCarMode} className="flex size-10 items-center justify-center">
                  <Car className="size-5" strokeWidth={1.75} />
                </button>
              ) : null}
              {track?.mvId || track?.mvUrl ? (
                <button type="button" aria-label="Watch video" onClick={() => setWatch(true)} className="flex size-10 items-center justify-center text-hot">
                  <Film className="size-5" strokeWidth={1.75} />
                </button>
              ) : null}
              <div className="hidden flex-1 items-center gap-3 lg:flex">
                <Volume2 className="size-4 text-muted" strokeWidth={1.75} />
                <input className="h-seek w-full max-w-40" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
              </div>
            </div>

            {upcoming && upcoming.id !== track?.id ? (
              <button type="button" onClick={() => setShowQueue(true)} className="mt-3 w-full truncate rounded-xl bg-raised/80 px-3 py-2 text-left text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Up next</span>
                <span className="mt-0.5 block truncate">
                  {upcoming.name}
                  <span className="text-muted"> · {upcoming.artist}</span>
                </span>
              </button>
            ) : null}

            {showQueue ? (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto lg:hidden">
                {queue.length === 0 ? (
                  <li className="px-1 py-2 text-sm text-muted">Queue is empty.</li>
                ) : (
                  queue.map((item) =>
                    item ? (
                      <li key={item.id}>
                        <button type="button" onClick={() => playIndex(tracks.findIndex((t) => t.id === item.id))} className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left">
                          <div className="size-10 overflow-hidden rounded-md bg-raised">
                            {item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}
                          </div>
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{item.name}</span>
                            <span className="block truncate text-xs text-muted">{item.artist}</span>
                          </span>
                        </button>
                      </li>
                    ) : null,
                  )
                )}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="hidden min-h-0 overflow-y-auto lg:block">
          {showQueue ? (
            <ul className="space-y-2 pr-4">
              {queue.length === 0 ? (
                <p className="text-sm text-muted">Queue is empty.</p>
              ) : (
                queue.map((item) =>
                  item ? (
                    <li key={item.id}>
                      <button type="button" onClick={() => playIndex(tracks.findIndex((t) => t.id === item.id))} className="flex w-full items-center gap-3 rounded-lg py-2 text-left hover:bg-surface">
                        <div className="size-12 overflow-hidden rounded-md bg-raised">
                          {item.coverUrl ? <img src={proxyCoverUrl(item.coverUrl)} alt="" className="size-full object-cover" /> : null}
                        </div>
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-medium">{item.name}</span>
                          <span className="block truncate text-sm text-muted">{item.artist}</span>
                        </span>
                      </button>
                    </li>
                  ) : null,
                )
              )}
            </ul>
          ) : (
            lyricsPane
          )}
        </div>
      </div>
      {watch && track && (track.mvId || track.mvUrl) ? (
        <VideoWatch title={track.name} youtubeId={track.mvId} url={track.mvUrl || `https://www.youtube.com/watch?v=${track.mvId}`} onClose={() => setWatch(false)} />
      ) : null}
    </div>
  );
}
