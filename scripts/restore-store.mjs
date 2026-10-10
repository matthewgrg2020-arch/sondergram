import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const GOOD_SHA = "e53aa9387335a9f6f767f36776efe4eb66266cb1";
const STORE_PATH = "src/lib/player/store.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, STORE_PATH);

function tryGitRestore() {
  try {
    // Prefer already-present object (full clone / unshallow)
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
      /* fetch below */
    }

    // Shallow Vercel clones: fetch just that commit
    execSync(`git fetch --depth 1 origin ${GOOD_SHA}`, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 5 * 1024 * 1024,
    });
    if (!src.includes("export const usePlayer") || src.length < 50000) {
      console.log("restore-store: fetched content looks incomplete, skipping");
      return false;
    }
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from origin (" + src.length + " bytes)");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("restore-store: git restore failed (" + msg.split("\n")[0] + ")");
    return false;
  }
}

if (!tryGitRestore()) {
  console.log("restore-store: keeping existing store.ts");
}
