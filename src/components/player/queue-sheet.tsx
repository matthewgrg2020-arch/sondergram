import { ListMusic, X } from "lucide-react";
import { usePlayer } from "@/lib/player/store";
import { proxyCoverUrl } from "@/lib/player/covers";

type Props = {
  open: boolean;
  onClose: () => void;
  onPlayId?: (id: string) => void;
};

export function QueueSheet({ open, onClose, onPlayId }: Props) {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const upNext = usePlayer((s) => s.upNext);
  const playIds = usePlayer((s) => s.playIds);
  const playRest = usePlayer((s) => s.playRest);

  if (!open) return null;

  const current = index >= 0 ? tracks[index] : null;
  const upcoming = upNext
    .map((id) => tracks.find((t) => t.id === id))
    .filter(Boolean) as typeof tracks;

  const play = (id: string) => {
    if (onPlayId) onPlayId(id);
    else if (playRest) playRest(id);
    else playIds([id]);
  };

  const clearQueue = () => {
    usePlayer.setState({ upNext: [] });
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/55" onClick={onClose}>
      <div
        className="max-h-[78dvh] overflow-hidden rounded-t-2xl bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ListMusic className="size-5 text-accent" strokeWidth={1.75} />
            <h3 className="text-base font-semibold">Queue</h3>
            <span className="text-xs text-muted">{upcoming.length} up next</span>
          </div>
          <div className="flex items-center gap-2">
            {upcoming.length ? (
              <button type="button" onClick={clearQueue} className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-fg">
                Clear
              </button>
            ) : null}
            <button type="button" aria-label="Close queue" onClick={onClose} className="flex size-10 items-center justify-center rounded-full hover:bg-raised">
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {current ? (
            <div className="px-2 pb-2 pt-3">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">Now playing</p>
              <button type="button" onClick={() => play(current.id)} className="flex w-full items-center gap-3 rounded-xl bg-raised/70 px-2 py-2 text-left">
                <div className="size-11 shrink-0 overflow-hidden rounded bg-raised">
                  {current.coverUrl ? <img src={proxyCoverUrl(current.coverUrl)} alt="" className="size-full object-cover" /> : null}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{current.name}</span>
                  <span className="block truncate text-xs text-muted">{current.artist}</span>
                </span>
              </button>
            </div>
          ) : null}

          <div className="px-2 py-2">
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">Up next</p>
            {upcoming.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted">
                Queue is empty. Use ··· on a song and choose Play next or Add to queue.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.map((t, i) => (
                  <div key={`${t.id}-${i}`} className="flex items-center gap-2 py-2">
                    <button type="button" onClick={() => play(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="size-10 shrink-0 overflow-hidden rounded bg-raised">
                        {t.coverUrl ? <img src={proxyCoverUrl(t.coverUrl)} alt="" className="size-full object-cover" /> : null}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-full px-2 py-1 text-[11px] text-muted hover:bg-raised hover:text-fg"
                      onClick={() => {
                        usePlayer.setState((s: any) => ({
                          upNext: (s.upNext || []).filter((id: string, idx: number) => !(id === t.id && idx === i)),
                        }));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
