import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { streamSearch } from "@/lib/player/stream-search-api";
import type { StreamHit } from "@/lib/player/stream-search";
import { usePlayer } from "@/lib/player/store";
import { loadSlskSession } from "@/lib/player/soulseek";
import { IbroadcastPanel } from "./ibroadcast-panel";
import { SoulseekPanel } from "./soulseek-panel";
import { cn } from "@/lib/utils";

type OnlineTab = "youtube-music" | "soundcloud" | "soulseek" | "ibroadcast";

export function SearchPage({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const playRest = usePlayer((s) => s.playRest);
  const importStreamHits = usePlayer((s) => s.importStreamHits);
  const flash = usePlayer((s) => s.flash);
  const [tab, setTab] = useState<OnlineTab>("youtube-music");
  const [q, setQ] = useState(query || "");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [ytWarn, setYtWarn] = useState(true);
  const [selected, setSelected] = useState<StreamHit | null>(null);
  const slsk = loadSlskSession();

  useEffect(() => {
    setQ(query || "");
  }, [query]);

  const libraryHits = useMemo(() => {
    const term = (q || "").trim().toLowerCase();
    if (!term) return [];
    return tracks
      .filter((t) =>
        [t.name, t.artist, t.album, t.genre, ...(t.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 40);
  }, [tracks, q]);

  useEffect(() => {
    const query = (q || "").trim();
    if (!query) {
      setHits([]);
      setBusy(false);
      return;
    }
    if (tab === "ibroadcast") {
      setHits([]);
      setBusy(false);
      return;
    }
    if (tab === "soulseek") {
      setHits([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const sources =
      tab === "youtube-music" ? (["YouTube Music"] as const) : tab === "soundcloud" ? (["Audius"] as const) : undefined;
    void streamSearch({ data: { q: query.trim(), sources: sources as any } })
      .then((res) => {
        if (cancelled) return;
        let list = Array.isArray(res) ? res : (res as any)?.hits || [];
        if (tab === "youtube-music") {
          list = list.filter((h: StreamHit) => h.youtubeId || h.source === "YouTube Music" || h.source === "YouTube");
        }
        setHits(list);
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, tab]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-3xl font-semibold tracking-tight">Search</h2>
        <p className="mt-1 text-xs text-subtle">Library + online sources</p>
      </div>

      <label className="relative mb-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onQuery(e.target.value);
          }}
          placeholder="Search songs, artists, albums…"
          className="h-11 w-full rounded-full bg-raised pl-10 pr-4 text-sm outline-none ring-1 ring-border focus:ring-accent"
        />
      </label>

      <div className="mb-3 flex gap-1 overflow-x-auto">
        {(
          [
            ["youtube-music", "YouTube Music"],
            ["soundcloud", "SoundCloud"],
            ["soulseek", "Soulseek"],
            ["ibroadcast", "iBroadcast"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-xs transition-colors sm:text-sm",
              tab === id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {ytWarn && tab === "youtube-music" ? (
        <div className="mb-3 rounded-xl bg-raised px-3 py-2 text-xs text-muted">
          <strong className="font-semibold">Downloads use yt-dlp.</strong> Only download what you own or are allowed to
          save; copyright rules depend on where you are and the source.{" "}
          <button type="button" className="underline" onClick={() => setYtWarn(false)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {libraryHits.length ? (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">In your library</h3>
          <div className="divide-y divide-border">
            {libraryHits.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => playRest(t.id)}
                className="flex w-full items-center gap-3 py-2 text-left hover:opacity-90"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{t.artist}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "soulseek" && !slsk?.user ? (
          <p className="text-sm text-muted">Sign in to Soulseek in the sidebar to search the network.</p>
        ) : null}

        {tab === "soulseek" ? <SoulseekPanel /> : null}

        {tab === "ibroadcast" ? (
          <div className="mt-2">
            <IbroadcastPanel />
          </div>
        ) : null}

        {tab !== "soulseek" && tab !== "ibroadcast" ? (
          <>
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <LoaderCircle className="size-4 animate-spin" />
                Searching {tab === "youtube-music" ? "YouTube Music" : "SoundCloud"}…
              </p>
            ) : null}
            {!busy && hits.length === 0 && q.trim() ? (
              <p className="text-sm text-muted">No results.</p>
            ) : null}
            <div className="divide-y divide-border">
              {hits.map((h, i) => (
                <div key={`${h.source}-${h.name}-${i}`} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelected(h)}
                  >
                    <span className="block truncate text-sm">{h.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {h.artist} · {h.source}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg"
                    onClick={() => {
                      void importStreamHits([h], true)
                        .then(() => flash("Playing from search"))
                        .catch(() => flash("Could not add that track"));
                    }}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-full bg-raised px-3 text-xs"
                    onClick={() => {
                      void importStreamHits([h], false)
                        .then(() => flash("Added to library"))
                        .catch(() => flash("Could not add that track"));
                    }}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {!q.trim() && tab !== "ibroadcast" && tab !== "soulseek" ? (
          <p className="mt-8 text-sm text-muted">
            Search your library, YouTube Music, SoundCloud, Soulseek, or iBroadcast. Paste a Bandcamp or Archive link to
            add it.
          </p>
        ) : null}
      </div>

      {selected ? (
        <p className="mt-2 text-xs text-subtle">
          {"source" in selected ? `Playing from search · ${selected.source}` : "In library"}
        </p>
      ) : null}
    </section>
  );
}
