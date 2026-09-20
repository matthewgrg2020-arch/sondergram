import { useEffect, useRef } from "react";
import { ensureYoutubePlayer, setYoutubeHost } from "@/lib/player/youtube";
import { cn } from "@/lib/utils";

export function YoutubeStage({ active }: { active: boolean }) {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    setYoutubeHost(slot);
    void ensureYoutubePlayer();
    return () => {
      if (slotRef.current === slot) setYoutubeHost(null);
    };
  }, []);

  return (
    <div
      className={cn(
        active
          ? "relative aspect-video w-full overflow-hidden rounded-lg bg-raised shadow-[var(--shadow-border)]"
          : "pointer-events-none fixed bottom-0 left-0 z-0 h-48 w-80 overflow-hidden opacity-[0.02]",
      )}
    >
      <div
        ref={(el) => {
          slotRef.current = el;
          if (el) setYoutubeHost(el);
        }}
        className="h-full w-full"
      />
    </div>
  );
}