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
import { bindMediaSessionHandlers, syncMediaSession } from "./media-session";

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

function canUseStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__sg_eq_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function loadEqSettings() {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(EQ_SETTINGS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function persistEqSettings(partial) {
  if (!canUseStorage()) return;
  try {
    const prev = loadEqSettings() || {};
    const next = { ...prev, ...partial, savedAt: Date.now() };
    window.localStorage.setItem(EQ_SETTINGS_KEY, JSON.stringify(next));
  } catch {}
}

function storedToTrack(row) {
  let url = "";
  if (row.soulseekId) {
    const session = loadSlskSession();
    const parsed = parseSlskTrackId(row.soulseekId);
    if (parsed.username && parsed.filename) url = slskStreamUrl({ username: parsed.username, filename: parsed.filename }, session);
  } else if (row.ibroadcastId && row.ibFile) {
    url = resolveIbUrl(row) || `/api/ib-stream?id=${encodeURIComponent(row.ibroadcastId)}&file=${encodeURIComponent(row.ibFile)}`;
  } else if (row.url) {
    url = row.url;
  }
  let coverUrl = null;
  const remote = typeof row.coverRemote === "string" && !row.coverRemote.startsWith("blob:") ? row.coverRemote : null;
  if (row.cover && (row.cover.size > 0 || (row.cover.byteLength && row.cover.byteLength > 0))) {
    try { coverUrl = URL.createObjectURL(row.cover); } catch {}
  }
  if (!coverUrl) coverUrl = remote || null;
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

function pushMediaSession(state) {
  try {
    const track = state.tracks[state.index];
    syncMediaSession({
      track: track
        ? {
            name: track.name || track.title || "Unknown",
            artist: track.artist || "Unknown artist",
            album: track.album || "Unknown album",
            coverUrl: track.coverUrl || null,
          }
        : null,
      playing: Boolean(state.playing),
      duration: Number(state.duration) || (track && track.durationSec) || 0,
      position: Number(state.currentTime) || 0,
      playbackRate: Number(state.rate) || 1,
    });
  } catch {}
}

export const usePlayer = create((set, get) => ({
  tracks: [], index: -1, ready: false, playing: false, currentTime: 0, duration: 0,
  volume: 0.85, muted: false, shuffle: false, repeat: "off",
  eq: [...FLAT_EQ],
  preamp: 0,
  presetId: "flat",
  customPresets: [],
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
      const tracks = (rows || []).map(storedToTrack);
      const eqSaved = loadEqSettings();
      set({
        tracks,
        ready: true,
        ...(eqSaved?.eq ? { eq: eqSaved.eq } : {}),
        ...(eqSaved?.preamp != null ? { preamp: eqSaved.preamp } : {}),
        ...(eqSaved?.presetId ? { presetId: eqSaved.presetId } : {}),
        ...(eqSaved?.customPresets ? { customPresets: eqSaved.customPresets } : {}),
        ...(eqSaved?.bassLock != null ? { bassLock: eqSaved.bassLock } : {}),
        ...(eqSaved?.spatial ? { spatial: eqSaved.spatial } : {}),
        ...(eqSaved?.spatialAmount != null ? { spatialAmount: eqSaved.spatialAmount } : {}),
        ...(eqSaved?.remaster ? { remaster: eqSaved.remaster } : {}),
        ...(eqSaved?.remasterAmt != null ? { remasterAmt: eqSaved.remasterAmt } : {}),
      });
      try {
        bindMediaSessionHandlers({
          play: () => get().setPlaying(true),
          pause: () => get().setPlaying(false),
          nexttrack: () => get().next(),
          previoustrack: () => get().prev(),
          seekto: (t) => get().seek(t),
        });
      } catch {}
    } catch {
      set({ ready: true });
    }
  },
  playIndex: async (index, _user) => {
    const s = get();
    if (index < 0 || index >= s.tracks.length) return;
    set({ index, playing: true });
    pushMediaSession({ ...get(), index, playing: true });
  },
  playIds: (ids) => {
    const map = new Map(get().tracks.map((t) => [t.id, t]));
    const ordered = ids.map((id) => map.get(id)).filter(Boolean);
    if (!ordered.length) return;
    const rest = get().tracks.filter((t) => !ids.includes(t.id));
    set({ tracks: [...ordered, ...rest], index: 0, playing: true });
    pushMediaSession({ ...get(), index: 0, playing: true });
  },
  playRest: (id) => {
    const idx = get().tracks.findIndex((t) => t.id === id);
    if (idx >= 0) get().playIndex(idx, true);
  },
  queueNext: (id) => set((s) => ({ upNext: [id, ...s.upNext.filter((x) => x !== id)] })),
  queueNextMany: (ids) => set((s) => ({ upNext: [...ids, ...s.upNext.filter((x) => !ids.includes(x))] })),
  queueLast: (id) => set((s) => ({ upNext: [...s.upNext.filter((x) => x !== id), id] })),
  setTimes: (currentTime, duration) => {
    set({ currentTime, duration });
  },
  setPlaying: (playing) => {
    set({ playing });
    pushMediaSession({ ...get(), playing });
  },
  nextIndex: (_user) => {
    const s = get();
    if (s.upNext.length) {
      const nextId = s.upNext[0];
      const idx = s.tracks.findIndex((t) => t.id === nextId);
      set({ upNext: s.upNext.slice(1) });
      return idx >= 0 ? idx : null;
    }
    if (s.repeat === "one") return s.index;
    if (s.shuffle) {
      if (s.tracks.length < 2) return s.index;
      let n = Math.floor(Math.random() * s.tracks.length);
      if (n === s.index) n = (n + 1) % s.tracks.length;
      return n;
    }
    if (s.index + 1 < s.tracks.length) return s.index + 1;
    if (s.repeat === "all") return 0;
    return null;
  },
  prevIndex: () => {
    const s = get();
    if (s.currentTime > 3) return s.index;
    if (s.index > 0) return s.index - 1;
    if (s.repeat === "all" && s.tracks.length) return s.tracks.length - 1;
    return s.index;
  },
  toggle: async () => {
    get().setPlaying(!get().playing);
  },
  seek: async (t) => {
    set({ currentTime: t });
  },
  next: () => {
    const n = get().nextIndex(true);
    if (n !== null) get().playIndex(n, true);
    else get().setPlaying(false);
  },
  prev: () => {
    const p = get().prevIndex();
    if (p !== null) get().playIndex(p, true);
  },
  patchTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  updateMeta: (id, patch) => {
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch, metaEdited: true } : t)) }));
    void updateStoredMeta(id, { ...patch, metaEdited: true }).catch(() => {});
  },
  toggleLike: (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const liked = !Boolean(track.liked);
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, liked } : t)) }));
    void updateStoredMeta(id, { liked }).catch(() => {});
    try { get().flash(liked ? "Added to favorites" : "Removed from favorites"); } catch {}
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
    if (!file || !hold.size) return false;
    let url = "";
    try { url = URL.createObjectURL(file); } catch {}
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl: url || t.coverUrl } : t)) }));
    let saved = 0;
    for (const id of hold) {
      try {
        await updateStoredMeta(id, { cover: file, coverRemote: "" });
        saved += 1;
      } catch (err) {
        console.error("setCover failed", id, err);
      }
    }
    return saved > 0;
  },
  setCoverUrl: async (ids, coverUrl) => {
    const hold = new Set(ids || []);
    const raw = String(coverUrl || "").trim();
    if (!raw || !hold.size) return false;
    const proxied = /^(blob:|data:)/i.test(raw) || raw.startsWith("/api/cover")
      ? raw
      : `/api/cover?u=${encodeURIComponent(raw)}`;
    set((s) => ({ tracks: s.tracks.map((t) => (hold.has(t.id) ? { ...t, coverUrl: proxied } : t)) }));
    let coverBlob = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(proxied, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) coverBlob = await res.blob();
    } catch (err) {
      console.error("cover fetch failed", err);
    }
    if (!coverBlob || coverBlob.size < 100) {
      // Keep the remote URL so it can still display via the proxy.
      for (const id of hold) {
        try { await updateStoredMeta(id, { coverRemote: raw }); } catch {}
      }
      return true;
    }
    let saved = 0;
    for (const id of hold) {
      try {
        await updateStoredMeta(id, { cover: coverBlob, coverRemote: raw });
        saved += 1;
      } catch (err) {
        console.error("setCoverUrl failed", id, err);
      }
    }
    return saved > 0;
  },

  searchAlbumOnline: async (artist, album, track) => {
    try {
      return await searchAlbums(artist, album, track);
    } catch {
      try { return await searchAlbumHits(artist, album); } catch { return []; }
    }
  },
  applyAlbumHit: async (ids, hit) => {
    if (!hit) return;
    const patch = {
      album: hit.title || undefined,
      artist: hit.artist || undefined,
      year: hit.year || undefined,
      genre: hit.genre || undefined,
    };
    get().updateAlbumMeta(ids, patch);
    if (hit.artwork) { try { await get().setCoverUrl(ids, hit.artwork); } catch {} }
  },
  setEq: (eq) => { set({ eq }); persistEqSettings({ eq }); },
  setEqBand: (index, value) => {
    set((s) => {
      const eq = Array.isArray(s.eq) ? s.eq.slice() : [];
      const i = Number(index);
      if (!Number.isFinite(i) || i < 0 || i >= eq.length) return {};
      eq[i] = value;
      return { eq, presetId: "custom" };
    });
    const s = get();
    persistEqSettings({ eq: s.eq, presetId: "custom", preamp: s.preamp });
  },
  setPreamp: (preamp) => { set({ preamp, presetId: "custom" }); persistEqSettings({ preamp, presetId: "custom" }); },
  setPresetId: (presetId) => { set({ presetId }); persistEqSettings({ presetId }); },
  setCustomPresets: (customPresets) => { set({ customPresets }); persistEqSettings({ customPresets }); },
  applyPreset: (id, gains, preamp) => {
    const eq = Array.isArray(gains) ? gains.slice() : get().eq.slice();
    const pre = Number.isFinite(Number(preamp)) ? Number(preamp) : 0;
    set({ eq, preamp: pre, presetId: id || "custom" });
    persistEqSettings({ eq, preamp: pre, presetId: id || "custom" });
  },
  saveCustomPreset: (label) => {
    const name = String(label || "").trim().slice(0, 24) || "Custom";
    const state = get();
    const id = `custom-${Date.now().toString(36)}`;
    const next = [
      { id, label: name, gains: (state.eq || []).slice(), preamp: state.preamp },
      ...(Array.isArray(state.customPresets) ? state.customPresets.filter((item) => String(item.label || "").toLowerCase() !== name.toLowerCase()) : []),
    ].slice(0, 12);
    set({ customPresets: next, presetId: id });
    persistEqSettings({ customPresets: next, presetId: id, eq: state.eq, preamp: state.preamp });
  },
  deleteCustomPreset: (id) => {
    set((s) => ({
      customPresets: (s.customPresets || []).filter((item) => item.id !== id),
      presetId: s.presetId === id ? "custom" : s.presetId,
    }));
    const s = get();
    persistEqSettings({ customPresets: s.customPresets, presetId: s.presetId });
  },
  setBassLock: (bassLock) => { set({ bassLock }); persistEqSettings({ bassLock }); },
  setSpatial: (spatial) => { set({ spatial }); persistEqSettings({ spatial }); },
  setSpatialAmount: (spatialAmount) => { set({ spatialAmount }); persistEqSettings({ spatialAmount }); },
  setRemaster: (remaster) => { set({ remaster }); persistEqSettings({ remaster }); },
  setRemasterAmt: (remasterAmt) => { set({ remasterAmt }); persistEqSettings({ remasterAmt }); },
  setVolume: (volume) => set({ volume }),
  setMuted: (muted) => set({ muted }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeat: (repeat) => set({ repeat }),
  setRate: (rate) => set({ rate }),
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setBalance: (balance) => set({ balance }),
  setMono: (mono) => set({ mono }),
  setCrossfade: (crossfade) => set({ crossfade }),
  setGapless: (gapless) => set({ gapless }),
  setNormalize: (normalize) => set({ normalize }),
  setSkipSilence: (skipSilence) => set({ skipSilence }),
  setQuiet: (quiet) => set({ quiet }),
  setHaptic: (haptic) => set({ haptic }),
  setShakeSkip: (shakeSkip) => set({ shakeSkip }),
  setAutoEq: (autoEq) => set({ autoEq }),
  setStopAfter: (stopAfter) => set({ stopAfter }),
  setSleep: (sleep) => set({ sleep, sleepUntil: sleep ? Date.now() + sleep * 60 * 1000 : null }),
  setRadio: (radio) => set({ radio }),
  setViz: (viz) => set({ viz }),
  setFocus: (focus) => set({ focus }),
  playPlaylist: (id) => {
    const pl = get().playlists.find((p) => p.id === id);
    if (pl?.trackIds?.length) get().playIds(pl.trackIds);
  },
}));
