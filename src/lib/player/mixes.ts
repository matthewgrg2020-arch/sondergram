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
    mix("favorites", "Favorites Mix", "Songs you hearted", tracks, liked),
    mix("rotation", "Heavy Rotation", "What you keep playing", tracks, heavy),
    mix("new", "Recently Added", "Fresh to the shelf", tracks, added),
    mix("replay", "Replay", "Your recent spins", tracks, replay),
    ...fromTags,
  ].filter((row): row is Mix => Boolean(row));
}