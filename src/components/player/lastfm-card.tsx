import { useState } from "react";
import { loadLastFm, saveLastFm } from "@/lib/player/lastfm";

export function LastFmCard() {
  const [auth, setAuth] = useState(loadLastFm);
  const [saved, setSaved] = useState(false);
  const ready = Boolean(auth.user && auth.apiKey && auth.secret && auth.sk);

  return (
    <section className="rounded-xl bg-surface p-4">
      <h3 className="text-sm font-semibold">Last.fm</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Scrobble plays to Last.fm. Create an API account, authorize the app, then paste the session key.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(
          [
            ["user", "Username"],
            ["apiKey", "API key"],
            ["secret", "Shared secret"],
            ["sk", "Session key"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-xs text-subtle">
            {label}
            <input
              value={auth[key]}
              onChange={(e) => setAuth({ ...auth, [key]: e.target.value.trim() })}
              className="mt-1 h-9 w-full rounded-lg bg-raised px-3 text-sm text-fg"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            saveLastFm(auth);
            setSaved(true);
          }}
          className="h-9 rounded-full bg-accent px-4 text-sm text-accent-fg"
        >
          Save
        </button>
        {ready ? <span className="text-xs text-muted">Scrobbling as {auth.user}</span> : null}
        {saved ? <span className="text-xs text-subtle">Saved</span> : null}
      </div>
    </section>
  );
}