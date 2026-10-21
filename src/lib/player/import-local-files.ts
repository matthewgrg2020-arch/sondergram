import { putStoredTrack } from "./persist";
import { isAudioFile, copyAudioBlob } from "./format";
import { readFileTags, tagsFromFilename, trackNoFromName } from "./tags";

/** Import local File objects into IndexedDB + return track objects for the store. */
export async function importLocalFiles(files, get, set, playUrls) {
  const list = Array.from(files || []).filter(
    (f) => f && (isAudioFile(f) || /\.(mp3|m4a|aac|flac|wav|aiff|aif|ogg|opus|wma|alac)$/i.test(f.name || "")),
  );
  if (!list.length) {
    get().flash("No audio files selected");
    return 0;
  }
  const incoming = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    try {
      const tags = await readFileTags(file, file.name || "track");
      const fromName = tagsFromFilename(file.name || "track");
      const id = crypto.randomUUID();
      const audio = await copyAudioBlob(file);
      const format = (tags.format || fromName.format || "AUDIO").toUpperCase();
      const name = tags.title || fromName.title || file.name || "Untitled";
      const artist = tags.artist || fromName.artist || "Unknown artist";
      const album = tags.album || fromName.album || "Unknown album";
      let coverUrl = tags.coverUrl || null;
      const cover = tags.coverBlob || null;
      if (!coverUrl && cover) {
        try {
          coverUrl = URL.createObjectURL(cover);
        } catch {}
      }
      const track = {
        id,
        name,
        artist,
        album,
        genre: tags.genre || "",
        tags: tags.tags?.length ? tags.tags : ["Local"],
        year: tags.year || "",
        url: "",
        coverUrl,
        format,
        sampleRate: tags.sampleRate ?? null,
        bitDepth: tags.bitDepth ?? null,
        bitrate: tags.bitrate ?? null,
        channels: tags.channels ?? null,
        lossless: Boolean(tags.lossless) || /flac|wav|aiff|alac/i.test(format),
        liked: false,
        starred: false,
        addedAt: Date.now() + i,
        trackNo: tags.trackNo || trackNoFromName(file.name || "") || undefined,
        diskNo: tags.diskNo || undefined,
        durationSec: tags.duration || undefined,
        bytes: file.size,
        albumArtist: tags.albumArtist || undefined,
        explicit: Boolean(tags.explicit),
      };
      await putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: track.sampleRate,
        bitDepth: track.bitDepth,
        bitrate: track.bitrate,
        channels: track.channels,
        lossless: track.lossless,
        liked: false,
        starred: false,
        audio,
        cover,
        addedAt: track.addedAt,
        trackNo: track.trackNo,
        diskNo: track.diskNo,
        duration: track.durationSec,
        bytes: track.bytes,
        albumArtist: track.albumArtist,
        explicit: track.explicit,
      });
      try {
        const url = URL.createObjectURL(audio);
        playUrls.set(id, url);
        track.url = url;
      } catch {}
      incoming.push(track);
    } catch (err) {
      console.warn("importLocalFiles failed for", file?.name, err);
    }
  }
  if (!incoming.length) {
    get().flash("Could not import those files");
    return 0;
  }
  set((s) => ({ tracks: [...s.tracks, ...incoming] }));
  get().flash(incoming.length === 1 ? `Added “${incoming[0].name}”` : `Added ${incoming.length} tracks`);
  return incoming.length;
}
