import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void import("@/components/player/player-app")
      .then((mod) => {
        if (!live) return;
        if (typeof mod.PlayerApp !== "function") {
          setErr("PlayerApp export missing");
          return;
        }
        setApp(() => mod.PlayerApp);
      })
      .catch((e) => {
        if (!live) return;
        setErr(e?.message || String(e));
        console.error("player-app import failed", e);
      });
    return () => {
      live = false;
    };
  }, []);

  if (err) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6 text-fg">
        <div className="text-lg font-medium">Sondergram failed to load</div>
        <div className="max-w-md text-center text-sm opacity-70">{err}</div>
        <button
          type="button"
          className="rounded-full bg-raised px-4 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </main>
    );
  }

  if (!App) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg text-fg">
        <div className="text-sm opacity-70">Loading Sondergram…</div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <App />
    </main>
  );
}
