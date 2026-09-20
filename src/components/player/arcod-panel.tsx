import { Disc3, LoaderCircle, Play, Plus } from "lucide-react";
import { useState } from "react";
import { streamSearch } from "@/lib/player/stream-search-api";
import { groupAlbums } from "@/lib/player/catalog";
import { parseQobuzUrl, type StreamHit } from "@/lib/player/stream-search";
import { usePlayer } from "@/lib/player/store";

function qobuzArt(id: string) {
  if (!/^\d{8,}$/.test(id)) return "";
  return `https://static.qobuz.com/images/covers/${id.slice(-2)}/${id.slice(-4, -2)}/${id}_org.jpg`;
}

function albumHitFromUrl(id: string, raw: string): StreamHit {
  return {
    key: `Arcod:album:${id}:`,
    source: "Arcod",
    kind: "album",
    name: "Qobuz album",
    artist: "Arcod",
    album: "Qobuz album",
    year: "",
    cover: qobuzArt(id),
    preview: "",
    duration: 0,
    trackNo: 0,
    qobuzId: id,
    page: raw,
  };
}

export function ArcodPanel() {
  const importStreamHits = usePlayer((s) => s.importStreamHits);
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inLib = tracks.filter((t) => t.qobuzId);
  const pasted = parseQobuzUrl(query);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await streamSearch({ data: { q, sources: ["Arcod"] } });
      setHits(result.hits);
      setMessage(result.hits.length ? null : "Nothing matched on Arcod. Try another title or paste a Qobuz link.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Arcod search failed.");
    } finally {
      setBusy(false);
    }
  };

  const add = async (items: StreamHit[], play: boolean) => {
    const key = items.map((i) => i.key).join(",");
    setAdding(key);
    setMessage(null);
    try {
      const n = await importStreamHits(items, play);
      setMessage(n ? `Added ${n} with artwork and metadata.` : "Those titles are already in your library.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that title.");
    } finally {
      setAdding(null);
    }
  };

  const addPaste = async (play: boolean) => {
    if (!pasted) return;
    const hit =
      pasted.kind === "album"
        ? albumHitFromUrl(pasted.id, query.trim())
        : {
            key: `Arcod:track:${pasted.id}:`,
            source: "Arcod" as const,
            kind: "track" as const,
            name: "Qobuz track",
            artist: "Arcod",
            album: "",
            year: "",
            cover: "",
            preview: "",
            duration: 0,
            trackNo: 0,
            qobuzId: pasted.id,
            page: query.trim(),
          };
    await add([hit], play);
  };

  const albums = hits.filter((h) => h.kind === "album");
  const songs = hits.filter((h) => h.kind === "track");

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Disc3 className="size-5" strokeWidth={1.75} />
        Arcod
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Search Arcod for albums and songs, or paste a Qobuz link. Add a result to keep cover art, artist, album, year,
        and track info in your library.
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (pasted) {
            void addPaste(true);
            return;
          }
          void search();
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
          value={query}
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Artist, album, song, or qobuz.com/album/…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || adding !== null || query.trim().length < 2}
          className="h-11 shrink-0 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
        >
          {busy || adding !== null ? "…" : pasted ? "Add album" : "Search"}
        </button>
      </form>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {albums.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Albums</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {albums.map((hit) => (
              <article key={hit.key} className="overflow-hidden rounded-xl bg-surface">
                <div className="aspect-square bg-raised">
                  {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{hit.name}</p>
                  <p className="truncate text-xs text-muted">
                    {hit.artist}
                    {hit.year ? ` · ${hit.year}` : ""}
                    {hit.tracksCount ? ` · ${hit.tracksCount} tracks` : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={adding !== null}
                      onClick={() => void add([hit], true)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-full bg-accent text-xs font-medium text-accent-fg disabled:opacity-40"
                    >
                      {adding === hit.key ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      Play
                    </button>
                    <button
                      type="button"
                      disabled={adding !== null}
                      onClick={() => void add([hit], false)}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-raised px-3 text-xs"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {songs.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Songs</p>
          <ul className="divide-y divide-border/60">
            {songs.map((hit) => (
              <li key={hit.key} className="flex items-center gap-3 py-2.5">
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-raised">
                  {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{hit.name}</p>
                  <p className="truncate text-xs text-muted">
                    {hit.artist}
                    {hit.album ? ` · ${hit.album}` : ""}
                    {hit.year ? ` · ${hit.year}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void add([hit], true)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-hot px-3 text-xs font-semibold text-hot-fg disabled:opacity-40"
                >
                  <Play className="size-3.5" strokeWidth={2} />
                  Play
                </button>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void add([hit], false)}
                  className="h-8 shrink-0 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inLib.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">In your library · {inLib.length} tracks</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {groupAlbums(inLib).map((album) => (
              <button key={album.key} type="button" onClick={() => playIds(album.trackIds)} className="text-left">
                <div className="aspect-square overflow-hidden rounded-md bg-raised">
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm">{album.title}</p>
                <p className="truncate text-xs text-muted">{album.artist}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
