import { ExternalLink, LoaderCircle, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { bcSearch } from "@/lib/player/bandcamp-api";
import type { BcHit } from "@/lib/player/bandcamp";
import {
  filterCurated,
  rymAlbumUrl,
  rymChartUrl,
  rymGenreChartUrl,
  rymSearchUrl,
  RYM_CURATED,
  RYM_DECADES,
  RYM_GENRES,
  type RymPick,
} from "@/lib/player/rym";
import { usePlayer } from "@/lib/player/store";

function openUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function RymPanel() {
  const importBandcamp = usePlayer((s) => s.importBandcamp);
  const tracks = usePlayer((s) => s.tracks);
  const playRest = usePlayer((s) => s.playRest);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [decade, setDecade] = useState<string | null>(null);
  const [bcHits, setBcHits] = useState<BcHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const picks = useMemo(() => {
    const base = genre ? filterCurated(genre) : RYM_CURATED;
    return base.length ? base : RYM_CURATED;
  }, [genre]);

  const inLibMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tracks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [query, tracks]);

  const findBandcamp = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setMessage(null);
    void bcSearch({ data: { q: text } })
      .then((result) => {
        setBcHits(result.hits);
        setMessage(
          result.hits.length
            ? `${result.hits.length} Bandcamp matches for “${text}”`
            : `No Bandcamp matches for “${text}”. Try opening RYM instead.`,
        );
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Bandcamp search failed."))
      .finally(() => setBusy(false));
  };

  const addBc = async (url: string) => {
    setAdding(url);
    setMessage(null);
    try {
      const n = await importBandcamp(url, true);
      setMessage(n ? `Added ${n} Bandcamp tracks.` : "Already in your library.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that release.");
    } finally {
      setAdding(null);
    }
  };

  const findPick = (pick: RymPick) => {
    findBandcamp(`${pick.artist} ${pick.album}`);
  };

  return (
    <section className="space-y-5 px-5 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Star className="size-5" strokeWidth={1.75} />
          RateYourMusic
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Discover charts and highly rated albums on RateYourMusic, then find them on Bandcamp or in your library.
          RYM does not stream audio and blocks automated chart fetches — chart links open on RYM.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openUrl(rymChartUrl({ type: "top", year: "all-time" }))}
          className="h-9 rounded-full bg-accent px-4 text-xs font-semibold text-accent-fg"
        >
          Top albums all-time
          <ExternalLink className="ml-1.5 inline size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => openUrl(rymChartUrl({ type: "top", year: "2024" }))}
          className="h-9 rounded-full bg-raised px-4 text-xs font-medium hover:bg-white/10"
        >
          Top 2024
        </button>
        <button
          type="button"
          onClick={() => openUrl(rymChartUrl({ type: "popular", year: "all-time" }))}
          className="h-9 rounded-full bg-raised px-4 text-xs font-medium hover:bg-white/10"
        >
          Most popular
        </button>
        <button
          type="button"
          onClick={() => openUrl(rymChartUrl({ type: "esoteric", year: "all-time" }))}
          className="h-9 rounded-full bg-raised px-4 text-xs font-medium hover:bg-white/10"
        >
          Esoteric
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Genres → open RYM chart</p>
        <div className="flex flex-wrap gap-1.5">
          {RYM_GENRES.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => {
                setGenre(g.slug);
                openUrl(rymGenreChartUrl(g.slug, decade || "all-time"));
              }}
              className={
                genre === g.slug
                  ? "h-8 rounded-full bg-hot px-3 text-xs font-medium text-hot-fg"
                  : "h-8 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
              }
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Decade charts</p>
        <div className="flex flex-wrap gap-1.5">
          {RYM_DECADES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDecade(d);
                openUrl(
                  genre
                    ? rymGenreChartUrl(genre, d)
                    : rymChartUrl({ type: "top", year: d }),
                );
              }}
              className={
                decade === d
                  ? "h-8 rounded-full bg-hot px-3 text-xs font-medium text-hot-fg"
                  : "h-8 rounded-full bg-raised px-3 text-xs text-fg hover:bg-accent hover:text-accent-fg"
              }
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (!q) return;
          openUrl(rymSearchUrl(q));
          findBandcamp(q);
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
          value={query}
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Search artist or album…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search RYM + Bandcamp
        </button>
      </form>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {inLibMatches.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In your library</p>
          <div className="divide-y divide-border rounded-xl bg-surface">
            {inLibMatches.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => playRest(t.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-raised"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.artist} · {t.album}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Starter picks{genre ? ` · ${genre.replace(/-/g, " ")}` : " · highly rated"}
          </p>
          <span className="text-[10px] text-subtle">Curated offline · open RYM for live charts</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {picks.map((pick) => (
            <article key={pick.path} className="rounded-xl bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pick.album}</p>
                  <p className="truncate text-xs text-muted">
                    {pick.artist} · {pick.year}
                    {pick.rating ? ` · ★ ${pick.rating}` : ""}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-subtle">{pick.genres.join(" · ")}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => openUrl(rymAlbumUrl(pick.path))}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-[11px] font-medium hover:bg-white/10"
                >
                  RYM
                  <ExternalLink className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => findPick(pick)}
                  className="h-8 rounded-full bg-accent px-3 text-[11px] font-medium text-accent-fg disabled:opacity-50"
                >
                  Find on Bandcamp
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {bcHits.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Bandcamp results</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bcHits.map((hit) => (
              <article key={hit.url} className="overflow-hidden rounded-xl bg-surface">
                <div className="aspect-square bg-raised">
                  {hit.cover ? (
                    <img src={hit.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{hit.title}</p>
                  <p className="truncate text-xs text-muted">{hit.artist}</p>
                  <button
                    type="button"
                    disabled={adding !== null}
                    onClick={() => void addBc(hit.url)}
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-full bg-accent text-xs font-medium text-accent-fg disabled:opacity-40"
                  >
                    {adding === hit.url ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    Add & play
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
