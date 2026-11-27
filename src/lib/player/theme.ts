export type Theme = "dark" | "light";

export type AccentId = "apple" | "violet" | "ocean" | "mint" | "amber" | "rose" | "mono";

export type BgId =
  | "default"
  | "midnight"
  | "charcoal"
  | "slate"
  | "navy"
  | "forest"
  | "wine"
  | "cream"
  | "paper"
  | "lavender";

export type AccentPreset = {
  id: AccentId;
  label: string;
  color: string;
};

export type BgPreset = {
  id: BgId;
  label: string;
  swatch: string;
  /** When set, overrides page surfaces for the whole app */
  tokens?: {
    bg: string;
    surface: string;
    raised: string;
    fg: string;
    muted: string;
    subtle: string;
  };
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
  { id: "default", label: "Default", swatch: "#121212" },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "#000000",
    tokens: {
      bg: "#000000",
      surface: "#0a0a0a",
      raised: "#1a1a1a",
      fg: "#f5f5f7",
      muted: "#a1a1a6",
      subtle: "#6e6e73",
    },
  },
  {
    id: "charcoal",
    label: "Charcoal",
    swatch: "#1c1c1e",
    tokens: {
      bg: "#1c1c1e",
      surface: "#2c2c2e",
      raised: "#3a3a3c",
      fg: "#f5f5f7",
      muted: "#a1a1a6",
      subtle: "#8e8e93",
    },
  },
  {
    id: "slate",
    label: "Slate",
    swatch: "#1e293b",
    tokens: {
      bg: "#0f172a",
      surface: "#1e293b",
      raised: "#334155",
      fg: "#f8fafc",
      muted: "#94a3b8",
      subtle: "#64748b",
    },
  },
  {
    id: "navy",
    label: "Navy",
    swatch: "#0b1c2d",
    tokens: {
      bg: "#07131f",
      surface: "#0b1c2d",
      raised: "#132a40",
      fg: "#e8f1fa",
      muted: "#8eaccd",
      subtle: "#5c7a99",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#0f1f17",
    tokens: {
      bg: "#0a1610",
      surface: "#0f1f17",
      raised: "#1a2e24",
      fg: "#e8f5ee",
      muted: "#8fbc9f",
      subtle: "#5d8a6c",
    },
  },
  {
    id: "wine",
    label: "Wine",
    swatch: "#1a0f14",
    tokens: {
      bg: "#120a0e",
      surface: "#1a0f14",
      raised: "#2a1820",
      fg: "#f8eef2",
      muted: "#c49aad",
      subtle: "#8a6474",
    },
  },
  {
    id: "cream",
    label: "Cream",
    swatch: "#f5f0e8",
    tokens: {
      bg: "#f5f0e8",
      surface: "#fffdf8",
      raised: "#ebe4d8",
      fg: "#1d1d1f",
      muted: "#6e6e73",
      subtle: "#86868b",
    },
  },
  {
    id: "paper",
    label: "Paper",
    swatch: "#f7f7f5",
    tokens: {
      bg: "#f7f7f5",
      surface: "#ffffff",
      raised: "#ebebe8",
      fg: "#1d1d1f",
      muted: "#6e6e73",
      subtle: "#86868b",
    },
  },
  {
    id: "lavender",
    label: "Lavender",
    swatch: "#f0eef6",
    tokens: {
      bg: "#efeaf8",
      surface: "#f7f5fc",
      raised: "#e2dcf0",
      fg: "#1d1d1f",
      muted: "#6e6e73",
      subtle: "#86868b",
    },
  },
];

const THEME_KEY = "sondergram:theme";
const ACCENT_KEY = "sondergram:accent";
const BG_KEY = "sondergram:bg";

const SURFACE_VARS = ["--sg-bg", "--sg-surface", "--sg-raised", "--sg-fg", "--sg-muted", "--sg-subtle"] as const;

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

export function applyBackground(id: BgId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = bgPreset(id);
  root.dataset.bg = id;

  if (!preset.tokens) {
    // Default: clear overrides so CSS theme (dark/light) owns the page
    for (const key of SURFACE_VARS) root.style.removeProperty(key);
  } else {
    const t = preset.tokens;
    root.style.setProperty("--sg-bg", t.bg);
    root.style.setProperty("--sg-surface", t.surface);
    root.style.setProperty("--sg-raised", t.raised);
    root.style.setProperty("--sg-fg", t.fg);
    root.style.setProperty("--sg-muted", t.muted);
    root.style.setProperty("--sg-subtle", t.subtle);
  }

  try {
    localStorage.setItem(BG_KEY, id);
  } catch {
    /* quota */
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const color = preset.tokens?.bg || (loadTheme() === "light" ? "#f5f5f7" : "#000000");
    meta.setAttribute("content", color);
  }
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
    applyAccent(loadAccent());
    applyBackground(loadBg());
  } catch {
    /* ignore */
  }
}
