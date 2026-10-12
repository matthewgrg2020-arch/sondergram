import { useState } from "react";
import { Youtube } from "lucide-react";
import { usePlayer } from "@/lib/player/store";

export function YoutubeForm() {
  const importYoutube = usePlayer((s) => s.importYoutube);
  const addYoutube = usePlayer((s) => (s as { addYoutube?: (input: string) => Promise<boolean> }).addYoutube);
  const flash = usePlayer((s) => s.flash);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const input = value.trim();
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      if (addYoutube) {
        const ok = await addYoutube(input);
        if (!ok) {
          setError("Need a YouTube Music or YouTube link (music.youtube.com, youtu.be, or watch URL).");
          return;
        }
      } else if (importYoutube) {
        const n = await importYoutube(input);
        if (!n) {
          setError("Could not import that YouTube Music link.");
          return;
        }
      } else {
        setError("YouTube Music import is not available in this build.");
        return;
      }
      setValue("");
      flash?.("Added from YouTube Music — plays through the EQ engine when a stream is available.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-subtle">
        <Youtube className="size-3.5" strokeWidth={1.75} />
        YouTube Music
      </p>
      <div className="flex gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-fg outline-none ring-0 placeholder:text-subtle"
          value={value}
          placeholder="Paste a YouTube Music or YouTube link"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="YouTube Music link"
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
        >
          {busy ? "…" : "Add"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-muted">{error}</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Adds the track and plays audio through Sondergram’s engine (EQ, spatial, remaster) when a stream URL is available.
        The old YouTube video embed player has been removed.
      </p>
    </form>
  );
}
