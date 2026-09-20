import { Play, Trash2, X } from "lucide-react";
import { useState } from "react";
import { proxyCoverUrl } from "@/lib/player/covers";
import { cn } from "@/lib/utils";
import { ExplicitBadge } from "./format-badge";
import { MoreMenu } from "./more-menu";

export function RemoveAlbumButton({
  title,
  onRemove,
  dense,
}: {
  title: string;
  onRemove: () => void;
  dense?: boolean;
}) {
  const [ask, setAsk] = useState(false);
  return (
    <div
      className={cn(
        "absolute z-20",
        dense ? "right-1 top-1" : "right-1.5 top-1.5",
        ask ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover/cover:opacity-100",
      )}
    >
      {ask ? (
        <div
          className="flex items-center gap-0.5 rounded-full bg-bg/90 p-0.5 shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setAsk(false);
              onRemove();
            }}
            className="h-8 rounded-full bg-hot px-2.5 text-[11px] font-semibold text-hot-fg"
          >
            Remove
          </button>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setAsk(false)}
            className="flex size-8 items-center justify-center rounded-full text-fg hover:bg-raised"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Remove ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            setAsk(true);
          }}
          className="flex size-8 items-center justify-center rounded-full bg-bg/80 text-fg shadow-sm hover:bg-hot hover:text-hot-fg"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export function AlbumTile({
  title,
  artist,
  year,
  cover,
  badges,
  explicit,
  showTitles = true,
  onOpen,
  onPlay,
  onQueue,
  onRemove,
}: {
  title: string;
  artist: string;
  year?: string;
  cover: string | null;
  badges?: string[];
  explicit?: boolean;
  showTitles?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onQueue?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group/cover min-w-0 text-left">
      <div className="relative">
        <button type="button" onClick={onOpen} className="w-full" aria-label={`${title} — ${artist}`}>
          <div className="relative aspect-square overflow-hidden rounded-md bg-raised">
            {cover ? (
              <img src={proxyCoverUrl(cover)} alt="" className="size-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-semibold text-subtle">
                {title.slice(0, 1)}
              </div>
            )}
            {explicit ? (
              <span className="absolute bottom-1.5 left-1.5">
                <ExplicitBadge onArt />
              </span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          aria-label={`Play ${title}`}
          onClick={onPlay}
          className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-hot text-hot-fg opacity-100 shadow-sm sm:opacity-0 sm:group-hover/cover:opacity-100"
        >
          <Play className="ml-0.5 size-4" strokeWidth={2} fill="currentColor" />
        </button>
        {onQueue ? (
          <MoreMenu
            className="absolute left-2 top-2 z-10 opacity-100 sm:opacity-0 sm:group-hover/cover:opacity-100"
            label={`More for ${title}`}
            items={[
              { label: "Play", onClick: onPlay },
              { label: "Play next", onClick: onQueue },
              ...(onRemove ? [{ label: "Remove album", onClick: onRemove, danger: true }] : []),
            ]}
          />
        ) : null}
        {onRemove ? <RemoveAlbumButton title={title} onRemove={onRemove} /> : null}
      </div>
      {showTitles ? (
        <button type="button" onClick={onOpen} className="mt-2 w-full text-left">
          <p className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{title}</span>
            {explicit ? <ExplicitBadge /> : null}
            {badges?.map((badge) => (
              <span key={badge} className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {badge}
              </span>
            ))}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {artist}
            {year ? `  ·  ${year}` : ""}
          </p>
        </button>
      ) : null}
    </div>
  );
}

export function albumBadges(tracks: { format: string; lossless: boolean }[]) {
  const labels = new Set<string>();
  for (const track of tracks) {
    if (track.lossless) labels.add(track.format || "FLAC");
    else if (track.format && track.format !== "MP3") labels.add(track.format);
  }
  return [...labels].slice(0, 2);
}
