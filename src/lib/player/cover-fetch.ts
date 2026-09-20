const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function magicType(buf: Buffer) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  return "";
}

function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h === "::1") return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function referersFor(url: URL): (string | undefined)[] {
  const h = url.hostname.toLowerCase();
  if (h.includes("coverartarchive") || h.endsWith("archive.org")) {
    return ["https://coverartarchive.org/", "https://musicbrainz.org/", "https://archive.org/", undefined];
  }
  if (h.includes("bing") || h.includes("msn.com") || h.endsWith("bing.net")) {
    return ["https://www.bing.com/", undefined];
  }
  if (h.includes("google") || h.includes("gstatic") || h.includes("ggpht") || h.includes("googleusercontent")) {
    return ["https://www.google.com/", undefined];
  }
  if (h.includes("discogs")) return ["https://www.discogs.com/", undefined];
  if (h.includes("wikimedia") || h.includes("wikipedia")) return ["https://en.wikipedia.org/", undefined];
  if (h.includes("deezer") || h.endsWith("dzcdn.net")) return ["https://www.deezer.com/", undefined];
  if (h.includes("mzstatic") || h.includes("apple.com") || h.includes("itunes")) {
    return ["https://www.apple.com/", "https://music.apple.com/", undefined];
  }
  if (h.includes("theaudiodb") || h.includes("audiodb")) return ["https://www.theaudiodb.com/", undefined];
  if (h.includes("last.fm") || h.includes("lastfm")) return ["https://www.last.fm/", undefined];
  return ["https://www.google.com/", url.origin + "/", undefined];
}

export async function pullCoverBytes(url: string): Promise<{ type: string; buf: Buffer } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol) || isPrivateHost(parsed.hostname)) return null;

  for (const referer of referersFor(parsed)) {
    try {
      const headers: Record<string, string> = {
        Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
        "User-Agent": UA,
      };
      if (referer) headers.Referer = referer;
      const res = await fetch(parsed.toString(), {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 400 || buf.length > 8_000_000) continue;
      const header = (res.headers.get("content-type") || "").split(";")[0].trim();
      const type = /^image\//i.test(header) && !/svg/i.test(header) ? header : magicType(buf);
      if (!type || /svg/i.test(type)) continue;
      return { type, buf };
    } catch {
      continue;
    }
  }
  return null;
}
