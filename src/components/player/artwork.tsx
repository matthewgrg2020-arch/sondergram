import { useCoverPalette, coverVars } from "@/lib/player/cover-color";
import { proxyCoverUrl } from "@/lib/player/covers";
import type { Track } from "@/lib/player/store";
import { FormatBadge } from "./format-badge";

type Props = {
  track?: Track;
  playing: boolean;
};

function hashHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 40;
}

export function Artwork({ track, playing }: Props) {
  const name = track?.name ?? "";
  const coverUrl = track?.coverUrl ?? null;
  const shift = hashHue(name || "empty");
  const palette = useCoverPalette(coverUrl);

  return (
    <div className="relative flex items-center justify-center py-2" style={coverVars(palette)}>
      <div
        className="relative z-10 aspect-square w-[min(100%,18rem)] overflow-hidden rounded-xl bg-raised shadow-[var(--shadow-border)]"
        style={{
          boxShadow: `0 0 0 1px rgb(${palette.accent} / 0.22), 0 18px 50px rgb(${palette.mid} / 0.45)`,
        }}
      >
        {coverUrl ? (
          <img
            src={proxyCoverUrl(coverUrl)}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 80% at 20% 10%, color-mix(in oklab, var(--color-glow) ${18 + (shift % 8)}%, transparent), transparent 55%),
            linear-gradient(165deg, var(--color-raised) 0%, var(--color-bg) 55%, color-mix(in oklab, var(--color-accent) 12%, var(--color-bg)) 100%)`,
              }}
              aria-hidden
            />
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="font-display text-5xl text-fg/80">{(name || "S").slice(0, 1)}</span>
            </div>
          </>
        )}
        {track ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-start bg-bg/80 px-3 py-2">
            <FormatBadge
              label={track.format}
              lossless={track.lossless}
              sampleRate={track.sampleRate}
              bitDepth={track.bitDepth}
              bitrate={track.bitrate}
              tags={track.tags}
            />
          </div>
        ) : null}
      </div>
      <div
        className={`vinyl pointer-events-none absolute right-[8%] z-0 hidden size-44 rounded-full sm:block ${playing ? "animate-[spin_4s_linear_infinite]" : ""}`}
        aria-hidden
      />
    </div>
  );
}
