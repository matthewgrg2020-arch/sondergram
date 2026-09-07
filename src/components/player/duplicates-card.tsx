import { findDuplicates } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";

export function DuplicatesCard() {
  const tracks = usePlayer((s) => s.tracks);
  const playIndex = usePlayer((s) => s.playIndex);
  const removeTrack = usePlayer((s) => s.removeTrack);
  const groups = findDuplicates(tracks);
  if (tracks.length === 0) return null;

  return (
    <section className="rounded-xl bg-surface p-4">
      <h3 className="text-sm font-semibold">Duplicates</h3>
      <p className="mt-1 text-xs text-muted">
        {groups.length === 0 ? "No matching titles in the library." : `${groups.length} matching titles.`}
      </p>
      {groups.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {groups.slice(0, 12).map((list) => (
            <li key={list[0]!.id} className="rounded-lg bg-raised p-2">
              <p className="px-1 text-sm">
                {list[0]!.name}
                <span className="ml-2 text-xs text-muted">{list[0]!.artist}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {list.map((track) => (
                  <span key={track.id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px]">
                    <button type="button" onClick={() => playIndex(tracks.findIndex((t) => t.id === track.id))}>
                      {track.format}
                      {track.album ? ` · ${track.album}` : ""}
                    </button>
                    <button type="button" className="text-hot" onClick={() => removeTrack(track.id)}>
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}