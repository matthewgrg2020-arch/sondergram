import { useEffect, useRef, useState } from "react";
import { authClient, authEnabled, signIn, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { syncAccountLibrary } from "@/lib/player/cloud";
import { usePlayer } from "@/lib/player/store";

export function AccountSync() {
  const { user, isPending } = useCurrentUserState();
  const hydrate = usePlayer((s) => s.hydrate);
  const flash = usePlayer((s) => s.flash);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const auto = useRef(false);
  const email = accountEmail || (user && !user.isDevFallback ? user.primaryEmail : null);
  const signedIn = Boolean(email);

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

  useEffect(() => {
    void fetch("/api/account")
      .then((r) => r.json())
      .then((body: { email?: string | null }) => setAccountEmail(body.email || null))
      .catch(() => setAccountEmail(null));
  }, []);

  useEffect(() => {
    if (!signedIn || auto.current) return;
    auto.current = true;
    void sync();
  }, [signedIn]);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-[0.18em] text-subtle">Account</p>
      {isPending && !email ? <p className="mt-2 text-sm text-muted">Checking sign-in…</p> : null}
      {email ? (
        <>
          <p className="mt-2 text-sm text-fg">{email}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Songs and playlists on this device save to this email, so another phone or computer can pull the same library.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void sync()} className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50">
              {busy ? "Syncing…" : "Sync library"}
            </button>
            <button
              type="button"
              onClick={() => {
                void fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "out" }) }).then(() => {
                  window.location.assign("/");
                });
              }}
              className="h-10 rounded-full bg-raised px-4 text-sm"
            >
              Sign out
            </button>
          </div>
        </>
      ) : null}
      {!email ? <EmailAuth /> : null}
      {note ? <p className="mt-3 text-xs text-muted">{note}</p> : null}
    </section>
  );
}

export async function signedInEmail() {
  const session = await authClient.getSession();
  return session.data?.user?.email ?? null;
}

function EmailAuth() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, email, password }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.message || "Could not sign in with that email.");
      return;
    }
    window.location.assign("/");
  };

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <button type="button" onClick={() => signIn("grok-google", { callbackURL: "/" })} className="h-11 w-full rounded-full bg-white text-sm font-medium text-black">
        Continue with Google
      </button>
      <p className="text-sm leading-relaxed text-muted">Or use email and password. The library saves to this account.</p>
      <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-11 w-full rounded-xl bg-raised px-3 text-sm" />
      <input type="password" required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password, 8+ characters" className="h-11 w-full rounded-xl bg-raised px-3 text-sm" />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-accent text-sm font-medium text-accent-fg disabled:opacity-50">
        {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
      </button>
      <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")} className="w-full text-sm text-muted">
        {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </form>
  );
}
