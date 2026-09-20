import { groupAlbums, groupTags } from "./catalog";
import type { Track } from "./store";

export type Mix = {
  id: string;
  title: string;
  subtitle: string;
  trackIds: string[];
  covers: (string | null)[];
};

function coversOf(tracks: Track[], ids: string[]) {
  const seen = new Set<string>();
  const covers: (string | null)[] = [];
  for (const id of ids) {
    const track = tracks.find((t) => t.id === id);
    const src = track?.coverUrl ?? null;
    const key = src ?? `letter:${track?.name ?? id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    covers.push(src);
    if (covers.length >= 4) break;
  }
  return covers;
}

function mix(id: string, title: string, subtitle: string, tracks: Track[], ids: string[]): Mix | null {
  if (ids.length === 0) return null;
  return { id, title, subtitle, trackIds: ids, covers: coversOf(tracks, ids) };
}

function timeOfDayMix(tracks: Track[], plays: Record<string, number>): Mix | null {
  const hour = new Date().getHours();
  const liked = tracks.filter((t) => t.liked);
  const starred = tracks.filter((t) => t.starred);
  const heavy = [...tracks]
    .sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0))
    .filter((t) => (plays[t.id] ?? 0) > 0);
  let title = "For you";
  let subtitle = "Made for you";
  let pool: Track[] = [];
  if (hour < 5 || hour >= 21) {
    title = "Night mix";
    subtitle = "Late listening";
    pool = starred.length ? starred : liked.length ? liked : heavy;
  } else if (hour < 12) {
    title = "Morning mix";
    subtitle = "Start the day";
    pool = liked.length ? liked : heavy;
  } else if (hour < 17) {
    title = "Afternoon mix";
    subtitle = "Keep it going";
    pool = heavy.length ? heavy : liked.length ? liked : tracks;
  } else {
    title = "Evening mix";
    subtitle = "Wind down";
    pool = liked.length ? liked : starred.length ? starred : heavy;
  }
  if (pool.length < 4) pool = tracks;
  const ids = pool.slice(0, 24).map((t) => t.id);
  return mix("timeday", title, subtitle, tracks, ids);
}

export function homeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function libraryMixes(
  tracks: Track[],
  plays: Record<string, number>,
  recent: string[],
): Mix[] {
  const liked = tracks.filter((t) => t.liked).map((t) => t.id);
  const heavy = [...tracks]
    .sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0))
    .filter((t) => (plays[t.id] ?? 0) > 0)
    .slice(0, 24)
    .map((t) => t.id);
  const added = [...tracks]
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .slice(0, 24)
    .map((t) => t.id);
  const replay = recent.filter((id) => tracks.some((t) => t.id === id)).slice(0, 24);
  const fromTags = groupTags(groupAlbums(tracks))
    .slice(0, 4)
    .map((tag) =>
      mix(
        `tag:${tag.name}`,
        `${tag.name} Mix`,
        "Made for you",
        tracks,
        tag.albums.flatMap((a) => a.trackIds).slice(0, 24),
      ),
    );

  return [
    timeOfDayMix(tracks, plays),
    mix("favorites", "Favorites Mix", "Songs you hearted", tracks, liked),
    mix("rotation", "Heavy Rotation", "What you keep playing", tracks, heavy),
    mix("new", "Recently Added", "Fresh to the shelf", tracks, added),
    mix("replay", "Replay", "Your recent spins", tracks, replay),
    ...fromTags,
  ].filter((row): row is Mix => Boolean(row));
}