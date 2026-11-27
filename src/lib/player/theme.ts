export type Theme = "dark" | "light";

export type AccentId = "apple" | "violet" | "ocean" | "mint" | "amber" | "rose" | "mono";

export type AccentPreset = {
  id: AccentId;
  label: string;
  color: string;
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

const THEME_KEY = "sondergram:theme";
const ACCENT_KEY = "sondergram:accent";

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

function preset(id: AccentId): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) || ACCENT_PRESETS[0]!;
}

export function applyAccent(id: AccentId) {
  if (typeof document === "undefined") return;
  const { color } = preset(id);
  const root = document.documentElement;
  root.dataset.accent = id;
  root.style.setProperty("--sg-accent", color);
  root.style.setProperty("--sg-glow", color);
  root.style.setProperty("--sg-hot", color);
  // Readable label on accent buttons: dark text on mint/amber/mono, white otherwise
  const lightFg = id === "mint" || id === "amber" || id === "mono";
  root.style.setProperty("--sg-accent-fg", lightFg ? "#111111" : "#ffffff");
  root.style.setProperty("--sg-hot-fg", lightFg ? "#111111" : "#ffffff");
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    /* quota */
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
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f5f7" : "#000000");
  // Re-apply accent so mono stays legible across themes
  try {
    applyAccent(loadAccent());
  } catch {
    /* ignore */
  }
}
