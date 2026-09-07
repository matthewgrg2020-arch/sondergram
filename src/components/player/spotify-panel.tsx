import { Copy, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import {
  consumeSpotifyVerifier,
  loadSpClientId,
  loadSpSession,
  parseSpotifyClientId,
  saveSpClientId,
  saveSpSession,
  spotifyAuthUrl,
  spotifyRedirectUri,
  type SpSession,
} from "@/lib/player/spotify";
import { refreshSpotify, spotifyToken } from "@/lib/player/spotify-api";
import { usePlayer } from "@/lib/player/store";

export function SpotifyPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importSpotify = usePlayer((s) => s.importSpotify);
  const [session, setSession] = useState<SpSession | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const redirect = typeof location !== "undefined" ? spotifyRedirectUri() : "";

  useEffect(() => {
    setClientId(loadSpClientId());
    const stored = loadSpSession();
    if (stored) setSession(stored);
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const err = params.get("error");
    const state = params.get("state");
    if (err) {
      setMessage(err === "access_denied" ? "Spotify sign-in was cancelled." : `Spotify error: ${err}`);
      history.replaceState(null, "", location.pathname);
      return;
    }
    if (!code || state !== "sg") return;
    const verifier = consumeSpotifyVerifier();
    const id = loadSpClientId();
    if (!verifier || !id) {
      setMessage("Spotify sign-in expired. Paste the Client ID and tap Connect again.");
      history.replaceState(null, "", location.pathname);
      return;
    }
    void (async () => {
      try {
        setBusy(true);
        const next = await spotifyToken({
          clientId: id,
          code,
          verifier,
          redirectUri: spotifyRedirectUri(),
        });
        setSession(next);
        setMessage(`Signed in as ${next.name}. Import your library next.`);
        history.replaceState(null, "", location.pathname);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Spotify sign-in failed.");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const spTracks = tracks.filter((t) => t.spotifyId);

  const connect = async () => {
    const id = parseSpotifyClientId(clientId);
    if (!id) {
      setMessage("Paste only the Client ID from the Spotify dashboard (not a JSON file or secret).");
      return;
    }
    setClientId(id);
    saveSpClientId(id);
    const url = await spotifyAuthUrl(id, spotifyRedirectUri());
    location.href = url;
  };

  const runImport = async () => {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const fresh = await refreshSpotify(session, parseSpotifyClientId(clientId) || loadSpClientId());
      setSession(fresh);
      const added = await importSpotify(fresh.token);
      setMessage(
        added
          ? `Imported ${added} Spotify tracks into your library.`
          : "Those Spotify tracks are already in Sondergram.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-xl px-5 py-4">
      <h2 className="text-xl font-semibold tracking-tight">Spotify</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Sign in on any phone, tablet, or computer, then import Saved Albums, Liked Songs, and playlists. They show up
        as albums and tracks in Sondergram, same as local files. Spotify does not allow copying full songs; playback
        uses official previews (and iTunes previews when Spotify has none).
      </p>

      <label className="mt-5 block text-xs uppercase tracking-widest text-subtle">Spotify Client ID</label>
      <input
        className="mt-1 h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
        value={clientId}
        placeholder="abc123… from the Spotify dashboard"
        onChange={(e) => {
          setClientId(e.target.value);
          setMessage(null);
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        Create an app at developer.spotify.com/dashboard. Under Redirect URIs, add this exactly, then paste the Client
        ID (not the secret, not a JSON file).
      </p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(redirect).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-xs text-fg"
      >
        <Copy className="size-3.5" strokeWidth={1.75} />
        {copied ? "Copied" : "Copy redirect URI"}
      </button>
      <p className="mt-2 break-all text-[11px] text-subtle">{redirect}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {session ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runImport()}
              className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              {busy ? "Importing…" : "Import Spotify library"}
            </button>
            <button
              type="button"
              onClick={() => {
                saveSpSession(null);
                setSession(null);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            Connect Spotify
          </button>
        )}
      </div>
      {session ? (
        <p className="mt-3 text-sm text-muted">
          Signed in as {session.name}
          {spTracks.length ? ` · ${spTracks.length} Spotify tracks in Sondergram` : ""}
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-hot">{message}</p> : null}
    </section>
  );
}