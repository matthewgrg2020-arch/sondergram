import { Cloud, LoaderCircle, LogOut, Play, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  loadIbSession,
  saveIbSession,
  streamUrl,
  type IbPlaylist,
  type IbSession,
  type IbTrack,
} from "@/lib/player/ibroadcast";
import { ibLibrary, ibLogin, ibSearch } from "@/lib/player/ibroadcast-api";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

function albumKey(t: IbTrack) {
  return `${(t.artist || "").toLowerCase()}::${(t.album || "Unknown album").toLowerCase()}`;
}

/** Always produce a readable string from Error / server-fn payload / plain object. */
function errText(err: unknown, fallback: string) {
  if (err == null) return fallback;
  if (err instanceof Error) {
    const m = (err.message || "").trim();
    if (/server error has occurred/i.test(m)) {
      return "iBroadcast request failed on the server. Sign out, sign back in, then Load / refresh library.";
    }
    if (m && m !== "[object Object]") return m;
  }
  if (typeof err === "string") {
    const m = err.trim();
    if (m && m !== "[object Object]") return m;
    return fallback;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const candidates = [o.message, o.error, o.msg, o.reason, o.detail];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() && c.trim() !== "[object Object]") return c.trim();
      if (c && typeof c === "object") {
        const nested = (c as Record<string, unknown>).message;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
      }
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}" && json !== "null") return json.slice(0, 240);
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function IbroadcastPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const playIds = usePlayer((s) => s.playIds);
  const hydrate = usePlayer((s) => s.hydrate);
  const flash = usePlayer((s) => s.flash);
  const [session, setSession] = useState<IbSession | null>(() => loadIbSession());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingLib, setLoadingLib] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [libTracks, setLibTracks] = useState<IbTrack[]>([]);
  const [playlists, setPlaylists] = useState<IbPlaylist[]>([]);
  const [tab, setTab] = useState<"tracks" | "albums" | "playlists">("albums");
  const [adding, setAdding] = useState<string | null>(null);

  const have = useMemo(
    () => new Set(tracks.map((t) => t.ibroadcastId).filter(Boolean) as string[]),
    [tracks],
  );

  const albums = useMemo(() => {
    const map = new Map<string, { key: string; album: string; artist: string; tracks: IbTrack[] }>();
    for (const t of libTracks) {
      const key = albumKey(t);
      const row = map.get(key);
      if (row) row.tracks.push(t);
      else map.set(key, { key, album: t.album || "Unknown album", artist: t.artist || "Unknown", tracks: [t] });
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }, [libTracks]);

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return libTracks;
    return libTracks.filter((t) =>
      [t.name, t.artist, t.album, t.genre].join(" ").toLowerCase().includes(q),
    );
  }, [libTracks, query]);

  const filteredAlbums = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter((a) => `${a.album} ${a.artist}`.toLowerCase().includes(q));
  }, [albums, query]);

  const refreshLibrary = async (sess: IbSession, q = "") => {
    // Send session both nested and flat — server accepts either shape.
    const payload = {
      session: sess,
      userId: sess.userId,
      token: sess.token,
      streaming: sess.streaming,
      email: sess.email,
      q: q.trim() || undefined,
    };
    let lib: Awaited<ReturnType<typeof ibLibrary>>;
    try {
      lib = q.trim()
        ? await ibSearch({ data: payload as any })
        : await ibLibrary({ data: payload as any });
    } catch (raw) {
      throw new Error(errText(raw, "Could not load library."));
    }
    // Server sometimes returns a plain error-shaped object instead of IbLibraryResult
    if (!lib || typeof lib !== "object") {
      throw new Error("Empty response from iBroadcast.");
    }
    const anyLib = lib as Record<string, unknown>;
    if (anyLib.ok === false || (anyLib.error && !(Array.isArray(anyLib.tracks) && (anyLib.tracks as unknown[]).length))) {
      const errMsg =
        typeof anyLib.error === "string"
          ? anyLib.error
          : errText(anyLib.error ?? anyLib, "Could not load library.");
      throw new Error(errMsg);
    }
    const trackList = Array.isArray(anyLib.tracks) ? (anyLib.tracks as IbTrack[]) : [];
    const playlistList = Array.isArray(anyLib.playlists) ? (anyLib.playlists as IbPlaylist[]) : [];
    if (!trackList.length) {
      const hint =
        typeof anyLib.debug === "string" && anyLib.debug
          ? ` (${anyLib.debug})`
          : "";
      throw new Error(
        "No tracks returned from iBroadcast. Sign out, sign back in, then Load / refresh library." + hint,
      );
    }
    setLibTracks(trackList);
    setPlaylists(playlistList);
    return lib;
  };

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingLib(true);
    void refreshLibrary(session)
      .then((lib) => {
        if (cancelled) return;
        const total =
          lib && typeof lib === "object" && "total" in lib
            ? Number((lib as { total?: number }).total) || 0
            : (lib as { tracks?: unknown[] })?.tracks?.length || 0;
        setMessage(`Loaded ${total} tracks from iBroadcast.`);
      })
      .catch((err) => {
        if (!cancelled) setMessage(errText(err, "Could not load library."));
      })
      .finally(() => {
        if (!cancelled) setLoadingLib(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId, session?.token]);

  const signIn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      let next: IbSession;
      try {
        next = await ibLogin({ data: { email, password } });
      } catch (raw) {
        throw new Error(errText(raw, "Sign-in failed."));
      }
      if (!next?.userId || !next?.token) {
        throw new Error("Sign-in did not return a session. Check email/password.");
      }
      const sess: IbSession = {
        userId: String(next.userId),
        token: String(next.token),
        streaming: next.streaming || "https://streaming.ibroadcast.com",
        email: next.email || email,
      };
      saveIbSession(sess);
      setSession(sess);
      setPassword("");
      setLoadingLib(true);
      try {
        const lib = await refreshLibrary(sess);
        const total =
          lib && typeof lib === "object" && "total" in lib
            ? Number((lib as { total?: number }).total) || 0
            : 0;
        setMessage(`Signed in. ${total} tracks in your iBroadcast library — search or add below.`);
      } catch (err) {
        setMessage(errText(err, "Signed in, but library failed to load.") + " Try Load / refresh library.");
      } finally {
        setLoadingLib(false);
      }
    } catch (err) {
      setMessage(errText(err, "Sign-in failed."));
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    saveIbSession(null);
    setSession(null);
    setLibTracks([]);
    setPlaylists([]);
    setMessage("Signed out of iBroadcast.");
  };

  const addIbTracks = async (items: IbTrack[], play: boolean) => {
    const sessionNow = loadIbSession();
    if (!sessionNow) throw new Error("Sign in first.");
    const existing = new Set(usePlayer.getState().tracks.map((t) => t.ibroadcastId).filter(Boolean) as string[]);
    const toAdd = items.filter((t) => t?.id && !existing.has(t.id));
    const playList: string[] = [];
    for (const item of items) {
      const found = usePlayer.getState().tracks.find((t) => t.ibroadcastId === item.id);
      if (found) playList.push(found.id);
    }
    for (let i = 0; i < toAdd.length; i++) {
      const item = toAdd[i]!;
      const id = crypto.randomUUID();
      playList.push(id);
      let playUrl = `ib:${item.id}`;
      try {
        const direct = streamUrl(sessionNow, item.file, item.id);
        if (direct) {
          playUrl = `/api/stream?u=${encodeURIComponent(direct)}&ref=${encodeURIComponent("https://media.ibroadcast.com/")}`;
        }
      } catch {
        /* keep placeholder */
      }
      await putStoredTrack({
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: item.genre || "iBroadcast",
        tags: item.genre ? [item.genre, "iBroadcast"] : ["iBroadcast"],
        year: item.year || "",
        format: "IB",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        coverRemote: item.artwork || undefined,
        ibroadcastId: item.id,
        ibFile: item.file,
        audio: new Blob([item.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    }
    if (toAdd.length) await hydrate();
    for (const item of toAdd) {
      const row = usePlayer.getState().tracks.find((t) => t.ibroadcastId === item.id);
      if (row) {
        let playUrl = row.url || `ib:${item.id}`;
        try {
          const direct = streamUrl(sessionNow, item.file, item.id);
          if (direct) {
            playUrl = `/api/stream?u=${encodeURIComponent(direct)}&ref=${encodeURIComponent("https://media.ibroadcast.com/")}`;
          }
        } catch {
          /* keep */
        }
        usePlayer.getState().patchTrack?.(row.id, {
          url: playUrl,
          ibroadcastId: item.id,
          ibFile: item.file,
          coverUrl: item.artwork || row.coverUrl,
          tags: item.genre ? [item.genre, "iBroadcast"] : ["iBroadcast"],
          format: "IB",
        });
      }
    }
    if (play && playList.length) playIds(playList);
    return toAdd.length;
  };

  const addSong = async (item: IbTrack, play: boolean) => {
    setAdding(item.id);
    try {
      const n = await addIbTracks([item], play);
      setMessage(play ? "Playing from iBroadcast." : n ? "Added song to Sondergram." : "Already in your library.");
      flash(play ? "Playing from iBroadcast." : n ? "Added iBroadcast song." : "Already in library.");
    } catch (err) {
      setMessage(errText(err, "Could not add song."));
    } finally {
      setAdding(null);
    }
  };

  const addAlbum = async (albumTracks: IbTrack[], label: string, play: boolean) => {
    setAdding(label);
    try {
      const n = await addIbTracks(albumTracks, play);
      setMessage(play ? `Playing “${label}”.` : n ? `Added album “${label}” (${n} new).` : "Album already in library.");
      flash(play ? "Playing album." : n ? `Added album “${label}”.` : "Album already in library.");
    } catch (err) {
      setMessage(errText(err, "Could not add album."));
    } finally {
      setAdding(null);
    }
  };

  if (!session) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="size-5 text-accent" />
          <h3 className="text-lg font-semibold">iBroadcast</h3>
        </div>
        <p className="text-sm text-muted">
          Sign in to browse and search your iBroadcast library, then add any song or album into Sondergram — same idea as
          Bandcamp.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="h-11 rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-11 rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent"
          />
        </div>
        <button
          type="button"
          disabled={busy || !email.trim() || !password.trim()}
          onClick={() => void signIn()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Sign in
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud className="size-5 text-accent" />
          <div>
            <h3 className="text-lg font-semibold">iBroadcast</h3>
            <p className="text-xs text-subtle">{session.email || session.userId}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loadingLib}
            onClick={() => {
              setLoadingLib(true);
              void refreshLibrary(session)
                .then((lib) => {
                  const total =
                    lib && typeof lib === "object" && "total" in lib
                      ? Number((lib as { total?: number }).total) || 0
                      : (lib as { tracks?: unknown[] })?.tracks?.length || 0;
                  setMessage(`Loaded ${total} tracks from iBroadcast.`);
                })
                .catch((err) => setMessage(errText(err, "Could not load library.")))
                .finally(() => setLoadingLib(false));
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium hover:bg-white/10"
          >
            {loadingLib ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            Load / refresh library
          </button>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium text-muted hover:text-fg"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter your iBroadcast library…"
          className="h-10 w-full rounded-full bg-raised pl-10 pr-4 text-sm outline-none ring-1 ring-border focus:ring-accent"
        />
      </label>

      <div className="flex gap-1 rounded-full bg-raised p-1">
        {(["albums", "tracks", "playlists"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "h-8 flex-1 rounded-full text-xs capitalize " +
              (tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")
            }
          >
            {id}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {loadingLib && !libTracks.length ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Loading library…
        </p>
      ) : null}

      {tab === "albums" ? (
        <div className="space-y-2">
          {filteredAlbums.map((album) => (
            <div key={album.key} className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{album.album}</p>
                <p className="truncate text-xs text-muted">
                  {album.artist} · {album.tracks.length} tracks
                </p>
              </div>
              <button
                type="button"
                disabled={adding === album.key}
                onClick={() => void addAlbum(album.tracks, album.album, true)}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50"
              >
                <Play className="size-3.5" />
                Play
              </button>
              <button
                type="button"
                disabled={adding === album.key}
                onClick={() => void addAlbum(album.tracks, album.album, false)}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Add
              </button>
            </div>
          ))}
          {!filteredAlbums.length && !loadingLib ? (
            <p className="text-sm text-muted">
              {message
                ? "No albums yet — see the message above. Try Load / refresh library or sign out and back in."
                : "No albums found. Load your library or try another filter."}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "tracks" ? (
        <div className="divide-y divide-border">
          {filteredTracks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.name}</p>
                <p className="truncate text-xs text-muted">
                  {t.artist}
                  {have.has(t.id) ? " · in library" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={adding === t.id}
                onClick={() => void addSong(t, true)}
                className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50"
              >
                Play
              </button>
              <button
                type="button"
                disabled={adding === t.id || have.has(t.id)}
                onClick={() => void addSong(t, false)}
                className="h-8 rounded-full bg-raised px-3 text-xs disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ))}
          {!filteredTracks.length && !loadingLib ? (
            <p className="py-2 text-sm text-muted">No tracks matched.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "playlists" ? (
        <div className="space-y-2">
          {playlists.map((p) => {
            const listTracks = libTracks.filter((t) => p.trackIds.includes(t.id));
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{listTracks.length || p.trackIds.length} tracks</p>
                </div>
                <button
                  type="button"
                  disabled={!listTracks.length || adding === p.id}
                  onClick={() => void addAlbum(listTracks, p.name, true)}
                  className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50"
                >
                  Play
                </button>
                <button
                  type="button"
                  disabled={!listTracks.length || adding === p.id}
                  onClick={() => void addAlbum(listTracks, p.name, false)}
                  className="h-8 rounded-full bg-raised px-3 text-xs disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            );
          })}
          {!playlists.length && !loadingLib ? (
            <p className="text-sm text-muted">No playlists returned from iBroadcast.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
