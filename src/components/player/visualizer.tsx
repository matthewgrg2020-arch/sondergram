import { useEffect, useRef } from "react";
import { getEngine } from "@/lib/player/engine";
import { usePlayer, type VizMode } from "@/lib/player/store";
import { cn } from "@/lib/utils";

const BAR_COUNT = 28;

export function Visualizer({ active, className }: { active: boolean; className?: string }) {
  const wrapRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef(0);
  const viz = usePlayer((s) => s.viz);
  const setViz = usePlayer((s) => s.setViz);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !active) return;
    const bars = Array.from(wrap.children) as HTMLElement[];
    const data = new Uint8Array(128);
    let last = 0;

    const draw = (stamp: number) => {
      if (stamp - last < 33) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      last = stamp;
      const { analyser } = getEngine();
      analyser.getByteFrequencyData(data);
      if (viz === "pulse") {
        let sum = 0;
        for (let i = 0; i < 24; i++) sum += data[i];
        const v = active ? sum / (24 * 255) : 0.08;
        for (let i = 0; i < bars.length; i++) {
          const falloff = 1 - Math.abs(i - bars.length / 2) / (bars.length / 2);
          bars[i].style.height = `${Math.max(8, v * falloff * 100)}%`;
          bars[i].style.opacity = String(0.3 + v * 0.7);
        }
      } else if (viz === "dots") {
        for (let i = 0; i < bars.length; i++) {
          const v = active ? data[i * 3] / 255 : 0.08;
          bars[i].style.height = `${Math.max(10, 10 + v * 18)}%`;
          bars[i].style.opacity = String(0.25 + v * 0.75);
        }
      } else {
        for (let i = 0; i < bars.length; i++) {
          const v = active ? data[i * 3] / 255 : 0.08;
          bars[i].style.height = `${Math.max(8, v * 100)}%`;
          bars[i].style.opacity = String(0.35 + v * 0.65);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, viz]);

  const cycle = () => {
    const order: VizMode[] = ["bars", "pulse", "dots"];
    setViz(order[(order.indexOf(viz) + 1) % order.length]);
  };

  return (
    <button
      type="button"
      ref={wrapRef}
      onClick={cycle}
      aria-label={`Visualizer ${viz}. Click to change.`}
      className={cn("flex h-14 w-full items-end gap-0.5 bg-transparent p-0", className)}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="min-w-0 flex-1 rounded-sm bg-accent"
          style={{ height: "8%" }}
        />
      ))}
    </button>
  );
}
