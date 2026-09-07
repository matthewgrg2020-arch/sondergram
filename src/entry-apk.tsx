import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlayerApp } from "@/components/player/player-app";
import { unlockEngine } from "@/lib/player/engine";
import "./styles.css";

function showCrash(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `<div style="min-height:100dvh;padding:24px;font-family:system-ui;background:#0a0a0b;color:#f4f4f5">
    <h1 style="font-size:22px;margin:0 0 8px">Sondergram</h1>
    <p style="color:#a3a3a3;line-height:1.5">${message.replace(/[<>]/g, "")}</p>
  </div>`;
}

function boot() {
  const root = document.getElementById("root");
  if (!root) {
    showCrash("The app shell is missing.");
    return;
  }
  try {
    unlockEngine();
    createRoot(root).render(
      <StrictMode>
        <main className="min-h-dvh overflow-x-hidden bg-bg text-fg">
          <PlayerApp />
        </main>
      </StrictMode>,
    );
  } catch (err) {
    showCrash(err instanceof Error ? err.message : "Could not start the player.");
  }
}

window.addEventListener("error", (event) => {
  if (!document.querySelector("[data-player-app], .mini-bar, .logo-script")) {
    showCrash(event.message || "A script failed to load.");
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  if (reason && !document.querySelector(".mini-bar, .logo-script")) showCrash(reason);
});

document.addEventListener(
  "pointerdown",
  () => {
    unlockEngine();
  },
  { once: true },
);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}