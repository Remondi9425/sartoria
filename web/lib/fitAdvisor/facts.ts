/**
 * What the Fit Advisor is allowed to know, as numbers.
 *
 * Every fact here is computed by the same arithmetic the size calculator uses
 * — the helpers are imported from it, not re-derived — so an explanation built
 * from these facts cannot describe a different pair from the one on screen.
 * The advisor's tools return nothing else, and the verifier accepts no number
 * that did not come out of one of them.
 *
 * A measurement read with low confidence produces no facts at all, only a flag
 * saying so. The advisor cannot state as fact what we did not measure.
 */
import {
  HEM_TOLERANCE_CM, THIGH_HINT_BAND, position, sizeCalculator, toBodyRange, verdictFor,
} from "../engine/advisor";
import type { AreaVerdict, Confidence, DigitalTwin, Product } from "../engine/types";

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface RangeFact {
  size_range_cm: [number, number];
  yours_cm: number;
  /** 0 at the bottom of the size's range, 100 at the top. */
  position_pct: number;
  room_to_top_cm: number;
  above_bottom_cm: number;
  reads: AreaVerdict;
}

export type Unreliable = { unreliable: true; why: string };

export interface SizeFacts {
  size: string;
  waist: RangeFact;
  seat: RangeFact | Unreliable;
  length: {
    pair_inseam_cm: number;
    yours_cm: number;
    /** Positive: length to turn up. Negative: runs short. */
    difference_cm: number;
    reads: "right length" | "turn up" | "runs short";
  } | Unreliable;
  /** Only ever "snug", and only on narrow cuts: no chart publishes a thigh. */
  thigh_hint: "snug" | null;
}

function rangeFact(value: number, range: [number, number]): RangeFact {
  const p = position(value, range);
  return {
    size_range_cm: [r1(range[0]), r1(range[1])],
    yours_cm: r1(value),
    position_pct: Math.round(p * 100),
    room_to_top_cm: r1(range[1] - value),
    above_bottom_cm: r1(value - range[0]),
    reads: verdictFor(p),
  };
}

/** The labels a pair is cut in, e.g. "W31 L32". */
export function labelsOf(product: Product): string[] {
  return product.chart.rows.map((r) => r.label);
}

/** How one size of this pair would sit on this body. Null for an unknown label. */
export function factsForSize(twin: DigitalTwin, product: Product, label: string): SizeFacts | null {
  const raw = product.chart.rows.find((r) => r.label === label);
  if (!raw) return null;
  const row = toBodyRange(raw, product.chart);
  const m = twin.measurements_cm;
  const c = twin.measurement_confidence;

  const seat: SizeFacts["seat"] = c.hip === "low"
    ? { unreliable: true, why: "your seat was not measured well enough to describe" }
    : rangeFact(m.hip, row.hip_cm);

  const spare = row.inseam_cm - m.inseam;
  const length: SizeFacts["length"] = c.inseam === "low"
    ? { unreliable: true, why: "your inseam was not measured well enough to talk about length" }
    : {
        pair_inseam_cm: r1(row.inseam_cm),
        yours_cm: r1(m.inseam),
        difference_cm: r1(spare),
        reads: Math.abs(spare) < HEM_TOLERANCE_CM ? "right length"
             : spare > 0 ? "turn up" : "runs short",
      };

  const narrow = product.fit === "slim" || product.fit === "tapered";
  const thigh_hint = narrow && c.hip !== "low" && position(m.hip, row.hip_cm) >= THIGH_HINT_BAND
    ? "snug" : null;

  return { size: raw.label, waist: rangeFact(m.waist, row.waist_cm), seat, length, thigh_hint };
}

/** Where the numbers came from, in words the advisor may repeat. */
export function sourceOf(twin: DigitalTwin): "video" | "typed in by you" | "read back from a pair you own" | "invented demo numbers" {
  const p = twin.processing_method;
  if (p.startsWith("manual_entry")) return "typed in by you";
  if (p.startsWith("wardrobe_anchor")) return "read back from a pair you own";
  if (p.startsWith("stub")) return "invented demo numbers";
  return "video";
}

export interface EngineRun {
  size: string | null;
  headline: string;
  /** The neighbouring size the engine names, or the nearest one when it refuses. */
  alternative: string | null;
  size_confidence: Confidence;
  length_confidence: Confidence;
  decided_by: "waist";
  facts: SizeFacts | null;
  refused_because: string | null;
}

/** The size calculator's answer, with the numbers behind it. */
export function runEngine(twin: DigitalTwin, product: Product): EngineRun {
  const fit = sizeCalculator.recommend(twin, product);
  return {
    size: fit.size,
    headline: fit.headline,
    alternative: fit.alternative,
    size_confidence: fit.confidence,
    length_confidence: fit.length_confidence,
    decided_by: "waist",
    facts: fit.size ? factsForSize(twin, product, fit.size) : null,
    refused_because: fit.size ? null : fit.headline,
  };
}

/** The pair itself: what the explanation may say about its cut and cloth. */
export function pairDetails(product: Product) {
  return {
    brand: product.brand,
    name: product.name,
    cut: product.fit,
    rise: product.rise,
    fly: product.fly,
    composition: product.composition,
    stretch: /elastane/i.test(product.composition),
    chart: product.chart.kind === "body"
      ? "body chart: sizes list the body they fit"
      : "garment-flat chart: ease is added back before comparing",
    sizes: labelsOf(product),
  };
}

/** How each measurement was obtained and how far it can be trusted. */
export function measurementSources(twin: DigitalTwin) {
  const c = twin.measurement_confidence;
  return {
    source: sourceOf(twin),
    confidence: { waist: c.waist, seat: c.hip, inseam: c.inseam, thigh: c.thigh },
  };
}
