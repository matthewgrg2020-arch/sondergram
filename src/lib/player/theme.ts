export type Theme = "dark" | "light";

export type AccentId = "apple" | "violet" | "ocean" | "mint" | "amber" | "rose" | "mono";

export type BgId =
  | "default"
  | "midnight"
  | "slate"
  | "forest"
  | "plum"
  | "espresso"
  | "sand"
  | "ice";

export type AccentPreset = {
  id: AccentId;
  label: string;
  color: string;
};

type BgTone = {
  bg: string;
  surface: string;
  raised: string;
  fg: string;
  muted: string;
  subtle: string;
};

export type BgPreset = {
  id: BgId;
  label: string;
  /** Swatch color shown in the picker */
  swatch: string;
  dark: BgTone;
  light: BgTone;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "apple", label: "Apple Red", color: "#fa2d48" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "ocean", label: "Ocean", color: "#0a84ff" },
  { id: "mint", label: "Mint", color: "#30d158" },
  { id: "amber", label: "Amber", color: "#ff9f0a" },
  { id: "rose", label: "Rose", color: "#ff375f" },
  { id: "mono", label: "Mono", color: "#f5f5f7" },
];

export const BG_PRESETS: BgPreset[] = [
  {
    id: "default",
    label: "Default",
    swatch: "#1c1c1e",
    dark: { bg: "#121212", surface: "#1c1c1e", raised: "#2c2c2e", fg: "#f5f5f7", muted: "#a1a1a6", subtle: "#6e6e73" },
    light: { bg: "#f5f5f7", surface: "#ffffff", raised: "#e8e8ed", fg: "#1d1d1f", muted: "#6e6e73", subtle: "#86868b" },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "#0b1220",
    dark: { bg: "#070b14", surface: "#0f172a", raised: "#1e293b", fg: "#e2e8f0", muted: "#94a3b8", subtle: "#64748b" },
    light: { bg: "#e8eef8", surface: "#f4f7fc", raised: "#d5e0f0", fg: "#0f172a", muted: "#475569", subtle: "#64748b" },
  },
  {
    id: "slate",
    label: "Slate",
    swatch: "#1e293b",
    dark: { bg: "#0f1419", surface: "#1a222c", raised: "#2a3441", fg: "#e8eef4", muted: "#9aa8b5", subtle: "#6b7a88" },
    light: { bg: "#eef1f4", surface: "#ffffff", raised: "#dde3ea", fg: "#15202b", muted: "#5b6b79", subtle: "#7a8a98" },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#0f2419",
    dark: { bg: "#0a1610", surface: "#12241a", raised: "#1c3326", fg: "#e6f2ea", muted: "#95b5a3", subtle: "#678f78" },
    light: { bg: "#e9f2ec", surface: "#f5faf7", raised: "#d4e6da", fg: "#13241a", muted: "#4d6b59", subtle: "#6b8a75" },
  },
  {
    id: "plum",
    label: "Plum",
    swatch: "#1f1430",
    dark: { bg: "#120c1c", surface: "#1c1428", raised: "#2c213d", fg: "#f0eaf8", muted: "#b0a0c4", subtle: "#7d6e92" },
    light: { bg: "#f1ebf7", surface: "#faf7fd", raised: "#e2d8ef", fg: "#1a1226", muted: "#65567a", subtle: "#85769a" },
  },
  {
    id: "espresso",
    label: "Espresso",
    swatch: "#2a1d14",
    dark: { bg: "#14100c", surface: "#221a14", raised: "#33281f", fg: "#f3ece4", muted: "#b5a594", subtle: "#847566" },
    light: { bg: "#f4efe9", surface: "#fbf8f4", raised: "#e8ddd2", fg: "#1f1710", muted: "#6e5f52", subtle: "#8c7c6d" },
  },
  {
    id: "sand",
    label: "Sand",
    swatch: "#c4b5a0",
    dark: { bg: "#1a1712", surface: "#262119", raised: "#3a3228", fg: "#f5f0e6", muted: "#b8ae9c", subtle: "#8a8070" },
    light: { bg: "#f3efe6", surface: "#faf7f1", raised: "#e6ded0", fg: "#2a241c", muted: "#6e6558", subtle: "#8c8272" },
  },
  {
    id: "ice",
    label: "Ice",
    swatch: "#c8d9e6",
    dark: { bg: "#0c1218", surface: "#141c24", raised: "#222e3a", fg: "#e8f0f6", muted: "#9db0c0", subtle: "#6d8294" },
    light: { bg: "#eaf2f7", surface: "#f6fafc", raised: "#d5e4ee", fg: "#12202a", muted: "#4f6678", subtle: "#70899c" },
  },
];

const THEME_KEY = "sondergram:theme";
const ACCENT_KEY = "sondergram:accent";
const BG_KEY = "sondergram:bg";

export function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* private mode */
  }
  return "dark";
}

export function loadAccent(): AccentId {
  if (typeof window === "undefined") return "apple";
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved && ACCENT_PRESETS.some((p) => p.id === saved)) return saved as AccentId;
  } catch {
    /* private mode */
  }
  return "apple";
}

export function loadBg(): BgId {
  if (typeof window === "undefined") return "default";
  try {
    const saved = localStorage.getItem(BG_KEY);
    if (saved && BG_PRESETS.some((p) => p.id === saved)) return saved as BgId;
  } catch {
    /* private mode */
  }
  return "default";
}

function accentPreset(id: AccentId): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]!;
}

function bgPreset(id: BgId): BgPreset {
  return BG_PRESETS.find((p) => p.id === id) || BG_PRESETS[0]!;
}

export function applyAccent(id: AccentId) {
  if (typeof document === "undefined") return;
  const { color } = accentPreset(id);
  const root = document.documentElement;
  root.dataset.accent = id;
  root.style.setProperty("--sg-accent", color);
  root.style.setProperty("--sg-glow", color);
  root.style.setProperty("--sg-hot", color);
  const lightFg = id === "mint" || id === "amber" || id === "mono";
  root.style.setProperty("--sg-accent-fg", lightFg ? "#111111" : "#ffffff");
  root.style.setProperty("--sg-hot-fg", lightFg ? "#111111" : "#ffffff");
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    /* quota */
  }
}

/** Applies background palette to the whole page (html/body/sidebar/panels). */
export function applyBg(id: BgId, theme?: Theme) {
  if (typeof document === "undefined") return;
  const mode = theme ?? loadTheme();
  const tone = bgPreset(id)[mode];
  const root = document.documentElement;
  root.dataset.bg = id;
  root.style.setProperty("--sg-bg", tone.bg);
  root.style.setProperty("--sg-surface", tone.surface);
  root.style.setProperty("--sg-raised", tone.raised);
  root.style.setProperty("--sg-fg", tone.fg);
  root.style.setProperty("--sg-muted", tone.muted);
  root.style.setProperty("--sg-subtle", tone.subtle);
  try {
    localStorage.setItem(BG_KEY, id);
  } catch {
    /* quota */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tone.bg);
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* quota */
  }
  try {
    applyBg(loadBg(), theme);
  } catch {
    /* ignore */
  }
  try {
    applyAccent(loadAccent());
  } catch {
    /* ignore */
  }
}
