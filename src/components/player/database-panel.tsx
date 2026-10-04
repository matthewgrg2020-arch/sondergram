import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { searchMusicDatabase, type CatalogHit } from "@/lib/player/catalog-api";

export function DatabasePanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      const rows = await searchMusicDatabase({ data: { query: q } });
      setHits(rows);
      setNote(rows.length ? null : "No dbPoweramp, Discogs, or AcoustID matches.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not search the music database.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <h2 className="text-3xl font-semibold tracking-tight">Music database</h2>
      <p className="mt-1 text-sm text-muted">Discover a release with dbPoweramp's sources (MusicBrainz and Discogs), then open a link for where to find it.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artist or album" className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm" />
        <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
          <Search className="size-4" />{busy ? "Searching…" : "Search"}
        </button>
      </form>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      <div className="mt-4 space-y-3">
        {hits.map((hit) => (
          <article key={`${hit.source}-${hit.artist}-${hit.title}-${hit.year}`} className="flex gap-3 rounded-2xl bg-surface p-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raised">{hit.artwork ? <img src={hit.artwork} alt="" className="size-full object-cover" /> : null}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{hit.title}</p>
              <p className="truncate text-xs text-muted">{[hit.artist, hit.year, hit.source].filter(Boolean).join(" · ")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hit.links.map((link) => (
                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs">
                    {link.label}<ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
