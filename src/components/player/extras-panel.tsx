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

function formatLoop(t: number | null) {
  if (t == null) return "—";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ExtrasPanel({ onCarMode }: { onCarMode?: () => void }) {
  const crossfade = usePlayer((s) => s.crossfade);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const setCrossfade = usePlayer((s) => s.setCrossfade);
  const setSleep = usePlayer((s) => s.setSleep);
  const stopAfter = usePlayer((s) => s.stopAfter);
  const setStopAfter = usePlayer((s) => s.setStopAfter);
  const cleanTitles = usePlayer((s) => s.cleanTitles);
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
  const saveQueuePlaylist = usePlayer((s) => s.saveQueuePlaylist);
  const playlists = usePlayer((s) => s.playlists);
  const playPlaylist = usePlayer((s) => s.playPlaylist);
  const deletePlaylist = usePlayer((s) => s.deletePlaylist);
  const isolate = usePlayer((s) => s.isolate);
  const setIsolate = usePlayer((s) => s.setIsolate);
  const flash = usePlayer((s) => s.flash);
  const loopA = usePlayer((s) => s.loopA);
  const loopB = usePlayer((s) => s.loopB);
  const markLoop = usePlayer((s) => s.markLoop);
  const clearLoop = usePlayer((s) => s.clearLoop);
  const listenMs = usePlayer((s) => s.listenMs);
  const [, setTick] = useState(0);
  const left = remainingLabel(sleepUntil);
  const todayMin = Math.floor(listenMs / 60_000);

  useEffect(() => {
    if (!sleepUntil) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [sleepUntil]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Playback</h2>
          <p className="mt-1 text-xs text-subtle">{todayMin} min today</p>
        </div>
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
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => cleanTitles()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-fg hover:bg-accent hover:text-accent-fg disabled:opacity-40"
        >
          <Wand2 className="size-4" strokeWidth={1.75} />
          Clean filename titles
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Crossfade · {crossfade}s</p>
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
        <input
          className="h-seek mt-3 w-full"
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfade}
          aria-label="Crossfade seconds"
          onChange={(e) => setCrossfade(Number(e.target.value))}
        />
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Loop</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => markLoop("a")}
            className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
          >
            A {formatLoop(loopA)}
          </button>
          <button
            type="button"
            onClick={() => markLoop("b")}
            className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
          >
            B {formatLoop(loopB)}
          </button>
          <button
            type="button"
            onClick={clearLoop}
            className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={toggleBassLock}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            bassLock ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          <Waves className="size-3.5" strokeWidth={1.75} />
          Bass lock
        </button>
        <button
          type="button"
          onClick={toggleHaptic}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            haptic ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          <Vibrate className="size-3.5" strokeWidth={1.75} />
          Haptic beat
        </button>
        <button
          type="button"
          onClick={toggleShakeSkip}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            shakeSkip ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          <Smartphone className="size-3.5" strokeWidth={1.75} />
          Shake skip
        </button>
        {playlists.length > 0 ? (
          <div className="mt-4 w-full">
            <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Saved queues</p>
            <div className="flex flex-wrap gap-1.5">
              {playlists.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => playPlaylist(row.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    deletePlaylist(row.id);
                  }}
                  className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
                >
                  {row.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCarMode}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
        >
          <Car className="size-3.5" strokeWidth={1.75} />
          Car mode
        </button>
        <button
          type="button"
          onClick={toggleAutoEq}
          className={cn(
            "h-9 rounded-full px-3 text-sm",
            autoEq ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          Auto EQ
        </button>
        <button
          type="button"
          onClick={() => saveQueuePlaylist()}
          className="h-9 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
        >
          Save queue
        </button>
        <button
          type="button"
          onClick={toggleQuiet}
          className={cn(
            "h-9 rounded-full px-3 text-sm",
            quiet ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          Quiet night
        </button>
        <button
          type="button"
          onClick={toggleNormalize}
          className={cn(
            "h-9 rounded-full px-3 text-sm",
            normalize ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          ReplayGain
        </button>
        <button
          type="button"
          onClick={toggleSkipSilence}
          className={cn(
            "h-9 rounded-full px-3 text-sm",
            skipSilence ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          Skip silence
        </button>
        <button
          type="button"
          onClick={toggleGapless}
          className={cn(
            "h-9 rounded-full px-3 text-sm",
            gapless ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          Gapless
        </button>
        <p className="col-span-full text-[11px] text-subtle">
          Gapless starts the next local file a moment before the current one ends.
        </p>
        <button
          type="button"
          onClick={toggleMono}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            mono ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          <Speaker className="size-3.5" strokeWidth={1.75} />
          Mono
        </button>
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