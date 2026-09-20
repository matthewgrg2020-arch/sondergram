import { useState } from "react";
import { AudioLines, LogOut } from "lucide-react";
import { loadAmSession, saveAmSession, type AmSession } from "@/lib/player/amazon";
import { usePlayer } from "@/lib/player/store";
import { StreamCatalog } from "./stream-catalog";

export function AmazonPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importAmazon = usePlayer((s) => s.importAmazon);
  const importAmazonArl = usePlayer((s) => s.importAmazonArl);
  const [session, setSession] = useState<AmSession | null>(() => loadAmSession());
  const [paste, setPaste] = useState("");
  const [arl, setArl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const amTracks = tracks.filter((t) => t.amazonId);

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <AudioLines className="size-5" strokeWidth={1.75} />
        Amazon Music
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Paste an Amazon Music album, artist, or playlist link — or search below. Results add to your library
        with cover and metadata. Playback uses public previews unless you own the files.
      </p>

      <form
        className="max-w-xl rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setMessage(null);
            try {
              const n = await importAmazon(paste.trim(), session?.arl);
              setMessage(n ? `Added ${n} tracks.` : "Those titles are already in Sondergram.");
              setPaste("");
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Amazon import failed.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Paste a link or search</p>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
            value={paste}
            placeholder="music.amazon.com/albums/…"
            onChange={(e) => setPaste(e.target.value)}
          />
          <button type="submit" disabled={busy || !paste.trim()} className="h-10 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40">
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </form>

      <div className="max-w-xl space-y-3 rounded-xl bg-surface p-4">
        <p className="text-xs uppercase tracking-widest text-subtle">ARL cookie</p>
        {session ? (
          <p className="text-sm">
            Saved for <span className="font-medium">{session.name}</span>
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            While signed into Amazon Music in a browser, copy the <span className="font-mono">at-acbus</span> or{" "}
            <span className="font-mono">at-main</span> cookie and paste it here. It stays on this device.
          </p>
        )}
        <input
          className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
          value={arl}
          placeholder="Paste ARL or cookie"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setArl(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || arl.trim().length < 12}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setMessage(null);
                try {
                  const n = await importAmazonArl(arl.trim());
                  setSession(loadAmSession());
                  setArl("");
                  setMessage(n ? `Imported ${n} tracks from Amazon.` : "Those albums are already here.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "ARL import failed.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="h-9 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
          >
            Save ARL and import
          </button>
          {session ? (
            <button
              type="button"
              onClick={() => {
                saveAmSession(null);
                setSession(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:text-fg"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Forget ARL
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {amTracks.length > 0 ? (
        <p className="text-xs text-subtle">{amTracks.length} Amazon titles in Sondergram</p>
      ) : null}

      <AmazonSearch />
    </section>
  );
}

function AmazonSearch() {
  const [q, setQ] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-subtle">Search Amazon Music</p>
      <input
        className="h-11 w-full max-w-xl rounded-lg bg-raised px-3 text-sm outline-none"
        value={q}
        placeholder="Artist, album, or song"
        onChange={(e) => setQ(e.target.value)}
      />
      <StreamCatalog query={q} locked="Amazon" />
    </div>
  );
}
