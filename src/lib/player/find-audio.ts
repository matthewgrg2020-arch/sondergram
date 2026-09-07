export type FoundAudio = {
  id: string;
  name: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  url: string;
  format: string;
  lossless: boolean;
  source: string;
  duration: number;
  trackNo: number;
};

export function audioExt(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".flac")) return "FLAC";
  if (clean.endsWith(".wav")) return "WAV";
  if (clean.endsWith(".aiff") || clean.endsWith(".aif")) return "AIFF";
  if (clean.endsWith(".ogg") || clean.endsWith(".oga")) return "OGG";
  if (clean.endsWith(".m4a") || clean.endsWith(".aac")) return "AAC";
  if (clean.endsWith(".mp3")) return "MP3";
  return "";
}
