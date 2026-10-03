import { EllipsisVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  const place = () => {
    const btn = wrapRef.current?.querySelector("button");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuH = Math.min(items.length * 44 + 16, 360);
    const gap = 6;
    const openUp = window.innerHeight - rect.bottom < menuH + 32;
    setPos({
      right: Math.max(8, window.innerWidth - rect.right),
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: Event) => {
      const node = e.target as Node;
      if (wrapRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const id = window.setTimeout(() => {
      window.addEventListener("pointerdown", close);
      window.addEventListener("scroll", onScroll, true);
    }, 80);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
    };
  }, [open, items.length]);

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[80] max-h-[min(70vh,360px)] min-w-48 overflow-y-auto rounded-xl bg-raised p-1 shadow-[var(--shadow-border)]"
            style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className={cn(
                  "block min-h-11 w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface",
                  item.active && "text-accent",
                  item.danger && "text-red-400",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
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
            ? "size-10 text-subtle hover:bg-raised hover:text-fg"
            : "size-8 bg-bg/80 text-fg shadow-sm hover:bg-accent hover:text-accent-fg",
        )}
      >
        <EllipsisVertical className="size-4" strokeWidth={1.75} />
      </button>
      {menu}
    </div>
  );
}
