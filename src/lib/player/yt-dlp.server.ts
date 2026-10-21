import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, chmod, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { platform, arch } from "node:os";

const BINARY_URLS: Record<string, string> = {
  "linux-x64": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
  "linux-arm64": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64",
  "darwin-x64": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
  "darwin-arm64": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
  "win32-x64": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
};

let resolvedBin: string | null | undefined;
let ensurePromise: Promise<string | null> | null = null;

function keyForHost() {
  const p = platform();
  const a = arch() === "x64" ? "x64" : arch() === "arm64" ? "arm64" : "";
  return a ? `${p}-${a}` : "";
}

async function pathExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function tryPath(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(cmd, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (d) => {
      out += String(d);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 && out.trim() ? cmd : null));
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 4000);
  });
}

async function downloadBinary(dest: string, url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`yt-dlp download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  if (platform() !== "win32") await chmod(dest, 0o755);
}

/** Resolve a yt-dlp binary: PATH first, then cached download under /tmp. */
export async function ensureYtDlp(): Promise<string | null> {
  if (resolvedBin !== undefined) return resolvedBin;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    for (const cmd of ["yt-dlp", "yt-dlp_linux", "python3 -m yt_dlp"]) {
      if (cmd.includes(" ")) {
        const parts = cmd.split(" ");
        const ok = await new Promise<boolean>((resolve) => {
          const child = spawn(parts[0]!, parts.slice(1).concat(["--version"]), {
            stdio: ["ignore", "pipe", "pipe"],
          });
          child.on("error", () => resolve(false));
          child.on("close", (code) => resolve(code === 0));
          setTimeout(() => {
            try {
              child.kill();
            } catch {
              /* ignore */
            }
            resolve(false);
          }, 4000);
        });
        if (ok) {
          resolvedBin = cmd;
          return resolvedBin;
        }
        continue;
      }
      const hit = await tryPath(cmd);
      if (hit) {
        resolvedBin = hit;
        return resolvedBin;
      }
    }

    const host = keyForHost();
    const url = BINARY_URLS[host];
    if (!url) {
      resolvedBin = null;
      return null;
    }

    const dir = join(tmpdir(), "sondergram-ytdlp");
    await mkdir(dir, { recursive: true });
    const dest = join(dir, platform() === "win32" ? "yt-dlp.exe" : "yt-dlp");
    if (!(await pathExists(dest))) {
      try {
        await downloadBinary(dest, url);
      } catch {
        resolvedBin = null;
        return null;
      }
    } else if (!existsSync(dest)) {
      resolvedBin = null;
      return null;
    }

    const ok = await tryPath(dest);
    resolvedBin = ok ? dest : null;
    return resolvedBin;
  })();
  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

function runYtDlp(bin: string, args: string[], timeoutMs = 25000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const parts = bin.includes(" ") ? bin.split(" ") : [bin];
    const child = spawn(parts[0]!, parts.slice(1).concat(args), {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve({ code: 124, stdout, stderr: stderr || "yt-dlp timeout" });
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export type YtDlpSearchHit = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover: string;
};

/** Search YouTube / YouTube Music via yt-dlp. */
export async function ytDlpSearch(query: string, limit = 12): Promise<YtDlpSearchHit[]> {
  const bin = await ensureYtDlp();
  if (!bin || !query.trim()) return [];

  const n = Math.max(1, Math.min(20, limit));
  // ytsearchmusic prefers music results when available
  const target = `ytsearchmusic${n}:${query.trim()}`;
  const { code, stdout } = await runYtDlp(
    bin,
    [
      "--flat-playlist",
      "--skip-download",
      "-J",
      "--no-warnings",
      "--no-check-certificates",
      target,
    ],
    30000,
  );

  if (code !== 0 || !stdout.trim()) {
    // Fallback to regular YouTube search
    const fallback = await runYtDlp(
      bin,
      [
        "--flat-playlist",
        "--skip-download",
        "-J",
        "--no-warnings",
        "--no-check-certificates",
        `ytsearch${n}:${query.trim()}`,
      ],
      30000,
    );
    if (fallback.code !== 0 || !fallback.stdout.trim()) return [];
    return parseSearchJson(fallback.stdout);
  }
  return parseSearchJson(stdout);
}

function parseSearchJson(raw: string): YtDlpSearchHit[] {
  try {
    const data = JSON.parse(raw) as {
      entries?: Array<Record<string, unknown>>;
      id?: string;
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnails?: Array<{ url?: string }>;
      thumbnail?: string;
    };
    const rows = Array.isArray(data.entries) ? data.entries : data.id ? [data] : [];
    const out: YtDlpSearchHit[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row.id || row.url || "")
        .replace(/^.*v=/, "")
        .replace(/.*\//, "")
        .slice(0, 11);
      if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
      const title = String(row.title || "").trim();
      if (!title) continue;
      const artist = String(row.uploader || row.channel || row.artist || "YouTube Music")
        .replace(/\s+-\s+Topic$/i, "")
        .trim();
      const duration = Number(row.duration) || 0;
      const thumbs = Array.isArray(row.thumbnails) ? row.thumbnails : [];
      const cover =
        String(row.thumbnail || "") ||
        (thumbs.length ? String(thumbs[thumbs.length - 1]?.url || "") : "") ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      seen.add(id);
      out.push({ id, title, artist: artist || "YouTube Music", duration, cover });
    }
    return out;
  } catch {
    return [];
  }
}

/** Resolve a direct audio stream URL for a video id (m4a/webm preferred). */
export async function ytDlpStreamUrl(videoId: string): Promise<{ url: string; duration: number }> {
  const bin = await ensureYtDlp();
  if (!bin || !videoId) return { url: "", duration: 0 };

  const page = `https://music.youtube.com/watch?v=${videoId}`;
  const { code, stdout } = await runYtDlp(
    bin,
    [
      "-f",
      "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
      "-g",
      "--no-warnings",
      "--no-check-certificates",
      "--extractor-args",
      "youtube:player_client=android,web",
      page,
    ],
    28000,
  );
  if (code !== 0) return { url: "", duration: 0 };
  const url = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//i.test(l));
  if (!url) return { url: "", duration: 0 };

  // Optional duration probe (cheap metadata only)
  let duration = 0;
  try {
    const meta = await runYtDlp(
      bin,
      ["--skip-download", "-J", "--no-warnings", "--no-check-certificates", page],
      15000,
    );
    if (meta.code === 0 && meta.stdout.trim()) {
      const j = JSON.parse(meta.stdout) as { duration?: number };
      duration = Number(j.duration) || 0;
    }
  } catch {
    /* ignore */
  }
  return { url, duration };
}
