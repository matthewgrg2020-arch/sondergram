export type SpSession = {
  token: string;
  refresh?: string;
  expiresAt: number;
  userId: string;
  name: string;
  product?: string;
};

const KEY = "sondergram:spotify";
const CLIENT_KEY = "sondergram:spotify-client";
const VERIFIER_KEY = "sondergram:spotify-verifier";
const REDIRECT_KEY = "sondergram:spotify-redirect";

export function loadSpSession(): SpSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpSession;
    if (!parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSpSession(session: SpSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

export function parseSpotifyClientId(raw: string) {
  const text = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!text) return "";
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const id = obj.clientId || obj.client_id || obj.clientID || obj.id;
      return typeof id === "string" ? id.trim() : "";
    } catch {
      return "";
    }
  }
  return text.replace(/^client[_ ]?id\s*[:=]\s*/i, "").trim();
}

export function loadSpClientId() {
  return parseSpotifyClientId(localStorage.getItem(CLIENT_KEY) || "");
}

export function saveSpClientId(id: string) {
  if (id) localStorage.setItem(CLIENT_KEY, id);
  else localStorage.removeItem(CLIENT_KEY);
}

function randomString(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"[b % 66] ?? "a")).join("");
}

function b64url(bytes: ArrayBuffer) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function spotifyAuthUrl(clientId: string, redirectUri: string) {
  const verifier = randomString(64);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64url(digest);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set(
    "scope",
    "user-library-read playlist-read-private playlist-read-collaborative user-read-email user-read-private user-follow-read",
  );
  url.searchParams.set("state", "sg");
  return url.toString();
}

export function consumeSpotifyVerifier() {
  const v = sessionStorage.getItem(VERIFIER_KEY) || "";
  sessionStorage.removeItem(VERIFIER_KEY);
  return v;
}

export function canonicalAppOrigin() {
  const url = new URL(location.href);
  let host = url.hostname;
  if (host === "localhost") host = "127.0.0.1";
  const port = url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";
  return `${url.protocol}//${host}${port}`;
}

export function spotifyRedirectUri() {
  return `${canonicalAppOrigin()}/`;
}

export function spotifyRedirectUris() {
  const origin = canonicalAppOrigin();
  return [...new Set([`${origin}/`, origin])];
}

export function rememberSpotifyRedirect(uri: string) {
  sessionStorage.setItem(REDIRECT_KEY, uri);
}

export function recalledSpotifyRedirect() {
  return sessionStorage.getItem(REDIRECT_KEY) || spotifyRedirectUri();
}