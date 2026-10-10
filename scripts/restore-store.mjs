import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const GOOD_SHA = "e53aa9387335a9f6f767f36776efe4eb66266cb1";
const STORE_PATH = "src/lib/player/store.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playerDir = join(root, "src", "lib", "player");
const out = join(root, STORE_PATH);

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
    if (!src.includes("export const usePlayer") || src.length < 50000) {
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
    // First try local object
    try {
      const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 5 * 1024 * 1024,
      });
      if (src.includes("export const usePlayer") && src.length > 50000) {
        writeFileSync(out, src);
        console.log("restore-store: restored store.ts from local git object (" + src.length + " bytes)");
        return true;
      }
    } catch {
      /* need fetch */
    }

    // Unshallow / fetch the specific commit (works on Vercel shallow clones)
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
      console.log("restore-store: git fetch failed", e?.message?.slice(0, 120));
    }

    const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 5 * 1024 * 1024,
    });
    if (!src.includes("export const usePlayer") || src.length < 50000) {
      console.log("restore-store: git show returned incomplete content (" + (src?.length || 0) + ")");
      return false;
    }
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from origin (" + src.length + " bytes)");
    return true;
  } catch (err) {
    console.log("restore-store: git restore failed", err?.message?.slice(0, 150));
    return false;
  }
}

// Prefer full git restore; fall back to b64 parts
if (!restoreFromGit() && !restoreFromParts()) {
  console.log("restore-store: keeping existing store.ts (full restore unavailable)");
  // If existing is the stub, log a clear warning
  try {
    const cur = readFileSync(out, "utf8");
    if (cur.includes("const noop = () => {}") || cur.length < 20000) {
      console.warn("WARNING: store.ts appears to be the minimal stub. Library import and add will not work.");
    }
  } catch {}
}
