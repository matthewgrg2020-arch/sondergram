export type UserPlaylist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
};

const KEY = "sondergram:playlists";

export function loadPlaylists(): UserPlaylist[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as UserPlaylist[];
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.id === "string") : [];
  } catch {
    return [];
  }
}

export function savePlaylists(rows: UserPlaylist[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 40)));
}
