import { ImagePlus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { proxyCoverUrl, searchCovers, type CoverHit, type CoverSource } from "@/lib/player/covers";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";
import { RemoveAlbumButton } from "./album-tile";

const SOURCES: { id: CoverSource; label: string }[] = [
  { id: "all", label: "All" },
  { id: "google", label: "Google" },
  { id: "picard", label: "Picard" },
  { id: "catalog", label: "Catalog" },
];

function busyCopy(source: CoverSource) {
  if (source === "google") return "Searching Google, Bing, DuckDuckGo…";
  if (source === "picard") return "Searching MusicBrainz Picard…";
  if (source === "catalog") return "Searching iTunes, Deezer, AudioDB, Wikipedia…";
  return "Searching Google, MusicBrainz Picard, iTunes, Deezer…";
}

function CoverThumb({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={cn("flex size-full items-center justify-center bg-raised text-subtle", className)} />;
  }
  return (
    <img
      src={proxyCoverUrl(src)}
      alt=""
      className={cn("size-full object-cover", className)}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function ArtworkPanel({
  src,
  artist,
  album,
  trackIds,
  onFile,
  onRemoveAlbum,
}: {
  src: string | null;
  artist: string;
  album: string;
  trackIds: string[];
  onFile: (file: File) => void;
  onRemoveAlbum?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setCoverUrl = usePlayer((s) => s.setCoverUrl);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CoverHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [source, setSource] = useState<CoverSource>("all");
  const gen = useRef(0);

  useEffect(() => {
    setQuery([artist, album].filter((part) => part && !/^unknown/i.test(part)).join(" "));
  }, [artist, album]);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const runSearch = async (term?: string, nextSource: CoverSource = source) => {
    const mine = ++gen.current;
    setBusy(true);
    const parts = (term ?? query).trim();
    const fallback = [artist, album].filter((part) => part && !/^unknown/i.test(part)).join(" ");
    const used = parts || fallback;
    const dash = used.split(/\s+[–—-]\s+/);
    let next: CoverHit[] = [];
    if (!parts || parts === fallback) {
      next = await searchCovers(artist, album, nextSource);
    } else if (dash.length >= 2) {
      next = await searchCovers(dash[0], dash.slice(1).join(" - "), nextSource);
    } else {
      const bits = used.split(/\s+/).filter(Boolean);
      if (bits.length >= 2) {
        next = await searchCovers(bits[0], bits.slice(1).join(" "), nextSource);
        if (next.length === 0) next = await searchCovers("", used, nextSource);
      } else {
        next = await searchCovers("", used, nextSource);
      }
    }
    if (mine !== gen.current) return;
    setHits(next);
    setBusy(false);
  };

  const pick = async (hit: CoverHit) => {
    setSaving(hit.url);
    const ok = await setCoverUrl(trackIds, hit.url);
    setSaving(null);
    if (ok) setOpen(false);
  };

  const showArt = Boolean(src) && !broken;

  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Artwork</span>
      <div className="group/cover relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative aspect-square w-full overflow-hidden rounded-xl bg-raised shadow-[var(--shadow-border)]"
        >
          {showArt ? (
            <img
              src={proxyCoverUrl(src!)}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-2 text-subtle">
              <ImagePlus className="size-8" strokeWidth={1.75} />
              <span className="text-xs">Upload cover</span>
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-bg/80 py-1.5 text-center text-xs text-fg opacity-0 transition-opacity group-hover/cover:opacity-100">
            Upload
          </span>
        </button>
        {onRemoveAlbum ? <RemoveAlbumButton title={album} onRemove={onRemoveAlbum} /> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (hits.length === 0) void runSearch();
        }}
        className="mt-2 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-raised text-sm text-fg hover:bg-accent hover:text-accent-fg"
      >
        <Search className="size-4" strokeWidth={1.75} />
        Find covers
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-semibold">Album covers</p>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full bg-raised">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <form
              className="flex gap-2 px-4 pb-3"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <input
                className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm outline-none"
                value={query}
                placeholder="Artist and album"
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="h-11 rounded-full bg-accent px-4 text-sm text-accent-fg">
                Search
              </button>
            </form>
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
              {SOURCES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSource(row.id);
                    void runSearch(undefined, row.id);
                  }}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
                    source === row.id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {busy ? <p className="py-8 text-center text-sm text-muted">{busyCopy(source)}</p> : null}
              {!busy && hits.length === 0 ? <p className="py-8 text-center text-sm text-muted">No covers found. Try Google, Picard, or another search.</p> : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {hits.map((hit) => (
                  <button
                    key={hit.url}
                    type="button"
                    disabled={saving === hit.url}
                    onClick={() => void pick(hit)}
                    className={cn("text-left", saving === hit.url && "opacity-60")}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-raised">
                      <CoverThumb src={hit.thumb || hit.url} />
                      {saving === hit.url ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-bg/70 text-xs font-medium">
                          Saving…
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium">{hit.label}</p>
                    <p className="truncate text-[10px] uppercase tracking-wide text-subtle">{hit.source}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
