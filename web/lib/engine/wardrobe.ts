/**
 * The way in that needs no camera.
 *
 * Someone who cannot film — or will not — still knows which pair in their
 * wardrobe fits. Reading that backwards through the brand's own chart gives a
 * body estimate, and it carries something the video never will: how they like
 * jeans to sit. Two identical pairs of legs want different jeans.
 *
 * Real logic, not a stub. The charts in `../brands` list the body each size
 * is cut for, so that body is the best single estimate of the person inside it.
 */
import type { BrandChart } from "../brands";
import type { Confidence, DigitalTwin, MeasurementSite } from "./types";

export function twinFromOwnedPair(
  chart: BrandChart, w: number, l: number, heightCm: number,
): DigitalTwin | null {
  const size = chart.sizes.find((s) => s.w === w);
  const length = chart.lengths.find((x) => x.l === l);
  if (!size || !length) return null;

  const { waist_cm: waist, hip_cm: hip } = size;
  // The rest is inferred from seat and stature, which is weak — and labelled
  // as weak. The thigh is the exception when the brand publishes one.
  const k = heightCm / 174;
  const r = (n: number) => Math.round(n * 10) / 10;

  const measurements: Record<MeasurementSite, number> = {
    waist, hip,
    thigh: size.thigh_cm ?? r(hip * 0.575), knee: r(hip * 0.395),
    calf: r(hip * 0.385), ankle: r(hip * 0.232),
    inseam: length.inseam_cm, outseam: r(107 * k), rise: r(26 * k),
  };

  const label = `${chart.brand} W${w} L${l}`;
  const strong: Confidence = "medium";     // never "high": a size fits a range of bodies
  const weak: Confidence = "low";
  return {
    session_id: `wardrobe-${Date.now().toString(36)}`,
    height_cm: heightCm,
    measurements_cm: measurements,
    measurement_confidence: {
      waist: strong, hip: strong, inseam: strong,
      thigh: size.thigh_cm === undefined ? weak : strong,
      knee: weak, calf: weak, ankle: weak, outseam: weak, rise: weak,
    },
    measurement_notes: {
      waist: `read back from ${label}, which you said fits`,
      thigh: size.thigh_cm === undefined
        ? "inferred from your seat, not measured"
        : `from ${chart.brand}'s chart for W${w}`,
    },
    capture_quality: {
      head_visible: null, feet_visible: null, body_in_frame: null,
      usable_frames: 0, rotation_coverage: 0,
      frontal_yaw_deg: null, profile_yaw_deg: null,
    },
    processing_method: "wardrobe_anchor_v2",
    data_quality_tier: "C",
    created_at: new Date().toISOString(),
  };
}
