import { Play } from "lucide-react";
import { ExplicitBadge } from "./format-badge";
import { MoreMenu } from "./more-menu";

export function AlbumTile({
  title,
  artist,
  year,
  cover,
  badges,
  explicit,
  onOpen,
  onPlay,
  onQueue,
}: {
  title: string;
  artist: string;
  year?: string;
  cover: string | null;
  badges?: string[];
  explicit?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onQueue?: () => void;
}) {
  return (
    <div className="group/cover min-w-0 text-left">
      <div className="relative">
        <button type="button" onClick={onOpen} className="w-full">
          <div className="aspect-square overflow-hidden rounded-md bg-raised">
            {cover ? (
              <img src={cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-semibold text-subtle">
                {title.slice(0, 1)}
              </div>
            )}
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
            className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-hover/cover:opacity-100"
            label={`More for ${title}`}
            items={[
              { label: "Play", onClick: onPlay },
              { label: "Play next", onClick: onQueue },
            ]}
          />
        ) : null}
      </div>
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