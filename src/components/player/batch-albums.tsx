import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Play, Trash2, X } from "lucide-react";
import type { AlbumGroup } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";
import { ArtUploader } from "./art-uploader";
import { TagEditor } from "./tag-editor";

function EditorField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">{label}</span>
      <input
        className="h-11 w-full rounded-md bg-raised px-3 text-sm text-fg outline-none ring-1 ring-border placeholder:text-subtle focus:ring-border-strong"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function sharedValue(values: string[]) {
  if (values.length === 0) return "";
  const first = values[0] ?? "";
  return values.every((value) => value === first) ? first : "";
}

const GENRES = ["Pop", "Hip-Hop", "R&B", "Rock", "Jazz", "Soul", "Electronic", "Metal", "Folk", "Country", "Punk", "Indie", "Funk", "Blues"];

export function BatchAlbumBar({
  count,
  onEdit,
  onPlay,
  onRemove,
  onClear,
}: {
  count: number;
  onEdit: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky bottom-2 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface/95 p-2 shadow-lg ring-1 ring-border backdrop-blur">
      <p className="px-2 text-sm font-medium">
        {count} {count === 1 ? "album" : "albums"}
      </p>
      <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-hot px-3 text-sm font-semibold text-hot-fg">
        <Pencil className="size-3.5" strokeWidth={1.75} />
        Edit
      </button>
      <button type="button" onClick={onPlay} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-raised px-3 text-sm">
        <Play className="size-3.5" strokeWidth={2} fill="currentColor" />
        Play
      </button>
      <button type="button" onClick={onRemove} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-raised px-3 text-sm text-hot">
        <Trash2 className="size-3.5" strokeWidth={1.75} />
        Remove
      </button>
      <button type="button" onClick={onClear} className="ml-auto inline-flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function BatchAlbumEditor({
  albums,
  onClose,
}: {
  albums: AlbumGroup[];
  onClose: () => void;
}) {
  const updateAlbumMeta = usePlayer((s) => s.updateAlbumMeta);
  const updateAlbumTags = usePlayer((s) => s.updateAlbumTags);
  const setCover = usePlayer((s) => s.setCover);
  const flash = usePlayer((s) => s.flash);
  const ids = useMemo(() => albums.flatMap((album) => album.trackIds), [albums]);
  const title0 = sharedValue(albums.map((a) => (a.title === "Unknown album" ? "" : a.title)));
  const artist0 = sharedValue(albums.map((a) => (a.artist === "Unknown artist" ? "" : a.artist)));
  const year0 = sharedValue(albums.map((a) => a.year));
  const genre0 = sharedValue(albums.map((a) => a.genre));
  const note0 = sharedValue(albums.map((a) => a.note));
  const tags0 = useMemo(() => {
    const first = albums[0]?.tags ?? [];
    const same = albums.every((album) => album.tags.length === first.length && album.tags.every((tag, i) => tag === first[i]));
    return same ? first : [];
  }, [albums]);
  const mixedTags = albums.some((album) => album.tags.join("|") !== (albums[0]?.tags ?? []).join("|"));
  const cover0 = albums.find((a) => a.coverUrl)?.coverUrl ?? null;
  const mixedCover = albums.some((a) => a.coverUrl !== albums[0]?.coverUrl);

  const [title, setTitle] = useState(title0);
  const [albumArtist, setAlbumArtist] = useState(artist0);
  const [trackArtist, setTrackArtist] = useState("");
  const [year, setYear] = useState(year0);
  const [genre, setGenre] = useState(genre0);
  const [note, setNote] = useState(note0);
  const [tags, setTags] = useState(tags0);
  const [cover, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(mixedCover ? null : cover0);

  useEffect(() => {
    if (!cover) return;
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const apply = () => {
    const patch: {
      album?: string;
      albumArtist?: string;
      artist?: string;
      year?: string;
      genre?: string;
      albumNote?: string;
    } = {};
    if (title.trim() && title.trim() !== title0) patch.album = title.trim();
    if (albumArtist.trim() && albumArtist.trim() !== artist0) patch.albumArtist = albumArtist.trim();
    if (trackArtist.trim()) patch.artist = trackArtist.trim();
    if (year.trim() !== year0) patch.year = year.trim();
    if (genre.trim() !== genre0) patch.genre = genre.trim();
    if (note !== note0) patch.albumNote = note;
    if (Object.keys(patch).length) updateAlbumMeta(ids, patch);
    const tagsChanged = tags.join("|") !== tags0.join("|");
    if (tagsChanged && (!mixedTags || tags.length > 0)) updateAlbumTags(ids, tags);
    if (cover) setCover(ids, cover);
    flash(`Updated ${albums.length} ${albums.length === 1 ? "album" : "albums"}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-semibold">
            Edit {albums.length} {albums.length === 1 ? "album" : "albums"}
          </p>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-raised">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <p className="text-xs text-muted">Blank fields keep whatever is already on each album. Fill a field to write it on all selected albums.</p>
          <ArtUploader
            src={coverPreview}
            label="Cover"
            onFile={(file) => setCoverFile(file)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorField label="Album" value={title} placeholder={title0 || "Multiple values"} onChange={setTitle} />
            <EditorField label="Album artist" value={albumArtist} placeholder={artist0 || "Multiple values"} onChange={setAlbumArtist} />
            <EditorField label="Artist on tracks" value={trackArtist} placeholder="Leave blank to keep" onChange={setTrackArtist} />
            <EditorField label="Year" value={year} placeholder={year0 || "Multiple values"} onChange={setYear} />
            <EditorField label="Genre" value={genre} placeholder={genre0 || "Multiple values"} onChange={setGenre} />
            <EditorField label="Note" value={note} placeholder={note0 || "Album notes"} onChange={setNote} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((name) => {
              const on = genre.toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setGenre(on ? "" : name)}
                  className={cn("h-7 rounded-full px-2.5 text-[11px]", on ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg")}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <TagEditor tags={tags} onChange={setTags} placeholder={mixedTags ? "Replace tags on all" : "Add a tag"} />
        </div>
        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-lg bg-raised text-sm">
            Cancel
          </button>
          <button type="button" onClick={apply} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-hot text-sm font-semibold text-hot-fg">
            <Check className="size-4" strokeWidth={2} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
