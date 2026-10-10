import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "player");
let parts = [];
try {
  parts = readdirSync(dir)
    .filter((f) => /^store_b64_\d+\.txt$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
} catch {
  console.log("restore-store: player dir missing, skipping");
  process.exit(0);
}

if (!parts.length) {
  console.log("restore-store: no b64 parts, skipping");
  process.exit(0);
}

try {
  const b64 = parts.map((f) => readFileSync(join(dir, f), "utf8")).join("").replace(/\s+/g, "");
  const src = Buffer.from(b64, "base64").toString("utf8");
  if (!src.includes("export const usePlayer") || src.length < 10000) {
    console.log("restore-store: payload incomplete, keeping existing store.ts");
    process.exit(0);
  }
  writeFileSync(join(dir, "store.ts"), src);
  console.log("restore-store: wrote store.ts (" + src.length + " bytes) from " + parts.length + " parts");
} catch (err) {
  console.log("restore-store: skip (" + (err instanceof Error ? err.message : "error") + ")");
  process.exit(0);
}
