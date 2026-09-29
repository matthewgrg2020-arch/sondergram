import { Disc3, Dices, LoaderCircle, Play, Plus } from "lucide-react";
import { useState } from "react";
import { BC_GENRES, parseBandcampUrl, type BcHit } from "@/lib/player/bandcamp";
import { bcDiscover, bcSearch } from "@/lib/player/bandcamp-api";
import { groupAlbums } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";

export function BandcampPanel() {
  const importBandcamp = usePlayer((s) => s.importBandcamp);
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [hits, setHits] = useState<BcHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inLib = tracks.filter((t) => t.bandcampId);
  const paste = parseBandcampUrl(query);

  const addUrl = async (url: string, play = true) => {
    setAdding(url);
    setMessage(null);
    try {
      const n = await importBandcamp(url, play);
      setMessage(n ? `Added ${n} Bandcamp tracks.` : "Those tracks are already in your library.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that Bandcamp page.");
    } finally {
      setAdding(null);
    }
  };

  const runSearch = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setMessage(null);
    setGenre(null);
    void bcSearch({ data: { q: text } })
      .then((result) => {
        setHits(result.hits);
        if (result.hits.length === 0) setMessage("Nothing matched that search.");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Search failed."))
      .finally(() => setBusy(false));
  };

  const runGenre = (g: string) => {
    setBusy(true);
    setMessage(null);
    setGenre(g);
    setQuery(g);
    void bcDiscover({ data: { genre: g } })
      .then((result) => {
        setHits(result.hits);
        if (result.hits.length === 0) setMessage(`No Bandcamp finds for ${g} right now.`);
        else setMessage(`${result.hits.length} ${g} releases`);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Genre search failed."))
      .finally(() => setBusy(false));
  };

  const crateDig = () => {
    if (!hits.length) return;
    const pick = hits[Math.floor(Math.random() * hits.length)];
    if (pick) void addUrl(pick.url, true);
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Disc3 className="size-5" strokeWidth={1.75} />
        Bandcamp
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Paste an album link, search by name, or dig by genre. Sondergram pulls artwork, year, tags, and streamable
        tracks into your library.
      </p>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Genres</p>
        <div className="flex flex-wrap gap-1.5">
          {BC_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              disabled={busy}
              onClick={() => runGenre(g)}
              className={
                genre === g
                  ? "h-8 rounded-full bg-hot px-3 text-xs font-medium text-hot-fg"
                  : "h-8 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
              }
            >
              {g.replace(/-/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (paste) {
            void addUrl(paste, true);
            return;
          }
          runSearch(query);
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
          value={query}
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Paste artist.bandcamp.com/album/… or search"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || adding !== null || !query.trim()}
          className="h-11 shrink-0 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
        >
          {busy ? "…" : paste ? "Add album" : "Search"}
        </button>
        {hits.length > 1 ? (
          <button
            type="button"
            disabled={adding !== null}
            onClick={crateDig}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-raised px-4 text-sm font-medium"
            title="Play a random result"
          >
            <Dices className="size-4" strokeWidth={1.75} />
            Crate dig
          </button>
        ) : null}
      </form>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {hits.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hits.map((hit) => (
            <article key={hit.url} className="overflow-hidden rounded-xl bg-surface">
              <div className="aspect-square bg-raised">
                {hit.cover ? (
                  <img src={hit.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                ) : null}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{hit.title}</p>
                <p className="truncate text-xs text-muted">
                  {hit.artist} · {hit.kind}
                  {hit.genre ? ` · ${hit.genre}` : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={adding !== null}
                    onClick={() => void addUrl(hit.url, true)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-full bg-accent text-xs font-medium text-accent-fg disabled:opacity-40"
                  >
                    {adding === hit.url ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={adding !== null}
                    onClick={() => void addUrl(hit.url, false)}
                    className="inline-flex h-9 items-center justify-center rounded-full bg-raised px-3 text-xs"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {inLib.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">In your library · {inLib.length} tracks</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {groupAlbums(inLib).map((album) => (
              <button
                key={album.key}
                type="button"
                onClick={() => playIds(album.trackIds)}
                className="text-left"
              >
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
