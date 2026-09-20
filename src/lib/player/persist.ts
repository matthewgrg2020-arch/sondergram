const DB_NAME = "fader-library";
const DB_VERSION = 2;
const STORE = "tracks";
const OPFS_DIR = "sg-audio";

export type StoredTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  tags: string[];
  year: string;
  format: string;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  channels: number | null;
  lossless: boolean;
  liked?: boolean;
  starred?: boolean;
  coverRemote?: string;
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
  trackNo?: number;
  diskNo?: number;
  duration?: number;
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
  audio: Blob;
  audioType?: string;
  cover: Blob | null;
  addedAt: number;
};

type RawRow = Omit<StoredTrack, "audio" | "cover"> & {
  audio: Blob | ArrayBuffer | ArrayBufferView;
  cover: Blob | ArrayBuffer | ArrayBufferView | null;
  audioType?: string;
  coverType?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function blobFromStored(value: unknown, type = "application/octet-stream"): Blob {
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer && value.byteLength > 0) return new Blob([value], { type });
  if (ArrayBuffer.isView(value) && value.byteLength > 0) {
    const copy = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    return new Blob([copy], { type });
  }
  return new Blob([], { type });
}

async function requestPersist() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* private mode */
  }
}

async function audioDir(create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create });
}

async function writeOpfs(id: string, blob: Blob) {
  try {
    const dir = await audioDir(true);
    const fh = await dir.getFileHandle(id, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function readOpfs(id: string) {
  try {
    const dir = await audioDir(false);
    const fh = await dir.getFileHandle(id);
    const file = await fh.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

async function deleteOpfs(id: string) {
  try {
    const dir = await audioDir(false);
    await dir.removeEntry(id);
  } catch {
    /* missing */
  }
}

async function audioSize(value: unknown) {
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function yieldUi() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function storeGetAll(db: IDBDatabase) {
  return new Promise<RawRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as RawRow[]);
    req.onerror = () => reject(req.error);
  });
}

async function storeGetAllKeys(db: IDBDatabase) {
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeGet(db: IDBDatabase, id: IDBValidKey) {
  return new Promise<RawRow | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as RawRow | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function storePut(db: IDBDatabase, row: RawRow) {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(row);
  await txDone(tx);
}

function metaRow(row: RawRow): StoredTrack {
  const type = row.audioType || "audio/mpeg";
  const coverType = row.coverType || "image/jpeg";
  const coverBlob = row.cover ? blobFromStored(row.cover, coverType) : new Blob([]);
  return {
    ...row,
    album: row.album ?? "",
    tags: row.tags ?? (row.genre ? row.genre.split(/\s*[/;,]\s*/).filter(Boolean) : []),
    liked: Boolean(row.liked),
    audio: new Blob(),
    audioType: type,
    cover: coverBlob.size > 0 ? coverBlob : null,
  };
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const opfs = await readOpfs(id);
  if (opfs && opfs.size > 0) return opfs;
  const db = await openDb();
  const row = await storeGet(db, id);
  if (!row) return null;
  const type = row.audioType || "audio/mpeg";
  const blob = blobFromStored(row.audio, type);
  if (blob.size > 0) {
    void writeOpfs(id, blob);
    return blob;
  }
  return null;
}

async function stripLegacyAudio() {
  const db = await openDb();
  const keys = await storeGetAllKeys(db);
  if (keys.length === 0) return;
  let needs = false;
  for (const id of keys.slice(0, 12)) {
    const row = await storeGet(db, id);
    if (row && (await audioSize(row.audio)) > 0) {
      needs = true;
      break;
    }
  }
  if (!needs) return;
  for (const id of keys) {
    const row = await storeGet(db, id);
    if (!row) continue;
    if ((await audioSize(row.audio)) > 0) {
      const blob = blobFromStored(row.audio, row.audioType || "audio/mpeg");
      await writeOpfs(String(id), blob);
      await storePut(db, { ...row, audio: new ArrayBuffer(0) });
    }
    await yieldUi();
  }
}

export async function listStoredTracks(): Promise<StoredTrack[]> {
  await stripLegacyAudio();
  const db = await openDb();
  const rows = await storeGetAll(db);
  return rows.map(metaRow).sort((a, b) => a.addedAt - b.addedAt);
}

export async function getStoredTrack(id: string): Promise<StoredTrack | undefined> {
  const db = await openDb();
  const row = await storeGet(db, id);
  if (!row) return undefined;
  const meta = metaRow(row);
  const audio = await getAudioBlob(id);
  return { ...meta, audio: audio ?? new Blob() };
}

export async function putStoredTrack(track: StoredTrack) {
  await requestPersist();
  if (
    !track.youtubeId &&
    !track.ibroadcastId &&
    !track.deezerId &&
    !track.spotifyId &&
    !track.amazonId &&
    !track.archiveId &&
    !track.bandcampId &&
    !track.soulseekId &&
    !track.previewUrl &&
    track.audio.size > 0
  ) {
    await writeOpfs(track.id, track.audio);
  }
  const audioType = track.audio.type || track.audioType || "audio/mpeg";
  const coverType = track.cover?.type || "image/jpeg";
  let coverPayload: ArrayBuffer | null = null;
  if (track.cover && track.cover.size > 0) {
    try {
      coverPayload = await track.cover.arrayBuffer();
    } catch {
      coverPayload = null;
    }
  }
  const record = {
    ...track,
    audio: new ArrayBuffer(0),
    audioType,
    cover: coverPayload,
    coverType,
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await txDone(tx);
}

export async function deleteStoredTrack(id: string) {
  await deleteOpfs(id);
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

export async function clearStoredLibrary() {
  const db = await openDb();
  const rows = await storeGetAll(db);
  for (const row of rows) {
    try {
      await deleteOpfs(row.id);
    } catch {
      /* leftover file */
    }
  }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await txDone(tx);
}

export async function updateStoredMeta(
  id: string,
  patch: Partial<
    Pick<
      StoredTrack,
      | "name"
      | "artist"
      | "album"
      | "genre"
      | "tags"
      | "year"
      | "cover"
      | "liked"
      | "starred"
      | "coverRemote"
      | "trackNo"
      | "diskNo"
      | "duration"
      | "bytes"
      | "albumArtist"
      | "explicit"
      | "albumNote"
      | "mvId"
      | "mvUrl"
      | "mvThumb"
      | "single"
      | "popular"
      | "chartRank"
      | "albumRating"
      | "spotifyId"
      | "previewUrl"
      | "artistGenre"
      | "artistTags"
      | "metaEdited"
      | "amazonId"
      | "soulseekId"
      | "replayGain"
      | "format"
      | "lossless"
      | "archiveId"
      | "bandcampId"
      | "bandcampUrl"
      | "qobuzId"
      | "appleId"
      | "youtubeId"
    >
  >,
) {
  await requestPersist();
  const db = await openDb();
  const current = await storeGet(db, id);
  const { cover: coverPatch, ...rest } = patch;
  let cover = current?.cover ?? null;
  let coverType = current?.coverType || "image/jpeg";
  if (coverPatch instanceof Blob && coverPatch.size > 0) {
    cover = await coverPatch.arrayBuffer();
    coverType = coverPatch.type || "image/jpeg";
  }
  const base: RawRow =
    current ??
    ({
      id,
      name: "",
      artist: "",
      album: "",
      genre: "",
      tags: [],
      year: "",
      format: "",
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      channels: null,
      lossless: false,
      audio: new ArrayBuffer(0),
      cover: null,
      addedAt: Date.now(),
    } as RawRow);
  await storePut(db, { ...base, ...rest, cover, coverType, id });
}
