import { useState } from "react";
import { FileAudio, Globe, Search } from "lucide-react";
import type { FoundAudio } from "@/lib/player/find-audio";
import { findAudioSearch, scanAudioPage } from "@/lib/player/find-audio-api";
import { usePlayer } from "@/lib/player/store";

export function FindAudioPanel() {
  const importFound = usePlayer((s) => s.importFoundAudio);
  const importArchive = usePlayer((s) => s.importArchive);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("");
  const [hits, setHits] = useState<FoundAudio[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addHit = async (hit: FoundAudio) => {
    setBusy(true);
    setMessage(null);
    try {
      if (hit.id.startsWith("ia:")) {
        const n = await importArchive(hit.id.slice(3), /flac|wav/i.test(hit.format), false);
        setMessage(n ? `Added ${n} Archive tracks.` : "Already in your library.");
      } else {
        const n = await importFound([hit]);
        setMessage(n ? `Added ${hit.name}.` : "Already in your library.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <FileAudio className="size-5" strokeWidth={1.75} />
        Find files
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Search public catalogs for FLAC, MP3, and WAV, or paste a page / direct file link. Sondergram looks on
        Internet Archive and Jamendo (Creative Commons), then reads audio links you provide. It will not scrape
        random pirate sites.
      </p>

      <form
        className="max-w-xl rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setMessage(null);
            try {
              const { hits: next } = await findAudioSearch({ data: { q: query.trim() } });
              setHits(next);
              setMessage(next.length ? `Found ${next.length} matches.` : "No public files matched.");
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Search failed.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-subtle">
          <Search className="size-3.5" strokeWidth={1.75} />
          Search albums and songs
        </p>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
            value={query}
            placeholder="Artist, album, or song"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={busy || !query.trim()} className="h-10 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40">
            {busy ? "…" : "Scan"}
          </button>
        </div>
      </form>

      <form
        className="max-w-xl rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setMessage(null);
            try {
              const { hits: next } = await scanAudioPage({ data: { url: page.trim() } });
              setHits(next);
              setMessage(`Found ${next.length} audio files on that page.`);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "That page had no audio files.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-subtle">
          <Globe className="size-3.5" strokeWidth={1.75} />
          Paste a page or file URL
        </p>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
            value={page}
            placeholder="https://…/album.flac or a page with MP3 links"
            onChange={(e) => setPage(e.target.value)}
          />
          <button type="submit" disabled={busy || !page.trim()} className="h-10 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40">
            Open
          </button>
        </div>
      </form>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {hits.length > 0 ? (
        <ul className="max-w-xl divide-y divide-border">
          {hits.map((hit) => (
            <li key={hit.id} className="flex items-center gap-3 py-2">
              <div className="size-12 overflow-hidden rounded-md bg-raised">
                {hit.cover ? <img src={hit.cover} alt="" className="size-full object-cover" /> : null}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{hit.name}</span>
                <span className="block truncate text-xs text-muted">
                  {hit.artist}
                  {hit.album ? ` · ${hit.album}` : ""}
                  {` · ${hit.format}`}
                  {` · ${hit.source}`}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addHit(hit)}
                className="h-8 rounded-full bg-raised px-3 text-xs disabled:opacity-40"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
