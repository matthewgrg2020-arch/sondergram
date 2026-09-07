import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist-apk");
const from = join(dist, "apk.html");
const to = join(dist, "index.html");
if (!existsSync(from)) {
  throw new Error("apk.html missing from dist-apk — apk build failed");
}
const html = readFileSync(from, "utf8").replace(/\s+crossorigin(?:="[^"]*")?/g, "");
writeFileSync(from, html);
writeFileSync(to, html);