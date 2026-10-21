import { Cloud, Link2, LoaderCircle, LogOut, Play, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  loadIbSession,
  parseSharePlaylist,
  saveIbSession,
  type IbPlaylist,
  type IbSession,
  type IbTrack,
} from "@/lib/player/ibroadcast";
import { ibLibrary, ibLogin, ibSearch } from "@/lib/player/ibroadcast-api";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

function albumKey(t: IbTrack) {
  return `${(t.artist || "").toLowerCase()}|||${(t.album || "").toLowerCase()}`;
}

function errText(err: unknown, fallback: string) {
  if (err instanceof Error) {
    const debug = "debug" in err ? String((err as { debug?: string }).debug || "") : "";
    return debug ? `${err.message} (${debug})` : err.message;
  }
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

export function IbroadcastPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const index = usePlayer((s) => s.index);
  const upNext = usePlayer((s) => s.upNext);
  const hydrate = usePlayer((s) => s.hydrate);
  const playIds = usePlayer((s) => s.playIds);
  const flash = usePlayer((s) => s.flash);
  const syncIbroadcast = usePlayer((s) => s.syncIbroadcast);
  const shareIbroadcast = usePlayer((s) => s.shareIbroadcast);
  const importIbPlaylist = usePlayer((s) => s.importIbPlaylist);

  const [session, setSession] = useState<IbSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [playlists, setPlaylists] = useState<IbPlaylist[]>([]);
  const [remote, setRemote] = useState<IbTrack[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"tracks" | "albums" | "playlists">("albums");
  const [loadingLib, setLoadingLib] = useState(false);

  useEffect(() => {
    const existing = loadIbSession();
    setSession(existing);
    if (existing) {
      setLoadingLib(true);
      void refreshLibrary(existing)
        .catch((err) => setMessage(errText(err, "Could not load library.")))
        .finally(() => setLoadingLib(false));
    }
  }, []);

  const haveIds = useMemo(
    () => new Set(tracks.map((t) => t.ibroadcastId).filter(Boolean) as string[]),
    [tracks],
  );

  const ibTracks = tracks.filter((t) => t.ibroadcastId);
  const ibCount = ibTracks.length;

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return remote;
    return remote.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.genre || "").toLowerCase().includes(q),
    );
  }, [remote, query]);

  const albums = useMemo(() => {
    const map = new Map<
      string,
      { key: string; artist: string; album: string; year: string; artwork: string; tracks: IbTrack[] }
    >();
    for (const t of filteredTracks) {
      const key = albumKey(t);
      const row = map.get(key);
      if (row) {
        row.tracks.push(t);
        if (!row.artwork && t.artwork) row.artwork = t.artwork;
        if (!row.year && t.year) row.year = t.year;
      } else {
        map.set(key, {
          key,
          artist: t.artist || "Unknown artist",
          album: t.album || "Unknown album",
          year: t.year || "",
          artwork: t.artwork || "",
          tracks: [t],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album));
  }, [filteredTracks]);

  const filteredPlaylists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, query]);

  const refreshLibrary = async (sess: IbSession, q = "") => {
    try {
      const lib = q.trim()
        ? await ibSearch({ data: { session: sess, q: q.trim() } })
        : await ibLibrary({ data: { ...sess, q: "" } });
      setPlaylists(lib.playlists || []);
      setRemote(lib.tracks || []);
      if ("ok" in lib && lib.ok === false) {
        const err = new Error(lib.error || "Could not load library.");
        (err as Error & { debug?: string }).debug = (lib as { debug?: string }).debug;
        throw err;
      }
      return lib;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || "");
      if (/server error has occurred/i.test(msg)) {
        throw new Error(
          "iBroadcast request failed on the server. Sign out, sign back in, then Load / refresh library.",
        );
      }
      throw err instanceof Error ? err : new Error(msg || "Could not load library.");
    }
  };

  const loadLibrary = async () => {
    const current = loadIbSession();
    if (!current) {
      setMessage("Sign in first.");
      return;
    }
    setLoadingLib(true);
    setMessage(null);
    try {
      const lib = await refreshLibrary(current);
      const total = "total" in lib ? lib.total : lib.tracks?.length || 0;
      setMessage(`Loaded ${total} tracks from iBroadcast.`);
    } catch (err) {
      setMessage(errText(err, "Could not load library."));
    } finally {
      setLoadingLib(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await ibLogin({ data: { email, password } });
      saveIbSession(next);
      setSession(next);
      setPassword("");
      setLoadingLib(true);
      try {
        const lib = await refreshLibrary(next);
        const total = "total" in lib ? lib.total : 0;
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
        usePlayer.getState().patchTrack?.(row.id, {
          url: `ib:${item.id}`,
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
    setMessage(null);
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
    setMessage(null);
    try {
      const n = await addIbTracks(albumTracks, play);
      setMessage(
        play
          ? `Playing ${albumTracks.length} tracks.`
          : n
            ? `Added ${n} tracks from “${label}”.`
            : `“${label}” is already in your library.`,
      );
      flash(play ? "Playing album." : n ? `Added album “${label}”.` : "Album already in library.");
    } catch (err) {
      setMessage(errText(err, "Could not add album."));
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Cloud className="size-5" strokeWidth={1.75} />
        iBroadcast
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Sign in to browse and search your iBroadcast library, then add any song or album into Sondergram.
      </p>

      {session ? (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-sm">
            Signed in as <span className="font-medium">{session.email}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {remote.length} tracks in iBroadcast · {ibCount} already in Sondergram
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || loadingLib}
              onClick={() => void loadLibrary()}
              className="h-9 rounded-full bg-raised px-4 text-sm disabled:opacity-40"
            >
              {loadingLib ? "Loading…" : "Load / refresh library"}
            </button>
            <button
              type="button"
              onClick={() => {
                saveIbSession(null);
                setSession(null);
                setShareUrl(null);
                setRemote([]);
                setPlaylists([]);
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
        </form>
      )}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {session ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-surface p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-subtle">Search your library</p>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input
                className="h-11 w-full rounded-full bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-subtle"
                value={query}
                placeholder="Search songs, artists, albums…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mt-2 flex gap-1 rounded-full bg-raised p-1 w-fit">
              {(["albums", "tracks", "playlists"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`h-8 rounded-full px-3 text-xs font-medium capitalize ${
                    tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
            {loadingLib ? (
              <p className="mt-2 text-xs text-muted">Loading your iBroadcast library…</p>
            ) : remote.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                No tracks loaded yet. Click <span className="text-fg">Load / refresh library</span>.
              </p>
            ) : (
              <p className="mt-2 text-xs text-subtle">
                {remote.length} tracks ready · {albums.length} albums in view
              </p>
            )}
          </div>

          {tab === "albums" && remote.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {albums.slice(0, 60).map((album) => {
                const missing = album.tracks.filter((t) => !haveIds.has(t.id)).length;
                return (
                  <li key={album.key} className="flex gap-3 rounded-xl bg-surface p-3">
                    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                      {album.artwork ? <img src={album.artwork} alt="" className="size-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{album.album}</p>
                      <p className="truncate text-xs text-muted">{album.artist}</p>
                      <p className="text-[11px] text-subtle">
                        {album.tracks.length} tracks
                        {album.year ? ` · ${album.year}` : ""}
                        {missing === 0 ? " · in library" : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={adding === album.key}
                          onClick={() => void addAlbum(album.tracks, album.album, true)}
                          className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] text-accent-fg disabled:opacity-40"
                        >
                          {adding === album.key ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" strokeWidth={2} />}
                          Play
                        </button>
                        <button
                          type="button"
                          disabled={adding === album.key || missing === 0}
                          onClick={() => void addAlbum(album.tracks, album.album, false)}
                          className="inline-flex h-7 items-center gap-1 rounded-full bg-raised px-2.5 text-[11px] disabled:opacity-40"
                        >
                          <Plus className="size-3" strokeWidth={2} />
                          Add
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {tab === "tracks" && remote.length > 0 ? (
            <ul className="space-y-1">
              {filteredTracks.slice(0, 80).map((track) => (
                <li key={track.id} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{track.name}</p>
                    <p className="truncate text-xs text-muted">
                      {track.artist}
                      {track.album ? ` · ${track.album}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={adding === track.id}
                    onClick={() => void addSong(track, true)}
                    className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-40"
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "playlists" && remote.length > 0 ? (
            <ul className="space-y-2">
              {filteredPlaylists.map((pl) => {
                const plTracks = pl.trackIds
                  .map((id) => remote.find((t) => t.id === id))
                  .filter((t): t is IbTrack => Boolean(t));
                return (
                  <li key={pl.id} className="rounded-xl bg-surface p-3">
                    <p className="text-sm font-medium">{pl.name}</p>
                    <p className="text-xs text-muted">{plTracks.length} tracks</p>
                    <button
                      type="button"
                      disabled={!plTracks.length || adding === pl.id}
                      onClick={() => void addAlbum(plTracks, pl.name, true)}
                      className="mt-2 h-8 rounded-full bg-accent px-3 text-xs text-accent-fg disabled:opacity-40"
                    >
                      Play playlist
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {tab === "albums" && remote.length > 0 && albums.length === 0 ? (
            <p className="text-sm text-muted">No albums match that search.</p>
          ) : null}
          {tab === "tracks" && remote.length > 0 && filteredTracks.length === 0 ? (
            <p className="text-sm text-muted">No tracks match that search.</p>
          ) : null}
          {tab === "playlists" && remote.length > 0 && filteredPlaylists.length === 0 ? (
            <p className="text-sm text-muted">No playlists match that search.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
