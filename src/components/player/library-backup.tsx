import { useRef, useState } from "react";
import { FolderDown, FolderUp } from "lucide-react";
import { usePlayer } from "@/lib/player/store";

export function LibraryBackup() {
  const tracks = usePlayer((s) => s.tracks);
  const exportLibrary = usePlayer((s) => s.exportLibrary);
  const importLibrary = usePlayer((s) => s.importLibrary);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-xs uppercase tracking-[0.18em] text-subtle">Library backup</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Songs live in this browser, not on the website. Use Export to download a zip, then Restore it on another
        browser, phone, or after you republish.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || tracks.length === 0}
          onClick={() => {
            setBusy("export");
            void exportLibrary().finally(() => setBusy(null));
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
        >
          <FolderDown className="size-4" strokeWidth={1.75} />
          {busy === "export" ? "Saving…" : "Export library"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-raised px-4 text-sm disabled:opacity-40"
        >
          <FolderUp className="size-4" strokeWidth={1.75} />
          {busy === "import" ? "Restoring…" : "Restore zip"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy("import");
            void importLibrary(file).finally(() => setBusy(null));
          }}
        />
      </div>
      <p className="mt-3 text-xs text-subtle">{tracks.length} tracks on this device</p>
    </section>
  );
}