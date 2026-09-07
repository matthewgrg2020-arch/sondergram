import { Smartphone } from "lucide-react";

export function ApkCard() {
  return (
    <section className="max-w-xl rounded-xl bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone className="size-4" strokeWidth={1.75} />
        Phone apps
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Android: install the APK. iPhone: Apple will not let this sandbox sign an IPA. Download the iOS project, open it in Xcode on a Mac, then Archive to export Sondergram.ipa.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/sondergram.apk"
          download="sondergram.apk"
          className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-fg"
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
        On iPhone you can also tap Share → Add to Home Screen to run Sondergram like an app today.
      </p>
    </section>
  );
}