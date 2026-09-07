import { ImagePlus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchCovers, type CoverHit } from "@/lib/player/covers";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";

export function ArtworkPanel({
  src,
  artist,
  album,
  trackIds,
  onFile,
}: {
  src: string | null;
  artist: string;
  album: string;
  trackIds: string[];
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setCoverUrl = usePlayer((s) => s.setCoverUrl);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CoverHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setQuery([artist, album].filter((part) => part && !/^unknown/i.test(part)).join(" "));
  }, [artist, album]);

  const runSearch = async (term?: string) => {
    setBusy(true);
    const parts = (term ?? query).trim();
    const fallback = [artist, album].filter((part) => part && !/^unknown/i.test(part)).join(" ");
    const used = parts || fallback;
    const dash = used.split(/\s+[–—-]\s+/);
    let next: CoverHit[] = [];
    if (!parts || parts === fallback) {
      next = await searchCovers(artist, album);
    } else if (dash.length >= 2) {
      next = await searchCovers(dash[0], dash.slice(1).join(" - "));
    } else {
      next = await searchCovers("", used);
    }
    setHits(next);
    setBusy(false);
  };

  const pick = async (hit: CoverHit) => {
    setSaving(hit.url);
    await setCoverUrl(trackIds, hit.url);
    setSaving(null);
    setOpen(false);
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Artwork</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative aspect-square w-full overflow-hidden rounded-xl bg-raised shadow-[var(--shadow-border)]"
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-subtle">
            <ImagePlus className="size-8" strokeWidth={1.75} />
            <span className="text-xs">Upload cover</span>
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-bg/80 py-1.5 text-center text-xs text-fg opacity-0 transition-opacity group-hover:opacity-100">
          Upload
        </span>
      </button>
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
        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-raised text-sm text-fg hover:bg-accent hover:text-accent-fg"
      >
        <Search className="size-4" strokeWidth={1.75} />
        Find covers
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-semibold">Album covers</p>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-full bg-raised">
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
                className="h-10 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm outline-none"
                value={query}
                placeholder="Artist and album"
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="h-10 rounded-full bg-accent px-4 text-sm text-accent-fg">
                Search
              </button>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {busy ? <p className="py-8 text-center text-sm text-muted">Searching iTunes, Deezer, AudioDB, Cover Art Archive, Wikipedia…</p> : null}
              {!busy && hits.length === 0 ? <p className="py-8 text-center text-sm text-muted">No covers found. Try another search.</p> : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {hits.map((hit) => (
                  <button
                    key={hit.url}
                    type="button"
                    disabled={saving === hit.url}
                    onClick={() => void pick(hit)}
                    className={cn("text-left", saving === hit.url && "opacity-60")}
                  >
                    <div className="aspect-square overflow-hidden rounded-lg bg-raised">
                      <img src={hit.thumb || hit.url} alt="" className="size-full object-cover" />
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