/**
 * The brands customers already own — read back, never sold.
 *
 * Unlike the catalogue, these are real labels: Levi's, Wrangler and Lee, the
 * first brands SartorIA integrates. They are here for one purpose, the "a pair
 * I own" path — someone says "Levi's W32 L32 fits me" and their published
 * body chart says what body that size is cut for. No products, prices or
 * logos: only the brand's own public size chart, attributed to its page.
 *
 * Every number is copied from the brand's Italian size-chart page on
 * 2026-09-24, in cm, the column for the natural waist where there is a choice.
 * All three are body charts ("measure directly on the body"), so no ease is
 * added. Where a brand gives a length table in cm it is used as published;
 * Levi's gives none, and its L is the inseam in inches.
 *
 * Wrangler and Lee are sister brands and publish the same women's chart. That
 * is not a copying mistake.
 */

export type BrandName = "Levi's" | "Wrangler" | "Lee";
export type Line = "men" | "women";

export interface OwnedSize {
  /** The W on the label. */
  w: number;
  waist_cm: number;
  hip_cm: number;
  /** Only where the brand publishes it. */
  thigh_cm?: number;
}

export interface BrandChart {
  brand: BrandName;
  line: Line;
  source: string;
  sizes: OwnedSize[];
  /** The L on the label → inseam in cm. */
  lengths: { l: number; inseam_cm: number }[];
}

const inches = (ls: number[]) =>
  ls.map((l) => ({ l, inseam_cm: Math.round(l * 2.54 * 10) / 10 }));

const rows = (t: number[][]): OwnedSize[] =>
  t.map(([w, waist_cm, hip_cm, thigh_cm]) =>
    thigh_cm === undefined ? { w, waist_cm, hip_cm } : { w, waist_cm, hip_cm, thigh_cm });

/** Published lengths shared by Wrangler and Lee women's. */
const KONTOOR_LENGTHS = [
  { l: 30, inseam_cm: 76.2 }, { l: 32, inseam_cm: 81.3 },
  { l: 34, inseam_cm: 86.4 }, { l: 36, inseam_cm: 91.4 },
];

/** Wrangler and Lee women's trousers: W, natural waist, hip, thigh. */
const KONTOOR_WOMEN = rows([
  [22, 58.5, 81.5, 49.5], [23, 61, 84, 50.5], [24, 63.5, 86.5, 51.5],
  [25, 66, 89, 52.5], [26, 68.5, 91.5, 53.5], [27, 71, 94, 54.5],
  [28, 73.5, 96.5, 55], [29, 76, 99, 57], [30, 78.5, 101.5, 58.5],
  [31, 81.5, 104, 60], [32, 84, 106.5, 61.5], [33, 87, 109, 63],
  [34, 90, 112, 65], [35, 93.5, 114.5, 66.5], [36, 96.5, 117, 68],
  [37, 99.5, 119.5, 69.5], [38, 103, 122, 71], [40, 108.5, 127, 74],
  [42, 114.5, 132, 77], [44, 120, 137, 79.5], [46, 125.5, 142, 82.5],
]);

export const BRAND_CHARTS: BrandChart[] = [
  {
    brand: "Levi's", line: "men",
    source: "https://www.levi.com/IT/en/info/sizechart",
    // W, waist, seat, thigh
    sizes: rows([
      [24, 61, 77.5, 47], [25, 63.5, 80, 48.3], [26, 66, 82.5, 49.4],
      [27, 68.6, 85, 50.8], [28, 71.1, 87.5, 52], [29, 73.7, 90.2, 53.3],
      [30, 76.2, 92.7, 54.6], [31, 78.7, 95.3, 56], [32, 81.3, 97.8, 57.2],
      [33, 83.8, 100.3, 58.4], [34, 86.4, 103, 59.7], [35, 89, 105.5, 61],
      [36, 91.4, 108, 62.2], [38, 96.5, 113, 64], [40, 101.6, 118, 66.5],
      [42, 106.7, 123.2, 68.3], [44, 111.8, 128.3, 70.5], [46, 116.7, 133.5, 72.5],
      [48, 121.9, 138.5, 74.3], [50, 127, 143.5, 76.2], [52, 132, 148.6, 78],
      [54, 137.2, 153.7, 80], [56, 142.2, 158.8, 82], [58, 147.2, 163.8, 83.8],
      [60, 152.4, 169, 85.7],
    ]),
    lengths: inches([30, 32, 34, 36, 38]),
  },
  {
    brand: "Levi's", line: "women",
    source: "https://www.levi.com/IT/en/info/sizechart",
    // W, waist, hip — Levi's publishes no thigh for women
    sizes: rows([
      [24, 64, 86], [25, 66, 89], [26, 69, 91.5], [27, 72, 94], [28, 74, 96.5],
      [29, 77, 99], [30, 79, 101], [31, 83, 105], [32, 87, 109], [33, 90, 113],
      [34, 96, 118],
    ]),
    lengths: inches([28, 30, 32, 34]),
  },
  {
    brand: "Wrangler", line: "men",
    source: "https://eu.wrangler.com/it-it/size-charts.html",
    // W, natural waist, hip, thigh
    sizes: rows([
      [22, 57, 67.5, 42.5], [23, 59.5, 70.5, 44], [24, 62, 73.5, 45.5],
      [25, 65, 77, 47.5], [26, 67.5, 80, 49], [27, 70, 83, 50.5],
      [28, 72.5, 86.5, 52], [29, 75, 89, 53.5], [30, 77.5, 91.5, 55],
      [31, 80, 94, 57], [32, 82.5, 96.5, 58.5], [33, 85, 99, 59.5],
      [34, 87.5, 101.5, 60.5], [35, 91, 103.5, 61.5], [36, 94, 105.5, 62],
      [37, 97, 107.5, 63.5], [38, 100.5, 109, 65], [40, 105.5, 113, 66],
      [42, 111, 117, 67.5], [44, 116.5, 120.5, 68.5], [46, 122, 124.5, 70.5],
      [48, 127.5, 128.5, 72], [50, 132.5, 132.5, 73.5],
    ]),
    lengths: KONTOOR_LENGTHS,
  },
  {
    brand: "Wrangler", line: "women",
    source: "https://eu.wrangler.com/it-it/size-charts.html",
    sizes: KONTOOR_WOMEN,
    lengths: KONTOOR_LENGTHS,
  },
  {
    brand: "Lee", line: "men",
    source: "https://eu.lee.com/it-it/size-chart.html",
    // W, waist, hip — Lee publishes no thigh for men
    sizes: rows([
      [26, 66, 81.5], [27, 69, 84], [28, 71.5, 86.5], [29, 74, 89],
      [30, 76.5, 91.5], [31, 79, 94], [32, 81.5, 96.5], [33, 84, 99.5],
      [34, 86.5, 102], [36, 91.5, 107], [38, 96.5, 110.5], [40, 102, 114],
      [42, 107, 117.5], [44, 112, 121],
    ]),
    lengths: [
      { l: 30, inseam_cm: 76 }, { l: 32, inseam_cm: 81 },
      { l: 34, inseam_cm: 86.5 }, { l: 36, inseam_cm: 91.5 },
    ],
  },
  {
    brand: "Lee", line: "women",
    source: "https://eu.lee.com/it-it/size-charts.html",
    sizes: KONTOOR_WOMEN,
    lengths: KONTOOR_LENGTHS,
  },
];

export const BRANDS: BrandName[] = ["Levi's", "Wrangler", "Lee"];

export function chartFor(brand: BrandName, line: Line): BrandChart {
  const c = BRAND_CHARTS.find((c) => c.brand === brand && c.line === line);
  if (!c) throw new Error(`no chart for ${brand} ${line}`);
  return c;
}
