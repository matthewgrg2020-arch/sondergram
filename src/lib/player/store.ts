import { create } from "zustand";
import { pickRadioIndex, radioScore } from "./catalog";
import { coverFromFile } from "./cover";
import { FLAT_EQ, type EqGains } from "./constants";
import { beginPlayback, outputAudio, pauseOutput, primePlayback, setMonoMode, setRemaster as applyRemaster, unlockEngine } from "./engine";
import { albumKey, compareTracks } from "./catalog";
import { isExplicitContent } from "./explicit";
import { copyAudioBlob, isAudioFile, typedAudioBlob } from "./format";
import { deleteStoredTrack, clearStoredLibrary, getAudioBlob, listStoredTracks, putStoredTrack, updateStoredMeta, type StoredTrack } from "./persist";
import { readFileTags, tagsFromFilename, trackNoFromName } from "./tags";
import type { IsolateMode, RemasterPreset, SpatialPreset } from "./engine";
import { loadSession, saveSession, todayKey, type CustomEqPreset, type VizMode } from "./session";
import { loadIbSession, streamUrl, type IbPlaylist, type IbTrack } from "./ibroadcast";
import { ibLibrary, ibSharePlaylist } from "./ibroadcast-api";
import { dzImport, dzArlImport } from "./deezer-api";
import { exportLibraryBackup, importLibraryBackup } from "./backup";
import { blobFromUrl, lookupAlbum, lookupTracklist, searchAlbums, type AlbumHit } from "./lookup";
import { findAlbumVideos } from "./videos";
import { lookupAlbumIntel } from "./charts";
import { iaItem, iaSearch } from "./archive-api";
import { bcImport, bcStream } from "./bandcamp-api";
import { loadPlaylists, savePlaylists, type UserPlaylist } from "./playlists";
import { amImport, amArlLibrary } from "./amazon-api";
import { saveAmSession } from "./amazon";
import type { FoundAudio } from "./find-audio";
import type { AmTrack } from "./amazon";
import type { IaTrack } from "./archive";
import { parseYoutubeId, youtubeLoad, youtubeMeta, youtubePause, youtubeStop, youtubeThumb } from "./youtube";
import { streamAlbum, resolveFullTrack } from "./stream-search-api";
import { isPreviewClip, isEngineCatalog, isYoutubePlayback, officialCatalogUrl, type StreamHit } from "./stream-search";
import { loadSpSession } from "./spotify";
import { slskEnqueue, slskStatus } from "./soulseek-api";
import { loadSlskSession, parseSlskTrackId, polishTrackFromFilename, slskStreamUrl, slskTrackId, sortSlskFiles, type SlskFile } from "./soulseek";

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

function saveMeta(track: Track, cover?: Blob | null) {
  cacheTrackMeta(track);
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
    soulseekId: track.soulseekId,
    replayGain: track.replayGain,
    format: track.format,
    lossless: track.lossless,
    archiveId: track.archiveId,
    bandcampId: track.bandcampId,
    bandcampUrl: track.bandcampUrl,
    qobuzId: track.qobuzId,
    appleId: track.appleId,
    previewUrl: track.previewUrl,
    youtubeId: track.youtubeId,
    coverRemote: track.coverUrl && !track.coverUrl.startsWith("blob:") ? track.coverUrl : undefined,
    ...(cover !== undefined ? { cover } : {}),
  });
}

const META_CACHE = "sondergram:meta";

let catalogUpgradeId = "";
let queueConsumed = false;

export function catalogHold(track?: { id?: string } | null) {
  return Boolean(track?.id && catalogUpgradeId === track.id);
}

type CachedMeta = Partial<
  Pick<
    Track,
    | "name"
    | "artist"
    | "album"
    | "genre"
    | "tags"
    | "year"
    | "albumArtist"
    | "albumNote"
    | "metaEdited"
    | "previewUrl"
    | "format"
    | "lossless"
    | "coverUrl"
  >
>;

function readMetaCache(): Record<string, CachedMeta> {
  try {
    const raw = localStorage.getItem(META_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cacheTrackMeta(track: Track) {
  try {
    const all = readMetaCache();
    all[track.id] = {
      name: track.name,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      tags: track.tags,
      year: track.year,
      albumArtist: track.albumArtist,
      albumNote: track.albumNote,
      metaEdited: track.metaEdited,
      previewUrl: track.previewUrl,
      format: track.format,
      lossless: track.lossless,
      coverUrl: track.coverUrl && !track.coverUrl.startsWith("blob:") ? track.coverUrl : undefined,
    };
    localStorage.setItem(META_CACHE, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

function applyMetaCache(tracks: Track[]) {
  const all = readMetaCache();
  return tracks.map((track) => {
    const cached = all[track.id];
    if (!cached) return track;
    return {
      ...track,
      ...cached,
      tags: cached.tags ?? track.tags,
      coverUrl: cached.coverUrl || track.coverUrl,
    };
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

async function deezerOfficialPreview(id: string) {
  try {
    const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(id)}`);
    if (!res.ok) return "";
    const data = (await res.json()) as { preview?: string };
    return data.preview || "";
  } catch {
    return "";
  }
}

function liveBandcampUrl(src?: string) {
  if (!src || !/^https?:/i.test(src)) return "";
  if (/bandcamp\.com\/(?:album|track|music)/i.test(src)) return "";
  if (!/bcbits\.com/i.test(src)) return "";
  try {
    const ts = Number(new URL(src).searchParams.get("ts"));
    if (Number.isFinite(ts) && ts > 0 && ts * 1000 < Date.now() + 20_000) return "";
  } catch {
    /* keep */
  }
  return src;
}

async function relatedStreamHits(track: { name: string; artist: string; deezerId?: string }): Promise<StreamHit[]> {
  try {
    let id = track.deezerId || "";
    if (!id) {
      const res = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${track.artist}" ${track.name}`)}&limit=5`,
      );
      const data = (await res.json()) as { data?: { id?: number }[] };
      id = String(data.data?.[0]?.id || "");
    }
    if (!id) return [];
    const infoRes = await fetch(`https://api.deezer.com/track/${encodeURIComponent(id)}`);
    const info = (await infoRes.json()) as {
      artist?: { id?: number; name?: string };
      album?: { cover_xl?: string; cover_medium?: string; title?: string };
    };
    const artistId = info.artist?.id;
    const cover = info.album?.cover_xl || info.album?.cover_medium || "";
    const rows: Record<string, unknown>[] = [];
    if (artistId) {
      const top = await fetch(`https://api.deezer.com/artist/${artistId}/top?limit=25`);
      const td = (await top.json()) as { data?: Record<string, unknown>[] };
      if (Array.isArray(td.data)) rows.push(...td.data);
    }
    const search = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${track.artist}"`)}&limit=20`);
    const sd = (await search.json()) as { data?: Record<string, unknown>[] };
    if (Array.isArray(sd.data)) rows.push(...sd.data);
    const seen = new Set<string>([id]);
    const hits: StreamHit[] = [];
    for (const item of rows) {
      const tid = String(item.id || "");
      const name = String(item.title || "");
      if (!tid || !name || seen.has(tid)) continue;
      seen.add(tid);
      const album = item.album && typeof item.album === "object" ? (item.album as Record<string, unknown>) : {};
      const artist = item.artist && typeof item.artist === "object" ? (item.artist as Record<string, unknown>) : {};
      hits.push({
        key: `deezer:track:${tid}`,
        source: "Deezer",
        kind: "track",
        name,
        artist: String(artist.name || track.artist),
        album: String(album.title || ""),
        year: "",
        cover: String(album.cover_xl || album.cover_medium || cover),
        preview: String(item.preview || ""),
        duration: Number(item.duration) || 0,
        trackNo: Number(item.track_position) || 0,
        deezerId: tid,
      });
      if (hits.length >= 16) break;
    }
    return hits;
  } catch {
    return [];
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

function ingestStreamHits(
  get: () => PlayerState,
  set: (partial: Partial<PlayerState> | ((s: PlayerState) => Partial<PlayerState>)) => void,
  remote: StreamHit[],
) {
  const state = get();
  const have = new Set(
    state.tracks.flatMap((t) => [t.previewUrl, t.youtubeId, t.deezerId, t.spotifyId, t.amazonId, t.archiveId, t.bandcampId, t.qobuzId, t.appleId].filter(Boolean)),
  );
  const incoming: Track[] = [];
  const ids: string[] = [];
  for (const item of remote) {
    const key = item.youtubeId || item.deezerId || item.spotifyId || item.amazonId || item.archiveId || item.bandcampUrl || item.qobuzId || item.appleId || item.preview || item.key;
    if (have.has(key)) {
      const existing = state.tracks.find((t) => {
        if (item.youtubeId && t.youtubeId === item.youtubeId) return true;
        if (item.deezerId && t.deezerId === item.deezerId) return true;
        if (item.spotifyId && t.spotifyId === item.spotifyId) return true;
        if (item.amazonId && t.amazonId === item.amazonId) return true;
        if (item.qobuzId && t.qobuzId === item.qobuzId) return true;
        if (item.appleId && t.appleId === item.appleId) return true;
        if (item.preview && t.previewUrl === item.preview) return true;
        return false;
      });
      if (existing) ids.push(existing.id);
      continue;
    }
    have.add(key);
    const id = crypto.randomUUID();
    ids.push(id);
    incoming.push({
      id,
      name: item.name,
      artist: item.artist,
      album: item.album || item.name,
      genre: item.genre || "",
      tags: [item.source, "Streaming", item.genre].filter((tag): tag is string => Boolean(tag)),
      year: item.year,
      url: item.preview || (item.youtubeId ? `yt:${item.youtubeId}` : `${item.source}:${key}`),
      coverUrl: item.cover || (item.youtubeId ? youtubeThumb(item.youtubeId) : null),
      format: item.source === "YouTube" ? "YT" : item.source === "Audius" ? "AUD" : item.source.slice(0, 3).toUpperCase(),
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      channels: null,
      lossless: false,
      liked: false,
      starred: false,
      explicit: isExplicitContent({
        name: item.name,
        artist: item.artist,
        album: item.album || item.name,
        genre: item.genre,
        tags: [item.source, "Streaming", item.genre].filter((tag): tag is string => Boolean(tag)),
      }),
      trackNo: item.trackNo || undefined,
      diskNo: item.diskNo || 1,
      durationSec: item.duration || 0,
      youtubeId: item.youtubeId,
      deezerId: item.deezerId,
      spotifyId: item.spotifyId,
      amazonId: item.amazonId,
      archiveId: item.archiveId,
      bandcampId: item.bandcampUrl,
      qobuzId: item.qobuzId,
      appleId: item.appleId || (item.source === "Apple Music" ? item.collectionId : undefined),
      previewUrl: item.preview || undefined,
      albumArtist: item.artist,
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
        lossless: false,
        trackNo: track.trackNo,
        duration: track.durationSec,
        albumArtist: track.albumArtist,
        coverRemote: track.coverUrl || undefined,
        youtubeId: track.youtubeId,
        deezerId: track.deezerId,
        spotifyId: track.spotifyId,
        amazonId: track.amazonId,
        archiveId: track.archiveId,
        bandcampId: track.bandcampId,
        qobuzId: track.qobuzId,
        appleId: track.appleId,
        previewUrl: track.previewUrl,
        audio: new Blob([track.youtubeId || track.deezerId || track.spotifyId || track.amazonId || track.appleId || track.id], { type: "text/plain" }),
        cover: null,
        addedAt: Date.now() + i,
      }).catch(() => undefined);
    });
  }
  return { incoming, ids: [...ids] };
}

async function prefetchPlayUrl(id: string) {
  if (!id || playUrls.has(id)) return;
  const track = usePlayer.getState().tracks.find((t) => t.id === id);
  if (!track || track.youtubeId || track.previewUrl || track.ibroadcastId || track.deezerId || track.archiveId || track.bandcampId || track.soulseekId) return;
  const blob = await getAudioBlob(id);
  if (!blob || blob.size === 0) return;
  if (playUrls.has(id)) return;
  const url = URL.createObjectURL(typedAudioBlob(blob, track.format));
  playUrls.set(id, url);
  trimPlayUrls([usePlayer.getState().tracks[usePlayer.getState().index]?.id ?? "", id, usePlayer.getState().upNext[0] ?? ""]);
}
type TrackPatch = Partial<Omit<Track, "id">>;
type AlbumPatch = Partial<Pick<Track, "album" | "year" | "tags" | "albumArtist" | "albumNote" | "explicit" | "genre" | "albumRating" | "artist">>;

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
  autoEq: boolean;
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
    autoEq: s.autoEq,
  };
}

function trackFromStored(row: StoredTrack): Track {
  const catalog = Boolean(
    row.deezerId ||
      row.spotifyId ||
      row.amazonId ||
      row.archiveId ||
      row.bandcampId ||
      row.soulseekId ||
      row.qobuzId ||
      row.appleId ||
      row.format === "APP" ||
      (row.tags || []).includes("Apple Music") ||
      /itunes\.apple|mzstatic|audio-ssl\.itunes/i.test(row.previewUrl || ""),
  );
  const leftoverYt = catalog && /^[a-zA-Z0-9_-]{11}$/.test(row.youtubeId || "") ? row.youtubeId : undefined;
  const yt = catalog ? undefined : row.youtubeId;
  const preview =
    row.previewUrl && (catalog && /googlevideo\.com|youtube\.com/i.test(row.previewUrl) ? "" : row.previewUrl);
  const raw: Track = {
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
        : preview
          ? preview
          : row.archiveId
            ? `ia:${row.archiveId}`
          : row.spotifyId
            ? `sp:${row.spotifyId}`
            : row.amazonId
              ? `am:${row.amazonId}`
              : row.soulseekId
                ? `slsk:${row.soulseekId}`
              : row.deezerId
              ? `dz:${row.deezerId}`
              : row.qobuzId
              ? `qb:${row.qobuzId}`
              : row.appleId
              ? `ap:${row.appleId}`
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
    bandcampId: row.bandcampId,
    bandcampUrl: row.bandcampUrl,
    qobuzId: row.qobuzId,
    appleId: row.appleId,
    amazonId: row.amazonId,
    soulseekId: row.soulseekId,
    previewUrl: preview || undefined,
    addedAt: row.addedAt,
    trackNo: row.trackNo || trackNoFromName(row.name),
    diskNo: row.diskNo || 1,
    durationSec: row.duration || 0,
    bytes: row.bytes || (row.audio instanceof Blob ? row.audio.size : 0),
    albumArtist: row.albumArtist || "",
    explicit: Boolean(row.explicit) || isExplicitContent({
      explicit: Boolean(row.explicit),
      name: row.name,
      artist: row.artist,
      album: row.album,
      albumArtist: row.albumArtist,
      genre: row.genre,
      tags: row.tags,
    }),
    albumNote: row.albumNote || "",
    mvId: row.mvId || leftoverYt,
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
  return polishTrackFromFilename(raw);
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
  stopAfter: StopAfter;
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
  autoEq: boolean;
  playlists: UserPlaylist[];
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
  importBandcamp: (url: string, autoplay?: boolean) => Promise<number>;
  importAmazon: (input: string, arl?: string) => Promise<number>;
  importAmazonArl: (arl: string) => Promise<number>;
  importSoulseek: (files: SlskFile[], autoplay?: boolean) => Promise<number>;
  importStreamHits: (hits: StreamHit[], autoplay?: boolean) => Promise<number>;
  importFoundAudio: (hits: FoundAudio[]) => Promise<number>;
  findOnArchive: (artist: string, album: string) => Promise<number>;
  archiveRadio: (artist?: string) => Promise<number>;
  warmTrack: (id: string) => void;
  shareIbroadcast: (name: string, trackIds: string[]) => Promise<string>;
  importIbPlaylist: (playlistId: string, playlists: IbPlaylist[], ibTracks: IbTrack[]) => void;
  addDemo: (track: Track, audio: Blob) => void;
  removeTrack: (id: string) => void;
  removeTracks: (ids: string[]) => void;
  clearLibrary: () => Promise<void>;
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
  setCoverUrl: (ids: string[], url: string) => Promise<boolean>;
  lookupAlbumOnline: (trackIds: string[]) => Promise<boolean>;
  searchAlbumOnline: (trackIds: string[]) => Promise<AlbumHit[]>;
  applyAlbumHit: (trackIds: string[], hit: AlbumHit) => Promise<void>;
  matchTracklist: (trackIds: string[], quiet?: boolean) => Promise<number>;
  cleanTitles: (ids?: string[]) => number;
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
  stopAfter: "off",
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
  autoEq: false,
  playlists: [],
  notice: null,

  hydrate: async () => {
    if (typeof indexedDB === "undefined") {
      set({ ready: true });
      return;
    }
    try {
      const rows = await listStoredTracks();
      const tracks = applyMetaCache(rows.map(trackFromStored));
      for (const track of tracks) {
        const orig = rows.find((row) => row.id === track.id);
        if (orig && orig.soulseekId && (orig.name !== track.name || orig.artist !== track.artist || orig.album !== track.album)) {
          saveMeta(track);
        }
      }
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
        autoEq: Boolean(session.autoEq),
        playlists: loadPlaylists(),
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
          explicit: Boolean(tags?.explicit) || isExplicitContent({
            explicit: tags?.explicit,
            name: tags?.title ?? parsed.title,
            artist: tags?.artist ?? parsed.artist,
            album: tags?.album ?? parsed.album,
            albumArtist: tags?.albumArtist,
            genre: tags?.genre,
            tags: tags?.tags,
          }),
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
    get().flash(n ? `Packed ${n} songs — share or save the zip` : "Library is empty");
    return n;
  },

  importLibrary: async (file) => {
    const n = await importLibraryBackup(file);
    await get().hydrate();
    get().flash(n ? `Restored ${n} songs on this device` : "Those songs are already here");
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
          }).catch(() => undefined),
        ),
      );
      incoming.forEach((track) => cacheTrackMeta(track));
    }
    if (autoplay && ids.length) get().playIds(ids);
    return incoming.length;
  },

  importBandcamp: async (url, autoplay = true) => {
    const album = await bcImport({ data: { url } });
    const have = new Set(
      get()
        .tracks.map((t) => t.bandcampId || t.previewUrl)
        .filter(Boolean),
    );
    const incoming: Track[] = [];
    const ids: string[] = [];
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
        genre: row.genre,
        tags: row.tags,
        year: row.year,
        url: row.page || row.url,
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
            audio: new Blob([track.bandcampId ?? track.id], { type: "text/plain" }),
            cover: null,
            addedAt: Date.now() + i,
          }).catch(() => undefined),
        ),
      );
      incoming.forEach((track) => cacheTrackMeta(track));
    }
    const playable = incoming.map((t) => t.id);
    if (autoplay && (playable.length || ids.length)) get().playIds(playable.length ? playable : ids);
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

  importSoulseek: async (files, autoplay = true) => {
    const session = loadSlskSession();
    if (!session) throw new Error("Sign in to Soulseek first.");
    const have = new Set(get().tracks.map((t) => t.soulseekId).filter(Boolean));
    const incoming: Track[] = [];
    const ids: string[] = [];
    const ordered = sortSlskFiles(files);
    for (const file of ordered) {
      const sid = slskTrackId(file.username, file.filename);
      if (have.has(sid)) {
        const existing = get().tracks.find((t) => t.soulseekId === sid);
        if (existing) ids.push(existing.id);
        continue;
      }
      have.add(sid);
      const id = crypto.randomUUID();
      ids.push(id);
      incoming.push({
        id,
        name: file.name,
        artist: file.artist,
        album: file.album || file.artist,
        genre: "",
        tags: ["Soulseek", file.ext].filter(Boolean),
        year: file.year || "",
        url: `slsk:${sid}`,
        coverUrl: null,
        format: file.ext || "SLK",
        sampleRate: null,
        bitDepth: null,
        bitrate: file.bitRate || null,
        channels: 2,
        lossless: file.lossless,
        liked: false,
        starred: false,
        trackNo: file.trackNo || undefined,
        diskNo: 1,
        durationSec: file.length || 0,
        bytes: file.size,
        soulseekId: sid,
        albumArtist: file.artist,
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
          bitrate: track.bitrate,
          channels: 2,
          lossless: track.lossless,
          trackNo: track.trackNo,
          duration: track.durationSec,
          bytes: track.bytes,
          albumArtist: track.albumArtist,
          soulseekId: track.soulseekId,
          audio: new Blob(),
          cover: null,
          addedAt: Date.now() + i,
        }).catch(() => undefined);
      });
    }
    const playable = ids.length
      ? ids
          .map((id) => get().tracks.find((t) => t.id === id))
          .filter((t): t is Track => Boolean(t))
          .sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0) || a.name.localeCompare(b.name))
          .map((t) => t.id)
      : [];
    if (autoplay && playable.length) get().playIds(playable);
    if (incoming.length) {
      get().flash(incoming.length === 1 ? "Added from Soulseek" : `Added ${incoming.length} tracks from Soulseek`);
      const metaIds = incoming.map((t) => t.id);
      void (async () => {
        const first = incoming[0];
        if (!first) return;
        let hit = await lookupAlbum(first.albumArtist || first.artist, first.album, first.name);
        if (!hit && first.artist && first.album && first.artist.toLowerCase() !== first.album.toLowerCase()) {
          hit = await lookupAlbum(first.album, first.artist, first.name);
        }
        if (hit) {
          await get().applyAlbumHit(metaIds, hit);
          await get().matchTracklist(metaIds, true);
        } else {
          await get().matchTracklist(metaIds, true);
        }
      })().catch(() => undefined);
    }
    return incoming.length;
  },

  importStreamHits: async (hits, autoplay = true) => {
    const rows: StreamHit[] = [];
    for (const item of hits) {
      if (item.kind === "album") {
        if (item.source === "Bandcamp" && (item.bandcampUrl || item.page)) {
          const n = await get().importBandcamp(item.bandcampUrl || item.page || "", autoplay);
          if (n) rows.push(item);
          continue;
        }
        if (item.source === "Archive" && item.archiveId) {
          const n = await get().importArchive(item.archiveId, true, autoplay);
          if (n) rows.push(item);
          continue;
        }
        if (item.source === "Amazon" && (item.page || item.amazonId || item.name)) {
          const n = await get().importAmazon(item.page || item.amazonId || `${item.artist} ${item.album || item.name}`);
          if (n) rows.push(item);
          continue;
        }
        const token = loadSpSession()?.token;
        const expanded = await streamAlbum({ data: { ...item, token } });
        rows.push(...(expanded.tracks || []));
        continue;
      }
      rows.push(item);
    }
    const { incoming, ids } = ingestStreamHits(get, set, rows.filter((row) => row.kind === "track"));
    const clips = incoming.filter((track) =>
      isPreviewClip(track.previewUrl || track.url, track.durationSec, {
        youtubeId: track.youtubeId,
        archiveId: track.archiveId,
        bandcampId: track.bandcampId,
      }),
    );
    const upgrade = async (track: Track) => {
      if (isEngineCatalog(track)) return;
      const full = await resolveFullTrack({
        data: { artist: track.artist, name: track.name, album: track.album, duration: track.durationSec },
      });
      if (!full.url && !full.youtubeId) return;
      const patch: TrackPatch = {};
      if (full.youtubeId) patch.mvId = full.youtubeId;
      if (full.url && !isPreviewClip(full.url) && !/googlevideo\.com|youtube\.com/i.test(full.url)) {
        patch.previewUrl = full.url;
        patch.url = full.url;
      }
      if (!Object.keys(patch).length) return;
      get().patchTrack(track.id, patch);
      const next = get().tracks.find((t) => t.id === track.id);
      if (next) saveMeta(next);
    };
    if (clips[0]) await upgrade(clips[0]).catch(() => undefined);
    void Promise.all(clips.slice(1).map((track) => upgrade(track).catch(() => undefined)));
    const playable = incoming
      .map((t) => get().tracks.find((x) => x.id === t.id) || t)
      .filter((t) => t.previewUrl || t.youtubeId)
      .map((t) => t.id);
    if (autoplay && (playable.length || ids.length)) get().playIds(playable.length ? playable : ids);
    if (incoming.length) get().flash(`Added ${incoming.length} from ${hits[0]?.source || "streaming"}`);
    return incoming.length || rows.length;
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
    get().removeTracks([id]);
  },

  removeTracks: (ids) => {
    const gone = new Set(ids.filter(Boolean));
    if (!gone.size) return;
    const { tracks, index } = get();
    const current = tracks[index];
    const removingCurrent = Boolean(current && gone.has(current.id));
    const doomed = tracks.filter((t) => gone.has(t.id));
    if (!doomed.length) return;
    const next = tracks.filter((t) => !gone.has(t.id));
    for (const track of doomed) {
      if (track.url?.startsWith("blob:")) URL.revokeObjectURL(track.url);
      if (track.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(track.coverUrl);
    }
    let nextIndex = index;
    if (next.length === 0) nextIndex = -1;
    else if (removingCurrent) nextIndex = Math.min(index, next.length - 1);
    else nextIndex = current ? next.findIndex((t) => t.id === current.id) : -1;
    if (removingCurrent) {
      pauseOutput();
      youtubeStop();
    }
    const playlists = get().playlists.map((row) => ({
      ...row,
      trackIds: row.trackIds.filter((id) => !gone.has(id)),
    }));
    savePlaylists(playlists);
    set({
      tracks: next,
      index: nextIndex,
      playing: next.length > 0 && !removingCurrent && get().playing,
      upNext: get().upNext.filter((id) => !gone.has(id)),
      recent: get().recent.filter((id) => !gone.has(id)),
      playlists,
    });
    for (const track of doomed) void deleteStoredTrack(track.id);
    if (doomed.length > 1) get().flash(`Removed album · ${doomed.length} tracks`);
  },

  clearLibrary: async () => {
    const { tracks } = get();
    pauseOutput();
    youtubeStop();
    for (const track of tracks) {
      if (track.url?.startsWith("blob:")) URL.revokeObjectURL(track.url);
      if (track.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(track.coverUrl);
    }
    savePlaylists([]);
    set({
      tracks: [],
      index: -1,
      playing: false,
      currentTime: 0,
      duration: 0,
      upNext: [],
      recent: [],
      plays: {},
      positions: {},
      playlists: [],
    });
    try {
      localStorage.removeItem("sondergram:index");
    } catch {
      /* private */
    }
    saveSession({ ...sessionSlice({ ...get(), recent: [], plays: {}, positions: {} }) });
    await clearStoredLibrary();
    get().flash("Removed all music");
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
    if (!url) return false;
    const blob = await blobFromUrl(url);
    if (!blob) {
      get().flash("Couldn’t save that cover. Try another image.");
      return false;
    }
    const idSet = new Set(ids);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (!idSet.has(t.id)) return t;
        if (t.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(t.coverUrl);
        return { ...t, coverUrl: URL.createObjectURL(blob) };
      }),
    }));
    for (const id of ids) {
      const track = get().tracks.find((t) => t.id === id);
      if (track) saveMeta(track, blob);
    }
    get().flash("Cover saved");
    return true;
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
    const work = searchAlbums(first.albumArtist || first.artist, first.album, first.name);
    const timed = new Promise<AlbumHit[]>((resolve) => {
      window.setTimeout(() => resolve([]), 12000);
    });
    return Promise.race([work, timed]);
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

  matchTracklist: async (trackIds, quiet = false) => {
    const tracks = get().tracks.filter((t) => trackIds.includes(t.id));
    const first = tracks[0];
    if (!first) return 0;
    const list = await lookupTracklist(first.albumArtist || first.artist, first.album);
    if (!list.length) {
      if (!quiet) get().flash("No official tracklist found");
      return 0;
    }
    let n = 0;
    const ordered = [...tracks].sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0) || a.name.localeCompare(b.name));
    for (const track of ordered) {
      const byNo = track.trackNo ? list.filter((song) => song.trackNo === track.trackNo) : [];
      const lower = track.name.toLowerCase();
      const byName = list.find((song) => {
        const title = song.title.toLowerCase();
        return lower === title || lower.includes(title) || title.includes(lower);
      });
      const song = byNo.length === 1 ? byNo[0] : byNo.find((row) => lower.includes(row.title.toLowerCase())) || byName;
      if (!song) continue;
      if (song.title === track.name && (track.trackNo || 0) === (song.trackNo || 0)) continue;
      get().patchTrack(track.id, {
        name: song.title,
        artist: song.artist || track.artist,
        album: song.album || track.album,
        trackNo: song.trackNo || track.trackNo,
        albumArtist: song.artist || track.albumArtist,
      });
      const next = get().tracks.find((t) => t.id === track.id);
      if (next) saveMeta(next);
      n += 1;
    }
    if (!quiet) get().flash(n ? `Matched ${n} titles` : "Titles already match the album");
    return n;
  },

  cleanTitles: (ids) => {
    const wanted = ids?.length ? new Set(ids) : null;
    let n = 0;
    for (const track of get().tracks) {
      if (wanted && !wanted.has(track.id)) continue;
      const next = polishTrackFromFilename(track);
      if (next.name === track.name && next.trackNo === track.trackNo && next.album === track.album) continue;
      get().patchTrack(track.id, {
        name: next.name,
        artist: next.artist,
        album: next.album,
        albumArtist: next.albumArtist || track.albumArtist,
        trackNo: next.trackNo,
      });
      const saved = get().tracks.find((t) => t.id === track.id);
      if (saved) saveMeta(saved);
      n += 1;
    }
    get().flash(n ? `Cleaned ${n} titles` : "Titles already look like song names");
    return n;
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
    youtubeStop();
    pauseOutput();
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
    if (prev && heard > 2 && prev.id !== id) positions[prev.id] = heard;
    if (fromUser && id && state.index !== index) delete positions[id];
    const recent = id ? [id, ...state.recent.filter((x) => x !== id)].slice(0, 24) : state.recent;
    const plays = { ...state.plays };
    if (id) plays[id] = (plays[id] ?? 0) + 1;
    const next = get().tracks[index];
    const consumed = queueConsumed;
    queueConsumed = false;
    const wasQueued = Boolean(id && state.upNext.includes(id));
    let upNext = id ? state.upNext.filter((x) => x !== id) : state.upNext;
    if (fromUser && next && !state.shuffle && !state.radio && !consumed && !wasQueued) {
      const album = state.tracks.filter((t) => albumKey(t) === albumKey(next)).sort(compareTracks);
      const pos = album.findIndex((t) => t.id === next.id);
      const rest = pos >= 0 ? album.slice(pos + 1).map((t) => t.id) : [];
      const head = upNext.map((qid) => state.tracks.find((t) => t.id === qid)).find((t): t is Track => Boolean(t));
      const leftoverOther = Boolean(head && albumKey(head) !== albumKey(next));
      if (upNext.length === 0 || leftoverOther) upNext = rest;
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
    unlockEngine();
    if (next?.forceYoutube) get().patchTrack(next.id, { forceYoutube: false });
    const yt = isYoutubePlayback(get().tracks[index] || next);
    if (yt && next?.youtubeId && !isEngineCatalog(next) && !next.bandcampId) {
      void youtubeLoad(next.youtubeId, true);
      return;
    }
    const fail = () => {
      if (get().index === index) get().setPlaying(false);
    };
    const startAt = (() => {
      if (!next) return 0;
      const saved = get().positions[next.id] || 0;
      const cap = next.durationSec || 0;
      if (saved <= 3) return 0;
      if (cap > 20 && saved > cap - 5) return 0;
      return saved;
    })();
    const playNow = (url: string) => {
      if (!get().playing || get().index !== index) return;
      if (!url || url.startsWith("yt:") || url.startsWith("dz:") || url.startsWith("sp:") || url.startsWith("am:") || url.startsWith("ap:") || url.startsWith("qb:")) return;
      void beginPlayback(url, startAt).catch(fail);
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
    if (next?.soulseekId) {
      pauseOutput();
      void (async () => {
        try {
          const session = loadSlskSession();
          if (!session) {
            get().flash("Sign in on the Soulseek page first.");
            fail();
            return;
          }
          const { username, filename } = parseSlskTrackId(next.soulseekId!);
          get().flash("Fetching that file from Soulseek…");
          const stream = slskStreamUrl(session, username, filename, "", next.bytes);
          if (!session.base) {
            get().patchTrack(next.id, { previewUrl: stream, url: stream });
            playNow(stream);
            return;
          }
          await slskEnqueue({
            data: {
              base: session.base,
              key: session.key,
              token: session.token,
              account: session.name,
              username,
              filename,
              size: next.bytes,
            },
          });
          const start = Date.now();
          let local = "";
          let ready = false;
          while (Date.now() - start < 180_000) {
            if (get().index !== index || !get().playing) return;
            const status = await slskStatus({
              data: {
                base: session.base,
                key: session.key,
                token: session.token,
                account: session.name,
                username,
                filename,
              },
            });
            if (status.error) throw new Error(status.error);
            if (status.done) {
              local = status.local;
              ready = true;
              break;
            }
            if (/queue/i.test(status.state)) get().flash("Waiting in the Soulseek queue…");
            else if (status.percent > 0) get().flash(`Soulseek ${Math.round(status.percent)}%`);
            else if (/connect|request|download/i.test(status.state)) get().flash("Connecting to the other user…");
            await new Promise((r) => setTimeout(r, 800));
          }
          if (get().index !== index || !get().playing) return;
          if (!ready) throw new Error("That file did not arrive in time. Try another result.");
          const url = slskStreamUrl(session, username, filename, local, next.bytes);
          get().patchTrack(next.id, { previewUrl: url, url });
          const updated = get().tracks.find((t) => t.id === next.id);
          if (updated) saveMeta(updated);
          if (get().index !== index || !get().playing) return;
          playNow(url);
        } catch (err) {
          if (get().index !== index) return;
          get().flash(err instanceof Error ? err.message : "Soulseek transfer failed.");
          fail();
        }
      })();
      return;
    }
    if (next?.bandcampId) {
      youtubePause();
      catalogUpgradeId = next.id;
      get().flash("Loading Bandcamp…");
      void (async () => {
        try {
          const fresh = await bcStream({
            data: {
              url: next.bandcampUrl || next.url,
              id: next.bandcampId,
              name: next.name,
              artist: next.artist,
              album: next.album,
            },
          });
          if (get().index !== index) return;
          if (!fresh.url) {
            fail();
            return;
          }
          get().patchTrack(next.id, {
            previewUrl: fresh.url,
            bandcampUrl: fresh.page || next.bandcampUrl,
            durationSec: fresh.duration || next.durationSec,
          });
          if (!get().playing) set({ playing: true });
          const page = fresh.page || next.bandcampUrl || "";
          const proxied = `/api/stream?u=${encodeURIComponent(fresh.url)}${page ? `&ref=${encodeURIComponent(page)}` : ""}`;
          playNow(proxied);
        } catch (err) {
          if (get().index !== index) return;
          get().flash(err instanceof Error ? err.message : "Bandcamp stream failed.");
          fail();
        } finally {
          if (catalogUpgradeId === next.id) catalogUpgradeId = "";
        }
      })();
      return;
    }
    if (next?.deezerId || next?.spotifyId || next?.amazonId || next?.qobuzId || isEngineCatalog(next)) {
      catalogUpgradeId = next.id;
      get().flash("Loading the full track…");
      const knownYt = /^[a-zA-Z0-9_-]{11}$/.test(next.mvId || "") ? next.mvId! : /^[a-zA-Z0-9_-]{11}$/.test(next.youtubeId || "") ? next.youtubeId! : "";
      const official = officialCatalogUrl(next);
      if (official) playNow(official);
      else {
        get().flash("Loading the full track…");
        void (async () => {
          try {
            let url = "";
            if (next.deezerId) url = await deezerOfficialPreview(next.deezerId);
            if (!url) url = await itunesPreview(next.artist, next.name);
            if (get().index !== index || !get().playing) return;
            if (catalogUpgradeId !== next.id) return;
            if (url) {
              get().patchTrack(next.id, { previewUrl: url, url });
              playNow(url);
            } else if (!knownYt) fail();
          } catch {
            if (get().index === index && get().playing && !knownYt) fail();
          }
        })();
      }
      void (async () => {
        try {
          const full = await resolveFullTrack({
            data: {
              artist: next.artist,
              name: next.name,
              album: next.album,
              duration: next.durationSec,
              youtubeId: knownYt,
            },
          });
          if (get().index !== index || !get().playing) return;
          if (full.youtubeId) {
            get().patchTrack(next.id, { mvId: full.youtubeId });
            const saved = get().tracks.find((t) => t.id === next.id);
            if (saved) saveMeta(saved);
          }
          const engineUrl = full.url && !isPreviewClip(full.url) ? full.url : "";
          const expected = next.durationSec || 0;
          const durationOk =
            !(expected >= 40 && full.duration >= 30) ||
            Math.abs(full.duration - expected) <= Math.max(22, expected * 0.22);
          if (engineUrl && durationOk) {
            youtubePause();
            get().patchTrack(next.id, { forceYoutube: false, youtubeId: undefined });
            await beginPlayback(engineUrl, 0);
            return;
          }
          const yt = full.youtubeId || knownYt;
          if (yt) {
            get().patchTrack(next.id, { mvId: yt, forceYoutube: true, youtubeId: yt });
            pauseOutput();
            void youtubeLoad(yt, true);
          }
        } catch {
          const fallback = officialCatalogUrl(get().tracks[index]) || official;
          if (fallback && get().index === index && get().playing) playNow(fallback);
        } finally {
          if (catalogUpgradeId === next.id) catalogUpgradeId = "";
        }
      })();
      const peek = get().tracks[index + 1] || get().tracks.find((t) => t.id === get().upNext[0]);
      if (peek?.deezerId && !officialCatalogUrl(peek)) {
        void deezerOfficialPreview(peek.deezerId).then((url) => {
          if (url) get().patchTrack(peek.id, { previewUrl: url });
        });
      }
      return;
    }
    if (
      next &&
      isPreviewClip(next.previewUrl || next.url, next.durationSec, {
        archiveId: next.archiveId,
        bandcampId: next.bandcampId,
      })
    ) {
      get().flash("Loading the full track…");
      void (async () => {
        try {
          const full = await resolveFullTrack({
            data: { artist: next.artist, name: next.name, album: next.album, duration: next.durationSec },
          });
          if (get().index !== index) return;
          if (!get().playing) return;
          if (full.url && !isPreviewClip(full.url)) {
            get().patchTrack(next.id, {
              previewUrl: full.url,
              url: full.url,
              mvId: full.youtubeId || next.mvId,
              youtubeId: undefined,
              forceYoutube: false,
            });
            const updated = get().tracks.find((t) => t.id === next.id);
            if (updated) saveMeta(updated);
            youtubePause();
            playNow(full.url);
            return;
          }
          if (full.youtubeId) {
            get().patchTrack(next.id, {
              mvId: full.youtubeId,
              forceYoutube: true,
              youtubeId: full.youtubeId,
            });
            const updated = get().tracks.find((t) => t.id === next.id);
            if (updated) saveMeta(updated);
            pauseOutput();
            void youtubeLoad(full.youtubeId, true);
            return;
          }
          if (next.previewUrl) playNow(next.previewUrl);
          else fail();
        } catch {
          if (get().index !== index || !get().playing) return;
          if (next.previewUrl) playNow(next.previewUrl);
          else fail();
        }
      })();
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
  setPlaying: (playing) => {
    if (!playing) {
      pauseOutput();
      youtubePause();
    }
    set({ playing });
  },
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
  playRadioFrom: (id) => {
    const { tracks, index } = get();
    const seed = tracks.find((t) => t.id === id);
    if (!seed) return;
    const scored = tracks
      .filter((t) => t.id !== seed.id)
      .map((t) => ({ t, n: radioScore(seed, t) + (t.liked ? 0.5 : 0) + (t.starred ? 0.4 : 0) }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 24);
    const fallback = scored.length
      ? scored
      : tracks
          .filter((t) => t.id !== seed.id)
          .map((t) => ({ t, n: 1 }))
          .slice(0, 24);
    const ids = fallback.map((row) => row.t.id);
    const playingThis = tracks[index]?.id === seed.id;
    set({ radio: true, radioRecent: [seed.id], upNext: ids, shuffle: false });
    get().flash(`Station · ${seed.artist || seed.name}`);
    if (!playingThis) {
      const i = tracks.findIndex((t) => t.id === seed.id);
      if (i >= 0) get().playIndex(i, true);
    } else if (!get().playing) {
      get().playIndex(index, true);
    }
  },
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
  setStopAfter: (mode) => {
    set({ stopAfter: mode });
    if (mode === "track") get().flash("Stops after this song");
    else if (mode === "album") get().flash("Stops at the end of this album");
    else get().flash("Keep playing");
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
    saveSession({ ...sessionSlice(get()), mono });
    setMonoMode(mono);
  },
  toggleAutoEq: () => {
    const autoEq = !get().autoEq;
    set({ autoEq });
    saveSession({ ...sessionSlice(get()), autoEq });
    get().flash(autoEq ? "EQ follows genre" : "Auto EQ off");
  },
  saveQueuePlaylist: (name) => {
    const state = get();
    const ids = state.upNext.length
      ? [state.tracks[state.index]?.id, ...state.upNext].filter(Boolean) as string[]
      : state.tracks.map((t) => t.id).slice(0, 80);
    if (ids.length === 0) {
      get().flash("Nothing to save");
      return;
    }
    const title = (name || state.tracks[state.index]?.album || "Queue").trim().slice(0, 40);
    const row: UserPlaylist = {
      id: crypto.randomUUID(),
      name: title,
      trackIds: [...new Set(ids)],
      createdAt: Date.now(),
    };
    const playlists = [row, ...state.playlists].slice(0, 40);
    set({ playlists });
    savePlaylists(playlists);
    get().flash(`Saved “${row.name}”`);
  },
  createPlaylist: (name, trackIds) => {
    const ids = [...new Set(trackIds)].filter((id) => get().tracks.some((t) => t.id === id));
    if (!ids.length) {
      get().flash("Nothing to add");
      return;
    }
    const title = (name || "Playlist").trim().slice(0, 40) || "Playlist";
    const row: UserPlaylist = {
      id: crypto.randomUUID(),
      name: title,
      trackIds: ids,
      createdAt: Date.now(),
    };
    const playlists = [row, ...get().playlists].slice(0, 40);
    set({ playlists });
    savePlaylists(playlists);
    get().flash(`Added to “${row.name}”`);
  },
  addTracksToPlaylist: (playlistId, trackIds) => {
    const row = get().playlists.find((p) => p.id === playlistId);
    if (!row) return;
    const ids = [...new Set([...row.trackIds, ...trackIds])].filter((id) =>
      get().tracks.some((t) => t.id === id),
    );
    const added = ids.length - row.trackIds.length;
    const playlists = get().playlists.map((p) => (p.id === playlistId ? { ...p, trackIds: ids } : p));
    set({ playlists });
    savePlaylists(playlists);
    get().flash(added > 0 ? `Added to “${row.name}”` : `Already in “${row.name}”`);
  },
  playPlaylist: (id) => {
    const row = get().playlists.find((p) => p.id === id);
    if (!row) return;
    const ids = row.trackIds.filter((tid) => get().tracks.some((t) => t.id === tid));
    if (!ids.length) {
      get().flash("That playlist is empty");
      return;
    }
    get().playIds(ids);
  },
  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id);
    set({ playlists });
    savePlaylists(playlists);
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
  playMoreLikeThis: async () => {
    const track = get().tracks[get().index];
    if (!track) return 0;
    get().flash("Finding similar tracks…");
    const hits = await relatedStreamHits(track);
    if (!hits.length) {
      get().flash("Couldn't find similar tracks.");
      return 0;
    }
    const n = await get().importStreamHits(hits, false);
    const ids = hits
      .map((hit) => get().tracks.find((t) => t.deezerId === hit.deezerId)?.id)
      .filter((id): id is string => Boolean(id) && id !== track.id);
    if (ids.length) get().queueNextMany(ids);
    get().flash(ids.length ? `Queued ${ids.length} similar songs` : n ? "Those tracks are already in your library." : "No new similar tracks.");
    return ids.length || n;
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
          queueConsumed = true;
          set({ upNext: rest });
          return i;
        }
      }
      set({ upNext: [] });
    }
    queueConsumed = false;
    if (!fromUser && repeat === "one") return index;

    const current = tracks[index];
    if (!shuffle && !radio && current) {
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
