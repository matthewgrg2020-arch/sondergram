import { Cloud, LoaderCircle, LogOut, Play, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  loadIbSession,
  saveIbSession,
  type IbSession,
  type IbTrack,
} from "@/lib/player/ibroadcast";
import { fetchIbAlbumTracks, fetchIbArtistTracks, searchIbLibraryClient } from "@/lib/player/ib-search-client";
import { ibLogin } from "@/lib/player/ibroadcast-api";
import { putStoredTrack } from "@/lib/player/persist";
import { usePlayer } from "@/lib/player/store";

function albumKey(t: IbTrack) {
  if (t.albumId) return `id:${t.albumId}`;
  const album = (t.album || "Unknown album").toLowerCase().trim();
  const artist = (t.artist || "Unknown").toLowerCase().trim();
  return `${album}::${artist}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

function friendlyError(err: unknown) {
  const m = err instanceof Error ? err.message : String(err || "");
  if (/abort|aborted/i.test(m)) {
    return "Search timed out on this large library. Try a more specific artist or album name, then search again.";
  }
  if (/server error/i.test(m)) return "Search hit a server limit. Try a more specific name.";
  return m || "Something went wrong.";
}

export function IbroadcastPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const hydrate = usePlayer((s) => s.hydrate);
  const playIds = usePlayer((s) => s.playIds);
  const flash = usePlayer((s) => s.flash);

  const [session, setSession] = useState<IbSession | null>(() => loadIbSession());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [query, setQuery] = useState("");
  const [libTracks, setLibTracks] = useState<IbTrack[]>([]);
  const [tab, setTab] = useState<"tracks" | "albums" | "artists">("tracks");
  const [adding, setAdding] = useState<string | null>(null);
  const [loadingLib, setLoadingLib] = useState(false);
  const [foundCount, setFoundCount] = useState(0);
  const [message, setMessage] = useState("");

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

  const artists = useMemo(() => {
    const map = new Map<string, { key: string; name: string; artistId?: string; tracks: IbTrack[] }>();
    for (const t of libTracks) {
      const name = (t.artist || "Unknown artist").trim() || "Unknown artist";
      const artistId = (t as IbTrack & { artistId?: string }).artistId;
      const key = artistId ? `id:${artistId}` : `name:${name.toLowerCase()}`;
      const row = map.get(key);
      if (row) row.tracks.push(t);
      else map.set(key, { key, name, artistId, tracks: [t] });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || b.tracks.length - a.tracks.length);
  }, [libTracks]);

  useEffect(() => {
    if (session) setMessage("Signed in. Search for an artist, album, or song.");
  }, [session]);

  const signIn = async () => {
    setSigningIn(true);
    setMessage("");
    try {
      const sess = await ibLogin(email.trim(), password);
      saveIbSession(sess);
      setSession(sess);
      setPassword("");
      setMessage("Signed in. Search for an artist, album, or song to add music.");
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => {
    saveIbSession(null);
    setSession(null);
    setLibTracks([]);
    setMessage("Signed out.");
  };

  const runSearch = () => {
    if (!session || query.trim().length < 2) return;
    const q = query.trim();
    setLoadingLib(true);
    setFoundCount(0);
    setLibTracks([]);
    setMessage(`Searching “${q}” in your iBroadcast library…`);
    void searchIbLibraryClient(session, q, {
      maxHits: 200,
      onProgress: (n) => {
        if (n > 0) {
          setFoundCount(n);
          setMessage(`Found ${n} for “${q}”…`);
        }
      },
    })
      .then((data) => {
        if (!data.ok) {
          setFoundCount(0);
          setLibTracks([]);
          setMessage(data.error || "No matches. Try a more specific artist or album name.");
          return;
        }
        const list = data.tracks || [];
        setLibTracks(list);
        const albumIds = new Set(list.map((t) => t.albumId || `${t.album}::${t.artist}`));
        const artistNames = new Set(list.map((t) => (t.artist || "").toLowerCase().trim()).filter(Boolean));
        if (artistNames.size === 1 && list.length >= 3) setTab("artists");
        else if (albumIds.size > 1) setTab("albums");
        else setTab("tracks");
        setMessage(list.length ? `Found ${list.length} match${list.length === 1 ? "" : "es"}.` : "No matches.");
      })
      .catch((err) => setMessage(friendlyError(err)))
      .finally(() => setLoadingLib(false));
  };

  const addIbTracks = async (items: IbTrack[], play: boolean) => {
    let added = 0;
    const ids: string[] = [];
    for (const item of items) {
      if (!item?.id || have.has(item.id)) {
        if (item?.id) ids.push(`ib:${item.id}`);
        continue;
      }
      const id = `ib:${item.id}`;
      await putStoredTrack({
        id,
        name: item.name || "Unknown title",
        artist: item.artist || "Unknown artist",
        album: item.album || "Unknown album",
        genre: item.genre || "",
        year: item.year || "",
        format: "ibroadcast",
        liked: false,
        starred: false,
        lossless: false,
        ibroadcastId: item.id,
        ibFile: item.file,
        coverRemote: item.artwork,
        duration: item.length || 0,
        addedAt: Date.now(),
        albumArtist: item.artist || "",
      } as any);
      added += 1;
      ids.push(id);
    }
    await hydrate();
    if (play && ids.length) playIds(ids);
    return added;
  };

  const addSong = async (item: IbTrack, play: boolean) => {
    setAdding(item.id);
    try {
      const n = await addIbTracks([item], play);
      setMessage(play ? `Playing “${item.name}”.` : n ? `Added “${item.name}”.` : `“${item.name}” is already in your library.`);
      flash?.(play ? "Playing" : n ? "Added to library" : "Already in library");
    } finally {
      setAdding(null);
    }
  };

  const expandAlbumTracks = async (albumTracks: IbTrack[]) => {
    if (!session || !albumTracks.length) return albumTracks;
    const sample = albumTracks[0]!;
    const album = (sample.album || "").trim();
    const artist = (sample.artist || "").trim();
    const q = [artist, album].filter(Boolean).join(" ") || album;
    if (!q) return albumTracks;
    try {
      setMessage(`Loading full album “${album || "album"}”…`);
      const full = await withTimeout(
        searchIbLibraryClient(session, q, { maxHits: 200 }),
        18000,
      );
      if (full?.ok && full.tracks.length > albumTracks.length) {
        const narrowed = album
          ? full.tracks.filter((t) => (t.album || "").toLowerCase().includes(album.toLowerCase()))
          : full.tracks;
        if (narrowed.length > albumTracks.length) return narrowed;
        if (narrowed.length) return narrowed;
        return full.tracks;
      }
      if (full?.ok && full.tracks.length) return full.tracks;
    } catch { /* fall through */ }
    setMessage(`Adding ${albumTracks.length} track${albumTracks.length === 1 ? "" : "s"} from “${album || "album"}”…`);
    return albumTracks;
  };

  const addAlbum = async (albumTracks: IbTrack[], label: string, play: boolean) => {
    setAdding(label);
    try {
      const fullTracks = await expandAlbumTracks(albumTracks);
      const usable = fullTracks.filter((t) => t && t.id);
      if (!usable.length) {
        setMessage(`No tracks to add for “${label}”.`);
        return;
      }
      setMessage(`Adding ${usable.length} track${usable.length === 1 ? "" : "s"} from “${label}”…`);
      const n = await addIbTracks(usable, play);
      setMessage(
        play
          ? `Playing “${label}” (${usable.length} tracks).`
          : n
            ? `Added ${n} track${n === 1 ? "" : "s"} from “${label}”.`
            : `All tracks from “${label}” are already in your library.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add album.");
    } finally {
      setAdding(null);
    }
  };

  const expandArtistTracks = async (artistTracks: IbTrack[]) => {
    if (!session || !artistTracks.length) return artistTracks;
    const sample = artistTracks[0]!;
    const artist = (sample.artist || "").trim();
    if (!artist) return artistTracks;
    try {
      setMessage(`Loading songs by “${artist}”…`);
      const full = await withTimeout(
        searchIbLibraryClient(session, artist, { maxHits: 400 }),
        18000,
      );
      if (full?.ok && full.tracks.length > artistTracks.length) {
        const narrowed = full.tracks.filter((t) => (t.artist || "").toLowerCase().includes(artist.toLowerCase()));
        return narrowed.length ? narrowed : full.tracks;
      }
      if (full?.ok && full.tracks.length) return full.tracks;
    } catch { /* fall through */ }
    return artistTracks;
  };

  const addArtist = async (artistTracks: IbTrack[], label: string, play: boolean) => {
    setAdding(`artist:${label}`);
    try {
      const fullTracks = await expandArtistTracks(artistTracks);
      const usable = fullTracks.filter((t) => t && t.id);
      if (!usable.length) {
        setMessage(`No tracks to add for “${label}”.`);
        return;
      }
      setMessage(`Adding ${usable.length} track${usable.length === 1 ? "" : "s"} by “${label}”…`);
      const n = await addIbTracks(usable, play);
      setMessage(
        play
          ? `Playing “${label}” (${usable.length} tracks).`
          : n
            ? `Added ${n} track${n === 1 ? "" : "s"} by “${label}”.`
            : `All found tracks by “${label}” are already in your library.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add artist.");
    } finally {
      setAdding(null);
    }
  };

  if (!session) {
    return (
      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Cloud className="size-5 text-accent" />
          <h2 className="text-lg font-semibold">iBroadcast</h2>
        </div>
        <p className="text-sm text-muted">Sign in to search your iBroadcast library and add songs, albums, or whole artists.</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-10 w-full rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-10 w-full rounded-xl bg-raised px-3 text-sm outline-none ring-1 ring-border focus:ring-accent" onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }} />
        <button type="button" disabled={signingIn || !email.trim() || !password} onClick={() => void signIn()} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50">
          {signingIn ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Sign in
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud className="size-5 text-accent" />
          <h2 className="text-lg font-semibold">iBroadcast</h2>
        </div>
        <button type="button" onClick={signOut} className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs font-medium hover:bg-white/10">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
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

      <p className="text-xs text-subtle">Add Album uses tracks already found, then tries a short extra scan for more. If the full album is slow, it still adds what was found.</p>

      <div className="flex gap-1 rounded-full bg-raised p-1">
        {(["tracks", "albums", "artists"] as const).map((id) => (
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

      {tab === "artists" ? (
        <div className="space-y-2">
          {artists.map((artist) => (
            <div key={artist.key} className="flex items-center gap-2 rounded-xl bg-raised/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{artist.name}</p>
                <p className="truncate text-xs text-muted">{artist.tracks.length} songs in results</p>
              </div>
              <button type="button" disabled={adding === `artist:${artist.name}`} onClick={() => void addArtist(artist.tracks, artist.name, true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg disabled:opacity-50">
                <Play className="size-3.5" /> Play
              </button>
              <button type="button" disabled={adding === `artist:${artist.name}`} onClick={() => void addArtist(artist.tracks, artist.name, false)} className="inline-flex h-8 items-center gap-1 rounded-full bg-raised px-3 text-xs font-medium hover:bg-white/10 disabled:opacity-50">
                <Plus className="size-3.5" /> Add all songs
              </button>
            </div>
          ))}
          {!artists.length && !loadingLib ? <p className="text-sm text-muted">Search for an artist to see results.</p> : null}
        </div>
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
                <Plus className="size-3.5" /> Add
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
    </section>
  );
}
