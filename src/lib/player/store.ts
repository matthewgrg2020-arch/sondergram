import { create } from "zustand";
import { FLAT_EQ, type EqGains } from "./constants";
import type { IsolateMode, RemasterPreset, SpatialPreset } from "./engine";
import {
  applyEq,
  applyPreamp,
  setBassLock,
  setRemaster as engSetRemaster,
  setSpatialMode,
  setBalance as engSetBalance,
  setMasterGain,
  setPlaybackRate,
} from "./engine";
import type { VizMode } from "./session";
import type { UserPlaylist } from "./playlists";
import type { StreamHit } from "./stream-search";
import type { FoundAudio } from "./find-audio";
import type { AmTrack } from "./amazon";
import type { SpTrack } from "./spotify";
import type { SlskFile } from "./soulseek";

export type RepeatMode = "off" | "all" | "one";
export type StopAfter = "off" | "track" | "album";
export type { IsolateMode, RemasterPreset, SpatialPreset, VizMode };

export type Track = {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  tags: string[];
  year: string;
  url: string;
  coverUrl: string | null;
  format: string;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  channels: number | null;
  lossless: boolean;
  liked: boolean;
  starred: boolean;
  youtubeId?: string;
  ibroadcastId?: string;
  ibFile?: string;
  deezerId?: string;
  spotifyId?: string;
  archiveId?: string;
  bandcampId?: string;
  bandcampUrl?: string;
  qobuzId?: string;
  appleId?: string;
  previewUrl?: string;
  addedAt?: number;
  trackNo?: number;
  diskNo?: number;
  durationSec?: number;
  bytes?: number;
  albumArtist?: string;
  explicit?: boolean;
  albumNote?: string;
  mvId?: string;
  mvUrl?: string;
  mvThumb?: string;
  single?: boolean;
  popular?: boolean;
  chartRank?: number;
  albumRating?: number;
  artistGenre?: string;
  artistTags?: string[];
  metaEdited?: boolean;
  amazonId?: string;
  soulseekId?: string;
  replayGain?: number;
  forceYoutube?: boolean;
};

const noop = () => {};
const asyncNoop = async () => 0;

export function catalogHold(_track?: { id?: string } | null) {
  return false;
}

type PlayerState = {
  tracks: Track[];
  index: number;
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  eq: EqGains;
  preamp: number;
  presetId: string;
  customPresets: { id: string; label: string; gains: EqGains; preamp: number }[];
  rate: number;
  pitch: number;
  isolate: IsolateMode;
  spatial: SpatialPreset;
  spatialAmount: number;
  radio: boolean;
  radioRecent: string[];
  upNext: string[];
  notice: string | null;
  crossfade: number;
  sleep: number | null;
  stopAfter: StopAfter;
  recent: string[];
  plays: Record<string, number>;
  positions: Record<string, number>;
  listenMs: number;
  listenDay: string;
  listenLog: { day: string; ms: number }[];
  balance: number;
  viz: VizMode;
  focus: boolean;
  quiet: boolean;
  normalize: boolean;
  skipSilence: boolean;
  bassLock: boolean;
  haptic: boolean;
  shakeSkip: boolean;
  gapless: boolean;
  mono: boolean;
  remaster: RemasterPreset;
  remasterAmt: number;
  autoEq: boolean;
  playlists: UserPlaylist[];
  loopA: number | null;
  loopB: number | null;
  hydrate: () => Promise<void>;
  playIndex: (index: number, fromUser?: boolean) => void;
  playIds: (ids: string[]) => void;
  queueNext: (id: string) => void;
  queueNextMany: (ids: string[]) => void;
  queueLast: (id: string) => void;
  playRest: (id: string) => void;
  playAlbum: (id: string) => void;
  skipAlbum: () => void;
  clearQueue: () => void;
  flash: (message: string) => void;
  setPlaying: (playing: boolean) => void;
  setTimes: (currentTime: number, duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setEqBand: (index: number, value: number) => void;
  setPreamp: (value: number) => void;
  applyPreset: (id: string, gains: EqGains, preamp: number) => void;
  saveCustomPreset: (label: string) => void;
  deleteCustomPreset: (id: string) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setIsolate: (mode: IsolateMode) => void;
  setSpatial: (preset: SpatialPreset) => void;
  setSpatialAmount: (amount: number) => void;
  toggleRadio: () => void;
  playRadioFrom: (id: string) => void;
  toggleLike: (id: string) => void;
  toggleStar: (id: string) => void;
  setReplayGain: (id: string, db: number) => void;
  setCrossfade: (seconds: number) => void;
  setSleep: (minutes: number | null) => void;
  setStopAfter: (mode: StopAfter) => void;
  surprise: () => void;
  rememberPosition: (id: string, time: number) => void;
  addListenMs: (ms: number) => void;
  toggleFocus: () => void;
  toggleQuiet: () => void;
  setBalance: (value: number) => void;
  setViz: (viz: VizMode) => void;
  toggleNormalize: () => void;
  toggleSkipSilence: () => void;
  toggleBassLock: () => void;
  toggleHaptic: () => void;
  toggleShakeSkip: () => void;
  toggleGapless: () => void;
  toggleMono: () => void;
  toggleAutoEq: () => void;
  saveQueuePlaylist: (name?: string) => void;
  createPlaylist: (name: string, trackIds: string[]) => void;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => void;
  playPlaylist: (id: string) => void;
  deletePlaylist: (id: string) => void;
  setRemaster: (preset: RemasterPreset) => void;
  setRemasterAmt: (amount: number) => void;
  djMix: () => void;
  playMoreLikeThis: () => Promise<number>;
  markLoop: (point: "a" | "b") => void;
  clearLoop: () => void;
  nextIndex: (fromUser?: boolean) => number | null;
  prevIndex: () => number | null;
  patchTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  addFiles: (files: File[]) => void;
  importLibrary: (file: File) => Promise<number>;
  clearLibrary: () => Promise<void>;
  exportLibrary: () => Promise<void>;
  importSoulseek: (files: SlskFile[], autoplay?: boolean) => Promise<number>;
  importStreamHits: (hits: StreamHit[], autoplay?: boolean) => Promise<number>;
  importFoundAudio: (hits: FoundAudio[]) => Promise<number>;
  findOnArchive: (artist: string, album: string) => Promise<number>;
  archiveRadio: (artist: string) => Promise<number>;
  importBandcamp: (url: string) => Promise<number>;
  importDeezer: (arl: string) => Promise<number>;
  importDeezerArl: (arl: string) => Promise<number>;
  importAmazon: (arl: string) => Promise<number>;
  importIbroadcast: () => Promise<number>;
  importYoutube: (idOrUrl: string) => Promise<number>;
};

export const usePlayer = create<PlayerState>((set, get) => ({
  tracks: [],
  index: -1,
  ready: true,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: "off",
  eq: [...FLAT_EQ] as EqGains,
  preamp: 0,
  presetId: "flat",
  customPresets: [],
  rate: 1,
  pitch: 0,
  isolate: "mix",
  spatial: "off",
  spatialAmount: 0.7,
  radio: false,
  radioRecent: [],
  upNext: [],
  notice: null,
  crossfade: 4,
  sleep: null,
  stopAfter: "off",
  recent: [],
  plays: {},
  positions: {},
  listenMs: 0,
  listenDay: "",
  listenLog: [],
  balance: 0,
  viz: "bars",
  focus: false,
  quiet: false,
  normalize: false,
  skipSilence: false,
  bassLock: false,
  haptic: false,
  shakeSkip: false,
  gapless: true,
  mono: false,
  remaster: "off",
  remasterAmt: 0.7,
  autoEq: false,
  playlists: [],
  loopA: null,
  loopB: null,
  hydrate: async () => {
    set({ ready: true });
  },
  playIndex: (index) => {
    const tracks = get().tracks;
    if (index < 0 || index >= tracks.length) return;
    set({ index, playing: true, currentTime: 0 });
  },
  playIds: (ids) => {
    const tracks = get().tracks;
    const first = tracks.findIndex((t) => ids.includes(t.id));
    if (first >= 0) get().playIndex(first, true);
  },
  queueNext: noop,
  queueNextMany: noop,
  queueLast: noop,
  playRest: noop,
  playAlbum: noop,
  skipAlbum: noop,
  clearQueue: () => set({ upNext: [] }),
  flash: (message) => set({ notice: message }),
  setPlaying: (playing) => set({ playing }),
  setTimes: (currentTime, duration) => set({ currentTime, duration }),
  setVolume: (volume) => {
    set({ volume });
    try { setMasterGain(volume); } catch {}
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
    })),
  setEqBand: (index, value) => {
    set((s) => {
      const eq = s.eq.slice() as EqGains;
      eq[index] = value;
      try { applyEq(eq); } catch {}
      return { eq, presetId: "custom" };
    });
  },
  setPreamp: (value) => {
    set({ preamp: value, presetId: "custom" });
    try { applyPreamp(value); } catch {}
  },
  applyPreset: (id, gains, preamp) => {
    set({ eq: gains.slice() as EqGains, preamp, presetId: id });
    try { applyEq(gains); applyPreamp(preamp); } catch {}
  },
  saveCustomPreset: (label) => {
    const name = (label || "").trim().slice(0, 24) || "Custom";
    const state = get();
    const id = `custom-${Date.now().toString(36)}`;
    const next = [
      { id, label: name, gains: state.eq.slice() as EqGains, preamp: state.preamp },
      ...state.customPresets.filter((item) => item.label.toLowerCase() !== name.toLowerCase()),
    ].slice(0, 12);
    set({ customPresets: next, presetId: id });
  },
  deleteCustomPreset: (id) => {
    set((s) => ({
      customPresets: s.customPresets.filter((item) => item.id !== id),
      presetId: s.presetId === id ? "custom" : s.presetId,
    }));
  },
  setRate: (rate) => {
    set({ rate });
    try { setPlaybackRate(rate); } catch {}
  },
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => set({ isolate }),
  setSpatial: (spatial) => {
    set({ spatial });
    try { setSpatialMode(spatial, get().spatialAmount); } catch {}
  },
  setSpatialAmount: (spatialAmount) => {
    set({ spatialAmount });
    try { setSpatialMode(get().spatial, spatialAmount); } catch {}
  },
  toggleRadio: () => set((s) => ({ radio: !s.radio })),
  playRadioFrom: noop,
  toggleLike: noop,
  toggleStar: noop,
  setReplayGain: noop,
  setCrossfade: (crossfade) => set({ crossfade }),
  setSleep: (sleep) => set({ sleep }),
  setStopAfter: (stopAfter) => set({ stopAfter }),
  surprise: noop,
  rememberPosition: noop,
  addListenMs: noop,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  toggleQuiet: () => set((s) => ({ quiet: !s.quiet })),
  setBalance: (balance) => {
    set({ balance });
    try { engSetBalance(balance); } catch {}
  },
  setViz: (viz) => set({ viz }),
  toggleNormalize: () => set((s) => ({ normalize: !s.normalize })),
  toggleSkipSilence: () => set((s) => ({ skipSilence: !s.skipSilence })),
  toggleBassLock: () =>
    set((s) => {
      const next = !s.bassLock;
      try { setBassLock(next ? 3 : 0); } catch {}
      return { bassLock: next };
    }),
  toggleHaptic: () => set((s) => ({ haptic: !s.haptic })),
  toggleShakeSkip: () => set((s) => ({ shakeSkip: !s.shakeSkip })),
  toggleGapless: () => set((s) => ({ gapless: !s.gapless })),
  toggleMono: () => set((s) => ({ mono: !s.mono })),
  toggleAutoEq: () => set((s) => ({ autoEq: !s.autoEq })),
  saveQueuePlaylist: noop,
  createPlaylist: noop,
  addTracksToPlaylist: noop,
  playPlaylist: noop,
  deletePlaylist: noop,
  setRemaster: (remaster) => {
    set({ remaster });
    try { engSetRemaster(remaster, get().remasterAmt); } catch {}
  },
  setRemasterAmt: (remasterAmt) => {
    set({ remasterAmt });
    try { engSetRemaster(get().remaster, remasterAmt); } catch {}
  },
  djMix: noop,
  playMoreLikeThis: asyncNoop,
  markLoop: noop,
  clearLoop: () => set({ loopA: null, loopB: null }),
  nextIndex: () => {
    const { tracks, index, shuffle } = get();
    if (!tracks.length) return null;
    if (shuffle) {
      let n = index;
      while (tracks.length > 1 && n === index) n = Math.floor(Math.random() * tracks.length);
      return n;
    }
    return index >= tracks.length - 1 ? 0 : index + 1;
  },
  prevIndex: () => {
    const { tracks, index } = get();
    if (!tracks.length) return null;
    return index <= 0 ? tracks.length - 1 : index - 1;
  },
  patchTrack: (id, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  removeTrack: (id) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      index: Math.min(s.index, Math.max(0, s.tracks.length - 2)),
    })),
  addFiles: noop,
  importLibrary: async () => 0,
  clearLibrary: async () => set({ tracks: [], index: -1 }),
  exportLibrary: async () => {},
  importSoulseek: asyncNoop,
  importStreamHits: asyncNoop,
  importFoundAudio: asyncNoop,
  findOnArchive: asyncNoop,
  archiveRadio: asyncNoop,
  importBandcamp: asyncNoop,
  importDeezer: asyncNoop,
  importDeezerArl: asyncNoop,
  importAmazon: asyncNoop,
  importIbroadcast: asyncNoop,
  importYoutube: asyncNoop,
}));
