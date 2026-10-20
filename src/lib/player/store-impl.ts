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
import type { SlskFile } from "./soulseek";
import { listStoredTracks, putStoredTrack, clearStoredLibrary, deleteStoredTrack, getAudioBlob } from "./persist";
import { exportLibraryBackup, importLibraryBackup } from "./backup";
import { isAudioFile, copyAudioBlob } from "./format";
import { albumKey, compareTracks } from "./catalog";
import { readFileTags, tagsFromFilename, trackNoFromName } from "./tags";
import { isExplicitContent } from "./explicit";
import { loadSlskSession, parseSlskTrackId, polishTrackFromFilename, slskStreamUrl, slskTrackId } from "./soulseek";
import { parseYoutubeId, youtubeThumb } from "./youtube";

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
  const defaults = { bookmarks: true, bookmarkPrompt: true, skipLowRated: false, skipSeconds: 30, playRecordPercent: 50, restrictData: false, autoFullScreen: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}
function savePlaybackSettings(partial) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadPlaybackSettings(), ...partial }));
  } catch {}
}
export function catalogHold() { return false; }

function revokePlayUrl(id) {
  const u = playUrls.get(id);
  if (u) { try { URL.revokeObjectURL(u); } catch {} playUrls.delete(id); }
}

async function ensurePlayUrl(track) {
  if (track.url && (track.url.startsWith("blob:") || track.url.startsWith("http") || track.url.startsWith("/api/"))) return track.url;
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
        if (!t.soulseekId && !t.youtubeId && !t.previewUrl && !t.bandcampId && !t.amazonId) {
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
    // Must unlock inside the user-gesture stack (iOS Safari)
    try { unlockEngine(); primePlayback(); setAudioSessionPlayback(); } catch {}
    void (async () => {
      let url = track.url || "";
      if (!url || (!url.startsWith("http") && !url.startsWith("/api/") && !url.startsWith("blob:") && !url.startsWith("yt:"))) {
        url = (await ensurePlayUrl(track)) || "";
        if (url && url !== track.url) {
          set((s) => ({ tracks: s.tracks.map((t, i) => (i === index ? { ...t, url } : t)) }));
        }
      }
      set({ index, playing: true, currentTime: 0 });
      if (!url) {
        get().flash("No audio for this track yet");
        return;
      }
      if (url.startsWith("yt:")) return;
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
    const state = get();
    const id = `custom-${Date.now().toString(36)}`;
    const next = [{ id, label: name, gains: state.eq.slice(), preamp: state.preamp },
      ...state.customPresets.filter((item) => item.label.toLowerCase() !== name.toLowerCase())].slice(0, 12);
    set({ customPresets: next, presetId: id });
  },
  deleteCustomPreset: (id) => set((s) => ({
    customPresets: s.customPresets.filter((item) => item.id !== id),
    presetId: s.presetId === id ? "custom" : s.presetId,
  })),
  setRate: (rate) => { set({ rate }); try { setPlaybackRate(rate); } catch {} },
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setSpatial: (spatial) => { set({ spatial }); try { setSpatialMode(spatial, get().spatialAmount); } catch {} },
  setSpatialAmount: (spatialAmount) => { set({ spatialAmount }); try { setSpatialMode(get().spatial, spatialAmount); } catch {} },
  toggleRadio: () => set((s) => ({ radio: !s.radio })),
  playRadioFrom: () => {},
  toggleLike: (id) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t)) })),
  toggleStar: (id) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, starred: !t.starred } : t)) })),
  setReplayGain: () => {},
  setCrossfade: (crossfade) => set({ crossfade }),
  setSleep: (minutes) => {
    if (minutes == null) set({ sleep: null, sleepUntil: null });
    else set({ sleep: minutes, sleepUntil: Date.now() + minutes * 60_000 });
  },
  setStopAfter: (stopAfter) => set({ stopAfter }),
  surprise: () => {
    const { tracks } = get();
    if (!tracks.length) return;
    get().playIndex(Math.floor(Math.random() * tracks.length), true);
  },
  rememberPosition: (id, time) => {
    if (!get().bookmarks) return;
    set((s) => ({ positions: { ...s.positions, [id]: time } }));
  },
  addListenMs: () => {},
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  toggleQuiet: () => set((s) => ({ quiet: !s.quiet })),
  setBalance: (balance) => { set({ balance }); try { engSetBalance(balance); } catch {} },
  setViz: (viz) => set({ viz }),
  toggleNormalize: () => set((s) => ({ normalize: !s.normalize })),
  toggleSkipSilence: () => set((s) => ({ skipSilence: !s.skipSilence })),
  toggleBassLock: () => set((s) => {
    const next = !s.bassLock;
    try { setBassLock(next ? 3 : 0); } catch {}
    return { bassLock: next };
  }),
  toggleHaptic: () => set((s) => ({ haptic: !s.haptic })),
  toggleShakeSkip: () => set((s) => ({ shakeSkip: !s.shakeSkip })),
  toggleGapless: () => set((s) => ({ gapless: !s.gapless })),
  toggleMono: () => set((s) => ({ mono: !s.mono })),
  toggleAutoEq: () => set((s) => ({ autoEq: !s.autoEq })),
  toggleBookmarks: () => set((s) => { const bookmarks = !s.bookmarks; savePlaybackSettings({ bookmarks }); return { bookmarks }; }),
  toggleBookmarkPrompt: () => set((s) => { const bookmarkPrompt = !s.bookmarkPrompt; savePlaybackSettings({ bookmarkPrompt }); return { bookmarkPrompt }; }),
  toggleSkipLowRated: () => set((s) => { const skipLowRated = !s.skipLowRated; savePlaybackSettings({ skipLowRated }); return { skipLowRated }; }),
  setSkipSeconds: (n) => { const skipSeconds = Math.max(10, Math.min(90, Math.round(n))); savePlaybackSettings({ skipSeconds }); set({ skipSeconds }); },
  setPlayRecordPercent: (n) => { const playRecordPercent = Math.max(25, Math.min(100, Math.round(n))); savePlaybackSettings({ playRecordPercent }); set({ playRecordPercent }); },
  toggleRestrictData: () => set((s) => { const restrictData = !s.restrictData; savePlaybackSettings({ restrictData }); return { restrictData }; }),
  toggleAutoFullScreen: () => set((s) => { const autoFullScreen = !s.autoFullScreen; savePlaybackSettings({ autoFullScreen }); return { autoFullScreen }; }),
  saveQueuePlaylist: () => {}, createPlaylist: () => {}, addTracksToPlaylist: () => {}, playPlaylist: () => {}, deletePlaylist: () => {},
  setRemaster: (remaster) => { set({ remaster }); try { engSetRemaster(remaster, get().remasterAmt); } catch {} },
  setRemasterAmt: (remasterAmt) => { set({ remasterAmt }); try { engSetRemaster(get().remaster, remasterAmt); } catch {} },
  djMix: () => {}, playMoreLikeThis: asyncNoop, markLoop: () => {}, clearLoop: () => set({ loopA: null, loopB: null }),
  nextIndex: () => {
    const { tracks, index, shuffle, skipLowRated } = get();
    if (!tracks.length) return null;
    const isLow = (t) => typeof t.rating === "number" && t.rating > 0 && t.rating <= 2;
    if (shuffle) {
      const pool = tracks.map((t, i) => ({ t, i })).filter(({ t, i }) => i !== index && (!skipLowRated || !isLow(t)));
      if (!pool.length) { let n = index; while (tracks.length > 1 && n === index) n = Math.floor(Math.random() * tracks.length); return n; }
      return pool[Math.floor(Math.random() * pool.length)].i;
    }
    let n = index >= tracks.length - 1 ? 0 : index + 1;
    if (skipLowRated) for (let k = 0; k < tracks.length; k++) { if (!isLow(tracks[n])) break; n = n >= tracks.length - 1 ? 0 : n + 1; }
    return n;
  },
  prevIndex: () => {
    const { tracks, index } = get();
    if (!tracks.length) return null;
    return index <= 0 ? tracks.length - 1 : index - 1;
  },
  patchTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTrack: (id) => {
    revokePlayUrl(id);
    void deleteStoredTrack(id).catch(() => {});
    set((s) => {
      const tracks = s.tracks.filter((t) => t.id !== id);
      return { tracks, index: Math.min(s.index, Math.max(-1, tracks.length - 1)) };
    });
  },

  addFiles: (files) => {
    void (async () => {
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isAudioFile(file) && !(file.type || "").startsWith("audio/")) continue;
        try {
          const audio = await copyAudioBlob(file);
          const tags = await readFileTags(file).catch(() => null);
          const parsed = tagsFromFilename(file.name);
          const id = crypto.randomUUID();
          const coverBlob = tags?.coverBlob || null;
          let coverUrl = null;
          if (coverBlob) { try { coverUrl = URL.createObjectURL(coverBlob); } catch {} }
          const url = URL.createObjectURL(audio);
          playUrls.set(id, url);
          const track = {
            id,
            name: tags?.title || parsed.title || file.name.replace(/\.[^.]+$/, ""),
            artist: tags?.artist || parsed.artist || "Unknown Artist",
            album: tags?.album || parsed.album || "Unknown Album",
            genre: tags?.genre || "", tags: tags?.tags || [], year: tags?.year || parsed.year || "",
            url, coverUrl,
            format: (tags?.format || file.name.split(".").pop() || "AUDIO").toUpperCase(),
            sampleRate: tags?.sampleRate ?? null, bitDepth: tags?.bitDepth ?? null,
            bitrate: tags?.bitrate ?? null, channels: tags?.channels ?? null,
            lossless: Boolean(tags?.lossless), liked: false, starred: false, addedAt: Date.now(),
            trackNo: tags?.trackNo || trackNoFromName(file.name) || parsed.trackNo,
            diskNo: tags?.diskNo || 1, durationSec: tags?.duration || 0, bytes: audio.size,
            albumArtist: tags?.albumArtist || "",
            explicit: Boolean(tags?.explicit) || isExplicitContent({ name: tags?.title ?? parsed.title, artist: tags?.artist ?? parsed.artist, album: tags?.album ?? parsed.album }),
          };
          set((s) => {
            const tracks = [...s.tracks, track];
            return { tracks, index: s.index === -1 ? tracks.length - 1 : s.index };
          });
          await putStoredTrack({
            id, name: track.name, artist: track.artist, album: track.album, genre: track.genre,
            tags: track.tags, year: track.year, format: track.format, sampleRate: track.sampleRate,
            bitDepth: track.bitDepth, bitrate: track.bitrate, channels: track.channels,
            lossless: track.lossless, liked: false, trackNo: track.trackNo, diskNo: track.diskNo,
            duration: track.durationSec, bytes: track.bytes, albumArtist: track.albumArtist,
            explicit: track.explicit, audio, cover: coverBlob, addedAt: Date.now() + i,
          });
          added += 1;
        } catch (err) { console.warn("addFiles failed", file.name, err); }
      }
      get().flash(added ? `Added ${added} ${added === 1 ? "song" : "songs"}` : "No audio files found");
    })();
  },

  importLibrary: async (file) => {
    try {
      const n = await importLibraryBackup(file);
      await get().hydrate();
      get().flash(n ? `Restored ${n} songs on this device` : "Those songs are already here");
      return n;
    } catch (err) {
      console.warn("importLibrary failed", err);
      get().flash("Could not restore that zip");
      return 0;
    }
  },

  clearLibrary: async () => {
    for (const id of [...playUrls.keys()]) revokePlayUrl(id);
    try { await clearStoredLibrary(); } catch {}
    set({ tracks: [], index: -1, playing: false });
    get().flash("Library cleared");
  },

  exportLibrary: async () => {
    try {
      const n = await exportLibraryBackup();
      get().flash(n ? `Packed ${n} songs — share or save the zip` : "Library is empty");
    } catch (err) {
      console.warn("exportLibrary failed", err);
      get().flash("Could not export library");
    }
  },

  importSoulseek: async (files, autoplay = true) => {
    const session = loadSlskSession();
    const have = new Set(get().tracks.map((t) => t.soulseekId).filter(Boolean));
    const incoming = [];
    for (const file of files) {
      const sid = slskTrackId(file);
      if (have.has(sid)) continue;
      have.add(sid);
      const id = crypto.randomUUID();
      const polished = polishTrackFromFilename(file.filename);
      const url = slskStreamUrl(file, session);
      incoming.push({
        id,
        name: file.name || polished.name || "Track",
        artist: file.artist || polished.artist || file.username,
        album: file.album || polished.album || "Soulseek",
        genre: "",
        tags: ["Soulseek", file.ext].filter(Boolean),
        year: file.year || polished.year || "",
        url,
        coverUrl: null,
        format: (file.ext || "SLSK").toUpperCase(),
        sampleRate: null, bitDepth: null, bitrate: file.bitRate || null, channels: null,
        lossless: Boolean(file.lossless), liked: false, starred: false,
        soulseekId: sid, trackNo: file.trackNo || polished.trackNo,
        durationSec: file.length || 0, bytes: file.size, addedAt: Date.now(),
      });
    }
    if (!incoming.length) {
      get().flash("Those Soulseek tracks are already in the library");
      return 0;
    }
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    for (let i = 0; i < incoming.length; i++) {
      const track = incoming[i];
      try {
        await putStoredTrack({
          id: track.id, name: track.name, artist: track.artist, album: track.album,
          genre: "", tags: track.tags, year: track.year, format: track.format,
          sampleRate: null, bitDepth: null, bitrate: track.bitrate, channels: null,
          lossless: track.lossless, liked: false, soulseekId: track.soulseekId,
          duration: track.durationSec, bytes: track.bytes, trackNo: track.trackNo,
          audio: new Blob([track.soulseekId], { type: "text/plain" }), cover: null,
          addedAt: Date.now() + i,
        });
      } catch {}
    }
    get().flash(`Added ${incoming.length} Soulseek ${incoming.length === 1 ? "track" : "tracks"}`);
    if (autoplay && incoming[0]) {
      const idx = get().tracks.findIndex((t) => t.id === incoming[0].id);
      if (idx >= 0) get().playIndex(idx, true);
    }
    return incoming.length;
  },

  importAmazon: asyncNoop,
  importBandcamp: asyncNoop,
  importDeezer: asyncNoop,
  importDeezerArl: asyncNoop,
  importIbroadcast: asyncNoop,
  importFoundAudio: asyncNoop,
  findOnArchive: asyncNoop,
  archiveRadio: asyncNoop,
  importYoutube: async (idOrUrl) => {
    const youtubeId = parseYoutubeId(idOrUrl);
    if (!youtubeId) {
      get().flash("Not a valid YouTube link");
      return 0;
    }
    const existing = get().tracks.findIndex((t) => t.youtubeId === youtubeId);
    if (existing >= 0) {
      get().playIndex(existing, true);
      return 0;
    }
    const id = crypto.randomUUID();
    const track = {
      id,
      name: `YouTube ${youtubeId}`,
      artist: "YouTube",
      album: "YouTube Music",
      genre: "",
      tags: ["YouTube"],
      year: "",
      url: `yt:${youtubeId}`,
      coverUrl: youtubeThumb(youtubeId),
      format: "YT",
      sampleRate: null, bitDepth: null, bitrate: null, channels: null,
      lossless: false, liked: false, starred: false,
      youtubeId, addedAt: Date.now(),
    };
    set((s) => ({ tracks: [...s.tracks, track] }));
    try {
      await putStoredTrack({
        id, name: track.name, artist: track.artist, album: track.album,
        genre: "", tags: ["YouTube"], year: "", format: "YT",
        sampleRate: null, bitDepth: null, bitrate: null, channels: null,
        lossless: false, liked: false, youtubeId,
        coverRemote: track.coverUrl || undefined,
        audio: new Blob([youtubeId], { type: "text/plain" }), cover: null,
        addedAt: Date.now(),
      });
    } catch {}
    get().flash("Added YouTube track");
    get().playIndex(get().tracks.length - 1, true);
    return 1;
  },
}));
