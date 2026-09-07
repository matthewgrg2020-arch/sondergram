import { EQ_BANDS, EQ_MAX, EQ_MIN, EQ_PRESETS } from "@/lib/player/constants";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { usePlayer } from "@/lib/player/store";

function formatDb(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

export function EqPanel() {
  const eq = usePlayer((s) => s.eq);
  const preamp = usePlayer((s) => s.preamp);
  const presetId = usePlayer((s) => s.presetId);
  const customPresets = usePlayer((s) => s.customPresets);
  const setEqBand = usePlayer((s) => s.setEqBand);
  const setPreamp = usePlayer((s) => s.setPreamp);
  const applyPreset = usePlayer((s) => s.applyPreset);
  const saveCustomPreset = usePlayer((s) => s.saveCustomPreset);
  const deleteCustomPreset = usePlayer((s) => s.deleteCustomPreset);
  const [name, setName] = useState("");

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg tracking-tight text-fg">Equalizer</h2>
        <span className="text-xs uppercase tracking-widest text-subtle">31 band · saved</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {EQ_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id, preset.gains, preset.preamp)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              presetId === preset.id
                ? "bg-accent text-accent-fg"
                : "bg-raised text-muted hover:text-fg",
            )}
          >
            {preset.label}
          </button>
        ))}
        {customPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id, preset.gains, preset.preamp)}
            onContextMenu={(e) => {
              e.preventDefault();
              deleteCustomPreset(preset.id);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              presetId === preset.id
                ? "bg-accent text-accent-fg"
                : "bg-raised text-muted hover:text-fg",
            )}
          >
            {preset.label}
          </button>
        ))}
        {presetId === "custom" ? (
          <span className="rounded-full bg-raised px-3 py-1.5 text-xs font-medium text-fg">Custom</span>
        ) : null}
      </div>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveCustomPreset(name);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this curve"
          className="h-9 min-w-0 flex-1 rounded-full bg-raised px-3 text-sm outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          className="h-9 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg"
        >
          Save preset
        </button>
      </form>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <label className="flex shrink-0 flex-col items-center gap-1.5 border-r border-border pr-3">
          <span className="font-mono text-[10px] tabular-nums text-muted">{formatDb(preamp)}</span>
          <input
            className="eq-fader eq-fader-pre"
            type="range"
            min={EQ_MIN}
            max={EQ_MAX}
            step={0.5}
            value={preamp}
            aria-label="Preamp"
            onChange={(e) => setPreamp(Number(e.target.value))}
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-fg">Pre</span>
        </label>

        <div className="flex min-w-0 flex-1 items-end justify-between gap-px">
          {EQ_BANDS.map((band, i) => (
            <label key={band.freq} className="flex min-w-2.5 flex-1 flex-col items-center gap-1">
              <input
                className="eq-fader"
                type="range"
                min={EQ_MIN}
                max={EQ_MAX}
                step={0.5}
                value={eq[i] ?? 0}
                aria-label={`${band.label} hertz`}
                title={`${band.label}  ${formatDb(eq[i] ?? 0)} dB`}
                onChange={(e) => setEqBand(i, Number(e.target.value))}
              />
              <span className="h-8 w-full text-center text-[8px] leading-none text-subtle [writing-mode:vertical-rl] rotate-180">
                {band.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}