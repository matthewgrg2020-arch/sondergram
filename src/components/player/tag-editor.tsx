import { useState } from "react";
import { X } from "lucide-react";

export function TagEditor({
  tags,
  onChange,
  placeholder = "Add a tag",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const tag = draft.trim().replace(/,$/, "");
    if (!tag) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">Tags</span>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md bg-raised px-2 py-1.5 ring-1 ring-border">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-1 text-xs text-fg"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-subtle hover:text-fg"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          className="h-8 min-w-24 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-subtle"
          value={draft}
          placeholder={tags.length ? placeholder : "Late night, jazz, favorite"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}
