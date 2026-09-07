import { useState } from "react";
import { Youtube } from "lucide-react";
import { usePlayer } from "@/lib/player/store";

export function YoutubeForm() {
  const addYoutube = usePlayer((s) => s.addYoutube);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const input = value.trim();
    if (!input) return;
    setBusy(true);
    setError(null);
    const ok = await addYoutube(input);
    setBusy(false);
    if (!ok) {
      setError("Need a YouTube watch, youtu.be, Shorts, or Music link.");
      return;
    }
    setValue("");
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
        YouTube
      </p>
      <div className="flex gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-fg outline-none ring-0 placeholder:text-subtle"
          value={value}
          placeholder="Paste a YouTube link"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="YouTube link"
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
        Plays in the official YouTube player from any tab. If something is already playing, the link is queued instead of skipping.
      </p>
    </form>
  );
}
