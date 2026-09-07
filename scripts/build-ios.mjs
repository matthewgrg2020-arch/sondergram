import { copyFileSync, createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ios = join(root, "ios");

if (!existsSync(ios)) {
  throw new Error("ios folder missing — run npx cap add ios first");
}

const guide = `# Build Sondergram as an IPA

Apple only lets a Mac with Xcode sign an .ipa. This zip is the iPhone/iPad app project.

## On a Mac

1. Install Xcode from the App Store and open it once.
2. Unzip this folder.
3. Double-click \`ios/App/App.xcodeproj\`.
4. At the top, choose your iPhone or "Any iOS Device".
5. Click the Sondergram target → Signing & Capabilities.
6. Check **Automatically manage signing** and pick your Apple ID team.
7. Menu: **Product → Archive**.
8. In the Organizer, click **Distribute App** → **Ad Hoc** or **Development** → Export.
9. That export is \`Sondergram.ipa\`. AirDrop it or use Finder to install on a paired iPhone.

A free Apple ID can install on your own phone for 7 days. A paid Apple Developer account ($99/year) keeps it signed longer and can use TestFlight.

## From the terminal (Mac)

\`\`\`bash
npm install
npm run build:apk
npx cap sync ios
cd ios/App
xcodebuild -scheme App -configuration Release -archivePath build/Sondergram.xcarchive archive
xcodebuild -exportArchive -archivePath build/Sondergram.xcarchive -exportPath build/ipa -exportOptionsPlist ExportOptions.plist
\`\`\`
`;

writeFileSync(join(ios, "BUILD-IPA.txt"), guide);
writeFileSync(join(root, "BUILD-IPA.md"), guide);

const outDir = join(root, "artifacts");
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, "sondergram-ios.zip");

function pythonZip() {
  const py = `
import os, zipfile
root = ${JSON.stringify(root)}
out = ${JSON.stringify(zipPath)}
names = ["ios", "BUILD-IPA.md", "capacitor.config.json", "package.json"]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in names:
        path = os.path.join(root, name)
        if os.path.isdir(path):
            for dirpath, _, files in os.walk(path):
                if "node_modules" in dirpath.split(os.sep):
                    continue
                for f in files:
                    full = os.path.join(dirpath, f)
                    z.write(full, os.path.relpath(full, root))
        elif os.path.isfile(path):
            z.write(path, name)
`;
  const result = spawnSync("python3", ["-c", py], { cwd: root, stdio: "inherit" });
  return result.status === 0;
}

if (!pythonZip()) {
  process.exit(1);
}

copyFileSync(zipPath, join(root, "public", "sondergram-ios.zip"));
console.log(`iOS project ready: ${zipPath}`);
console.log("Open ios/App/App.xcodeproj on a Mac to export the IPA.");
