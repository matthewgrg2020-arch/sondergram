import { Monitor, Smartphone } from "lucide-react";

export function ApkCard() {
  return (
    <section className="max-w-xl rounded-xl bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone className="size-4" strokeWidth={1.75} />
        Apps
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Windows: download the EXE and double-click. It opens Sondergram in its own window using Edge or Chrome already on the PC. Android: install the APK. iPhone: Apple will not let this sandbox sign an IPA — Add to Home Screen works today.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/sondergram.exe"
          download="Sondergram.exe"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          <Monitor className="size-4" strokeWidth={1.75} />
          Download Windows EXE
        </a>
        <a
          href="/sondergram.apk"
          download="sondergram.apk"
          className="inline-flex h-10 items-center rounded-full bg-raised px-4 text-sm font-medium text-fg"
        >
          Download APK
        </a>
        <a
          href="/sondergram-ios.zip"
          download="sondergram-ios.zip"
          className="inline-flex h-10 items-center rounded-full bg-raised px-4 text-sm font-medium text-fg"
        >
          Download iOS / IPA project
        </a>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        Windows Defender may warn on the first run because this build is unsigned. Choose More info → Run anyway. Your library stays on that computer.
      </p>
    </section>
  );
}
