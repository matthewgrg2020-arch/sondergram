import { useMemo } from "react";
import { groupAlbums, groupArtists, groupGenres } from "@/lib/player/catalog";
import { usePlayer } from "@/lib/player/store";

function minutesLabel(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function lastDays(n: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function bytesLabel(n: number) {
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  return `${(n / 1_000_000_000).toFixed(1)} GB`;
}

function hoursLabel(sec: number) {
  const h = sec / 3600;
  if (h < 1) return `${Math.max(1, Math.round(sec / 60))} min`;
  return `${h.toFixed(1)} h`;
}

export function StatsPage() {
  const tracks = usePlayer((s) => s.tracks);
  const plays = usePlayer((s) => s.plays);
  const listenMs = usePlayer((s) => s.listenMs);
  const listenLog = usePlayer((s) => s.listenLog);
  const playIndex = usePlayer((s) => s.playIndex);
  const playIds = usePlayer((s) => s.playIds);
  const days = lastDays(7);
  const maxDay = Math.max(1, ...days.map((d) => listenLog[d] ?? (d === days[days.length - 1] ? listenMs : 0)));
  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const artists = useMemo(() => groupArtists(tracks), [tracks]);
  const genres = useMemo(() => groupGenres(albums), [albums]);

  const library = useMemo(() => {
    const duration = tracks.reduce((n, t) => n + (t.durationSec || 0), 0);
    const bytes = tracks.reduce((n, t) => n + (t.bytes || 0), 0);
    const lossless = tracks.filter((t) => t.lossless).length;
    const unplayed = tracks.filter((t) => !(plays[t.id] ?? 0)).length;
    const liked = tracks.filter((t) => t.liked).length;
    const rated = albums.filter((a) => a.rating > 0).length;
    const formats = new Map<string, number>();
    for (const t of tracks) formats.set(t.format || "?", (formats.get(t.format || "?") ?? 0) + 1);
    const addedWeek = tracks.filter((t) => (t.addedAt ?? 0) > Date.now() - 7 * 86_400_000).length;
    return { duration, bytes, lossless, unplayed, liked, rated, formats, addedWeek };
  }, [tracks, plays, albums]);

  const topTracks = useMemo(() => {
    return [...tracks]
      .map((t) => ({ track: t, n: plays[t.id] ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
  }, [tracks, plays]);

  const topArtists = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tracks) {
      const name = t.artist || "Unknown artist";
      map.set(name, (map.get(name) ?? 0) + (plays[t.id] ?? 0));
    }
    return [...map.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [tracks, plays]);

  const streak = useMemo(() => {
    let n = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const ms = listenLog[key] ?? (i === 0 ? listenMs : 0);
      if (ms < 30_000) {
        if (i === 0) continue;
        break;
      }
      n += 1;
    }
    return n;
  }, [listenLog, listenMs]);

  return (
    <div className="space-y-8 px-5 py-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-sm text-muted">A snapshot of what’s on the shelf.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Songs" value={String(tracks.length)} />
        <Stat label="Albums" value={String(albums.length)} />
        <Stat label="Artists" value={String(artists.length)} />
        <Stat label="Genres" value={String(genres.length)} />
        <Stat label="Time" value={hoursLabel(library.duration)} />
        <Stat label="Size" value={bytesLabel(library.bytes)} />
        <Stat label="Lossless" value={String(library.lossless)} />
        <Stat label="Unplayed" value={String(library.unplayed)} />
        <Stat label="Liked" value={String(library.liked)} />
        <Stat label="Rated albums" value={String(library.rated)} />
        <Stat label="Added this week" value={String(library.addedWeek)} />
        <Stat label="Today" value={minutesLabel(listenMs)} />
      </div>

      {library.formats.size > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Formats</p>
          <div className="flex flex-wrap gap-2">
            {[...library.formats.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => (
                <span key={name} className="rounded-full bg-surface px-3 py-1.5 text-sm">
                  {name}
                  <span className="ml-2 text-xs text-subtle">{n}</span>
                </span>
              ))}
          </div>
        </div>
      ) : null}

      {genres.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Genres</p>
          <div className="flex flex-wrap gap-2">
            {genres.slice(0, 12).map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => playIds(g.albums.flatMap((a) => a.trackIds))}
                className="rounded-full bg-surface px-3 py-1.5 text-sm hover:bg-raised"
              >
                {g.name}
                <span className="ml-2 text-xs text-subtle">{g.albums.length}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Listening</h2>
        <p className="mt-1 text-sm text-muted">How you’ve been playing it.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Stat label="Today" value={minutesLabel(listenMs)} />
        <Stat label="Streak" value={`${streak}d`} />
        <Stat label="Plays" value={String(Object.values(plays).reduce((a, b) => a + b, 0))} />
      </div>

      <div>
        <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Last 7 days</p>
        <div className="flex h-24 items-end gap-2">
          {days.map((d) => {
            const ms = listenLog[d] ?? (d === days[days.length - 1] ? listenMs : 0);
            const h = Math.max(4, (ms / maxDay) * 100);
            return (
              <div key={d} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-sm bg-accent/80" style={{ height: `${h}%` }} />
                <span className="text-[10px] text-subtle">{d.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Most played</p>
        {topTracks.length === 0 ? (
          <p className="text-sm text-muted">Play a few songs and they’ll rank here.</p>
        ) : (
          <ul className="max-w-xl space-y-1">
            {topTracks.map(({ track, n }, i) => (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => playIndex(tracks.findIndex((t) => t.id === track.id))}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <span className="w-5 text-xs text-subtle">{i + 1}</span>
                  <div className="size-10 overflow-hidden rounded-md bg-raised">
                    {track.coverUrl ? <img src={track.coverUrl} alt="" className="size-full object-cover" /> : null}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{track.name}</span>
                    <span className="block truncate text-xs text-muted">{track.artist}</span>
                  </span>
                  <span className="text-xs text-subtle">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {topArtists.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-subtle">Artists</p>
          <div className="flex flex-wrap gap-2">
            {topArtists.map(([name, n]) => (
              <span key={name} className="rounded-full bg-surface px-3 py-1.5 text-sm">
                {name}
                <span className="ml-2 text-xs text-subtle">{n}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-xs uppercase tracking-widest text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}