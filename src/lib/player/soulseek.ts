export type SlskKind = "native" | "slskd";

export type SlskSession = {
  kind?: SlskKind;
  base: string;
  key: string;
  token?: string;
  name?: string;
  ticket?: string;
};

export type SlskFile = {
  username: string;
  filename: string;
  size: number;
  bitRate: number;
  length: number;
  ext: string;
  name: string;
  artist: string;
  album: string;
  lossless: boolean;
  locked: boolean;
  speed: number;
  queue: number;
  free: boolean;
  folder?: string;
  trackNo?: number;
  year?: string;
};

export type SlsKAlbum = {
  key: string;
  username: string;
  folder: string;
  artist: string;
  album: string;
  year: string;
  files: SlskFile[];
  size: number;
  duration: number;
  bitRate: number;
  lossless: boolean;
  free: boolean;
  speed: number;
  queue: number;
  ext: string;
};
