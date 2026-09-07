import { create } from "zustand";
import { pickRadioIndex } from "./catalog";
import { coverFromFile } from "./cover";
import { FLAT_EQ, type EqGains } from "./constants";
import { beginPlayback, outputAudio, pauseOutput, primePlayback, setMonoMode, setRemaster as applyRemaster, unlockEngine } from "./engine";
import { albumKey, compareTracks } from "./catalog";
import { copyAudioBlob, isAudioFile, typedAudioBlob } from "./format";
import { deleteStoredTrack, getAudioBlob, listStoredTracks, putStoredTrack, updateStoredMeta, type StoredTrack } from "./persist";
import { readFileTags, tagsFromFilename, trackNoFromName } from "./tags";
import type { IsolateMode, RemasterPreset, SpatialPreset } from "./engine";
import { loadSession, saveSession, todayKey, type CustomEqPreset, type VizMode } from "./session";
import { loadIbSession, streamUrl, type IbPlaylist, type IbTrack } from "./ibroadcast";
import { ibLibrary, ibSharePlaylist } from "./ibroadcast-api";
import { dzImport, dzArlImport } from "./deezer-api";
import { exportLibraryBackup, importLibraryBackup } from "./backup";
import { blobFromUrl, lookupAlbum, searchAlbums, type AlbumHit } from "./lookup";
import { findAlbumVideos } from "./videos";
import { lookupAlbumIntel } from "./charts";
import { iaItem, iaSearch } from "./archive-api";
import { amImport, amArlLibrary } from "./amazon-api";
import { saveAmSession } from "./amazon";
import type { FoundAudio } from "./find-audio";
import type { AmTrack } from "./amazon";
import type { IaTrack } from "./archive";
import { parseYoutubeId, youtubeLoad, youtubeMeta, youtubePause, youtubeThumb } from "./youtube";

export type RepeatMode = "off" | "all" | "one";
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
  replayGain?: number;
};

function saveMeta(track: Track, cover?: Blob | null) {
  void updateStoredMeta(track.id, {
    name: track.name,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    tags: track.tags,
    year: track.year,
    liked: track.liked,
    starred: track.starred,
    trackNo: track.trackNo,
    diskNo: track.diskNo,
    duration: track.durationSec,
    bytes: track.bytes,
    albumArtist: track.albumArtist,
    explicit: track.explicit,
    albumNote: track.albumNote,
    mvId: track.mvId,
    mvUrl: track.mvUrl,
    mvThumb: track.mvThumb,
    single: track.single,
    popular: track.popular,
    chartRank: track.chartRank,
    albumRating: track.albumRating,
    artistGenre: track.artistGenre,
    artistTags: track.artistTags,
    metaEdited: track.metaEdited,
    amazonId: track.amazonId,
    replayGain: track.replayGain,
    ...(cover !== undefined ? { cover } : {}),
  });
}

const playUrls = new Map<string, string>();

function trimPlayUrls(keep: string[]) {
  const hold = new Set(keep.filter(Boolean));
  for (const [id, url] of playUrls) {
    if (playUrls.size <= 3) break;
    if (hold.has(id)) continue;
    URL.revokeObjectURL(url);
    playUrls.delete(id);
  }
}

async function itunesPreview(artist: string, name: string) {
  try {
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", `${artist} ${name}`.trim());
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString());
    if (!res.ok) return "";
    const data = (await res.json()) as { results?: { previewUrl?: string }[] };
    return data.results?.[0]?.previewUrl || "";
  } catch {
    return "";
  }
}

function ingestAmazon(
  get: () => PlayerState,
  set: (partial: Partial<PlayerState> | ((s: PlayerState) => Partial<PlayerState>)) => void,
  remote: AmTrack[],
) {
  const have = new Set(get().tracks.map((t) => t.amazonId).filter(Boolean));
  const incoming: Track[] = [];
  for (const item of remote) {
    if (have.has(item.id)) continue;
    have.add(item.id);
    const id = crypto.randomUUID();
    incoming.push({
      id,
      name: item.name,
      artist: item.artist,
      album: item.album,
      genre: "",
      tags: ["Amazon", item.source].filter(Boolean),
      year: item.year,
      url: item.preview || `am:${item.id}`,
      coverUrl: item.cover || null,
      format: "AMZ",
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      channels: null,
      lossless: false,
      liked: false,
      starred: false,
      explicit: item.explicit,
      trackNo: item.trackNo || undefined,
      diskNo: item.diskNo || 1,
      durationSec: item.duration || 0,
      amazonId: item.id,
      previewUrl: item.preview || undefined,
      albumArtist: item.artist,
      addedAt: Date.now(),
    });
  }
  if (!incoming.length) return 0;
  set((s) => ({ tracks: [...s.tracks, ...incoming] }));
  incoming.forEach((track, i) => {
    void putStoredTrack({
      id: track.id,
      name: track.name,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      tags: track.tags,
      year: track.year,
      format: track.format,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      channels: null,
      lossless: false,
      liked: false,
      starred: false,
      explicit: track.explicit,
      trackNo: track.trackNo,
      diskNo: track.diskNo,
      duration: track.durationSec,
      albumArtist: track.albumArtist,
      coverRemote: track.coverUrl || undefined,
      amazonId: track.amazonId,
      previewUrl: track.previewUrl,
      audio: new Blob([track.amazonId ?? track.id], { type: "text/plain" }),
      cover: null,
      addedAt: Date.now() + i,
    });
  });
  return incoming.length;
}

async function prefetchPlayUrl(id: string) {
  if (!id || playUrls.has(id)) return;
  const track = usePlayer.getState().tracks.find((t) => t.id === id);
  if (!track || track.youtubeId || track.previewUrl || track.ibroadcastId || track.deezerId || track.archiveId) return;
  const blob = await getAudioBlob(id);
  if (!blob || blob.size === 0) return;
  if (playUrls.has(id)) return;
  const url = URL.createObjectURL(typedAudioBlob(blob, track.format));
  playUrls.set(id, url);
  trimPlayUrls([usePlayer.getState().tracks[usePlayer.getState().index]?.id ?? "", id, usePlayer.getState().upNext[0] ?? ""]);
}
type TrackPatch = Partial<Omit<Track, "id">>;
type AlbumPatch = Partial<Pick<Track, "album" | "year" | "tags" | "albumArtist" | "albumNote" | "explicit" | "genre" | "albumRating">>;

function sessionSlice(s: {
  positions: Record<string, number>;
  plays: Record<string, number>;
  recent: string[];
  listenMs: number;
  listenDay: string;
  listenLog: Record<string, number>;
  balance: number;
  viz: VizMode;
  focus: boolean;
  quiet: boolean;
  normalize: boolean;
  skipSilence: boolean;
  eq: EqGains;
  preamp: number;
  presetId: string;
  customPresets: CustomEqPreset[];
  isolate: IsolateMode;
  spatial: SpatialPreset;
  spatialAmount: number;
  volume: number;
  bassLock: boolean;
  haptic: boolean;
  shakeSkip: boolean;
  gapless: boolean;
  mono: boolean;
  remaster: RemasterPreset;
  remasterAmt: number;
}) {
  return {
    positions: s.positions,
    plays: s.plays,
    recent: s.recent,
    listenMs: s.listenMs,
    listenDay: s.listenDay || todayKey(),
    listenLog: s.listenLog,
    balance: s.balance,
    viz: s.viz,
    focus: s.focus,
    quiet: s.quiet,
    normalize: s.normalize,
    skipSilence: s.skipSilence,
    eq: s.eq,
    preamp: s.preamp,
    presetId: s.presetId,
    customPresets: s.customPresets,
    isolate: s.isolate,
    spatial: s.spatial,
    spatialAmount: s.spatialAmount,
    volume: s.volume,
    bassLock: s.bassLock,
    haptic: s.haptic,
    shakeSkip: s.shakeSkip,
    gapless: s.gapless,
    mono: s.mono,
    remaster: s.remaster,
    remasterAmt: s.remasterAmt,
  };
}

function trackFromStored(row: StoredTrack): Track {
  const yt = row.youtubeId;
  return {
    id: row.id,
    name: row.name,
    artist: row.artist,
    album: row.album ?? "",
    genre: row.genre ?? "",
    tags: row.tags ?? [],
    year: row.year ?? "",
    url: yt
      ? `yt:${yt}`
      : row.ibroadcastId
        ? `ib:${row.id}`
        : row.previewUrl
          ? row.previewUrl
          : row.archiveId
            ? `ia:${row.archiveId}`
          : row.spotifyId
            ? `sp:${row.spotifyId}`
            : row.amazonId
              ? `am:${row.amazonId}`
              : row.deezerId
              ? `dz:${row.deezerId}`
              : `sg:${row.id}`,
    coverUrl: row.cover
      ? URL.createObjectURL(row.cover)
      : row.coverRemote
        ? row.coverRemote
        : yt
          ? youtubeThumb(yt)
          : null,
    format: yt ? "YT" : row.format,
    sampleRate: row.sampleRate,
    bitDepth: row.bitDepth,
    bitrate: row.bitrate,
    channels: row.channels,
    lossless: row.lossless,
    liked: Boolean(row.liked),
    starred: Boolean(row.starred),
    youtubeId: yt,
    ibroadcastId: row.ibroadcastId,
    ibFile: row.ibFile,
    deezerId: row.deezerId,
    spotifyId: row.spotifyId,
    archiveId: row.archiveId,
    amazonId: row.amazonId,
    previewUrl: row.previewUrl,
    addedAt: row.addedAt,
    trackNo: row.trackNo || trackNoFromName(row.name),
    diskNo: row.diskNo || 1,
    durationSec: row.duration || 0,
    bytes: row.bytes || (row.audio instanceof Blob ? row.audio.size : 0),
    albumArtist: row.albumArtist || "",
    explicit: Boolean(row.explicit),
    albumNote: row.albumNote || "",
    mvId: row.mvId,
    mvUrl: row.mvUrl,
    mvThumb: row.mvThumb,
    single: Boolean(row.single),
    popular: Boolean(row.popular),
    chartRank: row.chartRank,
    albumRating: row.albumRating ?? 0,
    artistGenre: row.artistGenre || "",
    artistTags: row.artistTags || [],
    metaEdited: Boolean(row.metaEdited),
    replayGain: row.replayGain,
  };
}

function emptyMeta(format: string) {
  const lossless = format === "FLAC" || format === "WAV" || format === "AIFF" || format === "ALAC";
  return {
    album: "",
    genre: "",
    tags: [] as string[],
    year: "",
    coverUrl: null as string | null,
    sampleRate: null as number | null,
    bitDepth: null as number | null,
    bitrate: null as number | null,
    channels: null as number | null,
    lossless,
    liked: false,
    starred: false,
  };
}

type PlayerState = {
  tracks: Track[];
  index: number;
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
  customPresets: CustomEqPreset[];
  ready: boolean;
  rate: number;
  pitch: number;
  isolate: IsolateMode;
  radio: boolean;
  radioRecent: string[];
  upNext: string[];
  likedOnly: boolean;
  crossfade: number;
  sleepUntil: number | null;
  recent: string[];
  plays: Record<string, number>;
  positions: Record<string, number>;
  listenMs: number;
  listenDay: string;
  balance: number;
  viz: VizMode;
  focus: boolean;
  quiet: boolean;
  loopA: number | null;
  loopB: number | null;
  spatial: SpatialPreset;
  spatialAmount: number;
  listenLog: Record<string, number>;
  normalize: boolean;
  skipSilence: boolean;
  bassLock: boolean;
  haptic: boolean;
  shakeSkip: boolean;
  gapless: boolean;
  mono: boolean;
  remaster: RemasterPreset;
  remasterAmt: number;
  hydrate: () => Promise<void>;
  addFiles: (files: File[]) => void;
  exportLibrary: () => Promise<number>;
  importLibrary: (file: File) => Promise<number>;
  addYoutube: (input: string) => Promise<boolean>;
  syncIbroadcast: () => Promise<number>;
  importDeezer: (input?: string, token?: string) => Promise<number>;
  importDeezerArl: (arl: string) => Promise<number>;
  importSpotify: (token: string) => Promise<number>;
  importArchive: (identifier: string, lossless?: boolean, autoplay?: boolean) => Promise<number>;
  importAmazon: (input: string, arl?: string) => Promise<number>;
  importAmazonArl: (arl: string) => Promise<number>;
  importFoundAudio: (hits: FoundAudio[]) => Promise<number>;
  findOnArchive: (artist: string, album: string) => Promise<number>;
  archiveRadio: (artist?: string) => Promise<number>;
  warmTrack: (id: string) => void;
  shareIbroadcast: (name: string, trackIds: string[]) => Promise<string>;
  importIbPlaylist: (playlistId: string, playlists: IbPlaylist[], ibTracks: IbTrack[]) => void;
  addDemo: (track: Track, audio: Blob) => void;
  removeTrack: (id: string) => void;
  patchTrack: (id: string, patch: TrackPatch) => void;
  updateMeta: (
    id: string,
    patch: Partial<Pick<Track, "name" | "artist" | "album" | "year" | "tags">>,
  ) => void;
  updateAlbumTags: (trackIds: string[], tags: string[]) => void;
  updateAlbumMeta: (trackIds: string[], patch: AlbumPatch) => void;
  setAlbumRating: (trackIds: string[], rating: number) => void;
  updateArtistMeta: (trackIds: string[], patch: { genre?: string; tags?: string[] }) => void;
  setCover: (ids: string[], file: File) => void;
  setCoverUrl: (ids: string[], url: string) => Promise<void>;
  lookupAlbumOnline: (trackIds: string[]) => Promise<boolean>;
  searchAlbumOnline: (trackIds: string[]) => Promise<AlbumHit[]>;
  applyAlbumHit: (trackIds: string[], hit: AlbumHit) => Promise<void>;
  lookupVideos: (trackIds: string[]) => Promise<number>;
  lookupAlbumHits: (trackIds: string[]) => Promise<void>;
  playIndex: (index: number, fromUser?: boolean) => void;
  playIds: (ids: string[]) => void;
  queueNext: (id: string) => void;
  queueNextMany: (ids: string[]) => void;
  queueLast: (id: string) => void;
  playRest: (id: string) => void;
  playAlbum: (id: string) => void;
  skipAlbum: () => void;
  clearQueue: () => void;
  notice: string | null;
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
  toggleLike: (id: string) => void;
  toggleStar: (id: string) => void;
  setReplayGain: (id: string, db: number) => void;
  setCrossfade: (seconds: number) => void;
  setSleep: (minutes: number | null) => void;
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
  setRemaster: (preset: RemasterPreset) => void;
  setRemasterAmt: (amount: number) => void;
  djMix: () => void;
  markLoop: (point: "a" | "b") => void;
  clearLoop: () => void;
  nextIndex: (fromUser?: boolean) => number | null;
  prevIndex: () => number | null;
};

export const usePlayer = create<PlayerState>((set, get) => ({
  tracks: [],
  index: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: "all",
  eq: [...FLAT_EQ],
  preamp: 0,
  presetId: "flat",
  customPresets: [],
  ready: false,
  rate: 1,
  pitch: 0,
  isolate: "mix",
  radio: false,
  radioRecent: [],
  upNext: [],
  likedOnly: false,
  crossfade: 4,
  sleepUntil: null,
  recent: [],
  plays: {},
  positions: {},
  listenMs: 0,
  listenDay: "",
  balance: 0,
  viz: "bars",
  focus: false,
  quiet: false,
  loopA: null,
  loopB: null,
  spatial: "off",
  spatialAmount: 0.72,
  listenLog: {},
  normalize: false,
  skipSilence: false,
  bassLock: false,
  haptic: false,
  shakeSkip: false,
  gapless: true,
  mono: false,
  remaster: "off",
  remasterAmt: 0.72,
  notice: null,

  hydrate: async () => {
    if (typeof indexedDB === "undefined") {
      set({ ready: true });
      return;
    }
    try {
      const rows = await listStoredTracks();
      const tracks = rows.map(trackFromStored);
      const saved = Number(localStorage.getItem("sondergram:index") ?? localStorage.getItem("fader:index") ?? -1);
      const index = tracks.length === 0 ? -1 : Math.min(Math.max(saved, 0), tracks.length - 1);
      const crossfade = Number(localStorage.getItem("sondergram:crossfade") ?? 4);
      const session = loadSession();
      set({
        tracks,
        index,
        ready: true,
        playing: false,
        crossfade: Number.isFinite(crossfade) ? crossfade : 4,
        recent: session.recent,
        plays: session.plays,
        positions: session.positions,
        listenMs: session.listenMs,
        listenDay: session.listenDay,
        balance: session.balance,
        viz: session.viz,
        focus: session.focus,
        quiet: session.quiet,
        listenLog: session.listenLog,
        normalize: session.normalize,
        skipSilence: session.skipSilence,
        eq: session.eq,
        preamp: session.preamp,
        presetId: session.presetId,
        customPresets: session.customPresets,
        isolate: session.isolate,
        spatial: session.spatial,
        spatialAmount: session.spatialAmount,
        volume: session.volume,
        bassLock: session.bassLock,
        haptic: session.haptic,
        shakeSkip: session.shakeSkip,
        gapless: session.gapless,
        mono: session.mono,
        remaster: session.remaster,
        remasterAmt: session.remasterAmt,
      });
      const current = get().tracks[get().index];
      if (current) void prefetchPlayUrl(current.id);
    } catch {
      set({ ready: true });
    }
  },

  addFiles: (files) => {
    const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip") || f.type === "application/zip");
    const audioFiles = files.filter(isAudioFile);
    if (zips.length) {
      void (async () => {
        for (const zip of zips) {
          try {
            await get().importLibrary(zip);
          } catch {
            get().flash("That zip is not a Sondergram library backup");
          }
        }
      })();
    }
    if (audioFiles.length === 0) return;
    void (async () => {
      for (const [i, file] of audioFiles.entries()) {
        const parsed = tagsFromFilename(file.name);
        let audio: Blob;
        let tags: Awaited<ReturnType<typeof readFileTags>> | null = null;
        try {
          const copied = copyAudioBlob(file);
          const parsedTags = readFileTags(file, file.name).catch(() => null);
          audio = await copied;
          tags = await parsedTags;
        } catch {
          continue;
        }
        const id = crypto.randomUUID();
        const url = URL.createObjectURL(audio);
        const track: Track = {
          id,
          name: tags?.title ?? parsed.title,
          artist: tags?.artist ?? parsed.artist,
          url,
          format: tags?.format ?? parsed.format,
          ...emptyMeta(tags?.format ?? parsed.format),
          album: tags?.album ?? parsed.album,
          genre: tags?.genre ?? "",
          tags: tags?.tags ?? [],
          year: tags?.year ?? "",
          coverUrl: tags?.coverUrl ?? null,
          sampleRate: tags?.sampleRate ?? null,
          bitDepth: tags?.bitDepth ?? null,
          bitrate: tags?.bitrate ?? null,
          channels: tags?.channels ?? null,
          lossless: tags?.lossless ?? emptyMeta(parsed.format).lossless,
          liked: false,
          addedAt: Date.now(),
          trackNo: tags?.trackNo || trackNoFromName(file.name),
          diskNo: tags?.diskNo || 1,
          durationSec: tags?.duration || 0,
          bytes: audio.size,
          albumArtist: tags?.albumArtist || "",
          explicit: tags?.explicit ?? false,
        };
        set((s) => {
          const tracks = [...s.tracks, track];
          const index = s.index === -1 ? tracks.length - 1 : s.index;
          return { tracks, index };
        });
        try {
          await putStoredTrack({
            id,
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
            trackNo: track.trackNo,
            diskNo: track.diskNo,
            duration: track.durationSec,
            bytes: track.bytes,
            albumArtist: track.albumArtist,
            explicit: track.explicit,
            audio,
            cover: tags?.coverBlob ?? null,
            addedAt: Date.now() + i,
          });
        } catch {
          /* copied bytes still play this session */
        }
      }
    })();
  },

  exportLibrary: async () => {
    const n = await exportLibraryBackup();
    get().flash(n ? `Saved ${n} tracks to a zip` : "Library is empty");
    return n;
  },

  importLibrary: async (file) => {
    const n = await importLibraryBackup(file);
    await get().hydrate();
    get().flash(n ? `Restored ${n} tracks` : "Those tracks are already here");
    return n;
  },

  addYoutube: async (input) => {
    const youtubeId = parseYoutubeId(input);
    if (!youtubeId) return false;
    const existing = get().tracks.findIndex((t) => t.youtubeId === youtubeId);
    if (existing >= 0) {
      const id = get().tracks[existing].id;
      if (get().playing && get().index !== existing) {
        get().queueLast(id);
        get().flash("Added to queue");
      } else {
        get().playIndex(existing);
      }
      return true;
    }
    const id = crypto.randomUUID();
    const track: Track = {
      id,
      name: "YouTube",
      artist: "YouTube",
      url: `yt:${youtubeId}`,
      format: "YT",
      ...emptyMeta("YT"),
      coverUrl: youtubeThumb(youtubeId),
      youtubeId,
      addedAt: Date.now(),
    };
    set((s) => ({ tracks: [...s.tracks, track] }));
    const index = get().tracks.findIndex((t) => t.id === id);
    if (get().playing && get().index !== index) {
      get().queueLast(id);
      get().flash("Added to library and queue");
    } else {
      get().playIndex(index);
    }
    void youtubeMeta(youtubeId).then((meta) => {
      const current = get().tracks.find((t) => t.id === id);
      if (!current || current.metaEdited) return;
      if (current.name !== "YouTube" && current.artist !== "YouTube") return;
      get().patchTrack(id, { name: meta.title, artist: meta.author, metaEdited: false });
      const next = get().tracks.find((t) => t.id === id);
      if (next) saveMeta(next);
    });
    void putStoredTrack({
      id,
      name: track.name,
      artist: track.artist,
      album: "",
      genre: "",
      tags: [],
      year: "",
      format: "YT",
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      channels: null,
      lossless: false,
      liked: false,
      youtubeId,
      audio: new Blob([youtubeId], { type: "text/plain" }),
      cover: null,
      addedAt: Date.now(),
    });
    return true;
  },

  syncIbroadcast: async () => {
    const session = loadIbSession();
    if (!session) throw new Error("Sign in to iBroadcast first.");
    const { tracks: remote } = await ibLibrary({ data: session });
    const have = new Set(get().tracks.map((t) => t.ibroadcastId).filter(Boolean));
    const incoming: Track[] = [];
    for (const item of remote) {
      if (have.has(item.id)) continue;
      have.add(item.id);
      const id = crypto.randomUUID();
      incoming.push({
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        tags: item.genre ? [item.genre, "iBroadcast"] : ["iBroadcast"],
        year: item.year,
        url: `ib:${item.id}`,
        coverUrl: item.artwork || null,
        format: "IB",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        ibroadcastId: item.id,
        ibFile: item.file,
        addedAt: Date.now(),
      });
    }
    if (incoming.length === 0) return 0;
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    incoming.forEach((track, i) => {
      void putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        coverRemote: track.coverUrl || undefined,
        ibroadcastId: track.ibroadcastId,
        ibFile: track.ibFile,
        audio: new Blob([track.ibroadcastId ?? track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    });
    return incoming.length;
  },

  importDeezer: async (input, token) => {
    const { tracks: remote } = await dzImport({ data: { input, token } });
    const have = new Set(get().tracks.map((t) => t.deezerId).filter(Boolean));
    const incoming: Track[] = [];
    for (const item of remote) {
      if (have.has(item.id)) continue;
      have.add(item.id);
      const id = crypto.randomUUID();
      incoming.push({
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: "",
        tags: item.source ? ["Deezer", item.source] : ["Deezer"],
        year: item.year,
        url: item.preview || `dz:${item.id}`,
        coverUrl: item.cover || null,
        format: "DZ",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        explicit: item.explicit,
        trackNo: item.trackNo || undefined,
        diskNo: item.diskNo || 1,
        durationSec: item.duration || 0,
        deezerId: item.id,
        previewUrl: item.preview || undefined,
        albumArtist: item.artist,
        addedAt: Date.now(),
      });
    }
    if (incoming.length === 0) return 0;
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    incoming.forEach((track, i) => {
      void putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        explicit: track.explicit,
        trackNo: track.trackNo,
        diskNo: track.diskNo,
        duration: track.durationSec,
        albumArtist: track.albumArtist,
        coverRemote: track.coverUrl || undefined,
        deezerId: track.deezerId,
        previewUrl: track.previewUrl,
        audio: new Blob([track.deezerId ?? track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    });
    return incoming.length;
  },

  importDeezerArl: async (arl) => {
    const { session, tracks: remote } = await dzArlImport({ data: { arl } });
    const { saveDzSession } = await import("./deezer");
    saveDzSession(session);
    const have = new Set(get().tracks.map((t) => t.deezerId).filter(Boolean));
    const incoming: Track[] = [];
    for (const item of remote) {
      if (have.has(item.id)) continue;
      have.add(item.id);
      let preview = item.preview;
      if (!preview) preview = await itunesPreview(item.artist, item.name);
      const id = crypto.randomUUID();
      incoming.push({
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: "",
        tags: ["Deezer", "ARL"],
        year: item.year,
        url: preview || `dz:${item.id}`,
        coverUrl: item.cover || null,
        format: "DZ",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: true,
        starred: false,
        explicit: item.explicit,
        trackNo: item.trackNo || undefined,
        diskNo: item.diskNo || 1,
        durationSec: item.duration || 0,
        deezerId: item.id,
        previewUrl: preview || undefined,
        albumArtist: item.artist,
        addedAt: Date.now(),
      });
    }
    if (incoming.length === 0) return 0;
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    incoming.forEach((track, i) => {
      void putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: true,
        starred: false,
        explicit: track.explicit,
        trackNo: track.trackNo,
        diskNo: track.diskNo,
        duration: track.durationSec,
        albumArtist: track.albumArtist,
        coverRemote: track.coverUrl || undefined,
        deezerId: track.deezerId,
        previewUrl: track.previewUrl,
        audio: new Blob([track.deezerId ?? track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    });
    return incoming.length;
  },

  importSpotify: async (token) => {
    const { fetchSpotifyLibrary } = await import("./spotify-api");
    const remote = await fetchSpotifyLibrary(token);
    const have = new Set(get().tracks.map((t) => t.spotifyId).filter(Boolean));
    const incoming: Track[] = [];
    for (const item of remote) {
      if (have.has(item.id)) continue;
      have.add(item.id);
      const id = crypto.randomUUID();
      incoming.push({
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        tags: ["Spotify", ...(item.playlist ? [item.playlist] : [])],
        year: item.year,
        url: item.preview || `sp:${item.id}`,
        coverUrl: item.cover || null,
        format: "SP",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: item.liked,
        starred: false,
        explicit: item.explicit,
        trackNo: item.trackNo || undefined,
        diskNo: item.diskNo || 1,
        durationSec: item.duration || 0,
        spotifyId: item.id,
        previewUrl: item.preview || undefined,
        albumArtist: item.albumArtist || item.artist,
        addedAt: Date.now(),
      });
    }
    if (incoming.length === 0) return 0;
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    incoming.forEach((track, i) => {
      void putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: track.liked,
        starred: false,
        explicit: track.explicit,
        trackNo: track.trackNo,
        diskNo: track.diskNo,
        duration: track.durationSec,
        albumArtist: track.albumArtist,
        coverRemote: track.coverUrl || undefined,
        spotifyId: track.spotifyId,
        previewUrl: track.previewUrl,
        audio: new Blob([track.spotifyId ?? track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    });
    return incoming.length;
  },

  importArchive: async (identifier, lossless = true, autoplay = true) => {
    const item = await iaItem({ data: { identifier, lossless } });
    const have = new Set(get().tracks.map((t) => t.previewUrl).filter(Boolean));
    const incoming: Track[] = [];
    const ids: string[] = [];
    for (const row of item.tracks as IaTrack[]) {
      if (have.has(row.url)) {
        const existing = get().tracks.find((t) => t.previewUrl === row.url);
        if (existing) ids.push(existing.id);
        continue;
      }
      have.add(row.url);
      const id = crypto.randomUUID();
      ids.push(id);
      incoming.push({
        id,
        name: row.name,
        artist: row.artist,
        album: row.album,
        genre: row.genre,
        tags: ["Internet Archive", row.genre].filter(Boolean),
        year: row.year,
        url: row.url,
        coverUrl: row.cover || null,
        format: row.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: row.lossless,
        liked: false,
        starred: false,
        trackNo: row.trackNo,
        diskNo: 1,
        durationSec: row.duration,
        bytes: row.bytes,
        albumArtist: row.artist,
        albumNote: row.note,
        archiveId: row.identifier,
        previewUrl: row.url,
        addedAt: Date.now(),
      });
    }
    if (incoming.length) {
      set((s) => ({ tracks: [...s.tracks, ...incoming] }));
      incoming.forEach((track, i) => {
        void putStoredTrack({
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          genre: track.genre,
          tags: track.tags,
          year: track.year,
          format: track.format,
          sampleRate: null,
          bitDepth: null,
          bitrate: null,
          channels: null,
          lossless: track.lossless,
          trackNo: track.trackNo,
          duration: track.durationSec,
          bytes: track.bytes,
          albumArtist: track.albumArtist,
          albumNote: track.albumNote,
          coverRemote: track.coverUrl || undefined,
          archiveId: track.archiveId,
          previewUrl: track.previewUrl,
          audio: new Blob([track.archiveId ?? track.id], { type: "text/plain" }),
          cover: null,
          addedAt: Date.now() + i,
        });
      });
    }
    if (autoplay && ids.length) get().playIds(ids);
    return incoming.length;
  },

  importAmazon: async (input, arl) => {
    const { tracks: remote, name } = await amImport({ data: { input, arl } });
    if (arl) saveAmSession({ arl, name: name || "Amazon" });
    return ingestAmazon(get, set, remote);
  },

  importAmazonArl: async (arl) => {
    const { tracks: remote, name } = await amArlLibrary({ data: { arl } });
    saveAmSession({ arl, name: name || "Amazon" });
    return ingestAmazon(get, set, remote);
  },

  importFoundAudio: async (hits) => {
    const have = new Set(get().tracks.map((t) => t.previewUrl || t.url).filter(Boolean));
    const incoming: Track[] = [];
    for (const hit of hits) {
      if (have.has(hit.url) || have.has(hit.id)) continue;
      have.add(hit.url);
      let cover = hit.cover;
      let year = hit.year;
      let album = hit.album;
      let artist = hit.artist;
      if (!cover || !album || !artist) {
        const found = await lookupAlbum(artist, album || hit.name, hit.name);
        if (found) {
          cover = cover || found.artwork;
          year = year || found.year;
          album = album || found.title;
          artist = artist || found.artist;
        }
      }
      const id = crypto.randomUUID();
      incoming.push({
        id,
        name: hit.name,
        artist: artist || "Unknown artist",
        album: album || hit.name,
        genre: "",
        tags: [hit.source, hit.format].filter(Boolean),
        year,
        url: hit.url,
        coverUrl: cover || null,
        format: hit.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: hit.lossless,
        liked: false,
        starred: false,
        trackNo: hit.trackNo || 1,
        diskNo: 1,
        durationSec: hit.duration || 0,
        albumArtist: artist,
        previewUrl: hit.url,
        addedAt: Date.now(),
      });
    }
    if (!incoming.length) return 0;
    set((s) => ({ tracks: [...s.tracks, ...incoming] }));
    incoming.forEach((track, i) => {
      void putStoredTrack({
        id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: track.format,
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: track.lossless,
        trackNo: track.trackNo,
        duration: track.durationSec,
        albumArtist: track.albumArtist,
        coverRemote: track.coverUrl || undefined,
        previewUrl: track.previewUrl,
        audio: new Blob([track.previewUrl || track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      });
    });
    return incoming.length;
  },

  findOnArchive: async (artist, album) => {
    const q = [artist && `creator:(${artist})`, album && `title:(${album})`].filter(Boolean).join(" AND ");
    const { hits } = await iaSearch({ data: { q } });
    const hit = hits[0];
    if (!hit) {
      get().flash("No Internet Archive match");
      return 0;
    }
    get().flash(`Found ${hit.title}`);
    return get().importArchive(hit.identifier, true, true);
  },

  archiveRadio: async (artist) => {
    const { hits } = await iaSearch({
      data: { q: artist ? `creator:(${artist})` : "", collection: "etree" },
    });
    if (hits.length === 0) {
      get().flash("No Archive concerts found");
      return 0;
    }
    const hit = hits[Math.floor(Math.random() * hits.length)]!;
    get().flash(`Concert · ${hit.title}`);
    return get().importArchive(hit.identifier, true, true);
  },

  warmTrack: (id) => {
    void prefetchPlayUrl(id);
  },

  shareIbroadcast: async (name, trackIds) => {
    const session = loadIbSession();
    if (!session) throw new Error("Sign in to iBroadcast first.");
    const ids = trackIds
      .map((id) => get().tracks.find((t) => t.id === id)?.ibroadcastId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) throw new Error("Share needs tracks that already live in iBroadcast.");
    const result = await ibSharePlaylist({ data: { session, name, trackIds: ids } });
    return result.url;
  },

  importIbPlaylist: (playlistId, playlists, ibTracks) => {
    const list = playlists.find((p) => p.id === playlistId);
    if (!list) throw new Error("That playlist is not in this iBroadcast library.");
    const byId = new Map(ibTracks.map((t) => [t.id, t]));
    const existing = new Set(get().tracks.map((t) => t.ibroadcastId).filter(Boolean));
    const toAdd = list.trackIds
      .map((id) => byId.get(id))
      .filter((t): t is IbTrack => {
        if (!t) return false;
        return !existing.has(t.id);
      });
    const play = [
      ...get()
        .tracks.filter((t) => t.ibroadcastId && list.trackIds.includes(t.ibroadcastId))
        .map((t) => t.id),
    ];
    for (const item of toAdd) {
      const id = crypto.randomUUID();
      play.push(id);
      const track: Track = {
        id,
        name: item.name,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        tags: ["iBroadcast", list.name],
        year: item.year,
        url: `ib:${item.id}`,
        coverUrl: item.artwork || null,
        format: "IB",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        liked: false,
        starred: false,
        ibroadcastId: item.id,
        ibFile: item.file,
        addedAt: Date.now(),
      };
      set((s) => ({ tracks: [...s.tracks, track] }));
      void putStoredTrack({
        id,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        tags: track.tags,
        year: track.year,
        format: "IB",
        sampleRate: null,
        bitDepth: null,
        bitrate: null,
        channels: null,
        lossless: false,
        ibroadcastId: item.id,
        ibFile: item.file,
        coverRemote: item.artwork || undefined,
        audio: new Blob([item.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now(),
      });
    }
    if (play.length) get().playIds(play);
  },

  addDemo: (track, audio) => {
    set((s) => {
      const tracks = [...s.tracks, track];
      const index = s.index === -1 ? tracks.length - 1 : s.index;
      return { tracks, index };
    });
    void putStoredTrack({
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
      liked: track.liked,
      starred: track.starred,
      audio,
      cover: null,
      addedAt: Date.now(),
    });
  },

  removeTrack: (id) => {
    const { tracks, index } = get();
    const i = tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const next = tracks.filter((t) => t.id !== id);
    if (!tracks[i].youtubeId) URL.revokeObjectURL(tracks[i].url);
    if (tracks[i].coverUrl && !tracks[i].youtubeId && !tracks[i].ibroadcastId) URL.revokeObjectURL(tracks[i].coverUrl);
    let nextIndex = index;
    if (next.length === 0) nextIndex = -1;
    else if (i < index) nextIndex = index - 1;
    else if (i === index) nextIndex = Math.min(index, next.length - 1);
    set({
      tracks: next,
      index: nextIndex,
      playing: next.length > 0 && get().playing,
      upNext: get().upNext.filter((x) => x !== id),
    });
    void deleteStoredTrack(id);
  },

  patchTrack: (id, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  updateMeta: (id, patch) => {
    const extra = patch.tags ? { genre: patch.tags.join(" / ") } : {};
    get().patchTrack(id, { ...patch, ...extra, metaEdited: true });
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    saveMeta(track);
  },

  updateAlbumTags: (trackIds, tags) => {
    get().updateAlbumMeta(trackIds, { tags });
  },

  updateAlbumMeta: (trackIds, patch) => {
    const ids = new Set(trackIds);
    const extra = patch.tags ? { genre: patch.tags.join(" / ") } : {};
    set((s) => ({
      tracks: s.tracks.map((t) => (ids.has(t.id) ? { ...t, ...patch, ...extra, metaEdited: true } : t)),
    }));
    for (const id of trackIds) {
      const track = get().tracks.find((t) => t.id === id);
      if (track) saveMeta(track);
    }
  },

  setAlbumRating: (trackIds, rating) => {
    const next = Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2;
    get().updateAlbumMeta(trackIds, { albumRating: next });
  },

  updateArtistMeta: (trackIds, patch) => {
    const ids = new Set(trackIds);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (!ids.has(t.id)) return t;
        const tags = patch.tags ?? t.artistTags ?? t.tags;
        return {
          ...t,
          artistGenre: patch.genre ?? t.artistGenre,
          artistTags: tags,
          genre: patch.genre || t.genre,
          tags: patch.tags ?? t.tags,
        };
      }),
    }));
    for (const id of trackIds) {
      const track = get().tracks.find((t) => t.id === id);
      if (track) saveMeta(track);
    }
  },

  setCover: (ids, file) => {
    void coverFromFile(file).then((blob) => {
      const idSet = new Set(ids);
      set((s) => ({
        tracks: s.tracks.map((t) => {
          if (!idSet.has(t.id)) return t;
          if (t.coverUrl) URL.revokeObjectURL(t.coverUrl);
          return { ...t, coverUrl: URL.createObjectURL(blob) };
        }),
      }));
      for (const id of ids) {
        const track = get().tracks.find((t) => t.id === id);
        if (track) saveMeta(track, blob);
      }
    });
  },

  setCoverUrl: async (ids, url) => {
    if (!url) return;
    const blob = await blobFromUrl(url);
    const idSet = new Set(ids);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (!idSet.has(t.id)) return t;
        if (t.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(t.coverUrl);
        return { ...t, coverUrl: blob ? URL.createObjectURL(blob) : url };
      }),
    }));
    for (const id of ids) {
      const track = get().tracks.find((t) => t.id === id);
      if (!track) continue;
      if (blob) saveMeta(track, blob);
      else {
        void updateStoredMeta(id, {
          name: track.name,
          artist: track.artist,
          album: track.album,
          genre: track.genre,
          tags: track.tags,
          year: track.year,
          liked: track.liked,
          starred: track.starred,
          albumRating: track.albumRating,
          coverRemote: url,
        });
      }
    }
  },

  lookupAlbumOnline: async (trackIds) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id));
    const first = tracks[0];
    if (!first) return false;
    const hit = await lookupAlbum(first.albumArtist || first.artist, first.album, first.name);
    if (!hit) return false;
    const patch: AlbumPatch = {
      album: hit.title,
      year: hit.year || first.year,
    };
    if (hit.artist) patch.albumArtist = hit.artist;
    if (hit.genre) {
      patch.genre = hit.genre;
      if (!first.tags.length) patch.tags = [hit.genre];
    }
    if (hit.description) patch.albumNote = hit.description;
    if (hit.explicit) patch.explicit = true;
    get().updateAlbumMeta(trackIds, patch);
    if (hit.artwork) await get().setCoverUrl(trackIds, hit.artwork);
    return true;
  },

  searchAlbumOnline: async (trackIds) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id));
    const first = tracks[0];
    if (!first) return [];
    return searchAlbums(first.albumArtist || first.artist, first.album, first.name);
  },

  applyAlbumHit: async (trackIds, hit) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id));
    const first = tracks[0];
    if (!first) return;
    const patch: AlbumPatch = {
      album: hit.title,
      year: hit.year || first.year,
    };
    if (hit.artist) patch.albumArtist = hit.artist;
    if (hit.genre) {
      patch.genre = hit.genre;
      if (!first.tags.length) patch.tags = [hit.genre];
    }
    if (hit.description) patch.albumNote = hit.description;
    if (hit.explicit) patch.explicit = true;
    get().updateAlbumMeta(trackIds, patch);
    if (hit.artwork) await get().setCoverUrl(trackIds, hit.artwork);
  },

  lookupVideos: async (trackIds) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id) && !t.mvId && !t.youtubeId);
    if (tracks.length === 0) return 0;
    const found = await findAlbumVideos(tracks);
    let n = 0;
    for (const [id, video] of Object.entries(found)) {
      n += 1;
      get().patchTrack(id, {
        mvId: video.youtubeId,
        mvUrl: video.url,
        mvThumb: video.thumb,
      });
      const next = get().tracks.find((t) => t.id === id);
      if (next) saveMeta(next);
    }
    return n;
  },

  lookupAlbumHits: async (trackIds) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id));
    const first = tracks[0];
    if (!first) return;
    const intel = await lookupAlbumIntel(first.albumArtist || first.artist, first.album, tracks.map((t) => t.name));
    for (const track of tracks) {
      const single = intel.singles.includes(track.name);
      const popular = intel.popular.includes(track.name);
      const chartRank = intel.ranks[track.name];
      if (!single && !popular && chartRank == null) continue;
      get().patchTrack(track.id, {
        single: single || Boolean(track.single),
        popular: popular || Boolean(track.popular),
        chartRank: chartRank || track.chartRank,
      });
      const next = get().tracks.find((t) => t.id === track.id);
      if (next) saveMeta(next);
    }
    const videoIds = get()
      .tracks.filter((t) => trackIds.includes(t.id) && (t.single || t.popular) && !t.mvId)
      .map((t) => t.id);
    if (videoIds.length) await get().lookupVideos(videoIds);
    else await get().lookupVideos(trackIds.slice(0, 4));
  },

  playIndex: (index, fromUser = true) => {
    if (fromUser) {
      unlockEngine();
      primePlayback();
    }
    localStorage.setItem("sondergram:index", String(index));
    const state = get();
    const prev = state.tracks[state.index];
    const id = state.tracks[index]?.id;
    const positions = { ...state.positions };
    const heard = outputAudio().currentTime;
    if (prev && heard > 5 && prev.id !== id) positions[prev.id] = heard;
    if (fromUser && id) delete positions[id];
    const recent = id ? [id, ...state.recent.filter((x) => x !== id)].slice(0, 24) : state.recent;
    const plays = { ...state.plays };
    if (id) plays[id] = (plays[id] ?? 0) + 1;
    const next = get().tracks[index];
    let upNext = id ? state.upNext.filter((x) => x !== id) : state.upNext;
    if (fromUser && next && !state.shuffle && !state.radio) {
      const album = state.tracks.filter((t) => albumKey(t) === albumKey(next)).sort(compareTracks);
      const pos = album.findIndex((t) => t.id === next.id);
      const rest = pos >= 0 ? album.slice(pos + 1).map((t) => t.id) : [];
      const outside = upNext.filter((x) => !album.some((t) => t.id === x));
      if (rest.length && outside.length === 0) upNext = rest;
    }
    set({
      index,
      playing: true,
      currentTime: 0,
      positions,
      recent,
      plays,
      loopA: null,
      loopB: null,
      radioRecent: fromUser ? [] : state.radioRecent,
      upNext,
    });
    saveSession({ ...sessionSlice({ ...state, positions, plays, recent }) });
    const yt = next?.youtubeId;
    if (yt) {
      pauseOutput();
      youtubePause();
      void youtubeLoad(yt, true);
      return;
    }
    youtubePause();
    const fail = () => {
      if (get().index === index) set({ playing: false });
    };
    const playNow = (url: string) => {
      void beginPlayback(url, 0).catch(fail);
    };
    if (next?.ibroadcastId && next.ibFile) {
      const session = loadIbSession();
      if (!session) {
        set({ playing: false });
        return;
      }
      playNow(streamUrl(session, next.ibFile, next.ibroadcastId));
      return;
    }
    if (next?.archiveId) {
      const stream = next.previewUrl?.startsWith("http") ? next.previewUrl : next.url.startsWith("http") ? next.url : "";
      const alreadyFlac = Boolean(next.lossless) || /\.flac(\?|$)/i.test(stream);
      if (alreadyFlac && stream) playNow(stream);
      void (async () => {
        try {
          const item = await iaItem({ data: { identifier: next.archiveId, lossless: true } });
          if (get().index !== index) return;
          const match =
            item.tracks.find((row) => row.name === next.name && row.trackNo === next.trackNo) ||
            item.tracks.find((row) => row.name === next.name) ||
            item.tracks[(next.trackNo || 1) - 1] ||
            item.tracks[0];
          if (!match?.url) {
            if (!alreadyFlac && stream) playNow(stream);
            else if (!stream) fail();
            return;
          }
          get().patchTrack(next.id, {
            previewUrl: match.url,
            url: match.url,
            format: match.format,
            lossless: match.lossless,
          });
          const updated = get().tracks.find((t) => t.id === next.id);
          if (updated) saveMeta(updated);
          if (!alreadyFlac || match.url !== stream) playNow(match.url);
        } catch {
          if (stream) playNow(stream);
          else fail();
        }
      })();
      return;
    }
    if (next?.previewUrl) {
      playNow(next.previewUrl);
      return;
    }
    const cached = next ? playUrls.get(next.id) : undefined;
    if (cached?.startsWith("blob:")) {
      playNow(cached);
      const upcoming = get().upNext[0];
      if (upcoming) void prefetchPlayUrl(upcoming);
      return;
    }
    if (next?.url.startsWith("blob:") || next?.url.startsWith("http")) {
      playNow(next.url);
    }
    void (async () => {
      const track = get().tracks[index];
      if (!track || get().index !== index) return;
      if (track.deezerId && !track.previewUrl) {
        get().flash("Deezer has no preview for this track");
        set({ playing: false });
        return;
      }
      if (track.spotifyId && !track.previewUrl) {
        const preview = await itunesPreview(track.artist, track.name);
        if (get().index !== index) return;
        if (preview) {
          get().patchTrack(track.id, { previewUrl: preview, url: preview });
          playNow(preview);
          return;
        }
        get().flash("Spotify has no preview for this track on this device");
        set({ playing: false });
        return;
      }
      let url = playUrls.get(track.id);
      if (!url || !url.startsWith("blob:")) {
        const blob = await getAudioBlob(track.id);
        if (get().index !== index) return;
        if (!blob || blob.size === 0) {
          if (track.url.startsWith("blob:") || track.url.startsWith("http")) return;
          set({ playing: false });
          return;
        }
        url = URL.createObjectURL(typedAudioBlob(blob, track.format));
        const old = playUrls.get(track.id);
        if (old && old !== url) URL.revokeObjectURL(old);
        playUrls.set(track.id, url);
        get().patchTrack(track.id, { url });
        trimPlayUrls([track.id, get().upNext[0], get().tracks[get().index]?.id ?? ""]);
      }
      if (!url) return;
      playNow(url);
      const upcoming = get().upNext[0];
      if (upcoming) void prefetchPlayUrl(upcoming);
    })();
  },
  playIds: (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const tracks = get().tracks;
    const first = unique[0];
    const index = tracks.findIndex((t) => t.id === first);
    if (index < 0) return;
    set({ upNext: unique.slice(1), radio: false });
    get().playIndex(index, true);
  },
  queueNext: (id) => {
    const current = get().tracks[get().index]?.id;
    if (!id || id === current) return;
    set({ upNext: [id, ...get().upNext.filter((x) => x !== id)] });
    const name = get().tracks.find((t) => t.id === id)?.name;
    get().flash(name ? `${name} plays next` : "Plays next");
  },
  queueNextMany: (ids) => {
    const current = get().tracks[get().index]?.id;
    const clean = ids.filter((id) => id && id !== current);
    if (clean.length === 0) return;
    const rest = get().upNext.filter((id) => !clean.includes(id));
    set({ upNext: [...clean, ...rest] });
    get().flash(clean.length === 1 ? "Plays next" : `${clean.length} tracks play next`);
  },
  queueLast: (id) => {
    const current = get().tracks[get().index]?.id;
    if (!id || id === current) return;
    set({ upNext: [...get().upNext.filter((x) => x !== id), id] });
    const name = get().tracks.find((t) => t.id === id)?.name;
    get().flash(name ? `${name} added to queue` : "Added to queue");
  },
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
    const rest = upNext
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is Track => Boolean(t))
      .filter((t) => albumKey(t) !== key);
    const later = tracks.filter((t) => albumKey(t) !== key && !rest.some((r) => r.id === t.id));
    const next = rest[0] || later[0];
    if (!next) {
      get().flash("No next album");
      return;
    }
    get().playIds([next.id, ...rest.filter((t) => t.id !== next.id).map((t) => t.id)]);
  },
  clearQueue: () => {
    set({ upNext: [] });
    get().flash("Queue cleared");
  },
  flash: (message) => {
    set({ notice: message });
    window.setTimeout(() => {
      if (get().notice === message) set({ notice: null });
    }, 2200);
  },
  setPlaying: (playing) => set({ playing }),
  setTimes: (currentTime, duration) => {
    const prev = get();
    if (Math.abs(prev.currentTime - currentTime) < 0.2 && Math.abs((prev.duration || 0) - duration) < 0.25) {
      return;
    }
    set({ currentTime, duration });
    const track = prev.tracks[prev.index];
    if (track && duration > 1 && !(track.durationSec && track.durationSec > 1)) {
      get().patchTrack(track.id, { durationSec: duration });
    }
  },
  setVolume: (volume) => {
    set({ volume, muted: volume === 0 ? true : false });
    saveSession(sessionSlice(get()));
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
    })),
  setEqBand: (index, value) => {
    set((s) => {
      const eq = s.eq.slice();
      eq[index] = value;
      return { eq, presetId: "custom" };
    });
    saveSession(sessionSlice(get()));
  },
  setPreamp: (value) => {
    set({ preamp: value, presetId: "custom" });
    saveSession(sessionSlice(get()));
  },
  applyPreset: (id, gains, preamp) => {
    set({ eq: gains.slice(), preamp, presetId: id });
    saveSession(sessionSlice(get()));
  },
  saveCustomPreset: (label) => {
    const name = label.trim().slice(0, 24) || "Custom";
    const state = get();
    const id = `custom-${Date.now().toString(36)}`;
    const next = [
      { id, label: name, gains: state.eq.slice(), preamp: state.preamp },
      ...state.customPresets.filter((item) => item.label.toLowerCase() !== name.toLowerCase()),
    ].slice(0, 12);
    set({ customPresets: next, presetId: id });
    saveSession(sessionSlice(get()));
  },
  deleteCustomPreset: (id) => {
    set((s) => ({
      customPresets: s.customPresets.filter((item) => item.id !== id),
      presetId: s.presetId === id ? "custom" : s.presetId,
    }));
    saveSession(sessionSlice(get()));
  },
  setRate: (rate) => set({ rate }),
  setPitch: (pitch) => set({ pitch }),
  setIsolate: (isolate) => {
    set({ isolate });
    saveSession(sessionSlice(get()));
  },
  setSpatial: (spatial) => {
    set({ spatial });
    saveSession(sessionSlice(get()));
  },
  setSpatialAmount: (spatialAmount) => {
    set({ spatialAmount });
    saveSession(sessionSlice(get()));
  },
  toggleRadio: () => set((s) => ({ radio: !s.radio })),
  toggleLike: (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const liked = !track.liked;
    get().patchTrack(id, { liked });
    const next = get().tracks.find((t) => t.id === id);
    if (next) saveMeta(next);
  },
  toggleStar: (id) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;
    const starred = !track.starred;
    get().patchTrack(id, { starred });
    const next = get().tracks.find((t) => t.id === id);
    if (next) saveMeta(next);
  },
  setReplayGain: (id, db) => {
    get().patchTrack(id, { replayGain: db });
    const next = get().tracks.find((t) => t.id === id);
    if (next) saveMeta(next);
  },
  setCrossfade: (seconds) => {
    localStorage.setItem("sondergram:crossfade", String(seconds));
    set({ crossfade: seconds });
  },
  setSleep: (minutes) => {
    set({ sleepUntil: minutes == null ? null : Date.now() + minutes * 60_000 });
  },
  surprise: () => {
    const { tracks } = get();
    if (tracks.length === 0) return;
    const liked = tracks.filter((t) => t.liked);
    const pool = liked.length > 0 ? liked : tracks;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const index = tracks.findIndex((t) => t.id === pick.id);
    if (index < 0) return;
    set({ shuffle: true, radio: true });
    get().playIndex(index, true);
  },
  rememberPosition: (id, time) => {
    const positions = { ...get().positions, [id]: time };
    set({ positions });
    saveSession({ ...sessionSlice({ ...get(), positions }) });
  },
  addListenMs: (ms) => {
    const day = todayKey();
    const listenMs = (get().listenDay === day ? get().listenMs : 0) + ms;
    const listenLog = { ...get().listenLog, [day]: listenMs };
    set({ listenMs, listenDay: day, listenLog });
    saveSession({ ...sessionSlice(get()), listenMs, listenDay: day, listenLog });
  },
  toggleFocus: () => {
    const focus = !get().focus;
    set({ focus });
    saveSession({ ...sessionSlice(get()), focus });
  },
  toggleQuiet: () => {
    const quiet = !get().quiet;
    set({ quiet });
    saveSession({ ...sessionSlice(get()), quiet });
  },
  setBalance: (balance) => {
    set({ balance });
    saveSession({ ...sessionSlice(get()), balance });
  },
  setViz: (viz) => {
    set({ viz });
    saveSession({ ...sessionSlice(get()), viz });
  },
  toggleNormalize: () => {
    const normalize = !get().normalize;
    set({ normalize });
    saveSession({ ...sessionSlice(get()), normalize });
  },
  toggleSkipSilence: () => {
    const skipSilence = !get().skipSilence;
    set({ skipSilence });
    saveSession({ ...sessionSlice(get()), skipSilence });
  },
  toggleBassLock: () => {
    const bassLock = !get().bassLock;
    set({ bassLock });
    saveSession({ ...sessionSlice(get()), bassLock });
  },
  toggleHaptic: () => {
    const haptic = !get().haptic;
    set({ haptic });
    saveSession({ ...sessionSlice(get()), haptic });
  },
  toggleShakeSkip: () => {
    const shakeSkip = !get().shakeSkip;
    set({ shakeSkip });
    saveSession({ ...sessionSlice(get()), shakeSkip });
  },
  toggleGapless: () => {
    const gapless = !get().gapless;
    set({ gapless });
    saveSession({ ...sessionSlice(get()), gapless });
  },
  toggleMono: () => {
    const mono = !get().mono;
    set({ mono });
    setMonoMode(mono);
    saveSession({ ...sessionSlice(get()), mono });
  },
  setRemaster: (remaster) => {
    const amt = get().remasterAmt;
    set({ remaster });
    applyRemaster(remaster, amt);
    saveSession({ ...sessionSlice(get()), remaster });
  },
  setRemasterAmt: (remasterAmt) => {
    const next = Math.max(0, Math.min(1, remasterAmt));
    set({ remasterAmt: next });
    applyRemaster(get().remaster, next);
    saveSession({ ...sessionSlice(get()), remasterAmt: next });
  },
  djMix: () => {
    const { tracks, plays } = get();
    if (tracks.length === 0) return;
    const scored = tracks
      .map((t) => ({
        t,
        s: (plays[t.id] ?? 0) * 2 + (t.liked ? 5 : 0) + (t.starred ? 6 : 0) + Math.random() * 2,
      }))
      .sort((a, b) => b.s - a.s)
      .slice(0, Math.min(24, tracks.length));
    const ids = scored.map((x) => x.t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    set({ shuffle: true, radio: true });
    get().playIds(ids);
  },
  markLoop: (point) => {
    const t = get().currentTime;
    if (point === "a") set({ loopA: t });
    else set({ loopB: t });
  },
  clearLoop: () => set({ loopA: null, loopB: null }),

  nextIndex: (fromUser = false) => {
    const { tracks, index, shuffle, repeat, radio, radioRecent, upNext } = get();
    if (tracks.length === 0) return null;
    if (upNext.length > 0) {
      const rest = upNext.slice();
      while (rest.length) {
        const id = rest.shift()!;
        const i = tracks.findIndex((t) => t.id === id);
        if (i >= 0 && i !== index) {
          set({ upNext: rest });
          return i;
        }
      }
      set({ upNext: [] });
    }
    if (!fromUser && repeat === "one") return index;

    const current = tracks[index];
    if (!fromUser && !shuffle && !radio && current) {
      const album = tracks.filter((t) => albumKey(t) === albumKey(current)).sort(compareTracks);
      const pos = album.findIndex((t) => t.id === current.id);
      if (pos >= 0 && pos < album.length - 1) {
        const i = tracks.findIndex((t) => t.id === album[pos + 1]!.id);
        if (i >= 0 && i !== index) return i;
      }
    }

    const atEnd = index >= tracks.length - 1;
    if (!fromUser && radio && (atEnd || radioRecent.length > 0)) {
      const pick = pickRadioIndex(tracks, index, radioRecent);
      if (pick !== null) {
        const currentId = tracks[index]?.id;
        const recent = currentId ? [...radioRecent, currentId].slice(-8) : radioRecent;
        set({ radioRecent: recent });
        return pick;
      }
    }

    if (shuffle) {
      if (tracks.length === 1) return index;
      const artist = tracks[index]?.artist;
      const others = tracks.map((_, i) => i).filter((i) => i !== index);
      const different = others.filter((i) => tracks[i].artist !== artist);
      const pool = different.length ? different : others;
      return pool[Math.floor(Math.random() * pool.length)] ?? index;
    }
    const next = index + 1;
    if (next >= tracks.length) return fromUser || repeat === "all" ? 0 : null;
    return next;
  },

  prevIndex: () => {
    const { tracks, index, shuffle } = get();
    if (tracks.length === 0) return null;
    if (shuffle) {
      if (tracks.length === 1) return index;
      let prev = index;
      while (prev === index) prev = Math.floor(Math.random() * tracks.length);
      return prev;
    }
    return index <= 0 ? tracks.length - 1 : index - 1;
  },
}));
