import { AudioLines, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { loadDzSession, saveDzSession, type DzSession } from "@/lib/player/deezer";
import { dzExchange, dzMe } from "@/lib/player/deezer-api";
import { usePlayer } from "@/lib/player/store";

function readHashToken() {
  if (typeof location === "undefined") return null;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  return hash.get("access_token") || query.get("access_token") || query.get("code");
}

export function DeezerPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importDeezer = usePlayer((s) => s.importDeezer);
  const importDeezerArl = usePlayer((s) => s.importDeezerArl);
  const [session, setSession] = useState<DzSession | null>(null);
  const [paste, setPaste] = useState("");
  const [token, setToken] = useState("");
  const [arl, setArl] = useState("");
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSession(loadDzSession());
    const storedApp = localStorage.getItem("sondergram:deezer-app") || "";
    if (storedApp) setAppId(storedApp);
    const inbound = readHashToken();
    if (!inbound) return;
    const isCode = /^[a-z0-9]+$/i.test(inbound) && inbound.length < 80 && !inbound.includes(".");
    const secretSaved = sessionStorage.getItem("sondergram:deezer-secret") || "";
    const appSaved = localStorage.getItem("sondergram:deezer-app") || storedApp;
    void (async () => {
      try {
        setBusy(true);
        if (secretSaved && appSaved && isCode) {
          const next = await dzExchange({ data: { appId: appSaved, secret: secretSaved, code: inbound } });
          saveDzSession(next);
          setSession(next);
          setMessage(`Signed in as ${next.name}. Import your library next.`);
        } else {
          const next = await dzMe({ data: { token: inbound } });
          saveDzSession(next);
          setSession(next);
          setMessage(`Signed in as ${next.name}. Import your library next.`);
        }
        history.replaceState(null, "", location.pathname);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Deezer sign-in failed.");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const dzTracks = tracks.filter((t) => t.deezerId);
  const currentToken = session?.token || token.trim();

  const runImport = async (input?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const added = await importDeezer(input, currentToken || undefined);
      setMessage(
        added
          ? `Imported ${added} Deezer tracks. Previews play here; full songs stay on Deezer.`
          : "Those tracks are already in Sondergram.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => {
    const id = appId.trim();
    if (!id) {
      setMessage("Enter your Deezer application ID first.");
      return;
    }
    localStorage.setItem("sondergram:deezer-app", id);
    if (secret.trim()) sessionStorage.setItem("sondergram:deezer-secret", secret.trim());
    const redirect = `${location.origin}/`;
    const url = new URL("https://connect.deezer.com/oauth/auth.php");
    url.searchParams.set("app_id", id);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("perms", "basic_access,email,offline_access,manage_library");
    location.href = url.toString();
  };

  const tokenSignIn = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await dzMe({ data: { token: token.trim() } });
      saveDzSession(next);
      setSession(next);
      setToken("");
      setMessage(`Signed in as ${next.name}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That token was rejected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <AudioLines className="size-5" strokeWidth={1.75} />
        Deezer
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Import playlists, albums, or your Deezer library. Paste an ARL cookie from your own Deezer session to pull
        loved tracks and albums with artwork. Playback uses Deezer previews (or iTunes if a preview is missing).
      </p>

      <form
        className="max-w-xl rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void runImport(paste.trim() || undefined);
        }}
      >
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Paste a Deezer link or search</p>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none placeholder:text-subtle"
            value={paste}
            placeholder="Playlist, album, profile URL, or artist name"
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || (!paste.trim() && !currentToken)}
            className="h-10 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Public playlists and albums work with just a link. Private favourites need a connected account.
        </p>
      </form>

      {session ? (
        <div className="max-w-xl rounded-xl bg-surface p-4">
          <p className="text-sm">
            Connected as <span className="font-medium">{session.name}</span>
            {session.arl ? <span className="ml-2 text-xs text-subtle">ARL</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">{dzTracks.length} Deezer tracks in Sondergram</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runImport()}
              className="h-9 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
            >
              {busy ? "Working…" : "Import my library"}
            </button>
            <button
              type="button"
              onClick={() => {
                saveDzSession(null);
                setSession(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:text-fg"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-xl space-y-3 rounded-xl bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-subtle">ARL cookie</p>
          <p className="text-xs leading-relaxed text-muted">
            In a browser already signed into Deezer, copy the <span className="font-mono">arl</span> cookie and paste
            it here. It stays on this device.
          </p>
          <input
            className="h-10 w-full rounded-lg bg-raised px-3 text-sm text-fg outline-none"
            value={arl}
            placeholder="Paste your ARL"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setArl(e.target.value.trim())}
          />
          <button
            type="button"
            disabled={busy || arl.length < 20}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setMessage(null);
                try {
                  const added = await importDeezerArl(arl);
                  setSession(loadDzSession());
                  setArl("");
                  setMessage(added ? `Imported ${added} tracks from Deezer via ARL.` : "Those tracks are already in Sondergram.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "ARL import failed.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="h-9 rounded-full bg-accent px-4 text-sm text-accent-fg disabled:opacity-40"
          >
            {busy ? "Importing…" : "Save ARL and import"}
          </button>
          <p className="text-xs uppercase tracking-widest text-subtle">Or connect with a token</p>
          <label className="block text-xs text-muted">
            Access token
            <input
              className="mt-1 h-10 w-full rounded-lg bg-raised px-3 text-sm text-fg outline-none"
              value={token}
              placeholder="Paste a Deezer access token"
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !token.trim()}
            onClick={() => void tokenSignIn()}
            className="h-9 rounded-full bg-raised px-4 text-sm disabled:opacity-40"
          >
            Save token
          </button>
          <p className="text-xs leading-relaxed text-subtle">
            Create an app at developers.deezer.com, or copy a token from the Deezer API explorer. Token stays in
            this browser.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="h-10 rounded-lg bg-raised px-3 text-sm outline-none placeholder:text-subtle"
              value={appId}
              placeholder="Application ID"
              onChange={(e) => setAppId(e.target.value)}
            />
            <input
              className="h-10 rounded-lg bg-raised px-3 text-sm outline-none placeholder:text-subtle"
              value={secret}
              type="password"
              placeholder="App secret (optional)"
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <button type="button" onClick={connect} className="h-9 rounded-full bg-raised px-4 text-sm">
            Sign in with Deezer
          </button>
        </div>
      )}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {dzTracks.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">In Sondergram</p>
          <ul className="max-w-md divide-y divide-border">
            {dzTracks.slice(0, 12).map((track) => (
              <li key={track.id} className="flex items-center gap-3 py-2">
                <div className="size-10 overflow-hidden rounded-md bg-raised">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{track.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {track.artist}
                    {track.album ? `  ·  ${track.album}` : ""}
                    {track.previewUrl ? "" : "  ·  no preview"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {dzTracks.length > 12 ? (
            <p className="mt-2 text-xs text-subtle">+{dzTracks.length - 12} more in Library</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}