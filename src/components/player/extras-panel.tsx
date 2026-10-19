import { useEffect, useState } from "react";
import { Car, Dices, Mic, Moon, Smartphone, Speaker, Square, Vibrate, Wand2, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player/store";

const SLEEP = [15, 30, 45, 60];
const CROSS = [0, 1, 2, 4, 6, 8, 12];

function remainingLabel(until: number | null) {
  if (!until) return null;
  const ms = until - Date.now();
  if (ms <= 0) return "Ending";
  const m = Math.ceil(ms / 60_000);
  return `${m} min`;
}

export function ExtrasPanel({ onCarMode }: { onCarMode?: () => void }) {
  const crossfade = usePlayer((s) => s.crossfade);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const setCrossfade = usePlayer((s) => s.setCrossfade);
  const setSleep = usePlayer((s) => s.setSleep);
  const stopAfter = usePlayer((s) => s.stopAfter);
  const setStopAfter = usePlayer((s) => s.setStopAfter);
  const surprise = usePlayer((s) => s.surprise);
  const tracks = usePlayer((s) => s.tracks);
  const quiet = usePlayer((s) => s.quiet);
  const toggleQuiet = usePlayer((s) => s.toggleQuiet);
  const normalize = usePlayer((s) => s.normalize);
  const toggleNormalize = usePlayer((s) => s.toggleNormalize);
  const skipSilence = usePlayer((s) => s.skipSilence);
  const toggleSkipSilence = usePlayer((s) => s.toggleSkipSilence);
  const bassLock = usePlayer((s) => s.bassLock);
  const toggleBassLock = usePlayer((s) => s.toggleBassLock);
  const haptic = usePlayer((s) => s.haptic);
  const toggleHaptic = usePlayer((s) => s.toggleHaptic);
  const shakeSkip = usePlayer((s) => s.shakeSkip);
  const toggleShakeSkip = usePlayer((s) => s.toggleShakeSkip);
  const gapless = usePlayer((s) => s.gapless);
  const toggleGapless = usePlayer((s) => s.toggleGapless);
  const mono = usePlayer((s) => s.mono);
  const toggleMono = usePlayer((s) => s.toggleMono);
  const autoEq = usePlayer((s) => s.autoEq);
  const toggleAutoEq = usePlayer((s) => s.toggleAutoEq);
  const isolate = usePlayer((s) => s.isolate);
  const setIsolate = usePlayer((s) => s.setIsolate);
  const flash = usePlayer((s) => s.flash);

  const [left, setLeft] = useState<string | null>(() => remainingLabel(sleepUntil));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(remainingLabel(sleepUntil)), 15_000);
    setLeft(remainingLabel(sleepUntil));
    return () => window.clearInterval(id);
  }, [sleepUntil]);

  const Toggle = ({
    on,
    label,
    icon: Icon,
    onClick,
  }: {
    on: boolean;
    label: string;
    icon: typeof Waves;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
        on ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-fg">Playback</h2>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Toggle on={gapless} label="Gapless" icon={Waves} onClick={toggleGapless} />
        <Toggle on={normalize} label="Normalize" icon={Speaker} onClick={toggleNormalize} />
        <Toggle on={skipSilence} label="Skip silence" icon={Wand2} onClick={toggleSkipSilence} />
        <Toggle on={bassLock} label="Bass lock" icon={Waves} onClick={toggleBassLock} />
        <Toggle on={quiet} label="Quiet" icon={Moon} onClick={toggleQuiet} />
        <Toggle on={mono} label="Mono" icon={Smartphone} onClick={toggleMono} />
        <Toggle on={autoEq} label="Auto EQ" icon={Wand2} onClick={toggleAutoEq} />
        <Toggle on={haptic} label="Haptic" icon={Vibrate} onClick={toggleHaptic} />
        <Toggle on={shakeSkip} label="Shake skip" icon={Smartphone} onClick={toggleShakeSkip} />
        {onCarMode ? (
          <button
            type="button"
            onClick={onCarMode}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
          >
            <Car className="size-3.5" strokeWidth={1.75} />
            Car mode
          </button>
        ) : null}
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={surprise}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-fg hover:bg-accent hover:text-accent-fg disabled:opacity-40"
        >
          <Dices className="size-4" strokeWidth={1.75} />
          Surprise
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-subtle">
          <Moon className="size-3.5" strokeWidth={1.75} />
          Sleep
          {left ? <span className="font-mono text-accent">· {left}</span> : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSleep(null)}
            className={cn(
              "h-9 rounded-full px-3 text-sm",
              sleepUntil == null ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
            )}
          >
            Off
          </button>
          {SLEEP.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSleep(m)}
              className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-subtle">
          <Square className="size-3.5" strokeWidth={1.75} />
          Stop after
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(["off", "track", "album"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setStopAfter(mode)}
              className={cn(
                "h-9 rounded-full px-3 text-sm",
                stopAfter === mode ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
              )}
            >
              {mode === "off" ? "Off" : mode === "track" ? "This song" : "This album"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Crossfade</p>
        <div className="flex flex-wrap gap-1.5">
          {CROSS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCrossfade(s)}
              className={cn(
                "h-9 rounded-full px-3 text-sm",
                crossfade === s ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
              )}
            >
              {s === 0 ? "Off" : `${s}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            const next = isolate === "vocals" ? "mix" : "vocals";
            setIsolate(next);
            flash(next === "vocals" ? "Karaoke · vocals up" : "Karaoke off");
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            isolate === "vocals" ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          <Mic className="size-3.5" strokeWidth={1.75} />
          Karaoke
        </button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Bass lock and EQ stay on when you leave the app. Gapless starts the next track before this one ends.
      </p>
    </section>
  );
}
