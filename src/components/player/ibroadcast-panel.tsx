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
import { searchIbLibraryClient } from "@/lib/player/ib-search-client";
import { ibLogin } from "@/lib/player/ibroadcast-api";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

function albumKey(t: IbTrack) {
  if (t.albumId) return `id:${t.albumId}`;
  const album = (t.album || "Unknown album").toLowerCase().trim();
  const artist = (t.artist || "Unknown").toLowerCase().trim();
  return `${album}::${artist}`;
}

function errText(err: unknown, fallback: string) {
  if (err == null) return fallback;
  if (err instanceof Error) {
    const m = (err.message || "").trim();
    if (/abort/i.test(m)) return "Search timed out on this host. Try a more specific song or album title.";
    if (/server error has occurred/i.test(m)) return "Search hit a server limit. Try a more specific artist or album name.";
    if (m && m !== "[object Object]") return m;
  }
  if (typeof err === "string") {
    const m = err.trim();
    if (/abort/i.test(m)) return "Search timed out on this host. Try a more specific song or album title.";
    if (m && m !== "[object Object]") return m;
    return fallback;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    for (const c of [o.message, o.error, o.msg, o.reason, o.detail]) {
      if (typeof c === "string" && c.trim() && c.trim() !== "[object Object]") {
        if (/abort/i.test(c)) return "Search timed out on this host. Try a more specific song or album title.";
        return c.trim();
      }
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
  const [tab, setTab] = useState<"tracks" | "albums" | "playlists">("tracks");
  const [adding, setAdding] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);

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

  const searchLibrary = async (sess: IbSession, q: string) => {
    let data = await searchIbLibraryClient(sess, q, {
      maxHits: 200,
      onProgress: (n) => {
        setFoundCount(n);
        setMessage(`Found ${n} so far for “${q.trim()}”…`);
      },
    });
    if (!data.ok || !data.tracks?.length) {
      setMessage(`Deep search on server for “${q.trim()}”…`);
      try {
        const res = await fetch("/api/ib-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: sess.userId, token: sess.token, q }),
        });
        const server = (await res.json()) as {
          ok?: boolean; tracks?: IbTrack[]; total?: number; truncated?: boolean; error?: string;
        };
        if (server?.tracks?.length) {
          data = {
            ok: true,
            tracks: server.tracks,
            total: server.total ?? server.tracks.length,
            truncated: server.truncated,
          };
        } else if (!data.ok && server?.error) {
          data = { ok: false, tracks: [], total: 0, error: server.error };
        }
      } catch {
        /* keep client result */
      }
    }
    if (!data.ok) throw new Error(data.error || "Search failed.");
    setLibTracks(data.tracks);
    setPlaylists([]);
    setFoundCount(data.total);
    return data;
  };

  useEffect(() => {
    if (!session) return;
    setMessage("Type an artist, album, or song and press Search. Matching scans in your browser as the library streams.");
  }, [session?.userId, session?.token]);

  const runSearch = () => {
    if (!session) return;
    const q = query.trim();
    if (q.length < 2) {
      setMessage("Type at least 2 characters, then press Search.");
      return;
    }
    setLoadingLib(true);
    setFoundCount(0);
    setLibTracks([]);
    setMessage(`Searching iBroadcast for “${q}”…`);
    void searchLibrary(session, q)
      .then((data) => {
        const total = data.total;
        const extra = data.truncated ? " (first matches)" : "";
        setMessage(`Found ${total.toLocaleString()} match${total === 1 ? "" : "es"} for “${q}”${extra}.`);
        const albumIds = new Set((data.tracks || []).map((t) => t.albumId || `${t.album}::${t.artist}`));
        setTab(albumIds.size > 1 ? "albums" : "tracks");
      })
      .catch((err) => setMessage(errText(err, "Search failed.")))
      .finally(() => setLoadingLib(false));
  };

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
      if (!next?.userId || !next?.token) throw new Error("Sign-in did not return a session. Check email/password.");
      const sess: IbSession = {
        userId: String(next.userId),
        token: String(next.token),
        streaming: next.streaming || "https://streaming.ibroadcast.com",
        email: next.email || email,
      };
      saveIbSession(sess);
      setSession(sess);
      setPassword("");
      setMessage("Signed in. Search for an artist, album, or song to add music.");
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
    const existing = new Set(
      usePlayer.getState().tracks.map((t) => t.ibroadcastId).filter(Boolean) as string[],
    );
    const unique: IbTrack[] = [];
    const seenBatch = new Set<string>();
    for (const t of items) {
      if (!t?.id || seenBatch.has(t.id)) continue;
      seenBatch.add(t.id);
      if (existing.has(t.id)) continue;
      unique.push(t);
    }
    const playList: string[] = [];
    for (const item of items) {
      const found = usePlayer.getState().tracks.find((t) => t.ibroadcastId === item.id);
      if (found) playList.push(found.id);
    }
    let added = 0;
    for (let i = 0; i < unique.length; i++) {
      const item = unique[i]!;
      const id = crypto.randomUUID();
      playList.push(id);
      try {
        await putStoredTrack({
          id,
          name: item.name || "Untitled",
          artist: item.artist || "Unknown artist",
          album: item.album || "Unknown album",
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
          ibFile: item.file || "",
          audio: new Blob([item.id], { type: "text/plain" }),
          cover: null,
          addedAt: Date.now() + i,
          duration: item.length && item.length > 0 ? item.length : undefined,
        });
        added += 1;
        existing.add(item.id);
      } catch {
        /* continue */
      }
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
    }
    if (added > 0) await hydrate();
    for (const item of unique) {
      const row = usePlayer.getState().tracks.find((t) => t.ibroadcastId === item.id);
      if (!row) continue;
      let playUrl = row.url || `ib:${item.id}`;
      try {
        if (item.file) {
          const direct = streamUrl(sessionNow, item.file, item.id);
          if (direct) {
            playUrl = `/api/ib-stream?file=${encodeURIComponent(item.file)}&file_id=${encodeURIComponent(item.id)}&user_id=${encodeURIComponent(String(sessionNow.userId))}&token=${encodeURIComponent(sessionNow.token)}&base=${encodeURIComponent(sessionNow.streaming || "https://streaming.ibroadcast.com")}`;
          }
        }
      } catch { /* keep */ }
      usePlayer.getState().patchTrack?.(row.id, {
        url: playUrl,
        ibroadcastId: item.id,
        ibFile: item.file || "",
        coverUrl: item.artwork || row.coverUrl,
        artist: item.artist || row.artist,
        album: item.album || row.album,
        name: item.name || row.name,
        tags: item.genre ? [item.genre, "iBroadcast"] : ["iBroadcast"],
        format: "IB",
        durationSec: item.length && item.length > 0 ? item.length : row.durationSec,
      });
    }
    if (play && playList.length) playIds(playList);
    return added;
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
      setMessage(
        play
          ? `Playing “${label}” (${albumTracks.length} tracks).`
          : n
            ? `Added ${n} track${n === 1 ? "" : "s"} from “${label}”.`
            : "Album already in library.",
      );
      flash(play ? "Playing album." : n ? `Added ${n} tracks.` : "Album already in library.");
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
          Sign in, then search for any artist, album, or song in your iBroadcast library and add it to Sondergram.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-11 rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-11 rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" />
        </div>
        <button type="button" disabled={busy || !email.trim() || !password.trim()} onClick={() => void signIn()} className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg disabled:opacity-50">
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
        <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium text-muted hover:text-fg">
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
      <div className="flex gap-2">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
            placeholder="Artist, album, or song…"
            className="h-10 w-full rounded-full bg-raised pl-10 pr-4 text-sm outline-none ring-1 ring-border focus:ring-accent"
          />
        </label>
        <button type="button" disabled={loadingLib || query.trim().length < 2} onClick={runSearch} className="h-10 shrink-0 rounded-full bg-accent px-4 text-xs font-semibold text-accent-fg disabled:opacity-50">
          {loadingLib ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          Search
        </button>
      </div>
      <p className="text-xs text-subtle">Search streams your library, then falls back to a deeper server scan if needed.</p>
      <div className="flex gap-1 rounded-full bg-raised p-1">
        {(["tracks", "albums"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={"h-8 flex-1 rounded-full text-xs capitalize " + (tab === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>
            {id}
          </button>
        ))}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {loadingLib ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Searching…{foundCount ? ` ${foundCount} found` : ""}
        </p>
      ) : null}
      {tab === "albums" ? (
        <div className="space-y-2">
          {albums.map((album) => (
            <div key={album.key} className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{album.album}</p>
                <p className="truncate text-xs text-muted">{album.artist} · {album.tracks.length} tracks</p>
              </div>
              <button type="button" disabled={adding === album.key} onClick={() => void addAlbum(album.tracks, album.album, true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50">
                <Play className="size-3.5" /> Play
              </button>
              <button type="button" disabled={adding === album.key} onClick={() => void addAlbum(album.tracks, album.album, false)} className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs font-medium hover:bg-white/10 disabled:opacity-50">
                <Plus className="size-3.5" /> Add ({album.tracks.length})
              </button>
            </div>
          ))}
          {!albums.length && !loadingLib ? <p className="text-sm text-muted">Search for an artist or album to see results.</p> : null}
        </div>
      ) : null}
      {tab === "tracks" ? (
        <div className="divide-y divide-border">
          {libTracks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.artist}{t.album ? ` · ${t.album}` : ""}{have.has(t.id) ? " · in library" : ""}</p>
              </div>
              <button type="button" disabled={adding === t.id} onClick={() => void addSong(t, true)} className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50">Play</button>
              <button type="button" disabled={adding === t.id || have.has(t.id)} onClick={() => void addSong(t, false)} className="h-8 rounded-full bg-raised px-3 text-xs disabled:opacity-50">Add</button>
            </div>
          ))}
          {!libTracks.length && !loadingLib ? <p className="py-2 text-sm text-muted">Search for a song, artist, or album.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
