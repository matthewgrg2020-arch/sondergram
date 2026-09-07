import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-xs uppercase tracking-[0.22em] text-subtle">Sondergram</p>
        <h1 className="logo-script text-4xl">Sign in</h1>
        <p className="text-sm leading-relaxed text-muted">
          Cloud sync keeps your library metadata on your account so other devices can pull it.
        </p>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="h-11 w-full rounded-full bg-accent text-sm font-medium text-accent-fg"
            >
              Continue with {p.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <a href="/" className="block text-center text-sm text-muted hover:text-fg">
          Back to player
        </a>
      </div>
    </main>
  );
}
