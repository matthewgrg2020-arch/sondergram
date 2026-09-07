import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value = 0,
  onChange,
  size = "md",
}: {
  value?: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-4" : "size-7";
  const box = size === "sm" ? "size-4" : "size-8";
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Album rating">
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        const fill = value >= star ? 1 : value >= star - 0.5 ? 0.5 : 0;
        return (
          <span key={star} className={cn("relative inline-flex", box)}>
            <Star className={cn(dim, "text-subtle")} strokeWidth={1.5} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn(dim, "fill-hot text-hot")} strokeWidth={1.5} />
            </span>
            {onChange ? (
              <>
                <button
                  type="button"
                  aria-label={`${star - 0.5} stars`}
                  className="absolute inset-y-0 left-0 w-1/2"
                  onClick={() => onChange(value === star - 0.5 ? 0 : star - 0.5)}
                />
                <button
                  type="button"
                  aria-label={`${star} stars`}
                  className="absolute inset-y-0 right-0 w-1/2"
                  onClick={() => onChange(value === star ? 0 : star)}
                />
              </>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}