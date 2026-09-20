import { Archive, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { groupAlbums, groupTags } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";

export function RadioPage() {
  const tracks = usePlayer((s) => s.tracks);
  const radio = usePlayer((s) => s.radio);
  const toggleRadio = usePlayer((s) => s.toggleRadio);
  const playIds = usePlayer((s) => s.playIds);
  const playRadioFrom = usePlayer((s) => s.playRadioFrom);
  const archiveRadio = usePlayer((s) => s.archiveRadio);
  const index = usePlayer((s) => s.index);
  const [concert, setConcert] = useState(false);
  const tags = useMemo(() => groupTags(groupAlbums(tracks)), [tracks]);
  const current = index >= 0 ? tracks[index] : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8">
      <h2 className="text-3xl font-semibold tracking-tight">Radio</h2>
      <p className="mt-2 text-sm text-muted">
        Stations built from your tags. After the queue ends, similar songs keep playing.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleRadio}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
        >
          <Radio className="size-4" strokeWidth={1.75} />
          {radio ? "Stations on" : "Turn stations on"}
        </button>
        {current ? (
          <button
            type="button"
            onClick={() => playRadioFrom(current.id)}
            className="h-11 rounded-full bg-raised px-5 text-sm"
          >
            Station from “{current.name}”
          </button>
        ) : null}
        <button
          type="button"
          disabled={concert}
          onClick={() => {
            setConcert(true);
            void archiveRadio(current?.artist).finally(() => setConcert(false));
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-raised px-5 text-sm disabled:opacity-40"
        >
          <Archive className="size-4" strokeWidth={1.75} />
          {concert ? "Finding concert…" : "Archive concert radio"}
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Tag albums in Browse to grow stations.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => playIds(tag.albums.flatMap((a) => a.trackIds))}
              className="overflow-hidden rounded-xl bg-surface text-left shadow-[var(--shadow-border)]"
            >
              <div className="grid grid-cols-2">
                {tag.albums.slice(0, 4).map((album) => (
                  <div key={album.key} className="aspect-square bg-raised">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="p-4">
                <p className="font-semibold">{tag.name} Station</p>
                <p className="mt-1 text-xs text-muted">
                  {tag.albums.length} {tag.albums.length === 1 ? "album" : "albums"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}