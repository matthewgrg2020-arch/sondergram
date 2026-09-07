import { Cloud, Link2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { loadIbSession, parseSharePlaylist, saveIbSession, type IbPlaylist, type IbSession, type IbTrack } from "@/lib/player/ibroadcast";
import { ibLibrary, ibLogin } from "@/lib/player/ibroadcast-api";
import { usePlayer } from "@/lib/player/store";

export function IbroadcastPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const upNext = usePlayer((s) => s.upNext);
  const syncIbroadcast = usePlayer((s) => s.syncIbroadcast);
  const shareIbroadcast = usePlayer((s) => s.shareIbroadcast);
  const importIbPlaylist = usePlayer((s) => s.importIbPlaylist);
  const [session, setSession] = useState<IbSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [playlists, setPlaylists] = useState<IbPlaylist[]>([]);
  const [remote, setRemote] = useState<IbTrack[]>([]);

  useEffect(() => {
    setSession(loadIbSession());
  }, []);

  const ibTracks = tracks.filter((t) => t.ibroadcastId);
  const ibCount = ibTracks.length;

  const signIn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await ibLogin({ data: { email, password } });
      saveIbSession(next);
      setSession(next);
      setPassword("");
      const lib = await ibLibrary({ data: next });
      setPlaylists(lib.playlists);
      setRemote(lib.tracks);
      const added = await syncIbroadcast();
      setMessage(
        added
          ? `Synced ${added} tracks. They’re on Home and in Library.`
          : `Signed in. ${lib.total} tracks were already in Sondergram.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const current = loadIbSession();
      if (!current) throw new Error("Sign in first.");
      const lib = await ibLibrary({ data: current });
      setPlaylists(lib.playlists);
      setRemote(lib.tracks);
      const added = await syncIbroadcast();
      setMessage(added ? `Added ${added} tracks.` : "Library is already up to date.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const current = index >= 0 ? tracks[index] : undefined;
      const ids = current ? [current.id, ...upNext] : tracks.filter((t) => t.ibroadcastId).slice(0, 40).map((t) => t.id);
      const url = await shareIbroadcast("Sondergram mix", ids);
      setShareUrl(url);
      await navigator.clipboard?.writeText(url);
      setMessage("Share link copied.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not share.");
    } finally {
      setBusy(false);
    }
  };

  const openShare = () => {
    const id = parseSharePlaylist(paste);
    if (!id) {
      setMessage("Paste an iBroadcast playlist link.");
      return;
    }
    try {
      importIbPlaylist(id, playlists, remote);
      setMessage("Playlist queued.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not open that playlist.");
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Cloud className="size-5" strokeWidth={1.75} />
        iBroadcast
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Sign in to stream your iBroadcast locker here, then share a public playlist of what’s playing.
      </p>

      {session ? (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-sm">
            Signed in as <span className="font-medium">{session.email}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{ibCount} iBroadcast tracks in Sondergram</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void sync()}
              className="h-9 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
            >
              {busy ? "Working…" : "Sync library"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void share()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-sm"
            >
              <Link2 className="size-4" strokeWidth={1.75} />
              Share playing
            </button>
            <button
              type="button"
              onClick={() => {
                saveIbSession(null);
                setSession(null);
                setShareUrl(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:text-fg"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <form
          className="max-w-md space-y-3 rounded-xl bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="block text-xs uppercase tracking-widest text-subtle">
            Email
            <input
              className="mt-1 h-10 w-full rounded-lg bg-raised px-3 text-sm text-fg outline-none"
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-xs uppercase tracking-widest text-subtle">
            Password
            <input
              className="mt-1 h-10 w-full rounded-lg bg-raised px-3 text-sm text-fg outline-none"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="h-10 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs text-subtle">
            Uses your existing iBroadcast account. The password is sent to iBroadcast, not stored in Sondergram.
          </p>
        </form>
      )}

      <div className="max-w-md rounded-xl bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Open a share link</p>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none placeholder:text-subtle"
            value={paste}
            placeholder="Paste media.ibroadcast.com playlist URL"
            onChange={(e) => setPaste(e.target.value)}
          />
          <button type="button" onClick={openShare} className="h-10 rounded-full bg-raised px-4 text-sm">
            Open
          </button>
        </div>
        <p className="mt-2 text-xs text-subtle">Works for playlists on the account you signed in with.</p>
      </div>

      {shareUrl ? (
        <p className="break-all text-sm text-muted">
          Share:{" "}
          <a className="text-fg underline" href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {ibTracks.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In Sondergram</p>
          <ul className="max-w-md divide-y divide-border">
            {ibTracks.slice(0, 12).map((track) => (
              <li key={track.id} className="flex items-center gap-3 py-2">
                <div className="size-10 overflow-hidden rounded-md bg-raised">
                  {track.coverUrl ? <img src={track.coverUrl} alt="" className="size-full object-cover" /> : null}
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{track.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {track.artist}
                    {track.album ? `  ·  ${track.album}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {ibTracks.length > 12 ? (
            <p className="mt-2 text-xs text-subtle">+{ibTracks.length - 12} more on Home</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}