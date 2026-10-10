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

// RESTORE_IN_PROGRESS — full file being restored in subsequent commits
export const usePlayer = create(() => ({
  tracks: [] as Track[],
  index: -1,
  ready: false,
  playing: false,
  hydrate: async () => {},
  playIndex: () => {},
  setPlaying: () => {},
}));
export function catalogHold() { return false; }
