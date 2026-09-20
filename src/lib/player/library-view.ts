import { useSyncExternalStore } from "react";

export type CoverSize = "s" | "m" | "l";
export type TitleMode = "on" | "off";
export type LibSort = "title" | "artist" | "year" | "songs" | "name" | "albums";
export type LibTab = "songs" | "albums" | "artists" | "genres" | "tags" | "liked" | "added";

export type LibraryView = {
  size: CoverSize;
  titles: TitleMode;
  sort: LibSort;
  tab: LibTab;
};

const KEY = "sondergram:lib-view";
const SIZES: CoverSize[] = ["s", "m", "l"];
const TITLES: TitleMode[] = ["on", "off"];
const SORTS: LibSort[] = ["title", "artist", "year", "songs", "name", "albums"];
const TABS: LibTab[] = ["songs", "albums", "artists", "genres", "tags", "liked", "added"];

const DEFAULT_VIEW: LibraryView = { size: "m", titles: "on", sort: "title", tab: "albums" };

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function readStorage(): LibraryView {
  try {
    const packed = localStorage.getItem(KEY);
    if (packed) {
      const parsed = JSON.parse(packed) as Partial<LibraryView>;
      return {
        size: pick(parsed.size, SIZES, DEFAULT_VIEW.size),
        titles: pick(parsed.titles, TITLES, DEFAULT_VIEW.titles),
        sort: pick(parsed.sort, SORTS, DEFAULT_VIEW.sort),
        tab: pick(parsed.tab, TABS, DEFAULT_VIEW.tab),
      };
    }
    return {
      size: pick(localStorage.getItem("sondergram:lib-size"), SIZES, DEFAULT_VIEW.size),
      titles: pick(localStorage.getItem("sondergram:lib-titles"), TITLES, DEFAULT_VIEW.titles),
      sort: pick(localStorage.getItem("sondergram:lib-sort"), SORTS, DEFAULT_VIEW.sort),
      tab: DEFAULT_VIEW.tab,
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

function writeStorage(next: LibraryView) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem("sondergram:lib-size", next.size);
    localStorage.setItem("sondergram:lib-titles", next.titles);
    localStorage.setItem("sondergram:lib-sort", next.sort);
  } catch {
    /* private / quota */
  }
}

let current: LibraryView = { ...DEFAULT_VIEW };
let ready = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (ready || typeof window === "undefined") return;
  ready = true;
  current = readStorage();
}

function emit() {
  writeStorage(current);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  hydrate();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snapshot(): LibraryView {
  hydrate();
  return current;
}

function patch(partial: Partial<LibraryView>) {
  hydrate();
  current = { ...current, ...partial };
  emit();
}

export function getLibraryView(): LibraryView {
  return snapshot();
}

export function setCoverSize(size: CoverSize) {
  patch({ size });
}

export function setTitleMode(titles: TitleMode) {
  patch({ titles });
}

export function setLibSort(sort: LibSort) {
  patch({ sort });
}

export function setLibTab(tab: LibTab) {
  if (tab === "liked") return;
  patch({ tab });
}

export function useLibraryView() {
  const view = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_VIEW);
  return {
    size: view.size,
    titles: view.titles,
    sort: view.sort,
    tab: view.tab,
    setSize: setCoverSize,
    setTitles: setTitleMode,
    setSort: setLibSort,
    setTab: setLibTab,
  };
}
