import { useRef } from "react";
import { ImagePlus } from "lucide-react";

export function ArtUploader({
  src,
  label,
  onFile,
}: {
  src: string | null;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-subtle">{label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex size-24 items-center justify-center overflow-hidden rounded-md bg-raised shadow-[var(--shadow-border)]"
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6 text-subtle" strokeWidth={1.75} />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-bg/80 py-1 text-center text-xs text-fg opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          Upload
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
