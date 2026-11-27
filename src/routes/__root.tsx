import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Sondergram";

// Inline boot so background/theme restore before React hydrates (survives leave/reopen).
const BOOT_APPEARANCE = `
(function () {
  try {
    var theme = localStorage.getItem("sondergram:theme") || sessionStorage.getItem("sondergram:theme") || "dark";
    var bg = localStorage.getItem("sondergram:bg") || sessionStorage.getItem("sondergram:bg") || "default";
    var accent = localStorage.getItem("sondergram:accent") || sessionStorage.getItem("sondergram:accent") || "apple";
    var root = document.documentElement;
    root.dataset.theme = theme === "light" ? "light" : "dark";
    root.dataset.bg = bg;
    root.dataset.accent = accent;
    var presets = {
      midnight: { bg: "#000000", surface: "#0a0a0a", raised: "#1a1a1a", fg: "#f5f5f7", muted: "#a1a1a6", subtle: "#6e6e73" },
      charcoal: { bg: "#1c1c1e", surface: "#2c2c2e", raised: "#3a3a3c", fg: "#f5f5f7", muted: "#a1a1a6", subtle: "#8e8e93" },
      slate: { bg: "#0f172a", surface: "#1e293b", raised: "#334155", fg: "#f8fafc", muted: "#94a3b8", subtle: "#64748b" },
      navy: { bg: "#07131f", surface: "#0b1c2d", raised: "#132a40", fg: "#e8f1fa", muted: "#8eaccd", subtle: "#5c7a99" },
      forest: { bg: "#0a1610", surface: "#0f1f17", raised: "#1a2e24", fg: "#e8f5ee", muted: "#8fbc9f", subtle: "#5d8a6c" },
      wine: { bg: "#120a0e", surface: "#1a0f14", raised: "#2a1820", fg: "#f8eef2", muted: "#c49aad", subtle: "#8a6474" },
      cream: { bg: "#f5f0e8", surface: "#fffdf8", raised: "#ebe4d8", fg: "#1d1d1f", muted: "#6e6e73", subtle: "#86868b" },
      paper: { bg: "#f7f7f5", surface: "#ffffff", raised: "#ebebe8", fg: "#1d1d1f", muted: "#6e6e73", subtle: "#86868b" },
      lavender: { bg: "#efeaf8", surface: "#f7f5fc", raised: "#e2dcf0", fg: "#1d1d1f", muted: "#6e6e73", subtle: "#86868b" }
    };
    var p = presets[bg];
    if (p) {
      var s = root.style;
      s.setProperty("--sg-bg", p.bg);
      s.setProperty("--sg-surface", p.surface);
      s.setProperty("--sg-raised", p.raised);
      s.setProperty("--sg-fg", p.fg);
      s.setProperty("--sg-muted", p.muted);
      s.setProperty("--sg-subtle", p.subtle);
      s.setProperty("--color-bg", p.bg);
      s.setProperty("--color-surface", p.surface);
      s.setProperty("--color-raised", p.raised);
      s.setProperty("--color-fg", p.fg);
      s.setProperty("--color-muted", p.muted);
      s.setProperty("--color-subtle", p.subtle);
      s.backgroundColor = p.bg;
      s.color = p.fg;
    }
    var accents = { apple: "#fa2d48", violet: "#8b5cf6", ocean: "#0a84ff", mint: "#30d158", amber: "#ff9f0a", rose: "#ff375f", mono: "#f5f5f7" };
    var ac = accents[accent] || "#fa2d48";
    root.style.setProperty("--sg-accent", ac);
    root.style.setProperty("--sg-glow", ac);
    root.style.setProperty("--sg-hot", ac);
    root.style.setProperty("--color-accent", ac);
  } catch (e) {}
})();
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Sondergram — a music player with library, lyrics, and studio sound." },
      { name: "theme-color", content: "#060e24" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: BOOT_APPEARANCE }} />
      </head>
      <body className="bg-bg text-fg" suppressHydrationWarning>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
