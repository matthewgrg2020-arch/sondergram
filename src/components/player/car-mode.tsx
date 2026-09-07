import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { formatRemain, formatTime } from "@/lib/player/time";
import { useAudioClock } from "@/lib/player/clock";
import { usePlayer } from "@/lib/player/store";

type Props = {
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
};

export function CarMode({ onClose, onTogglePlay, onPrev, onNext, onSeek }: Props) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const { current, duration } = useAudioClock();
  const track = index >= 0 ? tracks[index] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-fg">
      <button
        type="button"
        onClick={onClose}
        className="mb-3 flex size-12 items-center justify-center self-end rounded-full bg-raised"
        aria-label="Close car mode"
      >
        <X className="size-6" strokeWidth={1.75} />
      </button>
      <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-raised shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {track?.coverUrl ? (
          <img src={track.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-7xl font-semibold text-subtle">
            {(track?.name ?? "S").slice(0, 1)}
          </div>
        )}
      </div>
      <h2 className="mt-6 truncate text-center text-3xl font-bold">{track?.name ?? "Nothing playing"}</h2>
      <p className="truncate text-center text-lg text-muted">{track?.artist ?? ""}</p>
      <div className="mt-6 flex items-center gap-3">
        <span className="w-12 text-right font-mono text-sm tabular-nums text-subtle">{formatTime(current)}</span>
        <input
          className="h-seek h-seek-touch w-full"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          disabled={!track}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <span className="w-12 font-mono text-sm tabular-nums text-subtle">{formatRemain(current, duration)}</span>
      </div>
      <div className="mt-8 flex items-center justify-center gap-8">
        <button type="button" aria-label="Previous" onClick={onPrev} className="flex size-16 items-center justify-center rounded-full bg-raised">
          <SkipBack className="size-9" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onTogglePlay}
          disabled={!track}
          className="flex size-24 items-center justify-center rounded-full bg-play text-play-fg disabled:opacity-40"
        >
          {playing ? <Pause className="size-12" strokeWidth={2} /> : <Play className="ml-1 size-12" strokeWidth={2} />}
        </button>
        <button type="button" aria-label="Next" onClick={onNext} className="flex size-16 items-center justify-center rounded-full bg-raised">
          <SkipForward className="size-9" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}