import { Archive, LoaderCircle, Play, Plus } from "lucide-react";
import { useState } from "react";
import { archivePage, parseArchiveId, type IaHit } from "@/lib/player/archive";
import { iaSearch } from "@/lib/player/archive-api";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";

const SHELVES: { id: string; label: string; q?: string; collection?: string }[] = [
  { id: "live", label: "Live concerts", collection: "etree" },
  { id: "78s", label: "78 RPM", collection: "78rpm" },
  { id: "netlabels", label: "Netlabels", collection: "netlabels" },
  { id: "albums", label: "Albums", collection: "album_recordings" },
  { id: "hiphop", label: "Hip hop", q: "subject:(hip hop OR rap)" },
  { id: "jazz", label: "Jazz", q: "subject:jazz" },
  { id: "classical", label: "Classical", q: "subject:classical" },
];

export function ArchivePanel() {
  const importArchive = usePlayer((s) => s.importArchive);
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IaHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [lossless, setLossless] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [shelf, setShelf] = useState("live");
  const inLib = tracks.filter((t) => t.archiveId);

  const runSearch = async (next?: { q?: string; collection?: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await iaSearch({
        data: {
          q: next?.q ?? query,
          collection: next?.collection,
        },
      });
      setHits(result.hits);
      if (result.hits.length === 0) setMessage("Nothing matched that search.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (identifier: string, play = true) => {
    setAdding(identifier);
    setMessage(null);
    try {
      const added = await importArchive(identifier, lossless, play);
      setMessage(added ? `Added ${added} tracks from the Archive.` : "Those tracks are already in your library.");
      if (!play) {
        /* importArchive already queues play */
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that item.");
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Archive className="size-5" strokeWidth={1.75} />
        Internet Archive
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Search live concerts, 78s, and free albums. Paste an archive.org link to add the whole recording with
        artwork and tags.
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const id = parseArchiveId(query);
          if (id) {
            void addItem(id, true);
            return;
          }
          void runSearch({ q: query });
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-fg outline-none placeholder:text-subtle"
          value={query}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Search or paste archive.org/details/…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          {parseArchiveId(query) ? (
            <button
              type="submit"
              disabled={Boolean(adding)}
              className="h-11 flex-1 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40 sm:flex-none"
            >
              {adding ? "Adding…" : "Add link"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="h-11 flex-1 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40 sm:flex-none"
            >
              {busy ? "…" : "Search"}
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SHELVES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setShelf(item.id);
              void runSearch({ q: item.q, collection: item.collection });
            }}
            className={cn(
              "h-8 rounded-full px-3 text-xs",
              shelf === item.id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLossless((v) => !v)}
          className={cn(
            "h-8 rounded-full px-3 text-xs",
            lossless ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
          )}
        >
          {lossless ? "FLAC" : "MP3"}
        </button>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {hits.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {hits.map((hit) => (
            <li key={hit.identifier} className="flex gap-3 rounded-xl bg-surface p-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                <img src={hit.cover} alt="" className="size-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{hit.title}</p>
                <p className="truncate text-xs text-muted">
                  {hit.creator}
                  {hit.year ? ` · ${hit.year}` : ""}
                </p>
                {hit.description ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-subtle">{hit.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={adding === hit.identifier}
                    onClick={() => void addItem(hit.identifier)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] text-accent-fg disabled:opacity-40"
                  >
                    {adding === hit.identifier ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Play className="size-3" strokeWidth={2} />
                    )}
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={adding === hit.identifier}
                    onClick={() => void addItem(hit.identifier, false)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-raised px-2.5 text-[11px] text-fg disabled:opacity-40"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                    Add
                  </button>
                  <a
                    href={archivePage(hit.identifier)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center rounded-full px-2.5 text-[11px] text-muted hover:text-fg"
                  >
                    Source
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {inLib.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In your library</p>
          <button
            type="button"
            onClick={() => playIds(inLib.map((t) => t.id))}
            className="h-9 rounded-full bg-raised px-3 text-xs"
          >
            Play {inLib.length} Archive tracks
          </button>
        </div>
      ) : null}
    </section>
  );
}