import { useEffect, useRef, useState } from "react";
import { authClient, authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { syncAccountLibrary } from "@/lib/player/cloud";
import { usePlayer } from "@/lib/player/store";

export function AccountSync() {
  const { user, isPending } = useCurrentUserState();
  const hydrate = usePlayer((s) => s.hydrate);
  const flash = usePlayer((s) => s.flash);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const auto = useRef(false);

  useEffect(() => {
    if (!user?.primaryEmail || auto.current) return;
    auto.current = true;
    void sync();
  }, [user?.primaryEmail]);

  if (!authEnabled) return null;

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const message = await syncAccountLibrary();
      setNote(message);
      flash(message);
      await hydrate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sync the library.";
      setNote(message);
      flash(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-[0.18em] text-subtle">Account</p>
      {isPending ? <p className="mt-2 text-sm text-muted">Checking sign-in…</p> : null}
      {!isPending && user?.primaryEmail ? (
        <>
          <p className="mt-2 text-sm text-fg">{user.primaryEmail}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Songs and playlists on this device save to this email, so another phone or computer can pull the same library.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void sync()} className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
              {busy ? "Syncing…" : "Sync library"}
            </button>
            <button
              type="button"
              onClick={() => void signOut("/login")}
              className="h-10 rounded-full bg-raised px-4 text-sm"
            >
              Sign out
            </button>
          </div>
        </>
      ) : null}
      {!isPending && !user?.primaryEmail ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sign in with email and password so this library follows you. No zip transfer on the next device.
          </p>
          <a href="/login" className="mt-3 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
            Sign in
          </a>
        </>
      ) : null}
      {note ? <p className="mt-3 text-xs text-muted">{note}</p> : null}
    </section>
  );
}

export async function signedInEmail() {
  const session = await authClient.getSession();
  return session.data?.user?.email ?? null;
}
