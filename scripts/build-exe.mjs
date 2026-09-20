import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = join(root, "desktop");
const web = join(desktop, "web");
const goRoot = join(root, ".go");
const goBin = join(goRoot, "go", "bin", "go");

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function ensureGo() {
  if (existsSync(goBin)) return goBin;
  mkdirSync(goRoot, { recursive: true });
  const tar = join(goRoot, "go.tgz");
  console.log("Downloading Go…");
  await download("https://go.dev/dl/go1.23.6.linux-amd64.tar.gz", tar);
  run("tar", ["-C", goRoot, "-xzf", tar]);
  return goBin;
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (/\.(apk|ipa)$/i.test(name) || /sondergram-(android|ios)\.zip$/i.test(name) || name === "sondergram.exe") continue;
    const src = join(from, name);
    const dest = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dest);
    else cpSync(src, dest);
  }
}

const go = await ensureGo();
console.log("Building web app…");
run("npm", ["run", "build:apk"], { cwd: root, env: process.env });

rmSync(web, { recursive: true, force: true });
copyTree(join(root, "dist-apk"), web);
writeFileSync(join(web, ".keep"), "");

const outDir = join(root, "artifacts");
mkdirSync(outDir, { recursive: true });
const exe = join(outDir, "Sondergram.exe");
console.log("Compiling Windows exe…");
run(go, ["build", "-ldflags=-H windowsgui -s -w", "-o", exe, "."], {
  cwd: desktop,
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0", GOTOOLCHAIN: "local" },
});

cpSync(exe, join(root, "public", "sondergram.exe"));
console.log(`EXE ready: ${exe}`);
