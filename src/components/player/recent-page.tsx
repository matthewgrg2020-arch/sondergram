import { useState } from "react";
import { groupAlbums } from "@/lib/player/catalog";
import { usePlayer, type Track } from "@/lib/player/store";
import { AddToPlaylist } from "./add-to-playlist";
import { MoreMenu } from "./more-menu";

export function RecentPage() {
  const tracks = usePlayer((s) => s.tracks);
  const recent = usePlayer((s) => s.recent);
  const playIndex = usePlayer((s) => s.playIndex);
  const playIds = usePlayer((s) => s.playIds);
  const queueNext = usePlayer((s) => s.queueNext);
  const [playlistIds, setPlaylistIds] = useState<string[] | null>(null);
  const items = recent
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));
  const added = [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 24);
  const addedAlbums = [...groupAlbums(tracks)]
    .sort((a, b) => {
      const aa = Math.max(...a.trackIds.map((id) => tracks.find((t) => t.id === id)?.addedAt ?? 0), 0);
      const bb = Math.max(...b.trackIds.map((id) => tracks.find((t) => t.id === id)?.addedAt ?? 0), 0);
      return bb - aa;
    })
    .slice(0, 12);

  return (
    <div className="px-4 py-2 sm:px-5">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">Recent</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Play something and it will land here.</p>
      ) : (
        <ul>
          {items.map((track) => (
            <li key={track.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => playIndex(tracks.findIndex((t) => t.id === track.id))}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface"
              >
                <div className="size-11 overflow-hidden rounded-md bg-raised">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{track.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {track.artist}
                    {track.album ? `  ·  ${track.album}` : ""}
                  </span>
                </span>
              </button>
              <MoreMenu
                tone="plain"
                label={`More for ${track.name}`}
                items={[
                  { label: "Play next", onClick: () => queueNext(track.id) },
                  { label: "Add to queue", onClick: () => usePlayer.getState().queueLast(track.id) },
                  { label: "Add to playlist", onClick: () => setPlaylistIds([track.id]) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Recently added</h3>
      {addedAlbums.length === 0 ? (
        <p className="text-sm text-muted">Drop in albums and they’ll show up here.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {addedAlbums.map((album) => (
            <button
              key={album.key}
              type="button"
              onClick={() => playIds(album.trackIds)}
              className="w-28 shrink-0 text-left"
            >
              <div className="aspect-square overflow-hidden rounded-lg bg-raised">
                {album.coverUrl ? <img src={album.coverUrl} alt="" className="size-full object-cover" /> : null}
              </div>
              <p className="mt-2 truncate text-sm">{album.title}</p>
              <p className="truncate text-xs text-muted">{album.artist}</p>
            </button>
          ))}
        </div>
      )}
      {added.length > 0 ? (
        <ul className="mt-4">
          {added.slice(0, 12).map((track) => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => playIndex(tracks.findIndex((t) => t.id === track.id))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface"
              >
                <div className="size-10 overflow-hidden rounded-md bg-raised">
                  {track.coverUrl ? <img src={track.coverUrl} alt="" className="size-full object-cover" /> : null}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{track.name}</span>
                  <span className="block truncate text-xs text-muted">{track.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <AddToPlaylist trackIds={playlistIds ?? []} open={Boolean(playlistIds)} onClose={() => setPlaylistIds(null)} />
    </div>
  );
}