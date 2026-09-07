import { EllipsisVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
};

export function MoreMenu({
  items,
  label = "More",
  className,
  tone = "overlay",
}: {
  items: MenuItem[];
  label?: string;
  className?: string;
  tone?: "overlay" | "plain";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center justify-center rounded-full",
          tone === "plain"
            ? "size-9 text-subtle hover:bg-raised hover:text-fg"
            : "size-8 bg-bg/80 text-fg shadow-sm hover:bg-accent hover:text-accent-fg",
        )}
      >
        <EllipsisVertical className="size-4" strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl bg-raised p-1 shadow-[var(--shadow-border)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                setOpen(false);
              }}
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface",
                item.active && "text-accent",
                item.danger && "text-red-400",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}