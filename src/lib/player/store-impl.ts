// @ts-nocheck
import { create } from "zustand";
import { FLAT_EQ } from "./constants";
import { listStoredTracks, putStoredTrack, clearStoredLibrary, deleteStoredTrack, getAudioBlob, updateStoredMeta } from "./persist";
import { fetchCoverImage, searchAlbumHits } from "./cover-search-api";
import { searchAlbums } from "./lookup";
import { resolveIbUrl } from "./ib-play";
import { importLocalFiles } from "./import-local-files";
import { exportLibraryBackup, importLibraryBackup } from "./backup";
import { loadSlskSession, parseSlskTrackId, slskStreamUrl } from "./soulseek";

export type Track = {
  id: string; name: string; artist: string; album: string; genre: string; tags: string[];
  year: string; url: string; coverUrl: string | null; format: string;
  sampleRate: number | null; bitDepth: number | null; bitrate: number | null; channels: number | null;
  lossless: boolean; liked: boolean; starred: boolean;
  [key: string]: any;
};

const playUrls = new Map();
const asyncNoop = async () => 0;

const EQ_SETTINGS_KEY = "sondergram-eq-settings";

function loadEqSettings() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(EQ_SETTINGS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function persistEqSettings(partial) {
  if (typeof localStorage === "undefined") return;
  try {
    const prev = loadEqSettings() || {};
    const next = { ...prev, ...partial, savedAt: Date.now() };
    localStorage.setItem(EQ_SETTINGS_KEY, JSON.stringify(next));
  } catch {}
}

const savedEq = loadEqSettings();

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

export const usePlayer = create((set, get) => ({
  tracks: [], index: -1, ready: false, playing: false, currentTime: 0, duration: 0,
  volume: 0.85, muted: false, shuffle: false, repeat: "off",
  eq: Array.isArray(savedEq?.eq) && savedEq.eq.length ? savedEq.eq.slice() : [...FLAT_EQ],
  preamp: typeof savedEq?.preamp === "number" ? savedEq.preamp : 0,
  presetId: typeof savedEq?.presetId === "string" ? savedEq.presetId : "flat",
  customPresets: Array.isArray(savedEq?.customPresets) ? savedEq.customPresets : [],
  bassLock: false, remaster: "off", remasterAmt: 0.7, spatial: "off", spatialAmount: 0.7,
  radio: false, radioRecent: [], upNext: [], notice: null, crossfade: 4,
  sleep: null, sleepUntil: null, stopAfter: "off", recent: [], plays: {}, positions: {},
  listenMs: 0, listenDay: "", listenLog: [], balance: 0, viz: "bars", focus: false, quiet: false,
  normalize: false, skipSilence: false, haptic: false, shakeSkip: false, gapless: true, mono: false,
  autoEq: false, playlists: [], loopA: null, loopB: null, bookmarks: true, bookmarkPrompt: true,
  skipLowRated: false, skipSeconds: 30, playRecordPercent: 50, restrictData: false, autoFullScreen: false,
  rate: 1,
  pitch: 0,
  isolate: "mix",
  flash: (notice) => { set({ notice }); setTimeout(() => set({ notice: null }), 3200); },
  hydrate: async () => {
    try {
      const rows = await listStoredTracks();
      set({ tracks: (rows || []).map(storedToTrack), ready: true });
    } catch {
      set({ ready: true });
    }
  },
  playIndex: async (index, _user) => {
    const track = get().tracks[index];
    if (!track) return;
    set({ index, playing: true, currentTime: 0 });
    try {
      const { beginPlayback } = await import("./engine");
      let url = track.url;
      if (track.ibroadcastId) {
        const ib = resolveIbUrl(track);
        if (ib) url = ib;
      }
      await beginPlayback(url || "", 0);
    } catch (e) { console.warn(e); }
  },
  playIds: (ids) => {
    const tracks = get().tracks;
    const first = ids.find((id) => tracks.some((t) => t.id === id));
    if (!first) return;
    const i = tracks.findIndex((t) => t.id === first);
    if (i >= 0) get().playIndex(i);
  },
  playRest: (id) => {
    const i = get().tracks.findIndex((t) => t.id === id);
    if (i >= 0) get().playIndex(i);
  },
  queueNext: (id) => set((s) => ({ upNext: [id, ...s.upNext.filter((x) => x !== id)] })),
  queueNextMany: (ids) => set((s) => ({ upNext: [...ids, ...s.upNext.filter((x) => !ids.includes(x))] })),
  queueLast: (id) => set((s) => ({ upNext: [...s.upNext.filter((x) => x !== id), id] })),
  setTimes: (currentTime, duration) => set({ currentTime, duration }),
  setPlaying: (playing) => {
    set({ playing: Boolean(playing) });
    if (!playing) {
      void import("./engine").then((m) => m.pauseOutput()).catch(() => {});
    } else {
      void import("./engine").then((m) => m.resumeEngine()).catch(() => {});
    }
  },
  nextIndex: (_user) => {
    let s = get();
    if (!s.tracks.length) return null;
    while ((s.upNext || []).length) {
      const id = s.upNext[0];
      set({ upNext: s.upNext.slice(1) });
      s = get();
      const i = s.tracks.findIndex((t) => t.id === id);
      if (i >= 0) return i;
    }
    if (s.repeat === "one" && s.index >= 0) return s.index;
    if (s.shuffle && s.tracks.length > 1) {
      let n = Math.floor(Math.random() * s.tracks.length);
      if (n === s.index) n = (n + 1) % s.tracks.length;
      return n;
    }
    let n = s.index < 0 ? 0 : s.index + 1;
    if (n >= s.tracks.length) {
      if (s.repeat === "all") return 0;
      return null;
    }
    return n;
  },
  prevIndex: () => {
    const s = get();
    if (!s.tracks.length) return null;
    if ((s.currentTime || 0) > 3 && s.index >= 0) return s.index;
    if (s.shuffle && s.tracks.length > 1) {
      let n = Math.floor(Math.random() * s.tracks.length);
      if (n === s.index) n = (n + 1) % s.tracks.length;
      return n;
    }
    if (s.index > 0) return s.index - 1;
    if (s.repeat === "all") return s.tracks.length - 1;
    return s.index >= 0 ? s.index : 0;
  },
  toggle: async () => {
    const { playing } = get();
    if (playing) {
      set({ playing: false });
      try { (await import("./engine")).pauseOutput(); } catch {}
    } else {
      set({ playing: true });
      try { const { resumeEngine } = await import("./engine"); await resumeEngine(); } catch {}
    }
  },
  seek: async (t) => {
    set({ currentTime: t });
    try { (await import("./engine")).seekOutput(t); } catch {}
  },
  next: () => {
    const n = get().nextIndex(true);
    if (n !== null) get().playIndex(n, true);
  },
  prev: () => {
    const s = get();
    if ((s.currentTime || 0) > 3 && s.index >= 0) {
      get().seek(0);
      return;
    }
    const p = get().prevIndex();
    if (p !== null) get().playIndex(p, true);
  },
  patchTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  updateMeta: (id, patch) => {
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch, metaEdited: true } : t)) }));
    void updateStoredMeta(id, { ...patch, metaEdited: true }).catch(() => {});
  },
  updateAlbumMeta: (ids, patch) => {
    const hold = new Set(ids || []);
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, ...patch } : t)) }));
    for (const id of hold) void updateStoredMeta(id, patch).catch(() => {});
  },
  removeTracks: async (ids) => {
    const hold = new Set(ids || []);
    for (const id of hold) { try { await deleteStoredTrack(id); } catch {} }
    set((s) => ({
      tracks: s.tracks.filter((t) => !hold.has(t.id)),
      upNext: s.upNext.filter((id) => !hold.has(id)),
    }));
  },
  clearLibrary: async () => {
    await clearStoredLibrary();
    set({ tracks: [], index: -1, playing: false, upNext: [] });
  },
  addFiles: async (files) => {
    try {
      const n = await importLocalFiles(files);
      await get().hydrate();
      get().flash(n ? `Added ${n} files` : "No new audio files");
      return n;
    } catch { return 0; }
  },
  importFiles: async (files) => get().addFiles(files),
  exportBackup: async () => exportLibraryBackup(),
  importBackup: async (file) => {
    try {
      await importLibraryBackup(file);
      await get().hydrate();
      get().flash("Library restored");
      return true;
    } catch (e) {
      get().flash((e && e.message) || "Could not restore zip");
      return false;
    }
  },
  importLibrary: async (file) => get().importBackup(file),
  setCover: async (ids, file) => {
    const hold = new Set(ids || []);
    let url = "";
    try { url = URL.createObjectURL(file); } catch {}
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl: url || t.coverUrl } : t)) }));
    for (const id of hold) {
      try { await updateStoredMeta(id, { cover: file, coverRemote: undefined }); } catch {}
    }
    return true;
  },
  setCoverUrl: async (ids, coverUrl) => {
    const hold = new Set((ids || []).filter(Boolean));
    if (!hold.size || !coverUrl) return false;
    let displayUrl = coverUrl;
    let coverBlob = null;
    try {
      const pulled = await Promise.race([
        fetchCoverImage({ data: { url: coverUrl } }),
        new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
      if (pulled?.ok && pulled.b64) {
        const bin = atob(pulled.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        coverBlob = new Blob([bytes], { type: pulled.type || "image/jpeg" });
        try { displayUrl = URL.createObjectURL(coverBlob); } catch {}
      }
    } catch {}
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl: displayUrl } : t)) }));
    for (const id of hold) {
      try {
        if (coverBlob) await updateStoredMeta(id, { cover: coverBlob, coverRemote: coverUrl });
        else await updateStoredMeta(id, { coverRemote: coverUrl });
      } catch {}
    }
    return true;
  },
  searchAlbumOnline: async (artist, album, track) => {
    try {
      const hits = await searchAlbumHits({ data: { artist: artist || "", album: album || "", track: track || "" } });
      if (Array.isArray(hits) && hits.length) return hits;
    } catch {}
    try { return await searchAlbums(artist || "", album || "", track || ""); }
    catch { return []; }
  },
  applyAlbumHit: async (ids, hit) => {
    if (!hit || !ids?.length) return false;
    const hold = new Set(ids);
    const patch = {
      album: hit.title || undefined,
      artist: hit.artist || undefined,
      year: hit.year || undefined,
      genre: hit.genre || undefined,
      explicit: Boolean(hit.explicit),
      metaEdited: true,
    };
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, ...patch } : t)) }));
    for (const id of hold) {
      try {
        await updateStoredMeta(id, {
          album: patch.album, artist: patch.artist, year: patch.year,
          genre: patch.genre, explicit: patch.explicit, metaEdited: true,
        });
      } catch {}
    }
    if (hit.artwork) { try { await get().setCoverUrl(ids, hit.artwork); } catch {} }
    return true;
  },
  setVolume: (volume) => set({ volume }),
  setMuted: (muted) => set({ muted }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeat: (repeat) => set({ repeat }),
  setEq: (eq) => { set({ eq }); persistEqSettings({ eq }); },
  setPreamp: (preamp) => { set({ preamp }); persistEqSettings({ preamp }); },
  setPresetId: (presetId) => { set({ presetId }); persistEqSettings({ presetId }); },
  setSpatial: (spatial) => set({ spatial }),
  setSpatialAmount: (spatialAmount) => set({ spatialAmount }),
  setRemaster: (remaster) => set({ remaster }),
  setRemasterAmt: (remasterAmt) => set({ remasterAmt }),
  setBassLock: (bassLock) => set({ bassLock }),
  setNormalize: (normalize) => set({ normalize }),
  setGapless: (gapless) => set({ gapless }),
  setCrossfade: (crossfade) => set({ crossfade }),
  setRate: (rate) => set({ rate }),
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setEqBand: (i, value) => set((s) => {
    const eq = Array.isArray(s.eq) ? s.eq.slice() : [...FLAT_EQ];
    if (i >= 0 && i < eq.length) eq[i] = value;
    const next = { eq, presetId: "custom" };
    persistEqSettings(next);
    return next;
  }),
  applyPreset: (presetId, gains, preamp) => {
    const next = {
      presetId: presetId || "custom",
      eq: Array.isArray(gains) ? gains.slice() : [...FLAT_EQ],
      preamp: typeof preamp === "number" ? preamp : 0,
    };
    set(next);
    persistEqSettings(next);
  },
  saveCustomPreset: (label) => {
    const s = get();
    const name = String(label || "").trim() || "Custom";
    const id = `custom-${Date.now()}`;
    const row = {
      id,
      label: name,
      gains: Array.isArray(s.eq) ? s.eq.slice() : [...FLAT_EQ],
      preamp: typeof s.preamp === "number" ? s.preamp : 0,
    };
    const customPresets = [...(s.customPresets || []), row];
    const next = { customPresets, presetId: id };
    set(next);
    persistEqSettings({ customPresets, presetId: id, eq: row.gains, preamp: row.preamp });
    get().flash(`Saved preset "${name}"`);
    return id;
  },
  deleteCustomPreset: (id) => {
    const s = get();
    const customPresets = (s.customPresets || []).filter((p) => p.id !== id);
    const presetId = s.presetId === id ? "flat" : s.presetId;
    set({ customPresets, presetId });
    persistEqSettings({ customPresets, presetId });
  },
  toggleRadio: () => set((s) => ({ radio: !s.radio })),
  setBalance: (balance) => set({ balance }),
  setViz: (viz) => set({ viz }),
  setFocus: (focus) => set({ focus }),
  setQuiet: (quiet) => set({ quiet }),
  setMono: (mono) => set({ mono }),
  setAutoEq: (autoEq) => set({ autoEq }),
  setSkipSilence: (skipSilence) => set({ skipSilence }),
  setHaptic: (haptic) => set({ haptic }),
  setShakeSkip: (shakeSkip) => set({ shakeSkip }),
  setSleep: (sleep) => set({ sleep, sleepUntil: sleep ? Date.now() + sleep * 60000 : null }),
  setStopAfter: (stopAfter) => set({ stopAfter }),
  setLoopA: (loopA) => set({ loopA }),
  setLoopB: (loopB) => set({ loopB }),
  setBookmarks: (bookmarks) => set({ bookmarks }),
  setBookmarkPrompt: (bookmarkPrompt) => set({ bookmarkPrompt }),
  setSkipLowRated: (skipLowRated) => set({ skipLowRated }),
  setSkipSeconds: (skipSeconds) => set({ skipSeconds }),
  setPlayRecordPercent: (playRecordPercent) => set({ playRecordPercent }),
  setRestrictData: (restrictData) => set({ restrictData }),
  setAutoFullScreen: (autoFullScreen) => set({ autoFullScreen }),
  setRadio: (radio) => set({ radio }),
  importBandcamp: asyncNoop,
  importStreamHits: asyncNoop,
  importFoundAudio: asyncNoop,
  importSlskFiles: asyncNoop,
  importIbPlaylist: asyncNoop,
}));
