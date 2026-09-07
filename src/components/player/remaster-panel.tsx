import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayer, type RemasterPreset } from "@/lib/player/store";

const PRESETS: { id: RemasterPreset; label: string; blurb: string }[] = [
  { id: "off", label: "Off", blurb: "Dry mix" },
  { id: "clean", label: "Clean", blurb: "Clearer mids and air" },
  { id: "full", label: "Full", blurb: "Body and warmth" },
  { id: "vinyl", label: "Vinyl", blurb: "Soft grit and air" },
  { id: "loud", label: "Loud", blurb: "Punchier, denser" },
];

export function RemasterPanel() {
  const remaster = usePlayer((s) => s.remaster);
  const amount = usePlayer((s) => s.remasterAmt);
  const setRemaster = usePlayer((s) => s.setRemaster);
  const setRemasterAmt = usePlayer((s) => s.setRemasterAmt);

  return (
    <section className="panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-hot" strokeWidth={1.75} />
        <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Remaster</h2>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        Makes library tracks sound clearer and fuller — presence, air, gentle compression, and a limiter. Applies
        to files in your library, not YouTube.
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRemaster(item.id)}
            className={cn(
              "h-9 rounded-full px-3 text-sm",
              remaster === item.id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mb-1 text-xs text-subtle">{PRESETS.find((p) => p.id === remaster)?.blurb}</p>
      <div className="flex items-center gap-3">
        <span className="w-14 text-xs uppercase tracking-widest text-subtle">Amount</span>
        <input
          className="h-seek flex-1"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={amount}
          disabled={remaster === "off"}
          aria-label="Remaster amount"
          onChange={(e) => setRemasterAmt(Number(e.target.value))}
        />
        <span className="w-10 text-right font-mono text-xs tabular-nums text-muted">{Math.round(amount * 100)}</span>
      </div>
    </section>
  );
}
