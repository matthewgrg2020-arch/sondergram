import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const name = email.split("@")[0] || "Listener";
    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Could not sign in with that email.");
      return;
    }
    window.location.assign("/");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-xs uppercase tracking-[0.22em] text-subtle">Sondergram</p>
        <h1 className="logo-script text-4xl">Sign in</h1>
        <p className="text-sm leading-relaxed text-muted">
          Use an email and password. The library saves to that account, so another device can pull the same songs.
        </p>
        {authEnabled ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="h-11 w-full rounded-xl bg-raised px-3 text-sm"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (8+ characters)"
              className="h-11 w-full rounded-xl bg-raised px-3 text-sm"
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-accent text-sm font-medium text-accent-fg disabled:opacity-50">
              {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
              className="w-full text-center text-sm text-muted hover:text-fg"
            >
              {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        {authEnabled && GROK_PROVIDERS.length > 0 ? (
          <div className="space-y-2 border-t border-white/10 pt-4">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="h-11 w-full rounded-full bg-raised text-sm"
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        ) : null}
        <a href="/" className="block text-center text-sm text-muted hover:text-fg">
          Back to player
        </a>
      </div>
    </main>
  );
}
