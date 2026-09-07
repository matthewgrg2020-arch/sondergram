import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AUDIO_ACCEPT, creditLine } from "@/lib/player/format";
import { usePlayer } from "@/lib/player/store";
import { makeDemoTone } from "@/lib/player/engine";
import { FormatBadge } from "./format-badge";

export function Playlist() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const playIndex = usePlayer((s) => s.playIndex);
  const addFiles = usePlayer((s) => s.addFiles);
  const addDemo = usePlayer((s) => s.addDemo);
  const removeTrack = usePlayer((s) => s.removeTrack);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg tracking-tight">Library</h2>
          {tracks.length > 0 ? (
            <p className="text-xs text-subtle">Saved on this device</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-fg transition-colors duration-150 hover:bg-accent hover:text-accent-fg"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          Add
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {tracks.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted">
            Drop FLAC, WAV, AIFF, or MP3 once. Files stay in a library on this device with artwork and tags. Unlimited cloud storage is not available here — the browser cannot host your music locker.
          </p>
          <p className="flex flex-wrap gap-1.5">
            {["FLAC", "WAV", "AIFF", "ALAC", "MP3"].map((label) => (
              <FormatBadge key={label} label={label} lossless={label !== "MP3"} />
            ))}
          </p>
          <button
            type="button"
            className="text-sm text-accent underline-offset-4 hover:underline"
            onClick={() => {
              const demo = makeDemoTone();
              addDemo(
                {
                  id: crypto.randomUUID(),
                  name: demo.name,
                  artist: "Sondergram",
                  album: "Listening Room",
                  genre: "Studio",
                  tags: ["Studio"],
                  year: "2026",
                  url: URL.createObjectURL(demo.blob),
                  coverUrl: null,
                  format: "WAV",
                  sampleRate: 44100,
                  bitDepth: 16,
                  bitrate: null,
                  channels: 1,
                  lossless: true,
                  liked: false,
                  starred: false,
                },
                demo.blob,
              );
            }}
          >
            Play studio tone
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {tracks.map((track, i) => (
            <li key={track.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => playIndex(i)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150",
                  i === index ? "bg-raised text-accent" : "text-fg hover:bg-raised",
                )}
              >
                {track.coverUrl ? (
                  <img
                    src={track.coverUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-sm object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-raised font-mono text-xs tabular-nums text-subtle">
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{track.name}</span>
                  <span className="block truncate text-xs text-muted">{creditLine(track)}</span>
                </span>
                <FormatBadge label={track.format} lossless={track.lossless} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${track.name}`}
                onClick={() => removeTrack(track.id)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-subtle opacity-100 transition-colors duration-150 hover:bg-raised hover:text-fg sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
