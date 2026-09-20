import { useRef, useState } from "react";
import { FolderDown, FolderUp, Share2, Smartphone, Trash2, X } from "lucide-react";
import {
  canShareLibraryFile,
  downloadLibraryFile,
  formatPackSize,
  packLibraryBackup,
  shareLibraryFile,
  type LibraryPack,
} from "@/lib/player/backup";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";

function iosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function PackSheet({
  pack,
  busy,
  onShare,
  onSave,
  onClose,
}: {
  pack: LibraryPack;
  busy: "share" | "save" | null;
  onShare: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const share = canShareLibraryFile();
  const phone = iosDevice();
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 pb-28 sm:items-center sm:pb-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface text-fg shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <p className="text-sm font-semibold">Library pack is ready</p>
            <p className="mt-1 text-xs text-muted">
              {pack.tracks} {pack.tracks === 1 ? "song" : "songs"}
              {pack.albums ? ` · ${pack.albums} albums` : ""}
              {pack.playlists ? ` · ${pack.playlists} playlists` : ""}
              {` · ${formatPackSize(pack.bytes)}`}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-raised">
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <p className="px-4 pt-3 text-sm leading-relaxed text-muted">
          {phone
            ? "Share it to Files, AirDrop, or Messages. On the other device open Sondergram and restore this zip."
            : "Save the zip, then open Sondergram on your iPhone or other computer and restore it from Settings."}
        </p>
        <div className="flex flex-col gap-2 p-4">
          {share ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={onShare}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
            >
              <Share2 className="size-4" strokeWidth={1.75} />
              {busy === "share" ? "Opening share…" : phone ? "Share to Files / AirDrop" : "Share"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={onSave}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-40",
              share ? "bg-raised text-fg" : "bg-hot text-hot-fg",
            )}
          >
            <FolderDown className="size-4" strokeWidth={1.75} />
            {busy === "save" ? "Saving…" : "Save zip"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useLibraryTransfer() {
  const tracks = usePlayer((s) => s.tracks);
  const playlists = usePlayer((s) => s.playlists);
  const importLibrary = usePlayer((s) => s.importLibrary);
  const flash = usePlayer((s) => s.flash);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"pack" | "import" | "share" | "save" | null>(null);
  const [pack, setPack] = useState<LibraryPack | null>(null);

  const prepare = async () => {
    setBusy("pack");
    try {
      const next = await packLibraryBackup();
      setPack(next);
    } catch {
      flash("Couldn’t pack the library. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!pack) return;
    setBusy("share");
    try {
      await shareLibraryFile(pack);
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") flash("Share was cancelled or isn’t available. Save the zip instead.");
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    if (!pack) return;
    setBusy("save");
    try {
      downloadLibraryFile(pack);
      flash(iosDevice() ? "Saved. Check Files or Downloads." : `Saved ${pack.name}`);
    } finally {
      setBusy(null);
    }
  };

  const restore = (file: File) => {
    setBusy("import");
    void importLibrary(file).finally(() => setBusy(null));
  };

  const sheet = pack ? (
    <PackSheet pack={pack} busy={busy === "share" || busy === "save" ? busy : null} onShare={() => void share()} onSave={save} onClose={() => setPack(null)} />
  ) : null;

  return { tracks, playlists, busy, inputRef, prepare, restore, sheet };
}

export function LibraryTransfer({ compact }: { compact?: boolean }) {
  const { tracks, playlists, busy, inputRef, prepare, restore, sheet } = useLibraryTransfer();
  const albums = new Set(tracks.map((t) => `${(t.albumArtist || t.artist).toLowerCase()}::${t.album.toLowerCase()}`)).size;

  if (compact) {
    return (
      <>
        <button
          type="button"
          disabled={busy !== null || tracks.length === 0}
          onClick={() => void prepare()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-fg hover:bg-accent hover:text-accent-fg disabled:opacity-40"
        >
          <FolderDown className="size-4" strokeWidth={1.75} />
          {busy === "pack" ? "Packing…" : "Export"}
        </button>
        {sheet}
      </>
    );
  }

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Move library</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Songs live on this device, not in the cloud. Pack a zip, then AirDrop it, save it to Files, or send it to your
        computer. Open Sondergram there and restore the zip.
      </p>
      <ol className="mt-3 space-y-1.5 text-sm text-muted">
        <li>1. Prepare the library pack.</li>
        <li>2. Share to Files / AirDrop, or save the zip.</li>
        <li>3. On the other device, restore that zip.</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || tracks.length === 0}
          onClick={() => void prepare()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
        >
          <Smartphone className="size-4" strokeWidth={1.75} />
          {busy === "pack" ? "Packing…" : "Prepare library"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-raised px-4 text-sm disabled:opacity-40"
        >
          <FolderUp className="size-4" strokeWidth={1.75} />
          {busy === "import" ? "Restoring…" : "Restore zip"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) restore(file);
          }}
        />
      </div>
      <p className="mt-3 text-xs text-subtle">
        {tracks.length} {tracks.length === 1 ? "song" : "songs"}
        {albums ? ` · ${albums} albums` : ""}
        {playlists.length ? ` · ${playlists.length} playlists` : ""} on this device
      </p>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Titles, artwork, likes, and playlists come along. Streaming plays the same way it does here. Soulseek still
        needs your Soulseek login on the new device.
      </p>
      {sheet}
    </section>
  );
}

export function LibraryBackup() {
  return <LibraryTransfer />;
}

export function LibraryClear() {
  const tracks = usePlayer((s) => s.tracks);
  const clearLibrary = usePlayer((s) => s.clearLibrary);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (tracks.length === 0) return null;
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Remove music</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Wipe every song, cover, and playlist on this device. Export a pack first if you want a copy.
      </p>
      {ask ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void clearLibrary().finally(() => {
                setBusy(false);
                setAsk(false);
              });
            }}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {busy ? "Removing…" : `Remove ${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk(false)}
            className="inline-flex h-11 items-center rounded-lg bg-raised px-4 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsk(true)}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-raised px-4 text-sm text-hot"
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
          Remove all music
        </button>
      )}
    </section>
  );
}
