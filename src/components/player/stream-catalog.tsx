import { useEffect, useMemo, useState } from "react";
import { STREAM_SOURCES, type StreamHit, type StreamSource } from "@/lib/player/stream-search";
import { streamSearch } from "@/lib/player/stream-search-api";
import { loadSpSession } from "@/lib/player/spotify";
import { usePlayer } from "@/lib/player/store";

type Props = {
  query: string;
  locked?: StreamSource;
};

export function StreamCatalog({ query, locked }: Props) {
  const importStreamHits = usePlayer((s) => s.importStreamHits);
  const [source, setSource] = useState<StreamSource | "All">(locked || "All");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      const token = loadSpSession()?.token;
      const sources = locked ? [locked] : source === "All" ? undefined : [source];
      void streamSearch({ data: { q, token, sources } })
        .then((res) => {
          if (live) setHits(res.hits);
        })
        .catch(() => {
          if (live) setHits([]);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 380);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, source, locked]);

  const albums = useMemo(() => hits.filter((h) => h.kind === "album"), [hits]);
  const tracks = useMemo(() => hits.filter((h) => h.kind === "track"), [hits]);
  const sources = locked ? [locked] : STREAM_SOURCES;

  const add = (items: StreamHit[]) => {
    const key = items.map((i) => i.key).join(",");
    setAdding(key);
    setNote(null);
    void importStreamHits(items, true)
      .then((n) => setNote(n ? `Added ${n} to your library.` : "Already in your library."))
      .catch((err) => setNote(err instanceof Error ? err.message : "Could not add that title."))
      .finally(() => setAdding(null));
  };

  if (q.length < 2) {
    return (
      <p className="mt-6 text-sm text-muted">
        Search Amazon Music, Apple Music, Deezer, Spotify, Bandcamp, Archive, YouTube, Audius, and Arcod. Add a result to drop it in your library with cover and metadata.
      </p>
    );
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Streaming catalogs</h3>
          <p className="text-sm text-muted">{busy ? "Searching…" : `${hits.length} results · add a title to keep cover art and metadata in your library`}</p>
        </div>
      </div>
      {!locked ? (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={source === "All"} onClick={() => setSource("All")} label="All" />
          {sources.map((name) => (
            <Chip key={name} active={source === name} onClick={() => setSource(name)} label={name} />
          ))}
        </div>
      ) : null}
      {source === "Spotify" && !loadSpSession()?.token ? (
        <p className="text-sm text-muted">Connect Spotify in Settings to search your catalog there. Other platforms still work.</p>
      ) : null}
      {note ? <p className="text-sm text-muted">{note}</p> : null}

      {albums.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Albums</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {albums.map((item) => (
              <article key={item.key} className="min-w-0">
                <div className="aspect-square overflow-hidden rounded-md bg-raised">
                  {item.cover ? (
                    <img src={item.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <p className="mt-2 truncate text-sm">{item.name}</p>
                <p className="truncate text-xs text-muted">{item.artist}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-subtle">{item.source}</p>
                <button
                  type="button"
                  disabled={adding === item.key}
                  onClick={() => add([item])}
                  className="mt-2 h-8 w-full rounded-full bg-hot text-xs font-semibold text-hot-fg disabled:opacity-40"
                >
                  {adding === item.key ? "Adding…" : "Add album"}
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Songs</p>
          <ul className="divide-y divide-border/60">
            {tracks.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2">
                <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-raised">
                  {item.cover ? (
                    <img src={item.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="truncate text-xs text-muted">
                    {item.artist}
                    {item.album ? ` · ${item.album}` : ""}
                  </p>
                </div>
                <span className="hidden text-[10px] uppercase tracking-widest text-subtle sm:block">{item.source}</span>
                <button
                  type="button"
                  disabled={adding === item.key}
                  onClick={() => add([item])}
                  className="h-8 shrink-0 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
                >
                  {adding === item.key ? "…" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!busy && hits.length === 0 ? (
        <p className="text-sm text-muted">No streaming matches for “{q}”.</p>
      ) : null}
    </section>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "h-8 rounded-full bg-hot px-3 text-xs font-semibold text-hot-fg"
          : "h-8 rounded-full bg-raised px-3 text-xs text-muted hover:text-fg"
      }
    >
      {label}
    </button>
  );
}
