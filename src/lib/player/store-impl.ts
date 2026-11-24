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
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePlaybackSettings(partial) {
  try {
    if (typeof localStorage === "undefined") return;
    const prev = loadPlaybackSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {}
}

/** Persist EQ + related audio prefs immediately (critical on iOS where tabs die). */
function persistEqState(s) {
  savePlaybackSettings({
    eq: Array.isArray(s.eq) ? s.eq.slice() : [...FLAT_EQ],
    preamp: typeof s.preamp === "number" ? s.preamp : 0,
    presetId: s.presetId || "flat",
    customPresets: Array.isArray(s.customPresets) ? s.customPresets : [],
    bassLock: Boolean(s.bassLock),
    remaster: s.remaster || "off",
    remasterAmt: typeof s.remasterAmt === "number" ? s.remasterAmt : 0.7,
    spatial: s.spatial || "off",
    spatialAmount: typeof s.spatialAmount === "number" ? s.spatialAmount : 0.7,
    normalize: Boolean(s.normalize),
    volume: typeof s.volume === "number" ? s.volume : 0.85,
    rate: typeof s.rate === "number" ? s.rate : 1,
    gapless: s.gapless !== false,
    crossfade: typeof s.crossfade === "number" ? s.crossfade : 4,
  });
}

function normalizeCustomPresets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, i) => {
      if (!p || typeof p !== "object") return null;
      const id = String(p.id || p.name || `custom-${i}`);
      const label = String(p.label || p.name || "Custom").slice(0, 24);
      const gains = Array.isArray(p.gains)
        ? p.gains.slice()
        : Array.isArray(p.eq)
          ? p.eq.slice()
          : [...FLAT_EQ];
      while (gains.length < FLAT_EQ.length) gains.push(0);
      const preamp = typeof p.preamp === "number" ? p.preamp : 0;
      return { id, label, gains: gains.slice(0, FLAT_EQ.length), preamp };
    })
    .filter(Boolean);
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

const init = typeof localStorage !== "undefined" ? loadPlaybackSettings() : {};
const initEq = Array.isArray(init.eq) && init.eq.length ? init.eq.slice(0, FLAT_EQ.length) : [...FLAT_EQ];
while (initEq.length < FLAT_EQ.length) initEq.push(0);
const initCustomPresets = normalizeCustomPresets(init.customPresets);

export const usePlayer = create((set, get) => ({
  tracks: [], index: -1, ready: false, playing: false, currentTime: 0, duration: 0,
  volume: typeof init.volume === "number" ? init.volume : 0.85,
  muted: false, shuffle: false, repeat: "off",
  eq: initEq,
  preamp: typeof init.preamp === "number" ? init.preamp : 0,
  presetId: init.presetId || "flat",
  customPresets: initCustomPresets,
  rate: typeof init.rate === "number" ? init.rate : 1,
  pitch: 0, isolate: "mix",
  spatial: init.spatial || "off",
  spatialAmount: typeof init.spatialAmount === "number" ? init.spatialAmount : 0.7,
  radio: false, radioRecent: [], upNext: [], notice: null,
  crossfade: typeof init.crossfade === "number" ? init.crossfade : 4,
  sleep: null, sleepUntil: null, stopAfter: "off", recent: [], plays: {}, positions: {},
  listenMs: 0, listenDay: "", listenLog: [], balance: 0, viz: "bars",
  focus: false, quiet: false,
  normalize: Boolean(init.normalize),
  skipSilence: false,
  bassLock: Boolean(init.bassLock),
  haptic: false, shakeSkip: false,
  gapless: init.gapless !== false,
  mono: false,
  remaster: init.remaster || "off",
  remasterAmt: typeof init.remasterAmt === "number" ? init.remasterAmt : 0.7,
  autoEq: false, playlists: [], loopA: null, loopB: null,
  bookmarks: init.bookmarks !== false,
  bookmarkPrompt: init.bookmarkPrompt !== false,
  skipLowRated: Boolean(init.skipLowRated),
  skipSeconds: typeof init.skipSeconds === "number" ? init.skipSeconds : 30,
  playRecordPercent: typeof init.playRecordPercent === "number" ? init.playRecordPercent : 50,
  restrictData: Boolean(init.restrictData),
  autoFullScreen: Boolean(init.autoFullScreen),

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
      const settings = loadPlaybackSettings();
      const eq = Array.isArray(settings.eq) && settings.eq.length
        ? settings.eq.slice(0, FLAT_EQ.length)
        : get().eq.slice();
      while (eq.length < FLAT_EQ.length) eq.push(0);
      const restored = {
        tracks,
        ready: true,
        eq,
        preamp: typeof settings.preamp === "number" ? settings.preamp : get().preamp,
        presetId: settings.presetId || get().presetId,
        customPresets: normalizeCustomPresets(settings.customPresets ?? get().customPresets),
        bassLock: Boolean(settings.bassLock),
        remaster: settings.remaster || get().remaster,
        remasterAmt: typeof settings.remasterAmt === "number" ? settings.remasterAmt : get().remasterAmt,
        spatial: settings.spatial || get().spatial,
        spatialAmount: typeof settings.spatialAmount === "number" ? settings.spatialAmount : get().spatialAmount,
        normalize: Boolean(settings.normalize),
        volume: typeof settings.volume === "number" ? settings.volume : get().volume,
        rate: typeof settings.rate === "number" ? settings.rate : get().rate,
        gapless: settings.gapless !== false,
        crossfade: typeof settings.crossfade === "number" ? settings.crossfade : get().crossfade,
      };
      set(restored);
      try {
        applyEq(restored.eq);
        applyPreamp(restored.preamp);
        setBassLock(restored.bassLock);
        engSetRemaster(restored.remaster);
        setSpatialMode(restored.spatial);
        setMasterGain(restored.volume);
        setPlaybackRate(restored.rate);
      } catch {}
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
  setVolume: (volume) => {
    set({ volume });
    try { setMasterGain(volume); } catch {}
    savePlaybackSettings({ volume });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () => set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
  setEqBand: (index, value) => set((s) => {
    const eq = s.eq.slice(); eq[index] = value;
    try { applyEq(eq); } catch {}
    const next = { eq, presetId: "custom" };
    persistEqState({ ...s, ...next });
    return next;
  }),
  setPreamp: (value) => {
    set((s) => {
      const next = { preamp: value, presetId: "custom" };
      persistEqState({ ...s, ...next });
      return next;
    });
    try { applyPreamp(value); } catch {}
  },
  applyPreset: (id, gains, preamp) => {
    const eq = (gains || FLAT_EQ).slice();
    set((s) => {
      const next = { eq, preamp: typeof preamp === "number" ? preamp : 0, presetId: id || "custom" };
      persistEqState({ ...s, ...next });
      return next;
    });
    try { applyEq(eq); applyPreamp(typeof preamp === "number" ? preamp : 0); } catch {}
  },
  saveCustomPreset: (label) => {
    const name = (label || "").trim().slice(0, 24) || "Custom";
    const id = name.toLowerCase().replace(/\s+/g, "-") || "custom";
    set((s) => {
      const preset = { id, label: name, gains: s.eq.slice(), preamp: s.preamp };
      const customPresets = [...s.customPresets.filter((p) => p.id !== id && p.label !== name), preset];
      persistEqState({ ...s, customPresets });
      return { customPresets, presetId: id };
    });
  },
  deleteCustomPreset: (idOrName) => set((s) => {
    const customPresets = s.customPresets.filter((p) => p.id !== idOrName && p.label !== idOrName);
    persistEqState({ ...s, customPresets });
    return { customPresets };
  }),
  setRate: (rate) => {
    set({ rate });
    try { setPlaybackRate(rate); } catch {}
    savePlaybackSettings({ rate });
  },
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setSpatial: (spatial) => {
    set((s) => {
      persistEqState({ ...s, spatial });
      return { spatial };
    });
    try { setSpatialMode(spatial); } catch {}
  },
  setSpatialAmount: (spatialAmount) => set((s) => {
    persistEqState({ ...s, spatialAmount });
    return { spatialAmount };
  }),
  setBalance: (balance) => { set({ balance }); try { engSetBalance(balance); } catch {} },
  setViz: (viz) => set({ viz }),
  setFocus: (focus) => set({ focus }),
  setQuiet: (quiet) => set({ quiet }),
  setNormalize: (normalize) => set((s) => {
    persistEqState({ ...s, normalize });
    return { normalize };
  }),
  setSkipSilence: (skipSilence) => set({ skipSilence }),
  setBassLock: (bassLock) => {
    set((s) => {
      persistEqState({ ...s, bassLock });
      return { bassLock };
    });
    try { setBassLock(bassLock); } catch {}
  },
  setHaptic: (haptic) => set({ haptic }),
  setShakeSkip: (shakeSkip) => set({ shakeSkip }),
  setGapless: (gapless) => set((s) => {
    persistEqState({ ...s, gapless });
    return { gapless };
  }),
  setMono: (mono) => set({ mono }),
  setRemaster: (remaster) => {
    set((s) => {
      persistEqState({ ...s, remaster });
      return { remaster };
    });
    try { engSetRemaster(remaster); } catch {}
  },
  setRemasterAmt: (remasterAmt) => set((s) => {
    persistEqState({ ...s, remasterAmt });
    return { remasterAmt };
  }),
  setAutoEq: (autoEq) => set({ autoEq }),
  setCrossfade: (crossfade) => set((s) => {
    persistEqState({ ...s, crossfade });
    return { crossfade };
  }),
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
  setCoverUrl: async (ids, coverUrl) => {
    const hold = new Set(ids || []);
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl } : t)) }));
    for (const id of hold) {
      try {
        const rows = await listStoredTracks();
        const row = rows.find((r) => r.id === id);
        if (row) {
          await putStoredTrack({ ...row, coverRemote: coverUrl || undefined, audio: row.audio || new Blob([]), cover: row.cover || null });
        }
      } catch {}
    }
    return true;
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
