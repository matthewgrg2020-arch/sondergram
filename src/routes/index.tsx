import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  const [App, setApp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let live = true;
    void import("@/components/player/player-app").then((mod) => {
      if (live) setApp(() => mod.PlayerApp);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!App) {
    return <main className="min-h-dvh bg-black" />;
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <App />
    </main>
  );
}
