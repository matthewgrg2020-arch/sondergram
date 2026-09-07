import { useEffect, useState } from "react";
import { formatSpecs } from "@/lib/player/format";
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

async function sampleColor(url: string) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum < 40 || lum > 700) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    if (!n) return null;
    return `${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)}`;
  } catch {
    return null;
  }
}

export function Artwork({ track, playing }: Props) {
  const name = track?.name ?? "";
  const coverUrl = track?.coverUrl ?? null;
  const shift = hashHue(name || "empty");
  const [glow, setGlow] = useState<string | null>(null);
  const specs = track
    ? formatSpecs({
        bitDepth: track.bitDepth,
        sampleRate: track.sampleRate,
        bitrate: track.bitrate,
        channels: track.channels,
        lossless: track.lossless,
      })
    : "";

  useEffect(() => {
    let live = true;
    setGlow(null);
    if (!coverUrl) return;
    void sampleColor(coverUrl).then((color) => {
      if (live) setGlow(color);
    });
    return () => {
      live = false;
    };
  }, [coverUrl]);

  return (
    <div className="relative flex items-center justify-center py-2">
      <div
        className="relative z-10 aspect-square w-[min(100%,18rem)] overflow-hidden rounded-xl bg-raised shadow-[var(--shadow-border)]"
        style={
          glow
            ? { boxShadow: `0 0 0 1px rgb(${glow} / 0.25), 0 18px 50px rgb(${glow} / 0.28)` }
            : undefined
        }
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
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
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-bg/80 px-3 py-2">
            <FormatBadge label={track.format} lossless={track.lossless} />
            {specs ? (
              <span className="truncate font-mono text-xs tabular-nums text-muted">{specs}</span>
            ) : null}
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
