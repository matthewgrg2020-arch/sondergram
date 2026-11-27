/** Media Session → iOS Lock Screen / Control Center / Apple Watch Now Playing. */
export type MediaSessionTrack = {
  name?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  coverUrl?: string | null;
};

function artworkEntries(coverUrl?: string | null): MediaImage[] {
  const src = (coverUrl || "").trim();
  if (!src) return [];
  const type = src.startsWith("data:image/png")
    ? "image/png"
    : src.includes(".png")
      ? "image/png"
      : "image/jpeg";
  return [
    { src, sizes: "96x96", type },
    { src, sizes: "256x256", type },
    { src, sizes: "512x512", type },
  ];
}

export function syncMediaSession(opts: {
  track: MediaSessionTrack | null | undefined;
  playing: boolean;
  duration?: number;
  position?: number;
  playbackRate?: number;
}) {
  if (typeof navigator === "undefined") return;
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
  if (!ms) return;

  const track = opts.track;
  if (!track) {
    try {
      ms.metadata = null;
      ms.playbackState = "none";
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const title = (track.name || track.title || "Unknown").trim() || "Unknown";
    ms.metadata = new MediaMetadata({
      title,
      artist: (track.artist || "Unknown artist").trim() || "Unknown artist",
      album: (track.album || "Unknown album").trim() || "Unknown album",
      artwork: artworkEntries(track.coverUrl),
    });
  } catch {
    /* ignore */
  }

  try {
    ms.playbackState = opts.playing ? "playing" : "paused";
  } catch {
    /* ignore */
  }

  const duration = Number(opts.duration);
  const position = Number(opts.position);
  const rate = Number(opts.playbackRate);
  if (Number.isFinite(duration) && duration > 0) {
    try {
      ms.setPositionState({
        duration,
        position: Number.isFinite(position) ? Math.max(0, Math.min(position, duration)) : 0,
        playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      });
    } catch {
      /* ignore */
    }
  }
}

export function bindMediaSessionHandlers(handlers: {
  play?: () => void;
  pause?: () => void;
  stop?: () => void;
  nexttrack?: () => void;
  previoustrack?: () => void;
  seekto?: (time: number) => void;
  seekbackward?: (offset: number) => void;
  seekforward?: (offset: number) => void;
}) {
  if (typeof navigator === "undefined") return;
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
  if (!ms?.setActionHandler) return;

  const bind = (action: MediaSessionAction, fn: ((details: MediaSessionActionDetails) => void) | null) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* some actions unsupported on older Safari */
    }
  };

  bind("play", handlers.play ? () => handlers.play!() : null);
  bind("pause", handlers.pause ? () => handlers.pause!() : null);
  bind("stop", handlers.stop ? () => handlers.stop!() : null);
  bind("nexttrack", handlers.nexttrack ? () => handlers.nexttrack!() : null);
  bind("previoustrack", handlers.previoustrack ? () => handlers.previoustrack!() : null);
  bind(
    "seekto",
    handlers.seekto
      ? (details) => {
          if (typeof details.seekTime === "number" && Number.isFinite(details.seekTime)) {
            handlers.seekto!(details.seekTime);
          }
        }
      : null,
  );
  bind(
    "seekbackward",
    handlers.seekbackward
      ? (details) => handlers.seekbackward!(typeof details.seekOffset === "number" ? details.seekOffset : 10)
      : null,
  );
  bind(
    "seekforward",
    handlers.seekforward
      ? (details) => handlers.seekforward!(typeof details.seekOffset === "number" ? details.seekOffset : 10)
      : null,
  );
}
