/**
 * The catalogue.
 *
 * Every brand here is invented — Marea, Fosco, Vela, Nebbia do not exist. Using
 * a real denim label's name, charts and prices in a demo would misrepresent a
 * real company, so the whole catalogue is fictional and says so.
 *
 * Real brands appear in one place only: `brands.ts`, the published size
 * charts used to read back a pair the customer already owns. Nothing is sold
 * under their names.
 *
 * The size charts are realistic in shape, not copied from anyone. So are the
 * construction details — rise, fly, hand, label — which exist only so the
 * fitting ticket has something true-to-this-catalogue to reorder by. When the
 * Catalog Ingestor is real it will replace this file wholesale.
 *
 * Between them the pairs cover waists from W23 to W56 (about 57 to 144 cm of
 * body) and legs from L26 to L38, as a real shop's range would. Each pair is
 * cut in its own span of those, so a body at either end is sized by some
 * pairs and honestly refused by others.
 */
import type { Product, SizeChart, SizeRow } from "./engine/types";

/** W and L count inches. */
const INCH = 2.54;
/** Chart edges are published to the half centimetre. */
const half = (n: number) => Math.round(n * 2) / 2;

interface Cut {
  /** The waist sizes it is cut in, inclusive: [28, 44] is W28 to W44. */
  waists: [number, number];
  /** The leg lengths it is cut in, in inches: [30, 32, 34] is L30, L32, L34. */
  lengths: number[];
  /** How far this brand's W sits above a true inch, in cm. Positive is vanity
   *  sizing: the label says less than the body it fits. */
  vanity_cm: number;
  /** How much fuller the seat is cut than the waist, in cm. A relaxed cut or a
   *  curvier block has more; a cut for a fuller waist has less. */
  seat_cm: number;
}

/** Where a waist size starts on the body, in cm. W32 starts at 31.5 inches. */
function edge(w: number, cut: Cut): number {
  return half((w - 0.5) * INCH + cut.vanity_cm);
}

/** Every waist in every length, as the body each row is meant to fit. */
function rowsFor(cut: Cut): SizeRow[] {
  const rows: SizeRow[] = [];
  for (let w = cut.waists[0]; w <= cut.waists[1]; w++) {
    const lo = edge(w, cut), hi = edge(w + 1, cut);
    for (const l of cut.lengths) {
      rows.push({
        label: `W${w} L${l}`,
        waist_cm: [lo, hi],
        hip_cm: [lo + cut.seat_cm, hi + cut.seat_cm],
        inseam_cm: half(l * INCH),
      });
    }
  }
  return rows;
}

/** A body chart: the sizes list the body they are meant to fit. */
function bodyChart(cut: Cut): SizeChart {
  return { kind: "body", ease_cm: { waist: 0, hip: 0 }, rows: rowsFor(cut) };
}

/** A flat chart: the sizes list the garment measured flat, so ease matters. */
function flatChart(cut: Cut): SizeChart {
  const ease = { waist: -2, hip: -3 };
  return {
    kind: "flat",
    ease_cm: ease,
    rows: rowsFor(cut).map((r) => ({
      ...r,
      waist_cm: [r.waist_cm[0] - ease.waist, r.waist_cm[1] - ease.waist],
      hip_cm: [r.hip_cm[0] - ease.hip, r.hip_cm[1] - ease.hip],
    })),
  };
}

const INDIGO = { id: "mid", name: "Mid indigo", hex: "#5B86C4", denim: "#5B86C4" };
const LIGHT = { id: "light", name: "Light wash", hex: "#A8C4E4", denim: "#A8C4E4" };
const DARK = { id: "dark", name: "Dark rinse", hex: "#25365C", denim: "#25365C" };
const BLACK = { id: "black", name: "Washed black", hex: "#23262E", denim: "#23262E" };

export const PRODUCTS: Product[] = [
  {
    id: "marea-slim-tapered",
    brand: "Marea Denim", name: "Slim Tapered", fit: "tapered",
    price_eur: 129, composition: "98% cotton · 2% elastane",
    rise: "mid", fly: "zip", soft: false, tagless: true,
    colours: [INDIGO, LIGHT, DARK, BLACK],
    chart: bodyChart({ waists: [26, 40], lengths: [30, 32, 34], vanity_cm: 1, seat_cm: 17 }),
  },
  {
    id: "fosco-regular-straight",
    brand: "Fosco", name: "Regular Straight", fit: "straight",
    price_eur: 119, composition: "100% cotton",
    rise: "mid", fly: "button", soft: false, tagless: false,
    colours: [LIGHT, INDIGO, DARK],
    chart: flatChart({ waists: [28, 46], lengths: [30, 32, 34, 36], vanity_cm: 0, seat_cm: 18 }),
  },
  {
    id: "marea-relaxed-carpenter",
    brand: "Marea Denim", name: "Relaxed Carpenter", fit: "relaxed",
    price_eur: 139, composition: "100% cotton",
    rise: "high", fly: "zip", soft: true, tagless: true,
    colours: [DARK, INDIGO],
    chart: bodyChart({ waists: [28, 48], lengths: [30, 32, 34], vanity_cm: 1, seat_cm: 21 }),
  },
  {
    id: "vela-tapered-crop",
    brand: "Vela", name: "Tapered Crop", fit: "tapered",
    price_eur: 109, composition: "97% cotton · 3% elastane",
    rise: "mid", fly: "zip", soft: false, tagless: false,
    colours: [BLACK, INDIGO, LIGHT],
    chart: bodyChart({ waists: [24, 38], lengths: [26, 28], vanity_cm: -1, seat_cm: 17 }),
  },
  {
    id: "nebbia-slim-stretch",
    brand: "Nebbia", name: "Slim Stretch", fit: "slim",
    price_eur: 99, composition: "94% cotton · 5% polyester · 1% elastane",
    rise: "low", fly: "zip", soft: true, tagless: true,
    colours: [INDIGO, DARK],
    chart: flatChart({ waists: [26, 38], lengths: [30, 32, 34], vanity_cm: 2, seat_cm: 15 }),
  },
  {
    id: "fosco-loose-taper",
    brand: "Fosco", name: "Loose Taper", fit: "relaxed",
    price_eur: 129, composition: "100% cotton",
    rise: "high", fly: "zip", soft: true, tagless: false,
    colours: [LIGHT, BLACK],
    chart: bodyChart({ waists: [28, 50], lengths: [30, 32, 34], vanity_cm: 0.5, seat_cm: 21 }),
  },
  {
    id: "vela-straight-rigid",
    brand: "Vela", name: "Straight Rigid", fit: "straight",
    price_eur: 149, composition: "100% cotton, unwashed",
    rise: "high", fly: "button", soft: false, tagless: false,
    colours: [DARK, INDIGO],
    chart: bodyChart({ waists: [27, 42], lengths: [30, 32, 34, 36], vanity_cm: -1.5, seat_cm: 18 }),
  },
  {
    id: "nebbia-easy-straight",
    brand: "Nebbia", name: "Easy Straight", fit: "straight",
    price_eur: 89, composition: "99% cotton · 1% elastane",
    rise: "mid", fly: "zip", soft: true, tagless: true,
    colours: [INDIGO, LIGHT, BLACK],
    chart: flatChart({ waists: [28, 52], lengths: [28, 30, 32, 34], vanity_cm: 2, seat_cm: 19 }),
  },
  {
    id: "marea-high-straight",
    brand: "Marea Denim", name: "High Straight", fit: "straight",
    price_eur: 125, composition: "99% cotton · 1% elastane",
    rise: "high", fly: "button", soft: false, tagless: true,
    colours: [LIGHT, INDIGO, BLACK],
    chart: bodyChart({ waists: [23, 36], lengths: [28, 30, 32], vanity_cm: 1, seat_cm: 20 }),
  },
  {
    id: "vela-high-skinny",
    brand: "Vela", name: "High Skinny", fit: "slim",
    price_eur: 95, composition: "92% cotton · 6% polyester · 2% elastane",
    rise: "high", fly: "zip", soft: true, tagless: true,
    colours: [BLACK, DARK, INDIGO],
    chart: bodyChart({ waists: [23, 36], lengths: [28, 30, 32], vanity_cm: 0, seat_cm: 21 }),
  },
  {
    id: "fosco-comfort-straight",
    brand: "Fosco", name: "Comfort Straight", fit: "straight",
    price_eur: 115, composition: "98% cotton · 2% elastane",
    rise: "high", fly: "zip", soft: true, tagless: false,
    colours: [INDIGO, DARK, BLACK],
    chart: bodyChart({ waists: [32, 56], lengths: [28, 30, 32, 34], vanity_cm: 0, seat_cm: 16 }),
  },
  {
    id: "fosco-slim-rigid",
    brand: "Fosco", name: "Slim Rigid", fit: "slim",
    price_eur: 135, composition: "100% cotton",
    rise: "mid", fly: "button", soft: false, tagless: false,
    colours: [DARK, BLACK],
    chart: flatChart({ waists: [27, 40], lengths: [30, 32, 34, 36], vanity_cm: -1, seat_cm: 15 }),
  },
  {
    id: "vela-relaxed-plus",
    brand: "Vela", name: "Relaxed Plus", fit: "relaxed",
    price_eur: 119, composition: "99% cotton · 1% elastane",
    rise: "high", fly: "zip", soft: true, tagless: true,
    colours: [INDIGO, DARK],
    chart: bodyChart({ waists: [34, 56], lengths: [28, 30, 32, 34], vanity_cm: 1, seat_cm: 17 }),
  },
  {
    id: "nebbia-work-tapered",
    brand: "Nebbia", name: "Work Tapered", fit: "tapered",
    price_eur: 105, composition: "100% cotton",
    rise: "mid", fly: "zip", soft: false, tagless: false,
    colours: [DARK, BLACK, INDIGO],
    chart: flatChart({ waists: [28, 44], lengths: [30, 32, 34], vanity_cm: 0, seat_cm: 18 }),
  },
  {
    id: "marea-wide-leg",
    brand: "Marea Denim", name: "Wide Leg", fit: "relaxed",
    price_eur: 145, composition: "100% cotton",
    rise: "high", fly: "button", soft: true, tagless: false,
    colours: [LIGHT, INDIGO],
    chart: bodyChart({ waists: [24, 40], lengths: [28, 30, 32, 34], vanity_cm: 1.5, seat_cm: 22 }),
  },
  {
    id: "nebbia-tall-straight",
    brand: "Nebbia", name: "Tall Straight", fit: "straight",
    price_eur: 109, composition: "99% cotton · 1% elastane",
    rise: "mid", fly: "zip", soft: true, tagless: true,
    colours: [INDIGO, DARK],
    chart: bodyChart({ waists: [28, 44], lengths: [34, 36, 38], vanity_cm: 2, seat_cm: 18 }),
  },
];

export const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand))];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
