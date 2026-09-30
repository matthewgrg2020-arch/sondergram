import { ChevronRight, Dices, Ellipsis, EyeOff, Plus, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { groupAlbums, type AlbumGroup } from "@/lib/player/catalog";
import { AUDIO_ACCEPT } from "@/lib/player/format";
import { libraryMixes } from "@/lib/player/mixes";
import { usePlayer, type Track } from "@/lib/player/store";
import { proxyCoverUrl } from "@/lib/player/covers";

function songsOf(album: AlbumGroup, tracks: Track[]) {
  return album.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t));
}

const MOODS: { id: string; label: string; match: (t: Track) => boolean }[] = [
  {
    id: "chill",
    label: "Chill",
    match: (t) => /chill|lofi|lo-fi|ambient|jazz|soul|acoustic|soft/i.test(`${t.genre} ${t.tags?.join(" ")} ${t.name}`),
  },
  {
    id: "energy",
    label: "Energy",
    match: (t) => /hip.?hop|rap|edm|techno|house|punk|metal|rock|drill|trap/i.test(`${t.genre} ${t.tags?.join(" ")}`),
  },
  {
    id: "focus",
    label: "Focus",
    match: (t) => /classical|instrumental|piano|study|focus|ambient/i.test(`${t.genre} ${t.tags?.join(" ")} ${t.name}`),
  },
  {
    id: "late",
    label: "Late night",
    match: (t) => /r&b|rnb|soul|neo.?soul|slow|ballad|night/i.test(`${t.genre} ${t.tags?.join(" ")} ${t.name}`),
  },
  {
    id: "loved",
    label: "Loved",
    match: (t) => Boolean(t.liked || t.starred),
  },
];

function shuffle<T>(arr: T[]) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

export function ListenNow({
  onOpenLibrary,
  onOpenAlbum,
  onOpenAdd,
}: {
  onOpenLibrary: () => void;
  onOpenAlbum?: (key: string) => void;
  onOpenAdd?: () => void;
}) {
  const tracks = usePlayer((s) => s.tracks);
  const plays = usePlayer((s) => s.plays);
  const recent = usePlayer((s) => s.recent);
  const playIds = usePlayer((s) => s.playIds);
  const addFiles = usePlayer((s) => s.addFiles);
  const djMix = usePlayer((s) => s.djMix);
  const inputRef = useRef<HTMLInputElement>(null);
  const [blind, setBlind] = useState(false);
  const [blindHint, setBlindHint] = useState("");

  const albums = useMemo(() => groupAlbums(tracks), [tracks]);

  const heroes = useMemo(() => {
    const mixes = libraryMixes(tracks, plays, recent).slice(0, 3);
    if (mixes.length >= 3) {
      return mixes.map((m, i) => ({
        id: m.id,
        title: m.title,
        subtitle: m.subtitle,
        cover: m.covers.find(Boolean) ?? null,
        trackIds: m.trackIds,
        tone: ["from-rose-900/80", "from-indigo-900/80", "from-emerald-900/80"][i] ?? "from-zinc-800",
      }));
    }
    const topAlbums = [...albums]
      .sort((a, b) => {
        const pa = songsOf(a, tracks).reduce((n, t) => n + (plays[t.id] ?? 0), 0);
        const pb = songsOf(b, tracks).reduce((n, t) => n + (plays[t.id] ?? 0), 0);
        return pb - pa;
      })
      .slice(0, 3);
    return topAlbums.map((a, i) => ({
      id: a.key,
      title: a.title,
      subtitle: a.artist,
      cover: a.coverUrl,
      trackIds: a.trackIds,
      tone: ["from-rose-900/80", "from-indigo-900/80", "from-emerald-900/80"][i] ?? "from-zinc-800",
    }));
  }, [tracks, plays, recent, albums]);

  const bestNew = useMemo(() => {
    const byAdded = [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    const byPlays = [...tracks].sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0));
    return (byAdded.length ? byAdded : byPlays).slice(0, 16);
  }, [tracks, plays]);

  const newThisWeek = useMemo(() => {
    return [...albums]
      .sort((a, b) => {
        const aa = Math.max(...songsOf(a, tracks).map((t) => t.addedAt ?? 0), 0);
        const bb = Math.max(...songsOf(b, tracks).map((t) => t.addedAt ?? 0), 0);
        return bb - aa;
      })
      .slice(0, 12);
  }, [albums, tracks]);

  const moodCounts = useMemo(() => {
    return MOODS.map((m) => ({
      ...m,
      count: tracks.filter(m.match).length,
      ids: tracks.filter(m.match).map((t) => t.id),
    })).filter((m) => m.count > 0);
  }, [tracks]);

  const startBlindListen = () => {
    if (!tracks.length) return;
    const pool = shuffle(tracks).slice(0, Math.min(25, tracks.length));
    setBlind(true);
    setBlindHint("Playing a hidden mix — open Now Playing to listen without spoilers");
    playIds(pool.map((t) => t.id));
  };

  const startSurprise = () => {
    if (typeof djMix === "function") {
      djMix();
      return;
    }
    if (!tracks.length) return;
    playIds(shuffle(tracks).slice(0, 40).map((t) => t.id));
  };

  if (tracks.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-start justify-center px-5 py-8">
        <p className="text-sm text-white/50">Drop files here or add tracks to fill your library.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="relative inline-flex h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-white px-4 text-sm font-medium text-black">
            <Plus className="size-4" strokeWidth={1.75} />
            Add files
            <input
              ref={inputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
          {onOpenAdd ? (
            <button
              type="button"
              onClick={onOpenAdd}
              className="inline-flex h-10 items-center rounded-full bg-white/10 px-4 text-sm font-medium text-white"
            >
              Archive & more
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 pt-2 sm:px-6">
      {/* New feature chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startBlindListen}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/16"
        >
          <EyeOff className="size-3.5" strokeWidth={2} />
          Blind listen
        </button>
        <button
          type="button"
          onClick={startSurprise}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/16"
        >
          <Dices className="size-3.5" strokeWidth={2} />
          Surprise mix
        </button>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/16"
        >
          <Sparkles className="size-3.5" strokeWidth={2} />
          Browse library
        </button>
      </div>
      {blind && blindHint ? (
        <p className="mb-4 rounded-xl bg-white/8 px-3 py-2 text-xs text-white/70">{blindHint}</p>
      ) : null}

      {/* Mood mixer */}
      {moodCounts.length > 0 ? (
        <section className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Mood mixer</p>
          <div className="flex flex-wrap gap-2">
            {moodCounts.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => playIds(shuffle(m.ids).slice(0, 40))}
                className="h-9 rounded-full bg-[#2c2c2e] px-3 text-xs font-medium text-white hover:bg-white/16"
              >
                {m.label}
                <span className="ml-1.5 text-white/40">{m.count}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {heroes.length > 0 ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {heroes.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => playIds(card.trackIds)}
              className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-[#2c2c2e] text-left shadow-lg"
            >
              {card.cover ? (
                <img
                  src={proxyCoverUrl(card.cover)}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : null}
              <div className={`absolute inset-0 bg-gradient-to-t ${card.tone} via-black/40 to-transparent`} />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-lg font-bold tracking-tight text-white sm:text-xl">{card.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{card.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <section className="mb-10">
        <button
          type="button"
          onClick={onOpenLibrary}
          className="mb-3 flex items-center gap-1 text-left text-xl font-bold tracking-tight text-white hover:text-white/80"
        >
          Best New Songs
          <ChevronRight className="size-5 opacity-50" strokeWidth={2} />
        </button>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
          {bestNew.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => playIds([track.id])}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/6"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-md bg-white/8">
                {track.coverUrl ? (
                  <img src={proxyCoverUrl(track.coverUrl)} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-white/30">
                    {(track.name || "?").slice(0, 1)}
                  </div>
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-white">{track.name}</span>
                <span className="block truncate text-[12px] text-white/45">{track.artist}</span>
              </span>
              <Ellipsis className="size-4 shrink-0 text-white/0 transition group-hover:text-white/40" strokeWidth={2} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="mb-3 flex items-center gap-1 text-left text-xl font-bold tracking-tight text-white hover:text-white/80"
        >
          New This Week
          <ChevronRight className="size-5 opacity-50" strokeWidth={2} />
        </button>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {newThisWeek.map((album) => (
            <button
              key={album.key}
              type="button"
              onClick={() => (onOpenAlbum ? onOpenAlbum(album.key) : playIds(album.trackIds))}
              className="w-[9.5rem] shrink-0 text-left sm:w-40"
            >
              <div className="aspect-square overflow-hidden rounded-lg bg-white/8 shadow-md">
                {album.coverUrl ? (
                  <img src={proxyCoverUrl(album.coverUrl)} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <p className="mt-2 truncate text-[13px] font-medium text-white">{album.title}</p>
              <p className="truncate text-[12px] text-white/45">{album.artist}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
