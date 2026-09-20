import { Copy, LogOut, Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  consumeSpotifyVerifier,
  loadSpClientId,
  loadSpSession,
  parseSpotifyClientId,
  recalledSpotifyRedirect,
  rememberSpotifyRedirect,
  saveSpClientId,
  saveSpSession,
  spotifyAuthUrl,
  spotifyRedirectUris,
  type SpSession,
} from "@/lib/player/spotify";
import { refreshSpotify, searchSpotifyCatalog, spotifyToken } from "@/lib/player/spotify-api";
import type { StreamHit } from "@/lib/player/stream-search";
import { usePlayer } from "@/lib/player/store";

export function SpotifyPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importSpotify = usePlayer((s) => s.importSpotify);
  const importStreamHits = usePlayer((s) => s.importStreamHits);
  const [session, setSession] = useState<SpSession | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StreamHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const uris = typeof location !== "undefined" ? spotifyRedirectUris() : [];
  const redirect = uris[0] || "";

  useEffect(() => {
    setClientId(loadSpClientId());
    const stored = loadSpSession();
    if (stored) setSession(stored);
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const err = params.get("error");
    const state = params.get("state");
    if (err) {
      const detail = params.get("error_description") || "";
      const mismatch = /redirect/i.test(err) || /redirect/i.test(detail);
      setMessage(
        err === "access_denied"
          ? "Spotify sign-in was cancelled."
          : mismatch
            ? "Spotify rejected the redirect URI. Add both addresses below under Redirect URIs, wait a few seconds, then Connect again."
            : `Spotify error: ${detail || err}`,
      );
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
          redirectUri: recalledSpotifyRedirect(),
        });
        setSession(next);
        setMessage(`Signed in as ${next.name}. Search or import your library.`);
        history.replaceState(null, "", location.pathname);
      } catch (error) {
        const text = error instanceof Error ? error.message : "Spotify sign-in failed.";
        setMessage(
          /redirect/i.test(text)
            ? "Spotify says the redirect URI does not match. Add both addresses below to your Spotify app, then Connect again."
            : text,
        );
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!session || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const fresh = await refreshSpotify(session, parseSpotifyClientId(clientId) || loadSpClientId());
          if (!live) return;
          setSession(fresh);
          const rows = await searchSpotifyCatalog(fresh.token, q);
          if (live) {
            setHits(rows);
            setMessage(null);
          }
        } catch (error) {
          if (live) {
            setHits([]);
            setMessage(error instanceof Error ? error.message : "Spotify search failed.");
          }
        } finally {
          if (live) setSearching(false);
        }
      })();
    }, 320);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, session?.token, clientId]);

  const spTracks = tracks.filter((t) => t.spotifyId);
  const albums = hits.filter((h) => h.kind === "album");
  const songs = hits.filter((h) => h.kind === "track");

  const copyUri = (value: string, key: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };

  const connect = async () => {
    const id = parseSpotifyClientId(clientId);
    if (!id) {
      setMessage("Paste only the Client ID from the Spotify dashboard (not a JSON file or secret).");
      return;
    }
    if (!redirect) {
      setMessage("Could not read this app’s address. Refresh and try again.");
      return;
    }
    setClientId(id);
    saveSpClientId(id);
    rememberSpotifyRedirect(redirect);
    const url = await spotifyAuthUrl(id, redirect);
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

  const addHits = (items: StreamHit[]) => {
    const key = items.map((item) => item.key).join(",");
    setAdding(key);
    setMessage(null);
    void importStreamHits(items, true)
      .then((n) => setMessage(n ? `Added ${n} to your library.` : "Already in your library."))
      .catch((err) => setMessage(err instanceof Error ? err.message : "Could not add that title."))
      .finally(() => setAdding(null));
  };

  return (
    <section className="max-w-2xl px-5 py-4">
      <h2 className="text-xl font-semibold tracking-tight">Spotify</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Search the Spotify catalog and add songs or albums with artwork and metadata. You can also import Saved Albums,
        Liked Songs, and playlists. Spotify does not allow copying full songs, so playback uses official previews.
      </p>

      {session ? (
        <div className="mt-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, albums, artists…"
              className="h-12 w-full rounded-xl bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-subtle"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="mt-2 text-xs text-subtle">
            Signed in as {session.name}
            {spTracks.length ? ` · ${spTracks.length} Spotify tracks in Sondergram` : ""}
            {searching ? " · Searching…" : hits.length ? ` · ${hits.length} results` : ""}
          </p>
        </div>
      ) : null}

      {session && albums.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Albums</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {albums.map((item) => (
              <article key={item.key} className="min-w-0">
                <div className="aspect-square overflow-hidden rounded-md bg-raised">
                  {item.cover ? (
                    <img src={item.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <p className="mt-2 truncate text-sm">{item.name}</p>
                <p className="truncate text-xs text-muted">{item.artist}</p>
                {item.year ? <p className="mt-0.5 text-[10px] uppercase tracking-widest text-subtle">{item.year}</p> : null}
                <button
                  type="button"
                  disabled={adding === item.key}
                  onClick={() => addHits([item])}
                  className="mt-2 h-9 w-full rounded-full bg-hot text-xs font-semibold text-hot-fg disabled:opacity-40"
                >
                  {adding === item.key ? "Adding…" : "Add album"}
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {session && songs.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Songs</p>
          <ul className="divide-y divide-border/60">
            {songs.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2">
                <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-raised">
                  {item.cover ? (
                    <img src={item.cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.name}</p>
                  <p className="truncate text-xs text-muted">
                    {item.artist}
                    {item.album ? ` · ${item.album}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={adding === item.key}
                  onClick={() => addHits([item])}
                  className="h-9 shrink-0 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
                >
                  {adding === item.key ? "…" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {session && query.trim().length >= 2 && !searching && hits.length === 0 && !message ? (
        <p className="mt-6 text-sm text-muted">No Spotify matches for that search.</p>
      ) : null}

      {session ? (
        <div className="mt-6 flex flex-wrap gap-2">
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
              setHits([]);
              setQuery("");
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-raised px-4 text-sm"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl bg-raised px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-widest text-subtle">1. Redirect URIs</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              In the Spotify developer dashboard, open your app → Settings → <span className="text-fg">Redirect URIs</span>.
              Add <span className="text-fg">both</span> of these exactly (the slash at the end matters). Use a Web app, not
              Android or iOS.
            </p>
            <ul className="mt-3 space-y-2">
              {uris.map((uri, i) => (
                <li key={uri} className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-bg px-2.5 py-2 text-[11px] text-fg">{uri}</code>
                  <button
                    type="button"
                    onClick={() => copyUri(uri, String(i))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg px-2.5 py-1.5 text-xs text-fg"
                  >
                    <Copy className="size-3.5" strokeWidth={1.75} />
                    {copied === String(i) ? "Copied" : "Copy"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              If you open Sondergram from a published link, copy the URIs from that copy of the app — Spotify must match the
              address you are actually using.
            </p>
          </div>

          <label className="mt-5 block text-xs uppercase tracking-widest text-subtle">2. Spotify Client ID</label>
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
            Paste the Client ID only — not the secret, not a JSON file. Save the Spotify app after adding the redirect URIs,
            then connect.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void connect()}
              className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Connect Spotify
            </button>
          </div>
        </>
      )}
      {message ? <p className="mt-3 text-sm text-hot">{message}</p> : null}
    </section>
  );
}
