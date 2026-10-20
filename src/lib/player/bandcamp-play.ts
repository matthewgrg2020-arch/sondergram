// @ts-nocheck
import { bcImport, bcStream } from "./bandcamp-api";
import { putStoredTrack } from "./persist";
import { beginPlayback, resumeEngine } from "./engine";

export function liveBandcampUrl(src) {
  if (!src || !/^https?:/i.test(src)) return "";
  if (/bandcamp\.com\/(?:album|track|music)/i.test(src)) return "";
  if (!/bcbits\.com/i.test(src)) return "";
  try {
    const ts = Number(new URL(src).searchParams.get("ts"));
    if (Number.isFinite(ts) && ts > 0 && ts * 1000 < Date.now() + 20_000) return "";
  } catch {}
  return src;
}

export async function importBandcampTracks(get, set, url, autoplay = true) {
  const album = await bcImport({ data: { url } });
  const have = new Set(get().tracks.map((t) => t.bandcampId || t.previewUrl).filter(Boolean));
  const incoming = [];
  const ids = [];
  for (const row of album.tracks) {
    const key = row.url || row.id;
    if (have.has(key) || have.has(row.id)) {
      const existing = get().tracks.find((t) => t.bandcampId === row.id || t.previewUrl === row.url);
      if (existing) ids.push(existing.id);
      continue;
    }
    have.add(key);
    const id = crypto.randomUUID();
    ids.push(id);
    incoming.push({
      id,
      name: row.name,
      artist: row.artist,
      album: row.album,
      genre: row.genre || "",
      tags: row.tags || ["Bandcamp"],
      year: row.year || "",
      url: row.url || row.page || "",
      coverUrl: row.cover || null,
      format: "MP3",
      sampleRate: 44100,
      bitDepth: null,
      bitrate: 128,
      channels: 2,
      lossless: false,
      liked: false,
      starred: false,
      trackNo: row.trackNo,
      diskNo: 1,
      durationSec: row.duration,
      albumArtist: album.artist,
      albumNote: row.note,
      bandcampId: row.id,
      bandcampUrl: row.page,
      previewUrl: row.url || undefined,
      addedAt: Date.now(),
    });
  }
  if (incoming.length) {
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    get().flash(`Added ${incoming.length} tracks from ${album.album}`);
    await Promise.all(
      incoming.map((track, i) =>
        putStoredTrack({
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          genre: track.genre,
          tags: track.tags,
          year: track.year,
          format: track.format,
          sampleRate: track.sampleRate,
          bitDepth: null,
          bitrate: track.bitrate,
          channels: 2,
          lossless: false,
          trackNo: track.trackNo,
          duration: track.durationSec,
          albumArtist: track.albumArtist,
          albumNote: track.albumNote,
          coverRemote: track.coverUrl || undefined,
          bandcampId: track.bandcampId,
          bandcampUrl: track.bandcampUrl,
          previewUrl: track.previewUrl,
          audio: new Blob([track.bandcampId || track.id], { type: "text/plain" }),
          cover: null,
          addedAt: Date.now() + i,
        }).catch(() => undefined),
      ),
    );
  }
  const playable = incoming.map((t) => t.id);
  if (autoplay && (playable.length || ids.length)) get().playIds(playable.length ? playable : ids);
  return incoming.length;
}

export async function playBandcampTrack(get, set, track, index) {
  const saved = liveBandcampUrl(track.previewUrl) || liveBandcampUrl(track.url);
  const page = track.bandcampUrl || "";
  const play = async (src) => {
    if (!get().playing || get().index !== index) return;
    const proxied = `/api/stream?u=${encodeURIComponent(src)}${page ? `&ref=${encodeURIComponent(page)}` : ""}`;
    try {
      await beginPlayback(proxied, 0);
      if (get().playing) await resumeEngine();
    } catch (err) {
      console.warn("bandcamp play failed", err);
      get().flash("Could not start that Bandcamp track");
    }
  };
  if (saved) void play(saved);
  else get().flash("Loading Bandcamp…");
  try {
    const fresh = await bcStream({
      data: {
        url: track.bandcampUrl || track.url,
        id: track.bandcampId,
        name: track.name,
        artist: track.artist,
        album: track.album,
      },
    });
    if (get().index !== index || !fresh?.url) {
      if (!saved) get().flash("Bandcamp has no stream for that track");
      return;
    }
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === track.id
          ? {
              ...t,
              previewUrl: fresh.url,
              url: fresh.url,
              bandcampUrl: fresh.page || t.bandcampUrl,
              durationSec: fresh.duration || t.durationSec,
            }
          : t,
      ),
    }));
    if (!saved || fresh.url !== saved) await play(fresh.url);
  } catch (err) {
    if (get().index !== index || saved) return;
    get().flash(err instanceof Error ? err.message : "Bandcamp stream failed");
  }
}
