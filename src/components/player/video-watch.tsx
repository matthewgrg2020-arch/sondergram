import { X } from "lucide-react";
import { parseYoutubeId } from "@/lib/player/youtube";

type Props = {
  title: string;
  youtubeId?: string;
  url: string;
  onClose: () => void;
};

export function VideoWatch({ title, youtubeId, url, onClose }: Props) {
  const id = youtubeId || parseYoutubeId(url) || undefined;
  const file = /\.(m4v|mp4|mov|m3u8)(\?|$)/i.test(url) || /video-ssl\.itunes\.apple\.com/i.test(url);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-fg">
        <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        <button type="button" aria-label="Close video" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-raised">
          <X className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {id ? (
          <iframe
            title={title}
            className="aspect-video w-full max-w-4xl rounded-xl bg-black"
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : file ? (
          <video className="max-h-full w-full max-w-4xl rounded-xl bg-black" src={url} controls autoPlay playsInline />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-fg"
          >
            Open on YouTube
          </a>
        )}
      </div>
    </div>
  );
}