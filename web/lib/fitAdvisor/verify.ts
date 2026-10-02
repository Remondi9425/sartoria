/**
 * The check between the Fit Advisor and the customer.
 *
 * The advisor writes; this decides whether what it wrote may be shown. It is
 * deliberately dumb: no model, no judgement. It reads each clause of the
 * paragraph for the size it is about, the part of the body it is about, and
 * the numbers in it, and asks whether those numbers are that size's figures
 * for that part of the body, in that unit — not merely numbers that appeared
 * somewhere in a tool's output. "1 cm of room at the waist" passes only if
 * the waist has 1 cm of room; a 1 cm turn-up elsewhere does not count.
 *
 * It also checks the one direction a customer acts on: a leg that needs
 * turning up may not be described as running short, and the reverse.
 *
 * A paragraph that fails is not repaired. It is dropped, and the screen keeps
 * the calculator's own fixed sentences. The check errs on that side: a true
 * sentence it cannot place is rejected rather than waved through.
 */
import type { AreaVerdict } from "../engine/types";
import type { SizeFacts } from "./facts";

export type Area = "waist" | "seat" | "length";
type Quantity =
  | "range" | "yours" | "position" | "room" | "above"
  | "pair_inseam" | "difference" | "composition";

/** One figure a tool returned, with what it measures. */
interface Fact {
  /** The size it belongs to; null for the customer's own measurements. */
  size: string | null;
  area: Area | "pair";
  quantity: Quantity;
  unit: "cm" | "pct";
  value: number;
}

type LengthRead = "right length" | "turn up" | "runs short";

/** Everything the advisor was shown, as figures with their meaning. */
export interface Evidence {
  facts: Fact[];
  /** Size labels it may mention, as their waist: "W32". */
  labels: Set<string>;
  /** Leg lengths it may mention on their own: "L34". */
  lengths: Set<string>;
  /** Full labels it saw facts for: "W32 L32". */
  sized: Set<string>;
  /** How each size it saw reads, for the direction checks. */
  reads: Map<string, { waist: AreaVerdict; seat?: AreaVerdict; length?: LengthRead }>;
}

export function emptyEvidence(): Evidence {
  return { facts: [], labels: new Set(), lengths: new Set(), sized: new Set(), reads: new Map() };
}

const LABEL = /\bW(\d{2})(?:\s*L(\d{2}))?\b/g;
/** A size, or a length named on its own ("the L34"), in the order written. */
const MENTION = /\bW(\d{2})(?:\s*L(\d{2}))?\b|\bL(\d{2})\b/g;
const waistOf = (label: string) => label.split(" ")[0];

function addLabels(ev: Evidence, text: string): void {
  for (const m of text.matchAll(LABEL)) {
    ev.labels.add(`W${m[1]}`);
    if (m[2]) ev.lengths.add(`L${m[2]}`);
  }
}

function addFacts(ev: Evidence, f: SizeFacts): void {
  const push = (size: string | null, area: Fact["area"], quantity: Quantity,
                unit: Fact["unit"], value: number) =>
    ev.facts.push({ size, area, quantity, unit, value: Math.abs(value) });

  addLabels(ev, f.size);
  ev.sized.add(f.size);
  const reads: { waist: AreaVerdict; seat?: AreaVerdict; length?: LengthRead } =
    { waist: f.waist.reads };

  for (const [area, r] of [["waist", f.waist], ["seat", f.seat]] as const) {
    if ("unreliable" in r) continue;
    push(f.size, area, "range", "cm", r.size_range_cm[0]);
    push(f.size, area, "range", "cm", r.size_range_cm[1]);
    push(null, area, "yours", "cm", r.yours_cm);
    push(f.size, area, "position", "pct", r.position_pct);
    push(f.size, area, "room", "cm", r.room_to_top_cm);
    push(f.size, area, "above", "cm", r.above_bottom_cm);
    if (area === "seat") reads.seat = r.reads;
  }
  if (!("unreliable" in f.length)) {
    push(f.size, "length", "pair_inseam", "cm", f.length.pair_inseam_cm);
    push(null, "length", "yours", "cm", f.length.yours_cm);
    push(f.size, "length", "difference", "cm", f.length.difference_cm);
    reads.length = f.length.reads;
  }
  ev.reads.set(f.size, reads);
}

const isFacts = (v: object): v is SizeFacts => "size" in v && "waist" in v;

/**
 * Add what one tool returned. The tools are known, so their outputs are read
 * by shape: a size's facts, the engine's run (which carries the chosen size's
 * facts and the size it names), the pair's details (its composition and the
 * sizes it is cut in), and the measurement sources (no figures).
 */
export function collect(ev: Evidence, value: unknown): void {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (isFacts(v)) {
    addFacts(ev, v);
    return;
  }
  if ("refused_because" in v) {
    if (v.facts && typeof v.facts === "object") addFacts(ev, v.facts as SizeFacts);
    if (typeof v.alternative === "string") addLabels(ev, v.alternative);
    return;
  }
  if (typeof v.composition === "string") {
    for (const m of v.composition.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
      ev.facts.push({ size: null, area: "pair", quantity: "composition",
                      unit: "pct", value: Number(m[1].replace(",", ".")) });
    }
    if (Array.isArray(v.sizes)) for (const s of v.sizes) if (typeof s === "string") addLabels(ev, s);
  }
}

/**
 * A stated number is supported if it is a shown number, or that number rounded
 * to a whole centimetre. Either way: 2.5 may be written 2 or 3.
 */
function supported(n: number, values: number[]): boolean {
  return values.some((k) =>
    Math.abs(k - n) < 0.051 || (Number.isInteger(n) && Math.abs(k - n) <= 0.5));
}

const AREA_WORDS: [Area | "thigh", RegExp][] = [
  ["waist", /\bwaist(band)?\b/i],
  ["seat", /\b(seat|hips?|bottom|rear)\b/i],
  ["length", /\b(leg|legs|length|inseam|hem|turn(ed|ing|s)?[- ]up|short|long)\b/i],
  ["thigh", /\bthighs?\b/i],
];

/**
 * Words that pin a centimetre figure to one quantity. They are read next to
 * the figure — "1.5 cm of room", "runs short by 3.5 cm" — not anywhere in the
 * clause: "your 82 cm waist … with 1.5 cm of room" makes 1.5 the room, not 82.
 */
const ROOM_AFTER = /^\s*(cm\s*)?(of\s+)?(room|spare|left over|to spare|to grow)\b/i;
const ROOM_BEFORE = /\broom (of|for)\s*$/i;
const ABOVE_AFTER = /^\s*(cm\s*)?(above the bottom|from the bottom|into (the|its|that) (range|band))\b/i;
const HEM =
  /\b(turn(ed|ing|s)?[- ]up|too long|runs? long|comes? (up )?long|too short|runs? short|comes? (up )?short|longer|shorter|long by|short by|up by)\b/i;
const SAYS_SHORT = /\bshort(er)?\b/gi;
const SAYS_LONG = /\b(turn(ed|ing|s)?[- ]up|too long|runs? long|comes? (up )?long|longer)\b/gi;
const SAYS_LOOSE = /\b(loose|roomy|baggy)\b/gi;
const SAYS_TIGHT = /\b(tight|snug)\b/gi;
const NEGATION = /\b(no|not|nothing|never|without|nor)\b|n't\b/i;

/** Whether the clause says it, and does not say it is not: "there's no hem to
 *  turn up" does not say the leg needs turning up. */
function affirms(re: RegExp, clause: string): boolean {
  for (const m of clause.matchAll(re)) {
    if (!NEGATION.test(clause.slice(Math.max(0, m.index - 20), m.index))) return true;
  }
  return false;
}

/** A number, an optional second end of a range, and its unit. */
const NUMBER = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?))?\s*(cm\b|%|per ?cent\b)?/gi;

export interface Draft {
  explanation: string;
  size_named: string | null;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * @param engineSize the size the calculator chose (null when it refused)
 */
export function verify(draft: Draft, ev: Evidence, engineSize: string | null): Verdict {
  const text = draft.explanation.trim();
  if (!text) return { ok: false, reason: "empty explanation" };
  if (text.length > 700) return { ok: false, reason: "explanation too long" };

  const short = (label: string | null) => label ? waistOf(label) : null;
  const size = short(engineSize);

  // The size is the calculator's, or none when it refused. A refusal may name
  // the nearest size — the engine does too — but never as the pick.
  if (short(draft.size_named) !== size) {
    return { ok: false, reason: `names ${draft.size_named} but the calculator chose ${engineSize}` };
  }
  if (size && !new RegExp(`\\b${size}\\b`).test(text)) {
    return { ok: false, reason: `does not name the chosen size ${size}` };
  }

  // Every size and length it mentions must be one it was shown.
  for (const m of text.matchAll(MENTION)) {
    const l = m[3] ? `L${m[3]}` : `W${m[1]}`;
    if (!(m[3] ? ev.lengths : ev.labels).has(l)) {
      return { ok: false, reason: `mentions ${l}, which no tool returned` };
    }
  }

  // Which sizes a mention means: the exact one when the length is given; the
  // chosen size when it shares the waist; otherwise every length it saw.
  const resolve = (w: string, l: string | undefined): string[] => {
    if (l) return [`W${w} L${l}`];
    if (engineSize && waistOf(engineSize) === `W${w}`) return [engineSize];
    return [...ev.sized].filter((s) => waistOf(s) === `W${w}`);
  };
  // A length on its own means that length in the waist being talked about.
  const resolveLength = (l: string, about: string[]): string[] => {
    const w = about[0] ? waistOf(about[0]) : engineSize ? waistOf(engineSize) : null;
    return [...ev.sized].filter((s) => s.endsWith(` L${l}`) && (!w || waistOf(s) === w));
  };

  for (const sentence of text.split(/(?<=[.!?;:])\s+/)) {
    // A sentence is about the chosen size until it names another.
    let about: string[] = engineSize ? [engineSize] : [];
    for (const clause of sentence.split(/,\s+|\s+[—–-]\s+|\s+(?:but|though|although|while|so)\s+/i)) {
      for (const m of clause.matchAll(MENTION)) {
        about = m[3] ? resolveLength(m[3], about) : resolve(m[1], m[2]);
      }

      const areas = AREA_WORDS.filter(([, re]) => re.test(clause)).map(([a]) => a);
      const bare = clause.replace(MENTION, " ");

      const numbers = [...bare.matchAll(NUMBER)];
      const endOf = (m: RegExpExecArray) => m.index + m[0].length;
      for (const [i, m] of numbers.entries()) {
        // The words between this figure and its neighbours say what it is.
        const after = bare.slice(endOf(m), numbers[i + 1]?.index ?? bare.length).slice(0, 30);
        const before = bare.slice(i > 0 ? endOf(numbers[i - 1]) : 0, m.index).slice(-20);
        const unit = m[3] ? (m[3] === "%" || /per/i.test(m[3]) ? "pct" : "cm") : null;
        const quantity: Quantity | null =
          unit === "pct" ? null
          : areas.includes("length") && (HEM.test(after) || HEM.test(before)) ? "difference"
          : ROOM_AFTER.test(after) || ROOM_BEFORE.test(before) ? "room"
          : ABOVE_AFTER.test(after) ? "above"
          : null;
        const pool = ev.facts.filter((f) =>
          (f.size === null || about.includes(f.size)) &&
          (!unit || f.unit === unit) &&
          (f.area === "pair" ? unit === "pct"
           : areas.length === 0 || areas.includes(f.area)) &&
          (!quantity || f.quantity === quantity));
        const values = pool.map((f) => f.value);
        for (const n of [m[1], m[2]]) {
          if (n === undefined) continue;
          if (!supported(Number(n.replace(",", ".")), values)) {
            return { ok: false, reason: `states ${n}${m[3] ? " " + m[3] : ""} where no tool returned it` };
          }
        }
      }

      // The directions a customer acts on must match the calculator's.
      for (const s of about) {
        const reads = ev.reads.get(s);
        if (!reads) continue;
        if (areas.includes("length") && reads.length === "turn up" && affirms(SAYS_SHORT, clause)) {
          return { ok: false, reason: `says ${s} runs short; it needs turning up` };
        }
        if (areas.includes("length") && reads.length === "runs short" && affirms(SAYS_LONG, clause)) {
          return { ok: false, reason: `says ${s} needs turning up; it runs short` };
        }
        for (const area of ["waist", "seat"] as const) {
          if (areas.length !== 1 || areas[0] !== area) continue;
          const v = reads[area];
          if (v === "snug" && affirms(SAYS_LOOSE, clause)) {
            return { ok: false, reason: `calls the ${area} of ${s} loose; it reads snug` };
          }
          if (v === "roomy" && affirms(SAYS_TIGHT, clause)) {
            return { ok: false, reason: `calls the ${area} of ${s} tight; it reads roomy` };
          }
        }
      }
    }
  }
  return { ok: true };
}
