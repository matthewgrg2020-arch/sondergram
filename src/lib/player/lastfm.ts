const KEY = "sondergram:lastfm";

export type LastFmAuth = {
  user: string;
  apiKey: string;
  secret: string;
  sk: string;
};

export function loadLastFm(): LastFmAuth {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { user: "", apiKey: "", secret: "", sk: "", ...JSON.parse(raw) };
  } catch {
    /* private */
  }
  return { user: "", apiKey: "", secret: "", sk: "" };
}

export function saveLastFm(auth: LastFmAuth) {
  try {
    localStorage.setItem(KEY, JSON.stringify(auth));
  } catch {
    /* quota */
  }
}

function md5(str: string) {
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  const bytes = unescape(encodeURIComponent(str));
  const n = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < n; i++) words[i >> 2] |= (bytes.charCodeAt(i) & 255) << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  const len = ((n + 8) >> 6) * 16 + 14;
  while (words.length <= len + 1) words.push(0);
  words[len] = n * 8;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const oa = a;
    const ob = b;
    const oc = c;
    const od = d;
    const w = words;
    a = ff(a, b, c, d, w[i]!, 7, -680876936);
    d = ff(d, a, b, c, w[i + 1]!, 12, -389564586);
    c = ff(c, d, a, b, w[i + 2]!, 17, 606105819);
    b = ff(b, c, d, a, w[i + 3]!, 22, -1044525330);
    a = ff(a, b, c, d, w[i + 4]!, 7, -176418897);
    d = ff(d, a, b, c, w[i + 5]!, 12, 1200080426);
    c = ff(c, d, a, b, w[i + 6]!, 17, -1473231341);
    b = ff(b, c, d, a, w[i + 7]!, 22, -45705983);
    a = ff(a, b, c, d, w[i + 8]!, 7, 1770035416);
    d = ff(d, a, b, c, w[i + 9]!, 12, -1958414417);
    c = ff(c, d, a, b, w[i + 10]!, 17, -42063);
    b = ff(b, c, d, a, w[i + 11]!, 22, -1990404162);
    a = ff(a, b, c, d, w[i + 12]!, 7, 1804603682);
    d = ff(d, a, b, c, w[i + 13]!, 12, -40341101);
    c = ff(c, d, a, b, w[i + 14]!, 17, -1502002290);
    b = ff(b, c, d, a, w[i + 15]!, 22, 1236535329);
    a = gg(a, b, c, d, w[i + 1]!, 5, -165796510);
    d = gg(d, a, b, c, w[i + 6]!, 9, -1069501632);
    c = gg(c, d, a, b, w[i + 11]!, 14, 643717713);
    b = gg(b, c, d, a, w[i]!, 20, -373897302);
    a = gg(a, b, c, d, w[i + 5]!, 5, -701558691);
    d = gg(d, a, b, c, w[i + 10]!, 9, 38016083);
    c = gg(c, d, a, b, w[i + 15]!, 14, -660478335);
    b = gg(b, c, d, a, w[i + 4]!, 20, -405537848);
    a = gg(a, b, c, d, w[i + 9]!, 5, 568446438);
    d = gg(d, a, b, c, w[i + 14]!, 9, -1019803690);
    c = gg(c, d, a, b, w[i + 3]!, 14, -187363961);
    b = gg(b, c, d, a, w[i + 8]!, 20, 1163531501);
    a = gg(a, b, c, d, w[i + 13]!, 5, -1444681467);
    d = gg(d, a, b, c, w[i + 2]!, 9, -51403784);
    c = gg(c, d, a, b, w[i + 7]!, 14, 1735328473);
    b = gg(b, c, d, a, w[i + 12]!, 20, -1926607734);
    a = hh(a, b, c, d, w[i + 5]!, 4, -378558);
    d = hh(d, a, b, c, w[i + 8]!, 11, -2022574463);
    c = hh(c, d, a, b, w[i + 11]!, 16, 1839030562);
    b = hh(b, c, d, a, w[i + 14]!, 23, -35309556);
    a = hh(a, b, c, d, w[i + 1]!, 4, -1530992060);
    d = hh(d, a, b, c, w[i + 4]!, 11, 1272893353);
    c = hh(c, d, a, b, w[i + 7]!, 16, -155497632);
    b = hh(b, c, d, a, w[i + 10]!, 23, -1094730640);
    a = hh(a, b, c, d, w[i + 13]!, 4, 681279174);
    d = hh(d, a, b, c, w[i]!, 11, -358537222);
    c = hh(c, d, a, b, w[i + 3]!, 16, -722521979);
    b = hh(b, c, d, a, w[i + 6]!, 23, 76029189);
    a = hh(a, b, c, d, w[i + 9]!, 4, -640364487);
    d = hh(d, a, b, c, w[i + 12]!, 11, -421815835);
    c = hh(c, d, a, b, w[i + 15]!, 16, 530742520);
    b = hh(b, c, d, a, w[i + 2]!, 23, -995338651);
    a = ii(a, b, c, d, w[i]!, 6, -198630844);
    d = ii(d, a, b, c, w[i + 7]!, 10, 1126891415);
    c = ii(c, d, a, b, w[i + 14]!, 15, -1416354905);
    b = ii(b, c, d, a, w[i + 5]!, 21, -57434055);
    a = ii(a, b, c, d, w[i + 12]!, 6, 1700485571);
    d = ii(d, a, b, c, w[i + 3]!, 10, -1894986606);
    c = ii(c, d, a, b, w[i + 10]!, 15, -1051523);
    b = ii(b, c, d, a, w[i + 1]!, 21, -2054922799);
    a = ii(a, b, c, d, w[i + 8]!, 6, 1873313359);
    d = ii(d, a, b, c, w[i + 15]!, 10, -30611744);
    c = ii(c, d, a, b, w[i + 6]!, 15, -1560198380);
    b = ii(b, c, d, a, w[i + 13]!, 21, 1309151649);
    a = ii(a, b, c, d, w[i + 4]!, 6, -145523070);
    d = ii(d, a, b, c, w[i + 11]!, 10, -1120210379);
    c = ii(c, d, a, b, w[i + 2]!, 15, 718787259);
    b = ii(b, c, d, a, w[i + 9]!, 21, -343485551);
    a = (a + oa) | 0;
    b = (b + ob) | 0;
    c = (c + oc) | 0;
    d = (d + od) | 0;
  }
  function hex(n: number) {
    let out = "";
    for (let i = 0; i < 4; i++) out += ((n >> (i * 8)) & 255).toString(16).padStart(2, "0");
    return out;
  }
  return hex(a) + hex(b) + hex(c) + hex(d);
}

function sign(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).sort();
  const raw = keys.map((k) => k + params[k]).join("") + secret;
  return md5(raw);
}

async function call(method: string, extra: Record<string, string>, auth: LastFmAuth) {
  if (!auth.apiKey || !auth.sk || !auth.secret) return false;
  const params: Record<string, string> = {
    method,
    api_key: auth.apiKey,
    sk: auth.sk,
    ...extra,
  };
  params.api_sig = sign(params, auth.secret);
  params.format = "json";
  const body = new URLSearchParams(params);
  const res = await fetch("https://ws.audioscrobbler.com/2.0/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.ok;
}

const scrobbled = new Set<string>();

export async function scrobbleTrack(artist: string, name: string, startedAt: number) {
  const auth = loadLastFm();
  if (!auth.user || !auth.sk) return false;
  const key = `${artist}|${name}|${startedAt}`;
  if (scrobbled.has(key)) return true;
  const ok = await call(
    "track.scrobble",
    {
      artist,
      track: name,
      timestamp: String(Math.floor(startedAt / 1000)),
    },
    auth,
  );
  if (ok) scrobbled.add(key);
  return ok;
}

export async function nowPlayingTrack(artist: string, name: string) {
  const auth = loadLastFm();
  if (!auth.sk) return false;
  return call("track.updateNowPlaying", { artist, track: name }, auth);
}