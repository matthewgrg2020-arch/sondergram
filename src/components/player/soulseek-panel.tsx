import { ChevronDown, ListMusic, LogOut, Play, Plus, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { slskConnect, slskExpandFolder, slskForget, slskSearch } from "@/lib/player/soulseek-api";
import {
  formatBytes,
  formatSpeed,
  groupSlskAlbums,
  isNativeSlsk,
  loadSlskSession,
  packSlskAlbums,
  saveSlskSession,
  sortSlskFiles,
  type SlskAlbum,
  type SlskFile,
  type SlskSession,
} from "@/lib/player/soulseek";
import { formatTime } from "@/lib/player/time";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player/store";

const HISTORY_KEY = "sondergram:slsk-recent";
const MAX_BYTES = 420_000_000;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => typeof row === "string") : [];
  } catch {
    return [];
  }
}

function pushHistory(q: string) {
  const next = [q, ...loadHistory().filter((row) => row.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function SoulseekPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importSoulseek = usePlayer((s) => s.importSoulseek);
  const queueNextMany = usePlayer((s) => s.queueNextMany);
  const [session, setSession] = useState<SlskSession | null>(() => loadSlskSession());
  const [name, setName] = useState(session?.kind === "native" ? session.name || "" : "");
  const [password, setPassword] = useState("");
  const [base, setBase] = useState(session?.kind === "slskd" ? session.base || "" : "");
  const [apiKey, setApiKey] = useState("");
  const [advanced, setAdvanced] = useState(session?.kind === "slskd");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SlskFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lossless, setLossless] = useState(false);
  const [kbps, setKbps] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [albumsOnly, setAlbumsOnly] = useState(true);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [openKey, setOpenKey] = useState("");
  const [copyKey, setCopyKey] = useState<Record<string, string>>({});
  const inLib = tracks.filter((t) => t.soulseekId).length;
  const native = isNativeSlsk(session);

  const filtered = useMemo(() => {
    return hits.filter((hit) => {
      if (lossless && !hit.lossless) return false;
      if (kbps && !hit.lossless && hit.bitRate < 320) return false;
      if (freeOnly && !hit.free) return false;
      return true;
    });
  }, [hits, lossless, kbps, freeOnly]);

  const packs = useMemo(() => packSlskAlbums(groupSlskAlbums(filtered)), [filtered]);
  const albumPacks = packs.filter((pack) => pack.copies.some((copy) => copy.files.length >= 2));
  const showSingles = !albumsOnly || albumPacks.length === 0;
  const singles = showSingles
    ? filtered.filter((hit) => {
        const folder = hit.folder || "";
        const album = packs.find((pack) => pack.copies.some((copy) => copy.username === hit.username && copy.folder === folder));
        return !album || album.copies.every((copy) => copy.files.length < 2);
      })
    : [];

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = advanced
        ? await slskConnect({ data: { kind: "slskd", base, key: apiKey, username: name, password } })
        : await slskConnect({ data: { kind: "native", username: name, password } });
      saveSlskSession(next);
      setSession(next);
      setPassword("");
      setApiKey("");
      setMessage(next.kind === "native" ? `Signed in as ${next.name}. Search below.` : "Connected. Search the network below.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sign in to Soulseek.");
    } finally {
      setBusy(false);
    }
  };

  const search = async (text = query) => {
    if (!session) return;
    const q = text.trim();
    if (q.length < 2) return;
    setQuery(q);
    setBusy(true);
    setMessage(null);
    try {
      const result = await slskSearch({
        data: {
          base: session.base,
          key: session.key,
          token: session.token,
          name: session.name,
          q,
        },
      });
      setHits(result.hits);
      setHistory(pushHistory(q));
      const folders = groupSlskAlbums(result.hits).filter((row) => row.files.length >= 2).length;
      setMessage(
        result.hits.length
          ? `${result.hits.length} files${folders ? ` · ${folders} album folders` : ""}`
          : "No audio files matched.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  const expand = async (album: SlskAlbum) => {
    if (!session) return album.files;
    try {
      const extra = await slskExpandFolder({
        data: {
          base: session.base,
          key: session.key,
          token: session.token,
          name: session.name,
          username: album.username,
          folder: album.folder,
          artist: album.artist,
          album: album.album,
          speed: album.speed,
          queue: album.queue,
          free: album.free,
        },
      });
      if (!extra.hits.length) return album.files;
      const seen = new Set(album.files.map((file) => file.filename.replace(/\\/g, "/").toLowerCase()));
      const merged = [...album.files];
      for (const hit of extra.hits) {
        const key = hit.filename.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...hit, speed: hit.speed || album.speed, queue: hit.queue || album.queue, free: hit.free || album.free });
      }
      const next = sortSlskFiles(merged);
      setHits((rows) => {
        const have = new Set(rows.map((row) => `${row.username}|${row.filename}`));
        const add = next.filter((file) => !have.has(`${file.username}|${file.filename}`));
        return add.length ? [...rows, ...add] : rows;
      });
      return next;
    } catch {
      return album.files;
    }
  };

  const add = async (files: SlskFile[], play: boolean, queue = false) => {
    const ok = files.filter((file) => file.size <= MAX_BYTES);
    if (!ok.length) {
      setMessage("Those files are over 400 MB. Pick an MP3 or FLAC copy of the same album.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const n = await importSoulseek(ok, play && !queue);
      if (queue) {
        const ids = usePlayer
          .getState()
          .tracks.filter((track) => ok.some((file) => track.soulseekId === `${file.username}|${file.filename}`))
          .sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0))
          .map((track) => track.id);
        if (ids.length) queueNextMany(ids);
      }
      const skipped = files.length - ok.length;
      setMessage(
        n
          ? play
            ? `Added ${n}. Fetching the album…`
            : queue
              ? `Queued ${n}.`
              : `Added ${n} to your library.`
          : "Already in your library.",
      );
      if (skipped) setMessage((prev) => `${prev} Skipped ${skipped} over 400 MB.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that folder.");
    } finally {
      setBusy(false);
    }
  };

  const addAlbum = async (album: SlskAlbum, play: boolean, queue = false) => {
    setBusy(true);
    setMessage("Loading the rest of the folder…");
    const files = await expand(album);
    setBusy(false);
    await add(files, play, queue);
  };

  return (
    <section className="space-y-4 px-5 py-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Share2 className="size-5" strokeWidth={1.75} />
        Soulseek
      </h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Sign in, search, and add a whole album folder when someone is sharing it — then stream it through Sound. EQ,
        remaster, bass, and spatial stay on.
      </p>

      <form
        className="max-w-xl space-y-3 rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <p className="text-xs uppercase tracking-widest text-subtle">Soulseek account</p>
        {session ? (
          <p className="text-sm">
            Signed in as <span className="font-medium">{session.name || session.base}</span>
            {inLib ? ` · ${inLib} in library` : ""}
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            Use the same username and password as the Soulseek app. They stay on this device.
          </p>
        )}
        <input
          className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
          value={name}
          placeholder="Username"
          autoComplete="username"
          onChange={(e) => setName(e.target.value)}
        />
        {!advanced ? (
          <input
            className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
            type="password"
            value={password}
            placeholder="Password"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : (
          <>
            <input
              className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
              value={base}
              placeholder="https://your-slskd.example"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setBase(e.target.value)}
            />
            <input
              className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
              value={apiKey}
              placeholder="API key"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <input
              className="h-10 w-full rounded-lg bg-raised px-3 text-sm outline-none"
              type="password"
              value={password}
              placeholder="Password (optional)"
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || (advanced ? !base.trim() : !name.trim() || !password.trim())}
            className="h-11 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
          >
            {busy ? "Connecting…" : session ? "Reconnect" : "Sign in"}
          </button>
          {session ? (
            <button
              type="button"
              onClick={() => {
                const who = session?.name;
                saveSlskSession(null);
                setSession(null);
                setHits([]);
                if (who) void slskForget({ data: { name: who } });
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:text-fg"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Forget
            </button>
          ) : null}
        </div>
        <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? "Use a Soulseek account instead" : "I already have a Soulseek server"}
        </button>
      </form>

      {session ? (
        <form
          className="max-w-xl rounded-xl bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Search Soulseek</p>
          <div className="flex gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
              value={query}
              placeholder="Artist or album"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || query.trim().length < 2}
              className="h-11 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
            >
              {busy ? "…" : "Search"}
            </button>
          </div>
          {history.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {history.map((row) => (
                <button
                  key={row}
                  type="button"
                  disabled={busy}
                  onClick={() => void search(row)}
                  className="h-8 rounded-full bg-raised px-3 text-xs text-muted hover:text-fg"
                >
                  {row}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={albumsOnly} onChange={(e) => setAlbumsOnly(e.target.checked)} />
              Albums
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
              Ready now
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={kbps} onChange={(e) => setKbps(e.target.checked)} />
              320 kbps+
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={lossless} onChange={(e) => setLossless(e.target.checked)} />
              FLAC / lossless
            </label>
          </div>
        </form>
      ) : null}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {albumPacks.length > 0 ? (
        <ul className="max-w-2xl space-y-3">
          {albumPacks.map((pack) => {
            const selected = pack.copies.find((copy) => copy.key === copyKey[pack.key]) || pack.copies[0]!;
            const open = openKey === selected.key;
            return (
              <li key={pack.key} className="rounded-xl bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {pack.album}
                      {pack.artist ? <span className="font-normal text-muted"> · {pack.artist}</span> : null}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-subtle">{selected.folder || "Folder"}</p>
                    <p className="mt-1 text-xs text-muted">
                      <span className={selected.free ? "text-fg" : ""}>{selected.username}</span>
                      {selected.free ? " · Ready" : " · Busy"}
                      {selected.speed ? ` · ${formatSpeed(selected.speed)}` : ""}
                      {` · ${selected.files.length} tracks`}
                      {selected.ext ? ` · ${selected.ext}` : ""}
                      {selected.bitRate ? ` · ${selected.bitRate} kbps` : ""}
                      {selected.duration ? ` · ${formatTime(selected.duration)}` : ""}
                      {` · ${formatBytes(selected.size)}`}
                    </p>
                  </div>
                </div>
                {pack.copies.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pack.copies.map((copy) => (
                      <button
                        key={copy.key}
                        type="button"
                        onClick={() => setCopyKey((s) => ({ ...s, [pack.key]: copy.key }))}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs",
                          copy.key === selected.key ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
                        )}
                      >
                        {copy.username}
                        {` · ${copy.files.length}`}
                        {copy.free ? "" : " · busy"}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addAlbum(selected, true)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-hot px-4 text-sm font-semibold text-hot-fg disabled:opacity-40"
                  >
                    <Play className="size-3.5" strokeWidth={2} />
                    Play album
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addAlbum(selected, false)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
                  >
                    <Plus className="size-3.5" strokeWidth={2} />
                    Add album
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addAlbum(selected, false, true)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-raised px-3 text-sm text-muted hover:text-fg disabled:opacity-40"
                  >
                    <ListMusic className="size-3.5" strokeWidth={1.75} />
                    Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? "" : selected.key)}
                    className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm text-muted hover:text-fg"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} strokeWidth={1.75} />
                    {selected.files.length} songs
                  </button>
                </div>
                {open ? (
                  <ul className="mt-3 divide-y divide-border/60">
                    {selected.files.map((hit) => (
                      <li key={`${hit.username}|${hit.filename}`} className="flex items-center gap-3 py-2">
                        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-subtle">
                          {hit.trackNo || ""}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{hit.name}</p>
                          <p className="truncate text-xs text-muted">
                            {hit.ext}
                            {hit.bitRate ? ` · ${hit.bitRate} kbps` : ""}
                            {hit.length ? ` · ${formatTime(hit.length)}` : ""}
                            {` · ${formatBytes(hit.size)}`}
                            {hit.size > MAX_BYTES ? " · too large" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy || hit.size > MAX_BYTES}
                          onClick={() => void add([hit], true)}
                          className="h-9 shrink-0 rounded-full bg-raised px-3 text-xs font-medium text-fg disabled:opacity-40"
                        >
                          Play
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {singles.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {singles.map((hit) => (
            <li key={`${hit.username}|${hit.filename}`} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{hit.name}</p>
                <p className="truncate text-xs text-muted">
                  {hit.artist}
                  {hit.album ? ` · ${hit.album}` : ""} · {hit.ext}
                  {hit.bitRate ? ` ${hit.bitRate} kbps` : ""}
                  {hit.length ? ` · ${formatTime(hit.length)}` : ""} · {formatBytes(hit.size)} · {hit.username}
                  {hit.free ? "" : " · busy"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || hit.size > MAX_BYTES}
                onClick={() => void add([hit], true)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-hot px-3 text-xs font-semibold text-hot-fg disabled:opacity-40"
              >
                <Play className="size-3.5" strokeWidth={2} />
                {hit.size > MAX_BYTES ? "Too large" : "Play"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void add([hit], false)}
                className="h-9 shrink-0 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {native ? (
        <p className="max-w-xl text-xs leading-relaxed text-subtle">
          First play can take a minute while the file arrives. After that it stays in this session so replay is quick.
          Whole albums queue in track order and pick up cover art when a catalog match is found.
        </p>
      ) : null}
    </section>
  );
}
