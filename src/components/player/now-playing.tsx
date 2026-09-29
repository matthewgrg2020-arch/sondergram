import {
  AudioLines,
  ChevronDown,
  Heart,
  Moon,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getEngine } from "@/lib/player/engine";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";
import { albumKey } from "@/lib/player/catalog";
import { isExplicitTrack } from "@/lib/player/explicit";
import { proxyCoverUrl } from "@/lib/player/covers";
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
  const [pulse, setPulse] = useState(1);

  useEffect(() => {
    if (!playing) return;
    const wave = new Uint8Array(64);
    const id = window.setInterval(() => {
      getEngine().analyser.getByteFrequencyData(wave);
      let bass = 0;
      for (let i = 0; i < 6; i++) bass += wave[i];
      setPulse(1 + Math.min(0.03, bass / 6 / 3200));
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  const onCoverPointerUp = (e: PointerEvent) => {
    if (swipeX.current == null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (dx > 60) onPrev();
    else if (dx < -60) onNext();
  };

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
          <div className="flex min-h-0 flex-[1.85] items-center justify-center overflow-hidden px-2 pt-0 pb-0 sm:px-4 sm:py-2 lg:flex-1 lg:px-0 [container-type:size]">
            <div
              className="relative aspect-square w-[min(96vw,calc(100dvh-12.75rem))] max-h-[min(96vw,calc(100dvh-12.75rem))] overflow-hidden rounded-2xl bg-raised shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:w-[min(100cqw,100cqh)] sm:max-h-full lg:size-[min(100cqw,100cqh)] lg:w-auto lg:max-h-full"
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

          <div className="relative z-10 shrink-0 bg-bg px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 truncate text-[1.35rem] font-bold leading-tight tracking-tight sm:text-2xl">
                  <span className="min-w-0 truncate">{track?.name ?? "Nothing playing"}</span>
                  {track && isExplicitTrack(track) ? <ExplicitBadge className="size-[18px] text-[11px]" /> : null}
                </h2>
                <p className="mt-0.5 truncate text-base text-muted">{track?.artist ?? ""}</p>
              </div>
              {track ? (
                <button type="button" aria-label={track.liked ? "Unlike" : "Like"} onClick={() => toggleLike(track.id)} className="mt-1 flex size-11 shrink-0 items-center justify-center">
                  <Heart className={cn("size-6", track.liked && "fill-hot text-hot")} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>

            <div className="mt-2 flex items-center gap-3">
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

            <div className="mt-3 flex items-center justify-between px-1">
              <button type="button" aria-label="Shuffle" onClick={toggleShuffle} className={cn("flex size-11 items-center justify-center", shuffle ? "text-accent" : "text-muted")}>
                <Shuffle className="size-5" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Previous" onClick={onPrev} className="flex size-12 items-center justify-center text-fg">
                <SkipBack className="size-7" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={onTogglePlay} className="flex size-16 items-center justify-center rounded-full bg-fg text-bg shadow-lg">
                {playing ? <Pause className="size-8" strokeWidth={1.75} /> : <Play className="size-8 translate-x-0.5" strokeWidth={1.75} />}
              </button>
              <button type="button" aria-label="Next" onClick={onNext} className="flex size-12 items-center justify-center text-fg">
                <SkipForward className="size-7" strokeWidth={1.75} />
              </button>
              <button type="button" aria-label="Repeat" onClick={cycleRepeat} className={cn("flex size-11 items-center justify-center", repeat !== "off" ? "text-accent" : "text-muted")}>
                {repeat === "one" ? <Repeat1 className="size-5" strokeWidth={1.75} /> : <Repeat className="size-5" strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
