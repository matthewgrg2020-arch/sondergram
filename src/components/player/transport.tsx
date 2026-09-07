import type { ReactNode } from "react";
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Radio,
  Heart,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";

type Props = {
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
};

export function Transport({ onTogglePlay, onPrev, onNext, onSeek }: Props) {
  const playing = usePlayer((s) => s.playing);
  const { current: currentTime, duration } = useAudioClock();
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const radio = usePlayer((s) => s.radio);
  const toggleRadio = usePlayer((s) => s.toggleRadio);
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const liked = index >= 0 ? tracks[index]?.liked : false;

  return (
    <div className="space-y-4">
      <div>
        <input
          className="h-seek w-full"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          disabled={!hasTrack}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-subtle">
          <span>{formatTime(currentTime)}</span>
          <span>{formatRemain(currentTime, duration)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton
            label="Radio"
            pressed={radio}
            onClick={toggleRadio}
          >
            <Radio className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="Shuffle"
            pressed={shuffle}
            onClick={toggleShuffle}
          >
            <Shuffle className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label={repeat === "one" ? "Repeat one" : "Repeat"}
            pressed={repeat !== "off"}
            onClick={cycleRepeat}
          >
            {repeat === "one" ? (
              <Repeat1 className="size-4" strokeWidth={1.75} />
            ) : (
              <Repeat className="size-4" strokeWidth={1.75} />
            )}
          </IconButton>
        </div>

        <div className="flex items-center justify-center gap-2">
          <IconButton label="Previous" onClick={onPrev}>
            <SkipBack className="size-5" strokeWidth={1.75} />
          </IconButton>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={onTogglePlay}
            className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_0_24px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] transition-transform duration-150 hover:brightness-110 active:scale-[0.98]"
          >
            {playing ? (
              <Pause className="size-6" strokeWidth={1.75} />
            ) : (
              <Play className="ml-0.5 size-6" strokeWidth={1.75} />
            )}
          </button>
          <IconButton label="Next" onClick={onNext}>
            <SkipForward className="size-5" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label={liked ? "Unlike" : "Like"}
            pressed={liked}
            onClick={() => {
              const id = index >= 0 ? tracks[index]?.id : null;
              if (id) toggleLike(id);
            }}
          >
            <Heart className="size-4" strokeWidth={1.75} fill={liked ? "currentColor" : "none"} />
          </IconButton>
        </div>

        <div className="flex items-center justify-between gap-1 sm:w-36 sm:justify-end">
          <div className="flex sm:hidden">
            <IconButton label="Radio" pressed={radio} onClick={toggleRadio}>
              <Radio className="size-4" strokeWidth={1.75} />
            </IconButton>
            <IconButton
              label="Shuffle"
              pressed={shuffle}
              onClick={toggleShuffle}
            >
              <Shuffle className="size-4" strokeWidth={1.75} />
            </IconButton>
            <IconButton
              label={repeat === "one" ? "Repeat one" : "Repeat"}
              pressed={repeat !== "off"}
              onClick={cycleRepeat}
            >
              {repeat === "one" ? (
                <Repeat1 className="size-4" strokeWidth={1.75} />
              ) : (
                <Repeat className="size-4" strokeWidth={1.75} />
              )}
            </IconButton>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
            <IconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
              {muted || volume === 0 ? (
                <VolumeX className="size-4" strokeWidth={1.75} />
              ) : (
                <Volume2 className="size-4" strokeWidth={1.75} />
              )}
            </IconButton>
            <input
              className="h-seek w-full min-w-0 sm:w-24"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex size-11 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-raised hover:text-fg",
        pressed && "text-accent",
      )}
    >
      {children}
    </button>
  );
}
