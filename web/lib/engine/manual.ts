/**
 * The way in for someone who already has a tape measure out.
 *
 * Only the three numbers the advisor decides on are asked for — waist and
 * seat pick the size, inseam picks the length. Everything else is inferred
 * from those and from stature, the same way the wardrobe path does it, and
 * labelled as inferred.
 *
 * Typed numbers are "medium", never "high": self-measurement is the textbook
 * source of a few centimetres of error, and nothing here can check it.
 */
import type { Confidence, DigitalTwin, MeasurementSite } from "./types";

export interface ManualInput {
  waist: number;
  hip: number;
  inseam: number;
}

/** Plausible adult ranges in cm. Outside them it is almost certainly a typo. */
export const MANUAL_RANGE: Record<keyof ManualInput, [number, number]> = {
  waist: [55, 150],
  hip: [70, 160],
  inseam: [60, 100],
};

export function manualIsValid(m: Partial<ManualInput>): m is ManualInput {
  return (Object.keys(MANUAL_RANGE) as (keyof ManualInput)[]).every((k) => {
    const v = m[k];
    const [lo, hi] = MANUAL_RANGE[k];
    return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  });
}

export function twinFromManual(input: ManualInput, heightCm: number): DigitalTwin {
  const { waist, hip, inseam } = input;
  const k = heightCm / 174;
  const r = (n: number) => Math.round(n * 10) / 10;

  const measurements: Record<MeasurementSite, number> = {
    waist, hip, inseam,
    thigh: r(hip * 0.575), knee: r(hip * 0.395),
    calf: r(hip * 0.385), ankle: r(hip * 0.232),
    outseam: r(107 * k), rise: r(26 * k),
  };

  const typed: Confidence = "medium";
  const weak: Confidence = "low";
  return {
    session_id: `manual-${Date.now().toString(36)}`,
    height_cm: heightCm,
    measurements_cm: measurements,
    measurement_confidence: {
      waist: typed, hip: typed, inseam: typed,
      thigh: weak, knee: weak, calf: weak, ankle: weak,
      outseam: weak, rise: weak,
    },
    measurement_notes: {
      waist: "typed in by you",
      thigh: "inferred from your seat, not measured",
    },
    capture_quality: {
      head_visible: null, feet_visible: null, body_in_frame: null,
      usable_frames: 0, rotation_coverage: 0,
      frontal_yaw_deg: null, profile_yaw_deg: null,
    },
    processing_method: "manual_entry_v1",
    data_quality_tier: "B",
    created_at: new Date().toISOString(),
  };
}
