import { cn } from "@/lib/utils";

export function FormatBadge({
  label,
  lossless,
}: {
  label: string;
  lossless?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium tracking-wide",
        lossless ? "bg-accent text-accent-fg" : "bg-raised text-muted",
      )}
    >
      {label}
    </span>
  );
}

export function ExplicitBadge({ className }: { className?: string } = {}) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-white/20 text-[10px] font-bold leading-none text-fg",
        className,
      )}
    >
      E
    </span>
  );
}