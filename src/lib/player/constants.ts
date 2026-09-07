const ISO_31 = [
  { freq: 20, label: "20" },
  { freq: 25, label: "25" },
  { freq: 31.5, label: "31" },
  { freq: 40, label: "40" },
  { freq: 50, label: "50" },
  { freq: 63, label: "63" },
  { freq: 80, label: "80" },
  { freq: 100, label: "100" },
  { freq: 125, label: "125" },
  { freq: 160, label: "160" },
  { freq: 200, label: "200" },
  { freq: 250, label: "250" },
  { freq: 315, label: "315" },
  { freq: 400, label: "400" },
  { freq: 500, label: "500" },
  { freq: 630, label: "630" },
  { freq: 800, label: "800" },
  { freq: 1000, label: "1k" },
  { freq: 1250, label: "1k2" },
  { freq: 1600, label: "1k6" },
  { freq: 2000, label: "2k" },
  { freq: 2500, label: "2k5" },
  { freq: 3150, label: "3k2" },
  { freq: 4000, label: "4k" },
  { freq: 5000, label: "5k" },
  { freq: 6300, label: "6k3" },
  { freq: 8000, label: "8k" },
  { freq: 10000, label: "10k" },
  { freq: 12500, label: "12k" },
  { freq: 16000, label: "16k" },
  { freq: 20000, label: "20k" },
] as const;

export const EQ_BANDS = ISO_31;
export type EqGains = number[];

export const BAND_COUNT = EQ_BANDS.length;

export const FLAT_EQ: EqGains = EQ_BANDS.map(() => 0);

function curve(points: [number, number][]): EqGains {
  return EQ_BANDS.map((band) => {
    const logF = Math.log10(band.freq);
    let lo = points[0];
    let hi = points[points.length - 1];
    for (let i = 0; i < points.length - 1; i++) {
      if (band.freq >= points[i][0] && band.freq <= points[i + 1][0]) {
        lo = points[i];
        hi = points[i + 1];
        break;
      }
    }
    if (band.freq <= points[0][0]) return points[0][1];
    if (band.freq >= points[points.length - 1][0]) return points[points.length - 1][1];
    const t =
      (logF - Math.log10(lo[0])) / (Math.log10(hi[0]) - Math.log10(lo[0]) || 1);
    return Math.round((lo[1] + (hi[1] - lo[1]) * t) * 2) / 2;
  });
}

export const EQ_PRESETS: { id: string; label: string; gains: EqGains; preamp: number }[] = [
  { id: "flat", label: "Flat", gains: FLAT_EQ, preamp: 0 },
  {
    id: "bass",
    label: "Bass",
    preamp: -3,
    gains: curve([
      [20, 8],
      [63, 6],
      [125, 3],
      [250, 1],
      [500, 0],
      [2000, -1],
      [8000, -2],
      [20000, -2],
    ]),
  },
  {
    id: "warm",
    label: "Warm",
    preamp: -1.5,
    gains: curve([
      [20, 3],
      [80, 4],
      [250, 2],
      [800, 0],
      [4000, -2],
      [10000, -4],
      [20000, -5],
    ]),
  },
  {
    id: "vocal",
    label: "Vocal",
    preamp: -2,
    gains: curve([
      [20, -4],
      [80, -2],
      [250, 0],
      [800, 2],
      [2000, 5],
      [4000, 4],
      [8000, 1],
      [20000, 0],
    ]),
  },
  {
    id: "bright",
    label: "Bright",
    preamp: -3,
    gains: curve([
      [20, -2],
      [125, -1],
      [500, 0],
      [2000, 2],
      [5000, 5],
      [10000, 6],
      [20000, 5],
    ]),
  },
];

export const EQ_MIN = -12;
export const EQ_MAX = 12;
/** Q ≈ 4.318 for 1/3-octave graphic EQ */
export const EQ_Q = 4.318;
