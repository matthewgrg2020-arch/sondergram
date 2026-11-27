import { useEffect, useState } from "react";
import {
  ACCENT_PRESETS,
  BG_PRESETS,
  applyAccent,
  applyBackground,
  applyTheme,
  loadAccent,
  loadBg,
  loadTheme,
  type AccentId,
  type BgId,
  type Theme,
} from "@/lib/player/theme";
import type { AppView } from "./sidebar";
import { AccountSync } from "./account-sync";
import { AddMusicCard } from "./add-music-card";
import { ApkCard } from "./apk-card";
import { DuplicatesCard } from "./duplicates-card";
import { ExtrasPanel } from "./extras-panel";
import { LastFmCard } from "./lastfm-card";
import { LibraryBackup, LibraryClear } from "./library-backup";

export function SettingsPage({
  onView,
  onCarMode,
}: {
  onView?: (view: AppView) => void;
  onCarMode?: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [accent, setAccent] = useState<AccentId>(() => loadAccent());
  const [bg, setBg] = useState<BgId>(() => loadBg());

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyAccent(accent); }, [accent]);
  useEffect(() => { applyBackground(bg); }, [bg]);

  return (
    <div className="space-y-4 px-5 py-4">
      <h2 className="text-3xl font-semibold tracking-tight">Settings</h2>
      <div className="rounded-2xl bg-raised p-4">
        <p className="mb-3 text-sm font-semibold">Appearance</p>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Mode</p>
        <div className="mb-4 flex gap-2">
          {(["dark", "light"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setTheme(mode); applyTheme(mode); }}
              className={`h-10 flex-1 rounded-full text-sm font-medium capitalize ${
                theme === mode ? "bg-accent text-accent-fg" : "bg-surface text-muted hover:text-fg"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Background</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {BG_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => { applyBackground(p.id); setBg(p.id); }}
              className={`flex h-10 items-center gap-2 rounded-full px-3 text-xs font-medium ring-2 ${
                bg === p.id ? "ring-fg" : "ring-transparent"
              }`}
              style={{
                background: p.swatch,
                color: ["cream", "paper", "lavender"].includes(p.id) ? "#111" : "#fff",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs uppercase tracking-widest text-subtle">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => { applyAccent(p.id); setAccent(p.id); }}
              className={`flex h-10 items-center gap-2 rounded-full px-3 text-xs font-medium ring-2 ${
                accent === p.id ? "ring-fg" : "ring-transparent"
              }`}
              style={{ background: p.color, color: p.id === "mint" || p.id === "amber" || p.id === "mono" ? "#111" : "#fff" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ExtrasPanel onCarMode={onCarMode} />
      <AccountSync />
      <AddMusicCard onView={onView} />
      <LibraryBackup />
      <LibraryClear />
      <LastFmCard />
      <DuplicatesCard />
      <ApkCard />
    </div>
  );
}
