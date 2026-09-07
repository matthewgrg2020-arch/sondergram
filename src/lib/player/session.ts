import { BAND_COUNT, FLAT_EQ, type EqGains } from "./constants";
import type { IsolateMode, RemasterPreset, SpatialPreset } from "./engine";

export type VizMode = "bars" | "pulse" | "dots";

export type CustomEqPreset = {
  id: string;
  label: string;
  gains: EqGains;
  preamp: number;
};

export type SessionData = {
  positions: Record<string, number>;
  plays: Record<string, number>;
  recent: string[];
  listenMs: number;
  listenDay: string;
  listenLog: Record<string, number>;
  balance: number;
  viz: VizMode;
  focus: boolean;
  quiet: boolean;
  normalize: boolean;
  skipSilence: boolean;
  eq: EqGains;
  preamp: number;
  presetId: string;
  customPresets: CustomEqPreset[];
  isolate: IsolateMode;
  spatial: SpatialPreset;
  spatialAmount: number;
  volume: number;
  bassLock: boolean;
  haptic: boolean;
  shakeSkip: boolean;
  gapless: boolean;
  mono: boolean;
  remaster: RemasterPreset;
  remasterAmt: number;
};

const KEY = "sondergram:session";

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function clampEq(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-12, Math.min(12, n));
}

function parseEq(value: unknown): EqGains {
  const src = Array.isArray(value) ? value : [];
  const next = FLAT_EQ.slice();
  for (let i = 0; i < BAND_COUNT; i++) next[i] = clampEq(src[i]);
  return next;
}

export function emptySession(): SessionData {
  return {
    positions: {},
    plays: {},
    recent: [],
    listenMs: 0,
    listenDay: todayKey(),
    listenLog: {},
    balance: 0,
    viz: "bars",
    focus: false,
    quiet: false,
    normalize: false,
    skipSilence: false,
    eq: [...FLAT_EQ],
    preamp: 0,
    presetId: "flat",
    customPresets: [],
    isolate: "mix",
    spatial: "off",
    spatialAmount: 0.7,
    volume: 0.85,
    bassLock: false,
    haptic: false,
    shakeSkip: false,
    gapless: true,
    mono: false,
    remaster: "off",
    remasterAmt: 0.72,
  };
}

export function loadSession(): SessionData {
  const fallback = emptySession();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = { ...fallback, ...(JSON.parse(raw) as Partial<SessionData>) };
    parsed.eq = parseEq(parsed.eq);
    parsed.preamp = clampEq(parsed.preamp);
    parsed.presetId = typeof parsed.presetId === "string" && parsed.presetId ? parsed.presetId : "flat";
    parsed.customPresets = Array.isArray(parsed.customPresets)
      ? parsed.customPresets
          .filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
          .map((item) => ({
            id: item.id,
            label: item.label.slice(0, 24),
            gains: parseEq(item.gains),
            preamp: clampEq(item.preamp),
          }))
      : [];
    const remaster = parsed.remaster;
    parsed.remaster =
      remaster === "clean" || remaster === "full" || remaster === "vinyl" || remaster === "loud" ? remaster : "off";
    const amt = Number(parsed.remasterAmt);
    parsed.remasterAmt = Number.isFinite(amt) ? Math.max(0, Math.min(1, amt)) : 0.72;
    if (parsed.listenDay !== todayKey()) {
      parsed.listenMs = 0;
      parsed.listenDay = todayKey();
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveSession(data: SessionData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}