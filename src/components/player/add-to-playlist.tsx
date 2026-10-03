import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { usePlayer } from "@/lib/player/store";

export function AddToPlaylist({
  trackIds,
  open,
  onClose,
}: {
  trackIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const playlists = usePlayer((s) => s.playlists);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const addTracksToPlaylist = usePlayer((s) => s.addTracksToPlaylist);
  const [name, setName] = useState("");

  if (!open || typeof document === "undefined") return null;

  const create = () => {
    createPlaylist(name, trackIds);
    setName("");
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Add to playlist"
        className="w-full max-w-sm rounded-2xl bg-raised p-4 shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">Add to playlist</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist"
            className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-sm text-fg outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-1 rounded-full bg-hot px-3 text-sm text-hot-fg"
          >
            <Plus className="size-4" strokeWidth={1.75} />
            Create
          </button>
        </form>
        {playlists.length === 0 ? (
          <p className="px-1 pb-1 text-sm text-muted">No playlists yet. Name one above.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {playlists.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    addTracksToPlaylist(row.id, trackIds);
                    onClose();
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
                >
                  <span className="truncate text-fg">{row.name}</span>
                  <span className="shrink-0 text-xs text-muted">{row.trackIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
