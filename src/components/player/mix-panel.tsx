import type { ReactNode } from "react";
import { Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayer, type IsolateMode, type SpatialPreset } from "@/lib/player/store";

const ISOLATE: { id: IsolateMode; label: string }[] = [
  { id: "mix", label: "Mix" },
  { id: "vocals", label: "Vocals" },
  { id: "instruments", label: "Inst." },
  { id: "drums", label: "Drums" },
  { id: "bass", label: "Bass" },
];

const SPATIAL: { id: SpatialPreset; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "room", label: "Room" },
  { id: "cinema", label: "Cinema" },
  { id: "overhead", label: "Height" },
];

const SPEEDS = [0.5, 1, 1.5, 2];
const PITCHES = [-6, 0, 6];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 min-w-10 rounded-full px-3 text-xs sm:text-sm",
        active ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function TempoPitch() {
  const rate = usePlayer((s) => s.rate);
  const pitch = usePlayer((s) => s.pitch);
  const setRate = usePlayer((s) => s.setRate);
  const setPitch = usePlayer((s) => s.setPitch);
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Tempo & pitch</h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {rate.toFixed(2)}×
          {pitch !== 0 ? `  ${pitch > 0 ? "+" : ""}${pitch.toFixed(1)} st` : ""}
        </span>
      </div>
      <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Speed</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SPEEDS.map((value) => (
          <Chip key={value} active={rate === value} onClick={() => setRate(value)}>
            {value}×
          </Chip>
        ))}
      </div>
      <input
        className="h-seek mb-4 w-full"
        type="range"
        min={0.5}
        max={2}
        step={0.05}
        value={rate}
        aria-label="Playback speed"
        onChange={(e) => setRate(Number(e.target.value))}
      />
      <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Pitch</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PITCHES.map((value) => (
          <Chip key={value} active={pitch === value} onClick={() => setPitch(value)}>
            {value > 0 ? `+${value}` : String(value)}
          </Chip>
        ))}
      </div>
      <input
        className="h-seek w-full"
        type="range"
        min={-6}
        max={6}
        step={0.5}
        value={pitch}
        aria-label="Pitch"
        onChange={(e) => setPitch(Number(e.target.value))}
      />
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Speed stays key-locked at 0. Off zero, pitch and speed move together like a deck.
      </p>
    </section>
  );
}

export function ListenCard() {
  const isolate = usePlayer((s) => s.isolate);
  const setIsolate = usePlayer((s) => s.setIsolate);
  const radio = usePlayer((s) => s.radio);
  const toggleRadio = usePlayer((s) => s.toggleRadio);
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-subtle">Listen</h2>
      <div className="flex items-end justify-between gap-2">
        {ISOLATE.map((mode) => (
          <label key={mode.id} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-subtle">{mode.label}</span>
            <input
              className="eq-fader iso"
              type="range"
              min={0}
              max={1}
              step={1}
              value={isolate === mode.id ? 1 : 0}
              aria-label={mode.label}
              onChange={() => setIsolate(mode.id)}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        Vocals and instruments use stereo center/side. Drums and bass are EQ isolates — not AI stems.
      </p>
      <button
        type="button"
        onClick={toggleRadio}
        className={cn(
          "mt-3 flex h-10 w-full items-center justify-between rounded-full px-3 text-sm",
          radio ? "bg-raised text-accent" : "bg-raised text-muted",
        )}
      >
        Radio
        <span className={cn("size-4 rounded-full", radio ? "bg-accent" : "bg-subtle")} />
      </button>
    </section>
  );
}

export function SpatialCard() {
  const spatial = usePlayer((s) => s.spatial);
  const spatialAmount = usePlayer((s) => s.spatialAmount);
  const setSpatial = usePlayer((s) => s.setSpatial);
  const setSpatialAmount = usePlayer((s) => s.setSpatialAmount);
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-subtle">Spatial</h2>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-full bg-raised p-1">
        {SPATIAL.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setSpatial(mode.id)}
            className={cn(
              "h-8 rounded-full text-xs",
              spatial === mode.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className="spatial-orb relative mx-auto mb-3 flex h-28 w-full max-w-[14rem] items-end justify-center overflow-hidden rounded-full">
        <Headphones className="mb-6 size-10 text-fg/80" strokeWidth={1.25} />
      </div>
      {spatial !== "off" ? (
        <label className="block">
          <span className="mb-2 flex justify-between text-xs uppercase tracking-widest text-subtle">
            Field
            <span className="font-mono tabular-nums">{Math.round(spatialAmount * 100)}</span>
          </span>
          <input
            className="h-seek w-full"
            type="range"
            min={0.2}
            max={1}
            step={0.01}
            value={spatialAmount}
            aria-label="Spatial amount"
            onChange={(e) => setSpatialAmount(Number(e.target.value))}
          />
        </label>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Cinema and Height are a binaural upmix for headphones — not licensed Dolby Atmos.
      </p>
    </section>
  );
}

export function MixPanel() {
  return (
    <div className="grid gap-4">
      <TempoPitch />
      <ListenCard />
      <SpatialCard />
    </div>
  );
}
