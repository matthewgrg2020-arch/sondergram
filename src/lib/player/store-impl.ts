// @ts-nocheck
import { create } from "zustand";
import { FLAT_EQ, type EqGains } from "./constants";
import type { IsolateMode, RemasterPreset, SpatialPreset } from "./engine";
import {
  applyEq, applyPreamp, setBassLock, setRemaster as engSetRemaster,
  setSpatialMode, setBalance as engSetBalance, setMasterGain, setPlaybackRate,
  unlockEngine, primePlayback, beginPlayback, resumeEngine, setAudioSessionPlayback,
} from "./engine";
import type { VizMode } from "./session";
import type { UserPlaylist } from "./playlists";
import type { StreamHit } from "./stream-search";
import type { FoundAudio } from "./find-audio";
import type { SlsKFile } from "./soulseek";
import { listStoredTracks, putStoredTrack, clearStoredLibrary, deleteStoredTrack, getAudioBlob } from "./persist";
import { exportLibraryBackup, importLibraryBackup } from "./backup";
import { isAudioFile, copyAudioBlob } from "./format";
import { albumKey, compareTracks } from "./catalog";
import { readFileTags, tagsFromFilename, trackNoFromName } from "./tags";
import { isExplicitContent } from "./explicit";
import { loadSlskSession, parseSlskTrackId, polishTrackFromFilename, slskStreamUrl, slskTrackId } from "./soulseek";
import { parseYoutubeId, youtubeThumb } from "./youtube";
import { importBandcampTracks, playBandcampTrack } from "./bandcamp-play";
import { resolveFullTrack } from "./stream-search-api";
import { resolveIbUrl } from "./ib-play";
import { importLocalFiles } from "./import-local-files";

export type RepeatMode = "off" | "all" | "one";
export type StopAfter = "off" | "track" | "album";
export type { IsolateMode, RemasterPreset, SpatialPreset, VizMode };

export type Track = {
  id: string; name: string; artist: string; album: string; genre: string; tags: string[];
  year: string; url: string; coverUrl: string | null; format: string;
  sampleRate: number | null; bitDepth: number | null; bitrate: number | null; channels: number | null;
  lossless: boolean; liked: boolean; starred: boolean;
  youtubeId?: string; ibroadcastId?: string; ibFile?: string; deezerId?: string; spotifyId?: string;
  archiveId?: string; bandcampId?: string; bandcampUrl?: string; qobuzId?: string; appleId?: string;
  previewUrl?: string; addedAt?: number; trackNo?: number; diskNo?: number; durationSec?: number;
  bytes?: number; albumArtist?: string; explicit?: boolean; albumNote?: string;
  mvId?: string; mvUrl?: string; mvThumb?: string; single?: boolean; popular?: boolean;
  chartRank?: number; albumRating?: number; artistGenre?: string; artistTags?: string[];
  metaEdited?: boolean; amazonId?: string; soulseekId?: string; replayGain?: number;
  forceYoutube?: boolean; rating?: number;
};

const asyncNoop = async () => 0;
const SETTINGS_KEY = "sondergram:playback-settings";
const playUrls = new Map();

function loadPlaybackSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePlaybackSettings(partial) {
  try {
    const prev = loadPlaybackSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {}
}

async function ensurePlayUrl(track) {
  if (track.url && (track.url.startsWith("blob:") || track.url.startsWith("http") || track.url.startsWith("/api/"))) return track.url;
  if (track.ibroadcastId || (track.url && String(track.url).startsWith("ib:"))) {
    const ib = resolveIbUrl(track);
    if (ib) return ib;
  }
  if (playUrls.has(track.id)) return playUrls.get(track.id);
  try {
    const blob = await getAudioBlob(track.id);
    if (blob && blob.size > 64) {
      const url = URL.createObjectURL(blob);
      playUrls.set(track.id, url);
      return url;
    }
  } catch {}
  return track.previewUrl || track.url || "";
}

function storedToTrack(row) {
  let url = "";
  if (row.soulseekId) {
    const session = loadSlskSession();
    const parsed = parseSlskTrackId(row.soulseekId);
    if (parsed.username && parsed.filename) url = slskStreamUrl({ username: parsed.username, filename: parsed.filename }, session);
  } else if (row.ibroadcastId && row.ibFile) {
    url = resolveIbUrl({ ibroadcastId: row.ibroadcastId, ibFile: row.ibFile, url: `ib:${row.ibroadcastId}` }) || `ib:${row.ibroadcastId}`;
  } else if (row.previewUrl) url = row.previewUrl;
  else if (row.youtubeId) url = `yt:${row.youtubeId}`;
  let coverUrl = row.coverRemote || null;
  if (!coverUrl && row.cover) {
    try { coverUrl = URL.createObjectURL(row.cover instanceof Blob ? row.cover : new Blob([row.cover])); } catch {}
  }
  return {
    id: row.id, name: row.name, artist: row.artist, album: row.album, genre: row.genre || "",
    tags: row.tags || [], year: row.year || "", url, coverUrl, format: row.format || "",
    sampleRate: row.sampleRate ?? null, bitDepth: row.bitDepth ?? null, bitrate: row.bitrate ?? null,
    channels: row.channels ?? null, lossless: Boolean(row.lossless), liked: Boolean(row.liked),
    starred: Boolean(row.starred), youtubeId: row.youtubeId, ibroadcastId: row.ibroadcastId,
    ibFile: row.ibFile, deezerId: row.deezerId, spotifyId: row.spotifyId, archiveId: row.archiveId,
    bandcampId: row.bandcampId, bandcampUrl: row.bandcampUrl, qobuzId: row.qobuzId, appleId: row.appleId,
    previewUrl: row.previewUrl, addedAt: row.addedAt, trackNo: row.trackNo, diskNo: row.diskNo,
    durationSec: row.duration, bytes: row.bytes, albumArtist: row.albumArtist, explicit: row.explicit,
    albumNote: row.albumNote, amazonId: row.amazonId, soulseekId: row.soulseekId, replayGain: row.replayGain,
  };
}

const init = typeof localStorage !== "undefined" ? loadPlaybackSettings() : {
  bookmarks: true, bookmarkPrompt: true, skipLowRated: false, skipSeconds: 30,
  playRecordPercent: 50, restrictData: false, autoFullScreen: false,
};

export const usePlayer = create((set, get) => ({
  tracks: [], index: -1, ready: false, playing: false, currentTime: 0, duration: 0,
  volume: 0.85, muted: false, shuffle: false, repeat: "off",
  eq: [...FLAT_EQ], preamp: 0, presetId: "flat", customPresets: [],
  rate: 1, pitch: 0, isolate: "mix", spatial: "off", spatialAmount: 0.7,
  radio: false, radioRecent: [], upNext: [], notice: null, crossfade: 4,
  sleep: null, sleepUntil: null, stopAfter: "off", recent: [], plays: {}, positions: {},
  listenMs: 0, listenDay: "", listenLog: [], balance: 0, viz: "bars",
  focus: false, quiet: false, normalize: false, skipSilence: false, bassLock: false,
  haptic: false, shakeSkip: false, gapless: true, mono: false, remaster: "off",
  remasterAmt: 0.7, autoEq: false, playlists: [], loopA: null, loopB: null,
  bookmarks: init.bookmarks, bookmarkPrompt: init.bookmarkPrompt, skipLowRated: init.skipLowRated,
  skipSeconds: init.skipSeconds, playRecordPercent: init.playRecordPercent,
  restrictData: init.restrictData, autoFullScreen: init.autoFullScreen,

  hydrate: async () => {
    try {
      const rows = await listStoredTracks();
      const tracks = rows.map(storedToTrack);
      for (const t of tracks) {
        if (!t.soulseekId && !t.youtubeId && !t.previewUrl && !t.bandcampId && !t.amazonId && !t.ibroadcastId) {
          try {
            const blob = await getAudioBlob(t.id);
            if (blob && blob.size > 64) {
              const url = URL.createObjectURL(blob);
              playUrls.set(t.id, url);
              t.url = url;
            }
          } catch {}
        }
      }
      set({ tracks, ready: true, ...loadPlaybackSettings() });
    } catch (err) {
      console.warn("hydrate failed", err);
      set({ ready: true, ...loadPlaybackSettings() });
    }
  },

  playIndex: (index) => {
    const tracks = get().tracks;
    if (index < 0 || index >= tracks.length) return;
    const track = tracks[index];
    try { unlockEngine(); primePlayback(); setAudioSessionPlayback(); } catch {}
    set({ index, playing: true, currentTime: 0 });
    if (track.bandcampId) {
      void playBandcampTrack(get, set, track, index);
      return;
    }
    void (async () => {
      let url = track.url || "";
      if (!url || (!url.startsWith("http") && !url.startsWith("/api/") && !url.startsWith("blob:") && !url.startsWith("yt:"))) {
        url = (await ensurePlayUrl(track)) || "";
        if (url && url !== track.url) {
          set((s) => ({ tracks: s.tracks.map((t, i) => (i === index ? { ...t, url } : t)) }));
        }
      }
      if ((url.startsWith("ib:") || track.ibroadcastId) && !url.startsWith("http") && !url.startsWith("/api/")) {
        const ib = resolveIbUrl(track);
        if (ib) {
          url = ib;
          set((s) => ({
            tracks: s.tracks.map((t, i) => (i === index ? { ...t, url } : t)),
          }));
        } else {
          get().flash("Sign in to iBroadcast to play this track");
          return;
        }
      }
      if ((url.startsWith("yt:") || track.youtubeId) && !url.startsWith("http")) {
        const youtubeId = track.youtubeId || url.slice(3);
        try {
          const full = await resolveFullTrack({
            data: {
              artist: track.artist,
              name: track.name,
              album: track.album,
              duration: track.durationSec,
              youtubeId,
            },
          });
          if (full?.url) {
            url = full.url;
            set((s) => ({
              tracks: s.tracks.map((t, i) =>
                i === index ? { ...t, url, previewUrl: full.url, youtubeId: full.youtubeId || youtubeId } : t,
              ),
            }));
          } else {
            get().flash("Could not resolve YouTube audio");
            return;
          }
        } catch (err) {
          console.warn("resolveFullTrack failed", err);
          get().flash("Could not resolve YouTube audio");
          return;
        }
      }
      if (!url) {
        get().flash("No audio for this track yet");
        return;
      }
      if (url.startsWith("yt:")) {
        get().flash("No streamable audio for this track");
        return;
      }
      try {
        await beginPlayback(url, 0);
        if (get().playing) await resumeEngine();
      } catch (err) {
        console.warn("playIndex beginPlayback failed", err);
        get().flash("Could not start that track");
      }
    })();
  },
  playIds: (ids) => {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return;
    const tracks = get().tracks;
    const first = unique[0];
    const index = tracks.findIndex((t) => t.id === first);
    if (index < 0) return;
    set({ upNext: unique.slice(1), radio: false });
    get().playIndex(index, true);
  },
  queueNext: (id) => set((s) => ({ upNext: [id, ...s.upNext.filter((x) => x !== id)] })),
  queueNextMany: (ids) => set((s) => {
    const hold = new Set(ids);
    return { upNext: [...ids, ...s.upNext.filter((x) => !hold.has(x))] };
  }),
  queueLast: (id) => set((s) => ({ upNext: [...s.upNext.filter((x) => x !== id), id] })),
  playRest: (id) => {
    const tracks = get().tracks;
    const current = tracks.find((t) => t.id === id);
    if (!current) return;
    const album = tracks.filter((t) => albumKey(t) === albumKey(current)).sort(compareTracks);
    const i = album.findIndex((t) => t.id === id);
    if (i < 0) return;
    get().playIds(album.slice(i).map((t) => t.id));
  },
  playAlbum: (id) => {
    const tracks = get().tracks;
    const current = tracks.find((t) => t.id === id);
    if (!current) return;
    get().playIds(tracks.filter((t) => albumKey(t) === albumKey(current)).sort(compareTracks).map((t) => t.id));
  },
  skipAlbum: () => {
    const { tracks, index, upNext } = get();
    const current = tracks[index];
    if (!current) return;
    const key = albumKey(current);
    const rest = upNext.filter((id) => {
      const t = tracks.find((x) => x.id === id);
      return t && albumKey(t) !== key;
    });
    set({ upNext: rest });
    const next = get().nextIndex(true);
    if (next !== null) get().playIndex(next, true);
  },
  clearQueue: () => set({ upNext: [] }),
  flash: (message) => set({ notice: message }),
  setPlaying: (playing) => set({ playing }),
  setTimes: (currentTime, duration) => set({ currentTime, duration }),
  setVolume: (volume) => { set({ volume }); try { setMasterGain(volume); } catch {} },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () => set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
  setEqBand: (index, value) => set((s) => {
    const eq = s.eq.slice(); eq[index] = value;
    try { applyEq(eq); } catch {}
    return { eq, presetId: "custom" };
  }),
  setPreamp: (value) => { set({ preamp: value, presetId: "custom" }); try { applyPreamp(value); } catch {} },
  applyPreset: (id, gains, preamp) => {
    set({ eq: gains.slice(), preamp, presetId: id });
    try { applyEq(gains); applyPreamp(preamp); } catch {}
  },
  saveCustomPreset: (label) => {
    const name = (label || "").trim().slice(0, 24) || "Custom";
    set((s) => ({ customPresets: [...s.customPresets.filter((p) => p.name !== name), { name, eq: s.eq.slice(), preamp: s.preamp }] }));
  },
  deleteCustomPreset: (name) => set((s) => ({ customPresets: s.customPresets.filter((p) => p.name !== name) })),
  setRate: (rate) => { set({ rate }); try { setPlaybackRate(rate); } catch {} },
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setSpatial: (spatial) => { set({ spatial }); try { setSpatialMode(spatial); } catch {} },
  setSpatialAmount: (spatialAmount) => set({ spatialAmount }),
  setBalance: (balance) => { set({ balance }); try { engSetBalance(balance); } catch {} },
  setViz: (viz) => set({ viz }),
  setFocus: (focus) => set({ focus }),
  setQuiet: (quiet) => set({ quiet }),
  setNormalize: (normalize) => set({ normalize }),
  setSkipSilence: (skipSilence) => set({ skipSilence }),
  setBassLock: (bassLock) => { set({ bassLock }); try { setBassLock(bassLock); } catch {} },
  setHaptic: (haptic) => set({ haptic }),
  setShakeSkip: (shakeSkip) => set({ shakeSkip }),
  setGapless: (gapless) => set({ gapless }),
  setMono: (mono) => set({ mono }),
  setRemaster: (remaster) => { set({ remaster }); try { engSetRemaster(remaster); } catch {} },
  setRemasterAmt: (remasterAmt) => set({ remasterAmt }),
  setAutoEq: (autoEq) => set({ autoEq }),
  setCrossfade: (crossfade) => set({ crossfade }),
  setLoopA: (loopA) => set({ loopA }),
  setLoopB: (loopB) => set({ loopB }),
  setStopAfter: (stopAfter) => set({ stopAfter }),
  setRadio: (radio) => set({ radio }),
  patchTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  updateMeta: (id, patch) => {
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch, metaEdited: true } : t)) }));
    const row = get().tracks.find((t) => t.id === id);
    if (row) void putStoredTrack({ ...row, audio: new Blob(), cover: null }).catch(() => {});
  },
  updateAlbumMeta: (ids, patch) => {
    const hold = new Set(ids || []);
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, ...patch } : t)) }));
  },
  removeTracks: (ids) => {
    const hold = new Set(ids || []);
    set((s) => {
      const tracks = s.tracks.filter((t) => !hold.has(t.id));
      let index = s.index;
      if (index >= tracks.length) index = tracks.length - 1;
      return { tracks, index, upNext: s.upNext.filter((id) => !hold.has(id)) };
    });
    for (const id of hold) {
      try { const u = playUrls.get(id); if (u) URL.revokeObjectURL(u); playUrls.delete(id); } catch {}
      void deleteStoredTrack(id).catch(() => {});
    }
  },
  addFiles: async (files) => {
    try {
      const n = await importLocalFiles(files);
      await get().hydrate();
      get().flash(n ? `Added ${n} files` : "No new audio files");
      return n;
    } catch (err) {
      console.warn("addFiles failed", err);
      get().flash("Could not import files");
      return 0;
    }
  },
  importFiles: async (files) => get().addFiles(files),
  importBandcamp: async (url, autoplay = true) => importBandcampTracks(get, set, url, autoplay),
  importStreamHits: asyncNoop,
  importFoundAudio: asyncNoop,
  importSlskFiles: asyncNoop,
  searchAlbumOnline: asyncNoop,
  applyAlbumHit: asyncNoop,
  importIbPlaylist: asyncNoop,
  setCover: async (ids, file) => {
    const hold = new Set(ids || []);
    let url = "";
    try { url = URL.createObjectURL(file); } catch {}
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl: url || t.coverUrl } : t)) }));
  },
  setCoverUrl: (ids, coverUrl) => {
    const hold = new Set(ids || []);
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl } : t)) }));
  },
  nextIndex: (force) => {
    const { tracks, index, shuffle, repeat, upNext } = get();
    if (!tracks.length) return null;
    if (upNext.length) {
      const id = upNext[0];
      const i = tracks.findIndex((t) => t.id === id);
      if (i >= 0) {
        set({ upNext: upNext.slice(1) });
        return i;
      }
    }
    if (repeat === "one" && !force) return index;
    if (shuffle) return Math.floor(Math.random() * tracks.length);
    const next = index + 1;
    if (next < tracks.length) return next;
    return repeat === "all" ? 0 : null;
  },
  prevIndex: () => {
    const { tracks, index, currentTime } = get();
    if (!tracks.length) return null;
    if (currentTime > 3) return index;
    const prev = index - 1;
    return prev >= 0 ? prev : tracks.length - 1;
  },
}));
