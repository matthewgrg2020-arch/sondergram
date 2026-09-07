import { useEffect, useState } from "react";
import { usePlayer, type Track } from "@/lib/player/store";
import { ArtUploader } from "./art-uploader";
import { TagEditor } from "./tag-editor";

export function Field({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">{label}</span>
      <input
        className="h-11 w-full rounded-md bg-raised px-3 text-sm text-fg outline-none ring-1 ring-border transition-[box-shadow] duration-150 placeholder:text-subtle focus:ring-border-strong"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export function MetadataPanel({ track }: { track?: Track }) {
  const updateMeta = usePlayer((s) => s.updateMeta);
  const setCover = usePlayer((s) => s.setCover);

  if (!track) {
    return (
      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-lg tracking-tight">Song</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Title, artist, album, year, tags, and artwork can be edited here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg tracking-tight">Song</h2>
        <span className="text-xs uppercase tracking-widest text-subtle">Editable</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <ArtUploader
          src={track.coverUrl}
          label="Artwork"
          onFile={(file) => setCover([track.id], file)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Title"
            value={track.name}
            placeholder="Song title"
            onSave={(name) => updateMeta(track.id, { name })}
          />
          <Field
            label="Artist"
            value={track.artist}
            placeholder="Artist name"
            onSave={(artist) => updateMeta(track.id, { artist })}
          />
          <Field
            label="Album"
            value={track.album}
            placeholder="Album title"
            onSave={(album) => updateMeta(track.id, { album })}
          />
          <Field
            label="Year"
            value={track.year}
            placeholder="1998"
            onSave={(year) => updateMeta(track.id, { year })}
          />
        </div>
        <div className="sm:col-span-2">
          <TagEditor tags={track.tags} onChange={(tags) => updateMeta(track.id, { tags })} />
        </div>
      </div>
    </section>
  );
}