import { formatSign } from "@/lib/player/format";
import { cn } from "@/lib/utils";

export function FormatBadge({
  label,
  lossless,
  sampleRate,
  bitDepth,
  bitrate,
  tags,
  className,
}: {
  label: string;
  lossless?: boolean;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
  tags?: string[];
  className?: string;
}) {
  const text = formatSign({ format: label, lossless, sampleRate, bitDepth, bitrate, tags });
  return (
    <span className={cn("fmt-sign", className)} title={text}>
      {text}
    </span>
  );
}

export function ExplicitBadge({ className, onArt }: { className?: string; onArt?: boolean } = {}) {
  return (
    <span
      title="Explicit"
      className={cn(
        "inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-[3px] px-[4px] text-[9px] font-extrabold leading-none tracking-tight",
        onArt ? "bg-white text-black shadow-sm" : "bg-fg text-bg",
        className,
      )}
    >
      E
    </span>
  );
}
