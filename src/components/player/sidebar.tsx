import {
  Archive,
  AudioLines,
  ChevronDown,
  Clock3,
  Cloud,
  Disc3,
  FolderDown,
  Heart,
  House,
  LayoutGrid,
  Library,
  ListMusic,
  Radio,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Youtube,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/player/store";

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
  | "rym"
  | "arcod"
  | "soulseek"
  | "liked"
  | "studio"
  | "stats"
  | "settings";

const TOP: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "listen", label: "Home", icon: House },
  { id: "recent", label: "New", icon: LayoutGrid },
  { id: "radio", label: "Radio", icon: Radio },
];

const SOURCES: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "ibroadcast", label: "iBroadcast", icon: Cloud },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "spotify", label: "Spotify", icon: AudioLines },
  { id: "deezer", label: "Deezer", icon: AudioLines },
  { id: "amazon", label: "Amazon", icon: AudioLines },
  { id: "bandcamp", label: "Bandcamp", icon: Disc3 },
  { id: "rym", label: "RateYourMusic", icon: Star },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "soulseek", label: "Soulseek", icon: Share2 },
  { id: "find", label: "Find files", icon: FolderDown },
  { id: "arcod", label: "Arcod", icon: Disc3 },
];

const FOOT: { id: AppView; label: string; icon: typeof Library }[] = [
  { id: "liked", label: "Favorite Songs", icon: Heart },
  { id: "studio", label: "Sound", icon: SlidersHorizontal },
  { id: "stats", label: "Recap", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
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

function NavBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Library;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-white/10 font-medium text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function Sidebar({ view, onView }: Props) {
  const playlists = usePlayer((s) => s.playlists);
  const playPlaylist = usePlayer((s) => s.playPlaylist);
  const [libOpen, setLibOpen] = useState(true);
  const [srcOpen, setSrcOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(true);

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col bg-[#1c1c1e] text-white lg:flex">
      <div className="px-3 pt-4 pb-2">
        <button type="button" onClick={() => onView("listen")} className="mb-3 px-1 text-left">
          <h1 className="logo-stream logo-nav text-white">Sondergram</h1>
        </button>
        <button
          type="button"
          onClick={() => onView("search")}
          className="flex h-8 w-full items-center gap-2 rounded-md bg-white/8 px-2.5 text-[13px] text-white/45 hover:bg-white/12"
        >
          <Search className="size-3.5" strokeWidth={2} />
          Search
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <nav className="flex flex-col gap-0.5">
          {TOP.map((item) => (
            <NavBtn
              key={item.label}
              active={view === item.id}
              onClick={() => onView(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setLibOpen((v) => !v)}
          className="mt-4 mb-1 flex h-7 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35"
        >
          <ChevronDown className={cn("size-3.5 transition", !libOpen && "-rotate-90")} strokeWidth={2} />
          Library
        </button>
        {libOpen ? (
          <nav className="flex flex-col gap-0.5">
            <NavBtn active={view === "library"} onClick={() => onView("library")} icon={Library} label="Library" />
            <NavBtn active={view === "recent"} onClick={() => onView("recent")} icon={Clock3} label="Recently Added" />
            <NavBtn active={view === "liked"} onClick={() => onView("liked")} icon={Heart} label="Favorite Songs" />
          </nav>
        ) : null}

        <button
          type="button"
          onClick={() => setPlOpen((v) => !v)}
          className="mt-4 mb-1 flex h-7 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35"
        >
          <ChevronDown className={cn("size-3.5 transition", !plOpen && "-rotate-90")} strokeWidth={2} />
          Playlists
        </button>
        {plOpen ? (
          <nav className="flex flex-col gap-0.5">
            <NavBtn active={false} onClick={() => onView("library")} icon={ListMusic} label="All Playlists" />
            {playlists.slice(0, 12).map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => playPlaylist(pl.id)}
                className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-white/55 hover:bg-white/5 hover:text-white/90"
              >
                <ListMusic className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{pl.name}</span>
              </button>
            ))}
          </nav>
        ) : null}

        <button
          type="button"
          onClick={() => setSrcOpen((v) => !v)}
          className="mt-4 mb-1 flex h-7 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35"
        >
          <ChevronDown className={cn("size-3.5 transition", !srcOpen && "-rotate-90")} strokeWidth={2} />
          Sources
        </button>
        {srcOpen ? (
          <nav className="flex flex-col gap-0.5">
            {SOURCES.map((item) => (
              <NavBtn
                key={item.id}
                active={view === item.id}
                onClick={() => onView(item.id)}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </nav>
        ) : null}

        <nav className="mt-4 flex flex-col gap-0.5 border-t border-white/8 pt-3">
          {FOOT.map((item) => (
            <NavBtn
              key={item.id}
              active={view === item.id}
              onClick={() => onView(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </nav>
      </div>

      <div className="border-t border-white/8 px-3 py-3">
        <button
          type="button"
          onClick={() => onView("settings")}
          className="flex w-full items-center gap-2.5 rounded-md px-1 text-left text-[13px] text-white/70 hover:text-white"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-white/12 text-[11px] font-semibold">
            SG
          </span>
          <span className="truncate">Sondergram</span>
        </button>
      </div>
    </aside>
  );
}

export function MobileDock({ view, onView }: Props) {
  return (
    <nav className="grid grid-cols-5 border-t border-white/8 bg-[#1c1c1e]/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md lg:hidden">
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
              active ? "text-white" : "text-white/40",
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
