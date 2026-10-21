import {
  AudioLines,
  ExternalLink,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { getEngine } from "@/lib/player/engine";
import { formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";
import { albumKey } from "@/lib/player/catalog";
import { isExplicitTrack } from "@/lib/player/explicit";
import { proxyCoverUrl } from "@/lib/player/covers";
import { activeLine, fetchLyrics, type Lyrics } from "@/lib/player/lyrics";
import { cn } from "@/lib/utils";
import { ExplicitBadge } from "./format-badge";

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

function playingFrom(track: {
  youtubeId?: string;
  soulseekId?: string;
  bandcampId?: string;
  amazonId?: string;
  tags?: string[];
  format?: string;
} | null) {
  if (!track) return { source: "Library", query: "" };
  if (track.youtubeId || track.tags?.includes("YouTube Music") || track.format === "YTM") {
    return { source: "YouTube Music", query: track.tags?.find((t) => t !== "YouTube Music" && t !== "YouTube") || "" };
  }
  if (track.soulseekId || track.tags?.includes("Soulseek")) return { source: "Soulseek", query: "" };
  if (track.bandcampId || track.tags?.includes("Bandcamp")) return { source: "Bandcamp", query: "" };
  if (track.amazonId || track.tags?.includes("Amazon")) return { source: "Amazon Music", query: "" };
  return { source: "Library", query: "" };
}

export function NowPlaying({ onClose, onTogglePlay, onPrev, onNext, onSeek, onParty, onCarMode, onOpenAlbum }: Props) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const { current: currentTime, duration } = useAudioClock();
  const toggleLike = usePlayer((s) => s.toggleLike);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const track = tracks[index] ?? null;
  const coverSrc = track?.coverUrl ? proxyCoverUrl(track.coverUrl) : null;
  const swipeX = useRef<number | null>(null);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const [pulse, setPulse] = useState(1);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const from = playingFrom(track);

  useEffect(() => {
    if (!playing) return;
    const wave = new Uint8Array(64);
    const id = window.setInterval(() => {
      try {
        getEngine().analyser.getByteFrequencyData(wave);
        let bass = 0;
        for (let i = 0; i < 6; i++) bass += wave[i];
        setPulse(1 + Math.min(0.03, bass / 6 / 3200));
      } catch {}
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    let live = true;
    setLyrics(null);
    if (!track?.name || !track?.artist) return;
    setLyricsBusy(true);
    void fetchLyrics(track.artist, track.name)
      .then((next) => {
        if (live) setLyrics(next);
      })
      .finally(() => {
        if (live) setLyricsBusy(false);
      });
    return () => {
      live = false;
    };
  }, [track?.id, track?.artist, track?.name]);

  const lines = useMemo(() => {
    if (lyrics?.synced?.length) return lyrics.synced;
    if (lyrics?.plain) {
      return lyrics.plain
        .split("\n")
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text, i) => ({ t: i * 4, text }));
    }
    return [] as { t: number; text: string }[];
  }, [lyrics]);

  const line = activeLine(lines, currentTime);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [line]);

  const onCoverPointerUp = (e: PointerEvent) => {
    if (swipeX.current == null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (dx > 60) onPrev();
    else if (dx < -60) onNext();
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#0b0a18] text-fg">
      {coverSrc ? (
        <div className="pointer-events-none absolute inset-0">
          <img src={coverSrc} alt="" className="size-full scale-125 object-cover opacity-25 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1440]/92 via-[#0b0a18]/96 to-[#0b0a18]" />
        </div>
      ) : null}

      {/* Header */}
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-6 lg:pt-4">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-white/5 text-fg hover:bg-white/10">
            <X className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setShowLyrics((v) => !v)}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
              showLyrics ? "bg-white/10 text-fg" : "bg-white/5 text-muted hover:text-fg",
            )}
          >
            <ExternalLink className="size-3.5" strokeWidth={1.75} />
            Lyrics
          </button>
        </div>
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Playing from search</p>
          <p className="truncate text-xs text-white/70">
            {from.source}
            {from.query ? `: ${from.query}` : track?.album ? `: ${track.album}` : ""}
          </p>
        </div>
        <button type="button" aria-label="Party visualizer" onClick={onParty} className="flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
          <AudioLines className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Body: cover+controls | lyrics */}
      <div
        className={cn(
          "relative z-10 grid min-h-0 flex-1",
          showLyrics ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-10 lg:pb-6 lg:pt-2" : "lg:place-items-center lg:px-10 lg:pb-6",
        )}
      >
        {/* Left column: cover + pinned controls */}
        <div className="relative z-20 flex min-h-0 flex-col items-center justify-between gap-3 px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:items-stretch lg:justify-center lg:gap-5 lg:px-0 lg:pb-0">
          <div className="flex w-full max-w-[22rem] shrink-0 flex-col items-center justify-center lg:max-w-[min(100%,26rem)]">
            <div
              className="relative mx-auto aspect-square w-full max-h-[min(42dvh,22rem)] max-w-[min(100%,22rem)] overflow-hidden rounded-2xl bg-raised shadow-[0_20px_56px_rgba(0,0,0,0.5)] lg:max-h-[min(52dvh,26rem)] lg:max-w-[min(100%,26rem)]"
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
                <div className="flex size-full items-center justify-center text-5xl font-semibold text-subtle">
                  {(track?.name ?? "S").slice(0, 1)}
                </div>
              )}
              {track && isExplicitTrack(track) ? (
                <span className="absolute bottom-2 left-2">
                  <ExplicitBadge onArt className="size-5 text-[10px]" />
                </span>
              ) : null}
            </div>
          </div>

          {/* Controls — always below cover */}
          <div className="relative z-20 w-full max-w-[22rem] shrink-0 lg:max-w-[min(100%,26rem)]">
            <div className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/50">{formatTime(currentTime)}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
                <input
                  className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  disabled={!track}
                  aria-label="Seek"
                  onChange={(e) => onSeek(Number(e.target.value))}
                />
              </div>
              <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-white/50">{formatTime(duration)}</span>
            </div>

            <div className="mt-3 flex items-start gap-3">
              <div className="min-w-0 flex-1 text-center lg:text-left">
                <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">{track?.name ?? "Nothing playing"}</h2>
                <p className="mt-0.5 truncate text-sm text-white/70">{track?.artist ?? ""}</p>
                {track?.album ? (
                  onOpenAlbum ? (
                    <button type="button" onClick={() => onOpenAlbum(albumKey(track))} className="mt-0.5 truncate text-xs text-white/45 hover:text-white/70">
                      {track.album}
                    </button>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-white/45">{track.album}</p>
                  )
                ) : null}
              </div>
              {track ? (
                <button type="button" aria-label={track.liked ? "Unlike" : "Like"} onClick={() => toggleLike(track.id)} className="mt-0.5 flex size-10 shrink-0 items-center justify-center">
                  <Heart className={cn("size-5", track.liked && "fill-hot text-hot")} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between px-1">
              <button type="button" aria-label="Shuffle" onClick={toggleShuffle} className={cn("flex size-11 items-center justify-center", shuffle ? "text-accent" : "text-white/50")}>
                <Shuffle className="size-5" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Previous" onClick={onPrev} className="flex size-12 items-center justify-center text-fg">
                <SkipBack className="size-7" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={onTogglePlay}
                className="relative z-20 flex size-14 items-center justify-center rounded-full bg-white text-black shadow-lg active:scale-95 sm:size-16"
              >
                {playing ? <Pause className="size-7 sm:size-8" strokeWidth={1.75} /> : <Play className="size-7 translate-x-0.5 sm:size-8" strokeWidth={1.75} />}
              </button>
              <button type="button" aria-label="Next" onClick={onNext} className="flex size-12 items-center justify-center text-fg">
                <SkipForward className="size-7" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Repeat" onClick={cycleRepeat} className={cn("flex size-11 items-center justify-center", repeat !== "off" ? "text-accent" : "text-white/50")}>
                {repeat === "one" ? <Repeat1 className="size-5" strokeWidth={1.75} /> : <Repeat className="size-5" strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>

        {/* Desktop lyrics */}
        {showLyrics ? (
          <div className="relative hidden min-h-0 flex-col lg:flex">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              {lyricsBusy ? (
                <div className="flex gap-1.5 px-1">
                  <span className="size-2 animate-pulse rounded-full bg-white/80" />
                  <span className="size-2 animate-pulse rounded-full bg-white/50 [animation-delay:120ms]" />
                  <span className="size-2 animate-pulse rounded-full bg-white/30 [animation-delay:240ms]" />
                </div>
              ) : (
                <p className="text-[11px] uppercase tracking-widest text-white/40">Synced lyrics</p>
              )}
              <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/60">lrclib</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]">
              {lines.length === 0 ? (
                <p className="text-2xl font-semibold leading-snug text-white/35">
                  {lyricsBusy ? "Looking up lyrics…" : "No lyrics found for this track."}
                </p>
              ) : (
                <div className="space-y-5 py-12">
                  {lines.map((row, i) => {
                    const dist = i - line;
                    return (
                      <p
                        key={`${row.t}-${i}`}
                        ref={i === line ? activeRef : undefined}
                        className={cn(
                          "text-2xl font-semibold leading-snug tracking-tight transition-all duration-300 xl:text-3xl",
                          dist === 0 && "scale-[1.02] text-white",
                          dist === 1 && "text-white/45",
                          dist === -1 && "text-white/35",
                          Math.abs(dist) > 1 && "text-white/20",
                        )}
                      >
                        {row.text}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {showLyrics ? (
        <div className="relative z-10 max-h-[32dvh] shrink-0 overflow-y-auto border-t border-white/10 px-5 py-3 lg:hidden">
          {lines.length === 0 ? (
            <p className="text-base text-white/40">{lyricsBusy ? "Looking up lyrics…" : "No lyrics found."}</p>
          ) : (
            <div className="space-y-3">
              {lines.map((row, i) => (
                <p
                  key={`${row.t}-${i}`}
                  ref={i === line ? activeRef : undefined}
                  className={cn("text-base font-semibold leading-snug", i === line ? "text-white" : "text-white/35")}
                >
                  {row.text}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
