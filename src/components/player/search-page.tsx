import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { parseArchiveId } from "@/lib/player/archive";
import { parseBandcampUrl } from "@/lib/player/bandcamp";
import { groupAlbums, groupArtists } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";
import { AddToPlaylist } from "./add-to-playlist";
import { MoreMenu } from "./more-menu";
import { StreamCatalog } from "./stream-catalog";

export function SearchPage({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const queueNext = usePlayer((s) => s.queueNext);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const importArchive = usePlayer((s) => s.importArchive);
  const importBandcamp = usePlayer((s) => s.importBandcamp);
  const [adding, setAdding] = useState(false);
  const [playlistIds, setPlaylistIds] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const archiveId = parseArchiveId(query);
  const bandcampUrl = parseBandcampUrl(query);
  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);

  const songHits = q
    ? tracks.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      )
    : [];
  const albumHits = q
    ? albums.filter(
        (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
      )
    : [];
  const artistHits = q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8">
      <h2 className="text-3xl font-semibold tracking-tight">Search</h2>
      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Artists, songs, Arcod, Spotify, Deezer, Apple Music…"
          className="h-12 w-full rounded-xl bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-subtle"
        />
      </label>

      {bandcampUrl ? (
        <div className="mt-6 rounded-xl bg-surface p-4">
          <p className="text-sm">Bandcamp link</p>
          <p className="mt-1 truncate font-mono text-xs text-muted">{bandcampUrl}</p>
          <button
            type="button"
            disabled={adding}
            onClick={() => {
              setAdding(true);
              setNote(null);
              void importBandcamp(bandcampUrl, true)
                .then((n) => setNote(n ? `Added ${n} tracks.` : "Already in your library."))
                .catch((err) => setNote(err instanceof Error ? err.message : "Could not add that link."))
                .finally(() => setAdding(false));
            }}
            className="mt-3 h-11 w-full rounded-full bg-hot text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add this album"}
          </button>
          {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
        </div>
      ) : null}

      {archiveId ? (
        <div className="mt-6 rounded-xl bg-surface p-4">
          <p className="text-sm">Internet Archive link</p>
          <p className="mt-1 truncate font-mono text-xs text-muted">{archiveId}</p>
          <button
            type="button"
            disabled={adding}
            onClick={() => {
              setAdding(true);
              setNote(null);
              void importArchive(archiveId, true, true)
                .then((n) => setNote(n ? `Added ${n} tracks.` : "Already in your library."))
                .catch((err) => setNote(err instanceof Error ? err.message : "Could not add that link."))
                .finally(() => setAdding(false));
            }}
            className="mt-3 h-11 w-full rounded-full bg-hot text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add this recording"}
          </button>
          {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
        </div>
      ) : null}

      {!q && !archiveId && !bandcampUrl ? (
        <StreamCatalog query="" />
      ) : (
        <>
          <StreamCatalog query={query} />
        <div className="mt-8 space-y-8">
          {artistHits.length + albumHits.length + songHits.length > 0 ? (
            <h3 className="text-lg font-semibold">In your library</h3>
          ) : null}
          {artistHits.length > 0 ? (
            <section>
              <h3 className="mb-3 text-lg font-semibold">Artists</h3>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {artistHits.map((artist) => (
                  <button
                    key={artist.key}
                    type="button"
                    onClick={() => playIds(artist.albums.flatMap((a) => a.trackIds))}
                    className="w-28 shrink-0 text-center"
                  >
                    <div className="mx-auto size-28 overflow-hidden rounded-full bg-raised">
                      {artist.coverUrl ? (
                        <img src={artist.coverUrl} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-sm">{artist.name}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {albumHits.length > 0 ? (
            <section>
              <h3 className="mb-3 text-lg font-semibold">Albums</h3>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {albumHits.map((album) => (
                  <div key={album.key} className="group/cover relative w-32 shrink-0 text-left">
                    <button type="button" onClick={() => playIds(album.trackIds)} className="w-full text-left">
                      <div className="aspect-square overflow-hidden rounded-md bg-raised">
                        {album.coverUrl ? (
                          <img src={album.coverUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-sm">{album.title}</p>
                      <p className="truncate text-xs text-muted">{album.artist}</p>
                    </button>
                    <MoreMenu
                      className="absolute right-1 top-1"
                      label={`More for ${album.title}`}
                      items={[
                        { label: "Play", onClick: () => playIds(album.trackIds) },
                        { label: "Play next", onClick: () => queueNextMany(album.trackIds) },
                        { label: "Add to playlist", onClick: () => setPlaylistIds(album.trackIds) },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {songHits.length > 0 ? (
            <section>
              <h3 className="mb-3 text-lg font-semibold">Songs</h3>
              <ul>
                {songHits.slice(0, 40).map((track) => (
                  <li key={track.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => usePlayer.getState().playRest(track.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-raised"
                    >
                      <div className="size-10 overflow-hidden rounded-sm bg-raised">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{track.name}</span>
                        <span className="block truncate text-xs text-muted">{track.artist}</span>
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
            </section>
          ) : null}
        </div>
        </>
      )}
      <AddToPlaylist trackIds={playlistIds ?? []} open={Boolean(playlistIds)} onClose={() => setPlaylistIds(null)} />
    </div>
  );
}