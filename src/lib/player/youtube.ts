export type YtPlayer = {
  loadVideoById?: (id: string) => void;
  cueVideoById?: (id: string) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  stopVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume?: (volume: number) => void;
  mute?: () => void;
  unMute?: () => void;
  setPlaybackRate?: (rate: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  getVideoData?: () => { title?: string; author?: string; video_id?: string };
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YtPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; UNSTARTED?: number; CUED?: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return ID.test(id) ? id : null;
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const v = url.searchParams.get("v");
      if (v && ID.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
        const id = parts[1] ?? "";
        return ID.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeThumb(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export async function youtubeMeta(id: string): Promise<{ title: string; author: string }> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    if (res.ok) {
      const data = (await res.json()) as { title?: string; author_name?: string };
      return { title: data.title?.trim() || "YouTube", author: data.author_name?.trim() || "YouTube" };
    }
  } catch {
    /* cors or offline */
  }
  return { title: "YouTube", author: "YouTube" };
}

let apiLoading: Promise<void> | null = null;

export function loadYoutubeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve) => {
    const ready = () => resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      ready();
    };
    if (!document.querySelector("script[data-sondergram-yt]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.sondergramYt = "1";
      document.head.appendChild(script);
    }
    const wait = () => {
      if (window.YT?.Player) ready();
      else window.setTimeout(wait, 60);
    };
    wait();
  });
  return apiLoading;
}

let player: YtPlayer | null = null;
let host: HTMLElement | null = null;
let boundHost: HTMLElement | null = null;
let loadedId: string | null = null;
let playerReady = false;
let onEnded: (() => void) | null = null;
let onMeta: ((title: string, author: string) => void) | null = null;
let loadToken = 0;
let pending: { id: string; play: boolean } | null = null;

export function setYoutubeHost(el: HTMLElement | null) {
  host = el;
}

export function setYoutubeHandlers(handlers: { onEnded?: () => void; onMeta?: (title: string, author: string) => void }) {
  onEnded = handlers.onEnded ?? onEnded;
  onMeta = handlers.onMeta ?? onMeta;
}

function ytCall<K extends keyof YtPlayer>(name: K, ...args: Parameters<NonNullable<YtPlayer[K]>>) {
  try {
    const target = player as Record<string, unknown> | null;
    const fn = target?.[name as string];
    if (typeof fn !== "function") return undefined;
    return (fn as (...xs: unknown[]) => unknown).apply(player, args);
  } catch {
    return undefined;
  }
}

function emitMeta() {
  try {
    const data = ytCall("getVideoData") as { title?: string; author?: string } | undefined;
    if (data?.title) onMeta?.(data.title, data.author || "YouTube");
  } catch {
    /* not ready */
  }
}

function resetPlayer() {
  try {
    ytCall("destroy");
  } catch {
    /* already gone */
  }
  player = null;
  playerReady = false;
  boundHost = null;
  loadedId = null;
  pending = null;
}

function applyPending() {
  if (!pending || !playerReady) return;
  const next = pending;
  pending = null;
  void youtubeLoad(next.id, next.play);
}

export async function ensureYoutubePlayer() {
  await loadYoutubeApi();
  if (!host || !window.YT?.Player) return null;
  if (player && boundHost === host) return player;
  if (player) resetPlayer();
  playerReady = false;
  try {
    player = new window.YT.Player(host, {
      width: "100%",
      height: "100%",
      playerVars: {
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        fs: 1,
        origin: window.location.origin,
        enablejsapi: 1,
      },
      events: {
        onReady: () => {
          playerReady = true;
          emitMeta();
          applyPending();
        },
        onStateChange: (event: { data: number }) => {
          if (event.data === window.YT?.PlayerState.ENDED) onEnded?.();
          if (event.data === window.YT?.PlayerState.PLAYING) emitMeta();
        },
        onError: () => {
          loadedId = null;
        },
      },
    });
  } catch {
    player = null;
    playerReady = false;
    return null;
  }
  boundHost = host;
  return player;
}

export async function youtubeLoad(id: string, play: boolean) {
  const token = ++loadToken;
  if (!host) {
    for (let i = 0; i < 40 && !host; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }
  if (token !== loadToken) return;
  const instance = await ensureYoutubePlayer();
  if (!instance || token !== loadToken) return;
  if (!playerReady) {
    pending = { id, play };
    return;
  }
  if (loadedId !== id) {
    if (play) {
      ytCall("unMute");
      ytCall("setVolume", 100);
      ytCall("loadVideoById", id);
    } else ytCall("cueVideoById", id);
    loadedId = id;
    return;
  }
  if (play) {
    ytCall("unMute");
    ytCall("setVolume", 100);
    const state = ytCall("getPlayerState");
    if (state === window.YT?.PlayerState.ENDED) ytCall("seekTo", 0, true);
    ytCall("playVideo");
    return;
  }
  ytCall("pauseVideo");
}

export function youtubePlay() {
  if (!playerReady) {
    if (loadedId) pending = { id: loadedId, play: true };
    return;
  }
  ytCall("playVideo");
}

export function youtubePause() {
  ytCall("pauseVideo");
}

export function youtubeSeek(seconds: number) {
  ytCall("seekTo", seconds, true);
}

export function youtubeSetVolume(value: number, muted: boolean) {
  if (!playerReady) return;
  if (muted || value <= 0) {
    ytCall("mute");
    ytCall("setVolume", 0);
    return;
  }
  ytCall("unMute");
  ytCall("setVolume", Math.round(Math.max(0, Math.min(1, value)) * 100));
}

export function youtubeSetRate(rate: number) {
  ytCall("setPlaybackRate", rate);
}

export function youtubeTime() {
  const t = ytCall("getCurrentTime");
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

export function youtubeDuration() {
  const t = ytCall("getDuration");
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

export function youtubeStop() {
  pending = null;
  loadToken += 1;
  loadedId = null;
  ytCall("pauseVideo");
  ytCall("stopVideo");
  ytCall("mute");
}

export function youtubeWhenPlaying(ms = 12000) {
  return new Promise<boolean>((resolve) => {
    const playing = () => ytCall("getPlayerState") === window.YT?.PlayerState.PLAYING;
    if (playing()) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const tick = window.setInterval(() => {
      if (playing()) {
        window.clearInterval(tick);
        resolve(true);
      } else if (Date.now() - start > ms) {
        window.clearInterval(tick);
        resolve(false);
      }
    }, 200);
  });
}
