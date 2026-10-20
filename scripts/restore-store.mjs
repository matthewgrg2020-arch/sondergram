import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const GOOD_SHA = "e53aa9387335a9f6f767f36776efe4eb66266cb1";
const STORE_PATH = "src/lib/player/store.ts";
const RAW_URL = `https://raw.githubusercontent.com/matthewgrg2020-arch/sondergram/${GOOD_SHA}/src/lib/player/store.ts`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playerDir = join(root, "src", "lib", "player");
const out = join(root, STORE_PATH);

function isFullStore(src) {
  if (typeof src !== "string") return false;
  if (src.includes("store-impl") && src.includes("export *") && src.length < 500) {
    try {
      const impl = readFileSync(join(playerDir, "store-impl.ts"), "utf8");
      if (impl.includes("export const usePlayer") && impl.includes("importLibrary") && !impl.includes("const noop = () => {}")) {
        return true;
      }
    } catch {}
  }
  return (
    src.includes("export const usePlayer") &&
    src.includes("importSoulseek") &&
    !src.includes("const noop = () => {}") &&
    src.length > 50000
  );
}

function restoreFromRaw() {
  try {
    console.log("restore-store: fetching full store from public raw URL...");
    let src = "";
    try {
      src = execSync(`curl -fsSL --max-time 30 "${RAW_URL}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 5 * 1024 * 1024,
        timeout: 35000,
      });
    } catch {
      src = execSync(
        `node -e "fetch('${RAW_URL}').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e);process.exit(1)})"`,
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 5 * 1024 * 1024,
          timeout: 35000,
        },
      );
    }
    if (!isFullStore(src)) {
      console.log("restore-store: raw payload incomplete (" + (src?.length || 0) + " bytes)");
      return false;
    }
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from raw (" + src.length + " bytes)");
    return true;
  } catch (err) {
    console.log("restore-store: raw fetch failed", String(err?.message || err).slice(0, 120));
    return false;
  }
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
  if (parts.length < 10) {
    console.log("restore-store: only " + parts.length + " b64 parts found (need ~19)");
    return false;
  }
  try {
    const b64 = parts.map((f) => readFileSync(join(playerDir, f), "utf8")).join("").replace(/\s+/g, "");
    const src = Buffer.from(b64, "base64").toString("utf8");
    if (!isFullStore(src)) {
      console.log("restore-store: b64 payload incomplete (" + src.length + " bytes from " + parts.length + " parts)");
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
    } catch {}
    try {
      execSync("git fetch --unshallow origin 2>/dev/null || true", {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
      });
    } catch {}
    try {
      execSync(`git fetch --depth=1 origin ${GOOD_SHA}`, {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
      });
    } catch (e) {
      console.log("restore-store: git fetch failed", String(e?.message || e).slice(0, 100));
    }
    const src = execSync(`git show ${GOOD_SHA}:${STORE_PATH}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 5 * 1024 * 1024,
    });
    if (!isFullStore(src)) return false;
    writeFileSync(out, src);
    console.log("restore-store: restored store.ts from origin (" + src.length + " bytes)");
    return true;
  } catch (err) {
    console.log("restore-store: git restore failed", String(err?.message || err).slice(0, 120));
    return false;
  }
}

let cur = "";
try {
  cur = readFileSync(out, "utf8");
} catch {}
if (isFullStore(cur)) {
  console.log("restore-store: store.ts already full (" + cur.length + " bytes)");
  process.exit(0);
}

const ok = restoreFromRaw() || restoreFromParts() || restoreFromGit();

if (!ok) {
  try {
    cur = readFileSync(out, "utf8");
  } catch {}
  if (isFullStore(cur)) {
    console.log("restore-store: store.ts is ready");
    process.exit(0);
  }
  console.warn("\nWARNING: Full store.ts could not be restored — continuing with current store.ts");
  console.warn("Need public network, complete b64 parts, or git access to", GOOD_SHA);
  process.exit(0);
}

console.log("restore-store: store.ts is ready");
