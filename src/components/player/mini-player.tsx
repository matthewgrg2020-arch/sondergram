import {
  Clock3,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";
import { Visualizer } from "./visualizer";

type Props = {
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onExpand: () => void;
  onLyrics: () => void;
};

export function MiniPlayer({ onTogglePlay, onPrev, onNext, onSeek, onExpand, onLyrics }: Props) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const { current: currentTime, duration } = useAudioClock();
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const setSleep = usePlayer((s) => s.setSleep);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const upNext = usePlayer((s) => s.upNext);
  const track = index >= 0 ? tracks[index] : undefined;

  return (
    <footer className="mini-bar mx-2 mb-2 overflow-hidden rounded-2xl px-2 py-1.5 sm:mx-3 sm:mb-3 sm:px-4 sm:py-2">
      <div className="mb-1 hidden h-6 sm:block">
        <Visualizer active={playing} className="h-6" />
      </div>
      <input
        className="h-seek h-seek-touch mb-1.5 w-full sm:hidden"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        disabled={!track}
        aria-label="Seek"
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <button type="button" onClick={onExpand} className="flex min-w-0 items-center gap-3 text-left">
          <div className="size-11 shrink-0 overflow-hidden rounded-md bg-raised sm:size-11">
            {track?.coverUrl ? (
              <img src={track.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm font-semibold text-subtle">
                {(track?.name ?? "S").slice(0, 1)}
              </div>
            )}
          </div>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{track?.name ?? "Select a song"}</span>
            <span className="block truncate text-xs text-muted">{track?.artist ?? ""}</span>
          </span>
        </button>

        <div className="flex items-center justify-end gap-0.5 sm:hidden">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!track}
            onClick={onTogglePlay}
            className="flex size-11 items-center justify-center rounded-full bg-play text-play-fg disabled:opacity-40"
          >
            {playing ? <Pause className="size-5" strokeWidth={2} /> : <Play className="ml-0.5 size-5" strokeWidth={2} />}
          </button>
          <IconBtn label="Next" onClick={onNext} disabled={!track}>
            <SkipForward className="size-5" strokeWidth={1.75} />
          </IconBtn>
        </div>

        <div className="hidden flex-col items-center gap-1 sm:flex">
          <div className="flex w-full max-w-md items-center gap-2">
            <span className="w-10 text-right font-mono text-xs tabular-nums text-subtle">
              {formatTime(currentTime)}
            </span>
            <input
              className="h-seek w-full"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={!track}
              aria-label="Seek"
              onChange={(e) => onSeek(Number(e.target.value))}
            />
            <span className="w-11 font-mono text-xs tabular-nums text-subtle">{formatRemain(currentTime, duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <IconBtn label="Shuffle" pressed={shuffle} onClick={toggleShuffle}>
              <Shuffle className="size-4" strokeWidth={1.75} />
            </IconBtn>
            <IconBtn label="Previous" onClick={onPrev} disabled={!track}>
              <SkipBack className="size-4" strokeWidth={1.75} />
            </IconBtn>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              disabled={!track}
              onClick={onTogglePlay}
              className="flex size-9 items-center justify-center rounded-full bg-play text-play-fg disabled:opacity-40"
            >
              {playing ? (
                <Pause className="size-4" strokeWidth={2} />
              ) : (
                <Play className="ml-0.5 size-4" strokeWidth={2} />
              )}
            </button>
            <IconBtn label="Next" onClick={onNext} disabled={!track}>
              <SkipForward className="size-4" strokeWidth={1.75} />
            </IconBtn>
            <IconBtn label="Repeat" pressed={repeat !== "off"} onClick={cycleRepeat}>
              {repeat === "one" ? (
                <Repeat1 className="size-4" strokeWidth={1.75} />
              ) : (
                <Repeat className="size-4" strokeWidth={1.75} />
              )}
            </IconBtn>
          </div>
        </div>

        <div className="hidden items-center justify-end gap-1 sm:flex">
          <IconBtn label="Playing next" onClick={onExpand}>
            <span className="relative">
              <ListMusic className="size-4" strokeWidth={1.75} />
              {upNext.length > 0 ? (
                <span className="absolute -right-1.5 -top-1 rounded-full bg-accent px-1 text-[9px] leading-4 text-accent-fg">
                  {upNext.length}
                </span>
              ) : null}
            </span>
          </IconBtn>
          <IconBtn label="Lyrics" onClick={onLyrics}>
            <Mic2 className="size-4" strokeWidth={1.75} />
          </IconBtn>
          <Volume2 className="size-4 text-muted" strokeWidth={1.75} />
          <input
            className="h-seek w-20"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <IconBtn
            label="Sleep timer"
            pressed={Boolean(sleepUntil)}
            onClick={() => setSleep(sleepUntil ? null : 30)}
          >
            <Clock3 className="size-4" strokeWidth={1.75} />
          </IconBtn>
        </div>
      </div>
    </footer>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-full text-muted hover:text-fg disabled:opacity-40",
        pressed && "text-fg",
      )}
    >
      {children}
    </button>
  );
}