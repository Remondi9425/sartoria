/**
 * What comes back over the wire is checked, not assumed.
 *
 * A TypeScript cast is a promise about a value, made at compile time, about
 * data that arrives at run time. `body as DigitalTwin` let an incomplete or
 * malformed response through to the size calculator, which would then pick a
 * size from whatever it found — or from nothing.
 *
 * The plausible ranges are the same envelope the worker uses (spike/config.py).
 * Duplicated deliberately: a client that trusts the server to have checked is
 * a client that breaks silently when the server changes.
 */
import type {
  CaptureQuality, Confidence, DigitalTwin, MeasurementSite, QualityTier,
} from "./types";

export const SITES: MeasurementSite[] = [
  "waist", "hip", "thigh", "knee", "calf", "ankle",
  "inseam", "outseam", "rise",
];

const PLAUSIBLE: Record<MeasurementSite, [number, number]> = {
  waist: [55, 160], hip: [70, 170], thigh: [35, 95], knee: [28, 60],
  calf: [25, 60], ankle: [16, 38], inseam: [55, 105],
  outseam: [80, 135], rise: [18, 42],
};

const CONFIDENCES: Confidence[] = ["high", "medium", "low"];
const TIERS: QualityTier[] = ["A", "B", "C"];

export class ContractError extends Error {}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ContractError(`${what} is not an object`);
  }
  return v as Record<string, unknown>;
}

function quality(v: unknown): CaptureQuality {
  const q = obj(v, "capture_quality");
  const tri = (k: string) => {
    const x = q[k];
    if (x !== true && x !== false && x !== null) {
      throw new ContractError(`capture_quality.${k} is ${JSON.stringify(x)}`);
    }
    return x;
  };
  const num = (k: string) => {
    const x = q[k];
    if (typeof x !== "number" || !Number.isFinite(x)) {
      throw new ContractError(`capture_quality.${k} is not a number`);
    }
    return x;
  };
  const numOrNull = (k: string) => {
    const x = q[k];
    if (x === null) return null;
    if (typeof x !== "number" || !Number.isFinite(x)) {
      throw new ContractError(`capture_quality.${k} is not a number or null`);
    }
    return x;
  };
  return {
    head_visible: tri("head_visible"),
    feet_visible: tri("feet_visible"),
    body_in_frame: tri("body_in_frame"),
    usable_frames: num("usable_frames"),
    rotation_coverage: num("rotation_coverage"),
    frontal_yaw_deg: numOrNull("frontal_yaw_deg"),
    profile_yaw_deg: numOrNull("profile_yaw_deg"),
  };
}

/** Throws ContractError rather than returning something half-built. */
export function parseTwin(body: unknown): DigitalTwin {
  const b = obj(body, "response");

  // Checked first and on its own. Validating the measurements and inferring
  // success from their presence is not the same thing: a complete body
  // carrying status "error" would have been read as a measurement.
  if (b.status !== "ok") {
    throw new ContractError(`status is ${JSON.stringify(b.status)}, not "ok"`);
  }
  const m = obj(b.measurements_cm, "measurements_cm");
  const c = obj(b.measurement_confidence, "measurement_confidence");

  const measurements = {} as Record<MeasurementSite, number>;
  const confidence = {} as Record<MeasurementSite, Confidence>;

  for (const site of SITES) {
    const value = m[site];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ContractError(`${site} is missing or not a finite number`);
    }
    const [lo, hi] = PLAUSIBLE[site];
    if (value < lo || value > hi) {
      throw new ContractError(`${site} is ${value} cm, outside ${lo}–${hi}`);
    }
    measurements[site] = value;

    const conf = c[site];
    if (!CONFIDENCES.includes(conf as Confidence)) {
      throw new ContractError(`${site} confidence is ${JSON.stringify(conf)}`);
    }
    confidence[site] = conf as Confidence;
  }

  const tier = b.data_quality_tier;
  if (!TIERS.includes(tier as QualityTier)) {
    throw new ContractError(`data_quality_tier is ${JSON.stringify(tier)}`);
  }
  if (typeof b.height_cm !== "number" || !Number.isFinite(b.height_cm)) {
    throw new ContractError("height_cm is missing or not a number");
  }

  return {
    session_id: String(b.session_id ?? ""),
    height_cm: b.height_cm,
    measurements_cm: measurements,
    measurement_confidence: confidence,
    measurement_notes: (b.measurement_notes as DigitalTwin["measurement_notes"]) ?? {},
    capture_quality: quality(b.capture_quality),
    processing_method: String(b.processing_method ?? "unknown"),
    data_quality_tier: tier as QualityTier,
    created_at: String(b.created_at ?? ""),
  };
}


/**
 * A refusal, checked like anything else that crosses the wire.
 *
 * It reaches a screen that shows the reason to a person and reads
 * capture_quality into a checklist, so "whatever arrived, cast" was the same
 * mistake here as it was for the twin — just quieter, because a refusal is
 * already bad news and nobody looks twice.
 */
export function parseRejection(body: unknown): {
  reason: string; all_reasons: string[]; coaching: string[];
  capture_quality: CaptureQuality;
} {
  const b = obj(body, "refusal");
  if (b.status !== "capture_rejected") {
    throw new ContractError(`status is ${JSON.stringify(b.status)}`);
  }
  const reason = b.reason;
  if (typeof reason !== "string" || !reason.trim()) {
    throw new ContractError("a refusal with no reason is not a refusal");
  }
  const strings = (v: unknown, what: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      throw new ContractError(`${what} is not a list of strings`);
    }
    return v as string[];
  };
  return {
    reason,
    all_reasons: strings(b.all_reasons, "all_reasons").length
      ? strings(b.all_reasons, "all_reasons") : [reason],
    coaching: strings(b.coaching, "coaching"),
    capture_quality: quality(b.capture_quality),
  };
}
