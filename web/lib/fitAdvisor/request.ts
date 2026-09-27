/**
 * What the browser sends the Fit Advisor: the pair, the three numbers a size
 * depends on, how far each can be trusted, and where they came from. Nothing
 * else leaves the page — no video, height, ticket or identifier.
 */
import type { Confidence, DigitalTwin, Product } from "../engine/types";

export const METHODS = ["video", "manual_entry", "wardrobe_anchor", "stub"] as const;

export interface AdvisorRequest {
  product_id: string;
  source: (typeof METHODS)[number];
  waist: number;
  hip: number;
  inseam: number;
  confidence: { waist: Confidence; hip: Confidence; inseam: Confidence };
}

export function advisorRequest(twin: DigitalTwin, product: Product): AdvisorRequest {
  const m = twin.measurements_cm;
  const c = twin.measurement_confidence;
  const source = METHODS.find((s) => s !== "video" && twin.processing_method.startsWith(s))
    ?? "video";
  return {
    product_id: product.id,
    source,
    waist: m.waist, hip: m.hip, inseam: m.inseam,
    confidence: { waist: c.waist, hip: c.hip, inseam: c.inseam },
  };
}

export interface AdvisorReply {
  explanation: string;
  steps: string[];
  /** True when the template stand-in wrote it, not a model. */
  demo: boolean;
}
