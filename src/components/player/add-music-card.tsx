import { Archive, AudioLines, Cloud, Disc3, FileAudio, Plus, Search, Share2, Star, Youtube } from "lucide-react";
import { useState } from "react";
import { parseArchiveId } from "@/lib/player/archive";
import { parseBandcampUrl } from "@/lib/player/bandcamp";
import { usePlayer } from "@/lib/player/store";
import { AUDIO_ACCEPT } from "@/lib/player/format";
import type { AppView } from "./sidebar";

const SOURCES: { id: AppView; label: string; hint: string; icon: typeof Youtube }[] = [
  { id: "archive", label: "Internet Archive", hint: "Paste a details link", icon: Archive },
  { id: "bandcamp", label: "Bandcamp", hint: "Album or artist link", icon: Disc3 },
  { id: "rym", label: "RateYourMusic", hint: "Charts, genres, find on Bandcamp", icon: Star },
  { id: "youtube", label: "YouTube", hint: "Watch or queue a video", icon: Youtube },
  { id: "find", label: "Find files", hint: "FLAC, MP3, WAV", icon: FileAudio },
  { id: "deezer", label: "Deezer", hint: "ARL or catalog", icon: AudioLines },
  { id: "spotify", label: "Spotify", hint: "Search catalog or import", icon: AudioLines },
  { id: "search", label: "Search catalogs", hint: "Amazon, Apple, Deezer…", icon: Search },
  { id: "amazon", label: "Amazon Music", hint: "Link or ARL", icon: AudioLines },
  { id: "ibroadcast", label: "iBroadcast", hint: "Cloud locker", icon: Cloud },
  { id: "soulseek", label: "Soulseek", hint: "Search and add album folders", icon: Share2 },
];

export function AddMusicCard({ onView }: { onView?: (view: AppView) => void }) {
  const addFiles = usePlayer((s) => s.addFiles);
  const importArchive = usePlayer((s) => s.importArchive);
  const importBandcamp = usePlayer((s) => s.importBandcamp);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const archiveId = parseArchiveId(link);
  const bandcampUrl = parseBandcampUrl(link);
  const ready = Boolean(archiveId || bandcampUrl);

  return (
    <section className="rounded-xl bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Plus className="size-4" strokeWidth={1.75} />
        Add music
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Drop files, paste a link, or search Amazon, Apple Music, Deezer, Spotify, Bandcamp, RateYourMusic and more.
      </p>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (bandcampUrl) {
            setBusy(true);
            setMessage(null);
            void importBandcamp(bandcampUrl, true)
              .then((n) => {
                setMessage(n ? `Added ${n} Bandcamp tracks.` : "Already in your library.");
                setLink("");
              })
              .catch((err) => setMessage(err instanceof Error ? err.message : "Could not add that link."))
              .finally(() => setBusy(false));
            return;
          }
          const id = parseArchiveId(link);
          if (!id) {
            setMessage("Paste a Bandcamp or archive.org/details/… link.");
            return;
          }
          setBusy(true);
          setMessage(null);
          void importArchive(id, true, true)
            .then((n) => {
              setMessage(n ? `Added ${n} tracks.` : "Already in your library.");
              setLink("");
            })
            .catch((err) => setMessage(err instanceof Error ? err.message : "Could not add that link."))
            .finally(() => setBusy(false));
        }}
      >
        <p className="text-xs uppercase tracking-widest text-subtle">Bandcamp or Archive link</p>
        <div className="flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
            value={link}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="bandcamp.com/album/… or archive.org/details/…"
            onChange={(e) => setLink(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !ready}
            className="h-11 shrink-0 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </form>

      <label className="relative mt-3 inline-flex h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
        Add files
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {SOURCES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView?.(item.id)}
              className="flex items-start gap-2 rounded-xl bg-raised px-3 py-3 text-left active:bg-white/10"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-subtle">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
