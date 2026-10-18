import { useEffect, useState } from "react";
import { Car, Dices, Moon, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player/store";

const SLEEP = [15, 30, 45, 60];

function remainingLabel(until: number | null) {
  if (!until) return null;
  const ms = until - Date.now();
  if (ms <= 0) return "Ending";
  const m = Math.ceil(ms / 60_000);
  return `${m} min`;
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {desc ? <p className="mt-0.5 text-[13px] leading-snug text-subtle">{desc}</p> : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "relative h-[28px] w-[48px] rounded-full transition-colors",
        on ? "bg-accent" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-6 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

function Segment({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-raised p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-8 rounded-full px-3.5 text-sm font-medium transition-colors",
            value === opt.id ? "bg-fg text-bg" : "text-muted hover:text-fg",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ExtrasPanel({ onCarMode }: { onCarMode?: () => void }) {
  const crossfade = usePlayer((s) => s.crossfade);
  const sleepUntil = usePlayer((s) => s.sleepUntil ?? null);
  const setCrossfade = usePlayer((s) => s.setCrossfade);
  const setSleep = usePlayer((s) => s.setSleep);
  const stopAfter = usePlayer((s) => s.stopAfter);
  const setStopAfter = usePlayer((s) => s.setStopAfter);
  const surprise = usePlayer((s) => s.surprise);
  const tracks = usePlayer((s) => s.tracks);
  const normalize = usePlayer((s) => s.normalize);
  const toggleNormalize = usePlayer((s) => s.toggleNormalize);
  const skipSilence = usePlayer((s) => s.skipSilence);
  const toggleSkipSilence = usePlayer((s) => s.toggleSkipSilence);
  const gapless = usePlayer((s) => s.gapless);
  const toggleGapless = usePlayer((s) => s.toggleGapless);
  const mono = usePlayer((s) => s.mono);
  const toggleMono = usePlayer((s) => s.toggleMono);
  const listenMs = usePlayer((s) => s.listenMs);

  const bookmarks = usePlayer((s) => s.bookmarks);
  const toggleBookmarks = usePlayer((s) => s.toggleBookmarks);
  const bookmarkPrompt = usePlayer((s) => s.bookmarkPrompt);
  const toggleBookmarkPrompt = usePlayer((s) => s.toggleBookmarkPrompt);
  const skipLowRated = usePlayer((s) => s.skipLowRated);
  const toggleSkipLowRated = usePlayer((s) => s.toggleSkipLowRated);
  const skipSeconds = usePlayer((s) => s.skipSeconds);
  const setSkipSeconds = usePlayer((s) => s.setSkipSeconds);
  const playRecordPercent = usePlayer((s) => s.playRecordPercent);
  const setPlayRecordPercent = usePlayer((s) => s.setPlayRecordPercent);
  const restrictData = usePlayer((s) => s.restrictData);
  const toggleRestrictData = usePlayer((s) => s.toggleRestrictData);
  const autoFullScreen = usePlayer((s) => s.autoFullScreen);
  const toggleAutoFullScreen = usePlayer((s) => s.toggleAutoFullScreen);

  const [, setTick] = useState(0);
  const left = remainingLabel(sleepUntil);
  const todayMin = Math.floor((listenMs || 0) / 60_000);

  useEffect(() => {
    if (!sleepUntil) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [sleepUntil]);

  const transition = gapless && crossfade === 0 ? "gapless" : "crossfade";

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Playback</h2>
          <p className="mt-0.5 text-xs text-subtle">{todayMin} min today</p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={surprise}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-fg hover:bg-accent hover:text-accent-fg disabled:opacity-40"
          >
            <Dices className="size-3.5" strokeWidth={1.75} />
            Surprise
          </button>
          {onCarMode ? (
            <button
              type="button"
              onClick={onCarMode}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg"
            >
              <Car className="size-3.5" strokeWidth={1.75} />
              Car
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4 sm:px-5">
        <div className="border-b border-white/5 py-4">
          <p className="text-[15px] font-medium text-fg">Track Transition</p>
          <p className="mt-0.5 text-[13px] text-subtle">Choose how to transition to the next track</p>
          <div className="mt-3">
            <Segment
              options={[
                { id: "gapless", label: "Gapless" },
                { id: "crossfade", label: "Crossfade" },
              ]}
              value={transition}
              onChange={(id) => {
                if (id === "gapless") {
                  if (!gapless) toggleGapless();
                  setCrossfade(0);
                } else {
                  if (gapless) toggleGapless();
                  if (crossfade === 0) setCrossfade(4);
                }
              }}
            />
          </div>
          {transition === "crossfade" ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[12px] text-subtle">
                <span>Crossfade</span>
                <span>{crossfade}s</span>
              </div>
              <input
                className="h-seek w-full"
                type="range"
                min={1}
                max={12}
                step={1}
                value={Math.max(1, crossfade)}
                aria-label="Crossfade seconds"
                onChange={(e) => setCrossfade(Number(e.target.value))}
              />
            </div>
          ) : null}
        </div>

        <Row title="Trim Silence" desc="Trim silence at the beginning and end of tracks">
          <Toggle on={skipSilence} onClick={toggleSkipSilence} />
        </Row>
        <Row
          title="Replay Gain"
          desc="Normalize the volume of each track so the apparent volume remains the same across your entire library"
        >
          <Toggle on={normalize} onClick={toggleNormalize} />
        </Row>
        <Row title="Mono" desc="Combine stereo channels into a single output channel">
          <Toggle on={mono} onClick={toggleMono} />
        </Row>
        <Row
          title="Bookmarks"
          desc="Save the position of tracks when paused and ask to resume when they are played again"
        >
          <Toggle on={bookmarks} onClick={toggleBookmarks} />
        </Row>
        <Row
          title="Bookmarks: Prompt to Resume"
          desc="When playing a bookmarked track, ask whether to resume or start from the beginning"
        >
          <Toggle on={bookmarkPrompt} onClick={toggleBookmarkPrompt} />
        </Row>
        <Row title="Skip Low Rated Tracks" desc="Automatically skip low rated tracks in the play queue">
          <Toggle on={skipLowRated} onClick={toggleSkipLowRated} />
        </Row>

        <div className="border-b border-white/5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium text-fg">Skip Forward/Backward Time</p>
              <p className="mt-0.5 text-[13px] text-subtle">
                Set the amount of time when skipping forward or backward
              </p>
            </div>
            <span className="shrink-0 text-[15px] font-medium text-fg">{skipSeconds}s</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[12px] text-subtle">10s</span>
            <input
              className="h-seek w-full"
              type="range"
              min={10}
              max={90}
              step={5}
              value={skipSeconds}
              aria-label="Skip seconds"
              onChange={(e) => setSkipSeconds(Number(e.target.value))}
            />
            <span className="text-[12px] text-subtle">90s</span>
          </div>
        </div>

        <div className="border-b border-white/5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium text-fg">Play Record Percent</p>
              <p className="mt-0.5 text-[13px] text-subtle">
                Choose at what percentage of a track a play is recorded
              </p>
            </div>
            <span className="shrink-0 text-[15px] font-medium text-fg">{playRecordPercent}%</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[12px] text-subtle">25%</span>
            <input
              className="h-seek w-full"
              type="range"
              min={25}
              max={100}
              step={5}
              value={playRecordPercent}
              aria-label="Play record percent"
              onChange={(e) => setPlayRecordPercent(Number(e.target.value))}
            />
            <span className="text-[12px] text-subtle">100%</span>
          </div>
        </div>

        <Row
          title="Restrict Data Usage"
          desc="With this setting on, the app will only access the internet when on Wifi and never when on cellular"
        >
          <Toggle on={restrictData} onClick={toggleRestrictData} />
        </Row>
        <Row
          title="Auto Navigate to Full Screen"
          desc="When initially adding a song to the queue and playing, automatically navigate to the full screen player"
        >
          <Toggle on={autoFullScreen} onClick={toggleAutoFullScreen} />
        </Row>

        <div className="py-4">
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

        <div className="pb-4">
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
      </div>
    </section>
  );
}
