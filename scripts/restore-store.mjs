import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const GOOD_SHA = "e53aa9387335a9f6f767f36776efe4eb66266cb1";
const STORE_PATH = "src/lib/player/store.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playerDir = join(root, "src", "lib", "player");
const out = join(root, STORE_PATH);

function isFullStore(src) {
  return (
    typeof src === "string" &&
    src.includes("export const usePlayer") &&
    src.includes("importSoulseek") &&
    !src.includes("const noop = () => {}") &&
    src.length > 50000
  );
}

function restoreFromParts() {
  let parts = [];
  try {
    parts = readdirSync(playerDir)
      .filter((f) => /^store_b64_\d+\.txt$/.test(f))
      .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
  } catch {
    return false;
  }
  if (!parts.length) return false;
  try {
    const b64 = parts.map((f) => readFileSync(join(playerDir, f), "utf8")).join("").replace(/\s+/g, "");
    const src = Buffer.from(b64, "base64").toString("utf8");
    if (!isFullStore(src)) {
      console.log("restore-store: b64 payload incomplete (" + src.length + " bytes)");
      return false;
    }
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from " + parts.length + " b64 parts (" + src.length + " bytes)");
    return true;
  } catch (err) {
    console.log("restore-store: b64 decode failed", err?.message || err);
    return false;
  }
}

function restoreFromGit() {
  try {
    // Try local object first
    try {
      const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 5 * 1024 * 1024,
      });
      if (isFullStore(src)) {
        writeFileSync(out, src);
        console.log("restore-store: restored store.ts from local git object (" + src.length + " bytes)");
        return true;
      }
    } catch {
      /* need fetch */
    }

    // Unshallow + fetch the specific commit (works on Vercel shallow clones)
    try {
      execSync("git fetch --unshallow origin 2>/dev/null || true", {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
      });
    } catch {
      /* ignore */
    }
    try {
      execSync(`git fetch --depth=1 origin ${GOOD_SHA}`, {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 90000,
      });
    } catch (e) {
      console.log("restore-store: git fetch failed", String(e?.message || e).slice(0, 150));
    }

    const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 5 * 1024 * 1024,
    });
    if (!isFullStore(src)) {
      console.log("restore-store: git show returned incomplete content (" + (src?.length || 0) + ")");
      return false;
    }
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from origin (" + src.length + " bytes)");
    return true;
  } catch (err) {
    console.log("restore-store: git restore failed", String(err?.message || err).slice(0, 200));
    return false;
  }
}

const ok = restoreFromGit() || restoreFromParts();

if (!ok) {
  // Final check of whatever is on disk
  let cur = "";
  try {
    cur = readFileSync(out, "utf8");
  } catch {}
  if (!isFullStore(cur)) {
    console.error("\nERROR: Full store.ts could not be restored.");
    console.error("Library import, Soulseek, Bandcamp, etc. will not work with the stub.");
    console.error("GOOD_SHA =", GOOD_SHA);
    process.exit(1);
  }
}

console.log("restore-store: store.ts is ready");
