import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const android = join(root, "android");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(root, ".android-sdk");
const javaHome =
  process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, "bin/java"))
    ? process.env.JAVA_HOME
    : existsSync(join(root, ".jdk/jdk-21.0.12.1+1/bin/java"))
      ? join(root, ".jdk/jdk-21.0.12.1+1")
      : "/usr/lib/jvm/java-17-openjdk-amd64";

if (!existsSync(android)) {
  throw new Error("android folder missing — run npx cap add android first");
}

writeFileSync(join(android, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);

const gradlew = join(android, "gradlew");
const result = spawnSync(gradlew, ["assembleDebug", "--no-daemon"], {
  cwd: android,
  env: {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    JAVA_HOME: javaHome,
  },
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const built = join(android, "app/build/outputs/apk/debug/app-debug.apk");
if (!existsSync(built)) {
  throw new Error("Gradle finished but app-debug.apk was not created");
}

const outDir = join(root, "artifacts");
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, "sondergram.apk");
copyFileSync(built, dest);
copyFileSync(built, join(root, "public", "sondergram.apk"));
console.log(`APK ready: ${dest}`);
