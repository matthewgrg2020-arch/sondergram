import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

function splitLogo(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= 1) return [clean];
  if (words.length === 2) return words;
  if (words.length === 3) return [words[0], words.slice(1).join(" ")];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function useCoverFill(src: string | null) {
  const [fill, setFill] = useState(src);
  useEffect(() => {
    if (!src) {
      setFill(null);
      return;
    }
    let live = true;
    const img = new Image();
    img.crossOrigin = src.startsWith("blob:") ? "" : "anonymous";
    img.onload = () => {
      if (!live) return;
      setFill(src);
    };
    img.onerror = () => {
      if (live) setFill(src);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return fill;
}

export function CoverTitle({
  title,
  coverUrl,
  className,
}: {
  title: string;
  coverUrl: string | null;
  className?: string;
}) {
  const lines = useMemo(() => splitLogo(title), [title]);
  const fill = useCoverFill(coverUrl);
  const long = title.length > 22 || lines.some((line) => line.length > 14);

  return (
    <h3
      className={cn("cover-logo", long && "cover-logo-long", className)}
      style={
        fill
          ? {
              backgroundImage: `url(${fill})`,
            }
          : undefined
      }
    >
      {lines.map((line) => (
        <span key={line} className="cover-logo-line">
          {line}
        </span>
      ))}
    </h3>
  );
}