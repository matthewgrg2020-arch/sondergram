import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { hydrate as hydrateStore } from "@/lib/player/store";

/** Temporary shell while full player-app is restored. */
export function PlayerApp() {
  const hydrate = usePlayer((s) => s.hydrate);
  const notice = usePlayer((s) => s.notice);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await hydrate();
      } catch {}
      setReady(true);
    })();
  }, [hydrate]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-fg p-6">
      <div className="text-lg font-medium">Sondergram</div>
      <div className="text-sm opacity-70">
        {ready ? "Restoring full player… refresh in a moment." : "Loading library…"}
      </div>
      {notice ? <div className="text-xs opacity-60 max-w-sm text-center">{notice}</div> : null}
    </div>
  );
}
