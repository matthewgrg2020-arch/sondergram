import { X } from "lucide-react";
import type { AlbumHit } from "@/lib/player/lookup";
import { proxyCoverUrl } from "@/lib/player/covers";

export function OnlineMatchesSheet({
  hits,
  applying,
  onClose,
  onPick,
}: {
  hits: AlbumHit[];
  applying?: boolean;
  onClose: () => void;
  onPick: (hit: AlbumHit) => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={() => {
        if (!applying) onClose();
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Online matches</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-raised px-3 text-sm font-medium"
          >
            <X className="size-4" strokeWidth={1.75} />
            <span>Close</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {hits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No matches found.</p>
          ) : (
            <div className="space-y-2">
              {hits.map((hit, i) => {
                const art = (hit as any).artwork || (hit as any).coverUrl || "";
                return (
                  <button
                    key={`${hit.title}-${i}`}
                    type="button"
                    disabled={applying}
                    onClick={() => onPick(hit)}
                    className="flex w-full items-center gap-3 rounded-xl bg-raised p-3 text-left hover:bg-white/10 disabled:opacity-50"
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded bg-surface">
                      {art ? <img src={proxyCoverUrl(art)} alt="" className="size-full object-cover" /> : null}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{hit.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {[hit.artist, hit.year, hit.genre].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-full bg-raised text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
