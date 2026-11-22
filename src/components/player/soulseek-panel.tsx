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
  type SltAlbum,
  type SlskFile,
  type SlskSession,
} from "@/lib/player/soulseek";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player/store";

const MAX_BYTES = 420_000_000;
const HISTORY_KEY = "sondergram:slsk-history";

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((row) => typeof row === "string") : [];
  } catch {
    return [];
  }
}

function pushHistory(q: string) {
  const next = [q, ...loadHistory().filter((row) => row.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function SoulseekPanel() {
  const tracks = usePlayer((s) => s.tracks);
  const importSoulseek = usePlayer((s) => s.importSoulseek);
  const flash = usePlayer((s) => s.flash);

  const [session, setSession] = useState<SlskSession | null>(() => loadSlskSession());
  const [name, setName] = useState(session?.kind === "native" ? session.name || "" : "");
  const [password, setPassword] = useState("");
  const [base, setBase] = useState(session?.kind === "slskd" ? session.base || "" : "");
  const [apiKey, setApiKey] = useState(session?.kind === "slskd" ? session.key || "" : "");
  const [advanced, setAdvanced] = useState(session?.kind === "slskd");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SlskFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [format, setFormat] = useState<"mp3" | "any" | "flac">("any");
  const [kbps, setKbps] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [albumsOnly, setAlbumsOnly] = useState(true);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const inLib = (tracks || []).filter((t) => t.soulseekId).length;

  const filtered = useMemo(() => {
    return (hits || []).filter((hit) => {
      if (format === "mp3") {
        if (hit.lossless) return false;
        if (hit.ext && !/mp3|m4a|aac|ogg|opus|wma/i.test(hit.ext)) return false;
      }
      if (format === "flac" && !hit.lossless) return false;
      if (kbps && !hit.lossless && hit.bitRate > 0 && hit.bitRate < 320) return false;
      if (freeOnly && !hit.free) return false;
      return true;
    });
  }, [hits, format, kbps, freeOnly]);

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
      const searchQ = q;
      const result = await slskSearch({
        data: {
          base: session.base,
          key: session.key,
          token: session.token,
          name: session.name,
          q: searchQ,
          timeoutMs: 18000,
        },
      });
      const files = Array.isArray((result as { files?: SlskFile[]; hits?: SlskFile[] }).files)
        ? (result as { files: SlskFile[] }).files
        : Array.isArray((result as { hits?: SlskFile[] }).hits)
          ? (result as { hits: SlskFile[] }).hits
          : [];
      setHits(files);
      setHistory(pushHistory(q));
      const folders = groupSlskAlbums(files).filter((row) => row.files.length >= 2).length;
      const shown = files.filter((hit) => {
        if (format === "mp3") {
          if (hit.lossless) return false;
          if (hit.ext && !/mp3|m4a|aac|ogg|opus|wma/i.test(hit.ext)) return false;
        }
        if (format === "flac" && !hit.lossless) return false;
        if (kbps && !hit.lossless && hit.bitRate > 0 && hit.bitRate < 320) return false;
        if (freeOnly && !hit.free) return false;
        return true;
      });
      setMessage(
        files.length === 0
          ? "No results from the network. Try a shorter query (artist name), wait a few seconds, and search again."
          : shown.length === 0
            ? "Results found but hidden by filters. Set Format → Any (and turn off 320kbps / free-only)."
            : `${shown.length} ${format === "mp3" ? "MP3" : format === "flac" ? "FLAC" : "audio"} files${folders ? ` · ${folders} album folders` : ""} (of ${files.length} total)`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  const add = async (files: SlskFile[], play: boolean) => {
    const ok = files.filter((file) => file.size <= MAX_BYTES);
    if (!ok.length) {
      setMessage("Those files are over 400 MB. Pick an MP3 or FLAC copy of the same album.");
      return;
    }
    try {
      await importSoulseek(ok, play);
      flash(ok.length === 1 ? `Added “${ok[0].name}”` : `Added ${ok.length} tracks`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add those files.");
    }
  };

  if (!session) {
    return (
      <section className="panel space-y-4 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Share2 className="size-5" strokeWidth={1.75} />
          Soulseek
        </h2>
        <p className="text-sm text-muted">
          Use the same username and password as the Soulseek app. They stay on this device.
        </p>
        <div className="space-y-2">
          <input
            className="h-11 w-full rounded-lg bg-raised px-3 text-sm outline-none"
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            className="h-11 w-full rounded-lg bg-raised px-3 text-sm outline-none"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            disabled={busy || !name.trim() || !password.trim()}
            onClick={() => void connect()}
            className="h-11 w-full rounded-full bg-accent text-sm font-semibold text-accent-fg disabled:opacity-40"
          >
            {busy ? "Connecting…" : "Sign in"}
          </button>
          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="panel flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Share2 className="size-5" strokeWidth={1.75} />
          Soulseek
        </h2>
        <p className="text-xs text-subtle">
          Signed in as <span className="font-medium text-fg">{session.name || session.base}</span>
          {inLib ? ` · ${inLib} in library` : ""}
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="h-11 min-w-0 flex-1 rounded-lg bg-raised px-3 text-sm outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search artist, album, or song…"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          className="h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-40"
        >
          {busy ? "…" : "Search"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
          <span className="text-subtle">Format</span>
          <select
            className="bg-transparent text-fg outline-none"
            value={format}
            onChange={(e) => setFormat(e.target.value as "mp3" | "any" | "flac")}
          >
            <option value="any">Any</option>
            <option value="mp3">MP3</option>
            <option value="flac">FLAC</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
          <input type="checkbox" checked={kbps} onChange={(e) => setKbps(e.target.checked)} />
          320kbps+
        </label>
        <label className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
          Free slot
        </label>
        <label className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
          <input type="checkbox" checked={albumsOnly} onChange={(e) => setAlbumsOnly(e.target.checked)} />
          Albums first
        </label>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {albumPacks.map((pack) => {
          const copy = pack.copies[0];
          if (!copy) return null;
          return (
            <div key={pack.key} className="rounded-xl bg-raised p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pack.album || pack.artist || "Album"}</p>
                  <p className="truncate text-xs text-muted">
                    {pack.artist} · {copy.files.length} tracks · {copy.username}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void add(copy.files, true)}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg"
                  >
                    <Play className="size-3.5" strokeWidth={1.75} />Play
                  </button>
                  <button
                    type="button"
                    onClick={() => void add(copy.files, false)}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-medium"
                  >
                    <Plus className="size-3.5" strokeWidth={1.75} />Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {singles.slice(0, 80).map((hit) => (
          <div key={`${hit.username}|${hit.filename}`} className="flex items-center gap-2 rounded-lg bg-raised/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{hit.name}</p>
              <p className="truncate text-xs text-muted">
                {hit.artist} · {hit.ext} · {hit.bitRate ? `${hit.bitRate}kbps` : ""} · {hit.username}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void add([hit], true)}
              className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
            >
              Play
            </button>
          </div>
        ))}

        {!busy && !hits.length && !message ? (
          <p className="text-sm text-subtle">Search for an artist or album to find shares on the network.</p>
        ) : null}
      </div>
    </section>
  );
}
