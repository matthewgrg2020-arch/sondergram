import {
  Archive,
  AudioLines,
  Clock3,
  Cloud,
  Disc3,
  Download,
  FolderDown,
  Heart,
  House,
  Library,
  Radio,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AppView =
  | "listen"
  | "library"
  | "recent"
  | "radio"
  | "search"
  | "youtube"
  | "ibroadcast"
  | "deezer"
  | "spotify"
  | "amazon"
  | "find"
  | "archive"
  | "bandcamp"
  | "arcod"
  | "soulseek"
  | "liked"
  | "studio"
  | "stats"
  | "settings";

const PRIMARY: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "listen", label: "Home", icon: House },
  { id: "library", label: "Library", icon: Library },
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "ibroadcast", label: "iBroadcast", icon: Cloud },
  { id: "deezer", label: "Deezer", icon: AudioLines },
  { id: "spotify", label: "Spotify", icon: AudioLines },
  { id: "amazon", label: "Amazon", icon: AudioLines },
  { id: "find", label: "Find files", icon: FolderDown },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "bandcamp", label: "Bandcamp", icon: Disc3 },
  { id: "arcod", label: "Arcod", icon: Disc3 },
  { id: "soulseek", label: "Soulseek", icon: Share2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const FOOT: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "liked", label: "Favorites", icon: Heart },
  { id: "radio", label: "Radio", icon: Radio },
  { id: "stats", label: "Recap", icon: Sparkles },
  { id: "studio", label: "Sound", icon: SlidersHorizontal },
];

const MOBILE: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "listen", label: "Home", icon: House },
  { id: "library", label: "Library", icon: Library },
  { id: "studio", label: "Sound", icon: SlidersHorizontal },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

type Props = {
  view: AppView;
  onView: (view: AppView) => void;
};

export function Sidebar({ view, onView }: Props) {
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-bg px-3 py-4 lg:flex">
      <button type="button" onClick={() => onView("listen")} className="mb-3 px-1 text-left">
        <h1 className="logo-stream logo-nav">Sondergram</h1>
      </button>
      <a
        href="/sondergram.apk"
        download="sondergram.apk"
        className="mb-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-3 text-sm font-medium text-accent-fg"
      >
        <Download className="size-4" strokeWidth={1.75} />
        Download APK
      </a>

      <nav className="flex flex-col gap-1">
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm",
                active ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <nav className="mt-auto flex flex-col gap-1 pt-6">
        {FOOT.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-3 text-sm",
                active ? "text-fg" : "text-subtle hover:text-muted",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileDock({ view, onView }: Props) {
  return (
    <nav className="grid grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md lg:hidden">
      {MOBILE.map((item) => {
        const Icon = item.icon;
        const active = view === item.id || (item.id === "library" && view === "liked");
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onView(item.id)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium",
              active ? "text-fg" : "text-subtle",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
