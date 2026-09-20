import { useEffect, useState, type CSSProperties } from "react";
import { proxyCoverUrl } from "./covers";

export type CoverPalette = {
  top: string;
  mid: string;
  bot: string;
  fg: string;
  muted: string;
  accent: string;
};

export const FALLBACK_PALETTE: CoverPalette = {
  top: "18 18 20",
  mid: "12 12 14",
  bot: "8 8 9",
  fg: "242 242 242",
  muted: "168 168 172",
  accent: "242 242 242",
};

const cache = new Map<string, CoverPalette>();

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToSpace(h: number, s: number, l: number) {
  const sat = clamp01(s);
  const light = clamp01(l);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
}

function fromPixels(data: Uint8ClampedArray): CoverPalette {
  const buckets = Array.from({ length: 24 }, () => ({ r: 0, g: 0, b: 0, w: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 90) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l < 0.08 || l > 0.92) continue;
    const satBoost = s < 0.12 ? 0.18 : 1;
    const weight = (0.35 + s) * (1 - Math.abs(l - 0.46) * 1.4) * satBoost;
    if (weight <= 0) continue;
    const bucket = buckets[Math.min(23, Math.floor((h / 360) * 24))];
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    bucket.w += weight;
  }
  buckets.sort((a, b) => b.w - a.w);
  const best = buckets[0];
  if (!best || best.w < 0.01) return FALLBACK_PALETTE;
  const r = best.r / best.w;
  const g = best.g / best.w;
  const b = best.b / best.w;
  const hsl = rgbToHsl(r, g, b);
  const s = Math.min(1, Math.max(0.28, hsl.s * 1.12));
  return {
    top: hslToSpace(hsl.h, s, 0.36),
    mid: hslToSpace(hsl.h, Math.min(1, s * 1.05), 0.2),
    bot: hslToSpace((hsl.h + 12) % 360, Math.min(1, s * 0.92), 0.08),
    fg: "247 245 246",
    muted: hslToSpace(hsl.h, Math.min(0.25, s * 0.35), 0.78),
    accent: hslToSpace(hsl.h, Math.min(1, s * 1.1), 0.72),
  };
}

export async function coverPalette(src: string): Promise<CoverPalette> {
  const hit = cache.get(src);
  if (hit) return hit;
  try {
    const img = new Image();
    const url = proxyCoverUrl(src);
    if (!url.startsWith("blob:") && !url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK_PALETTE;
    ctx.drawImage(img, 0, 0, 32, 32);
    const palette = fromPixels(ctx.getImageData(0, 0, 32, 32).data);
    cache.set(src, palette);
    return palette;
  } catch {
    return FALLBACK_PALETTE;
  }
}

export function coverVars(palette: CoverPalette): CSSProperties {
  return {
    "--cover-top": palette.top,
    "--cover-mid": palette.mid,
    "--cover-bot": palette.bot,
    "--cover-fg": palette.fg,
    "--cover-muted": palette.muted,
    "--cover-accent": palette.accent,
  } as CSSProperties;
}

export function useCoverPalette(src: string | null | undefined) {
  const [palette, setPalette] = useState<CoverPalette>(src ? (cache.get(src) ?? FALLBACK_PALETTE) : FALLBACK_PALETTE);
  useEffect(() => {
    if (!src) {
      setPalette(FALLBACK_PALETTE);
      return;
    }
    const cached = cache.get(src);
    if (cached) {
      setPalette(cached);
      return;
    }
    let live = true;
    void coverPalette(src).then((next) => {
      if (live) setPalette(next);
    });
    return () => {
      live = false;
    };
  }, [src]);
  return palette;
}

export async function coverAccent(src: string): Promise<string | null> {
  const palette = await coverPalette(src);
  if (palette === FALLBACK_PALETTE && !cache.has(src)) return null;
  return `rgb(${palette.accent})`;
}
