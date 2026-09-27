/**
 * The check between the Fit Advisor and the customer.
 *
 * The advisor writes; this decides whether what it wrote may be shown. It is
 * deliberately dumb: no model, no judgement, only "did every number and every
 * size in this paragraph come out of a tool the advisor actually called". The
 * mockup calls it `cited_landmarks ⊆ engine.rationale`.
 *
 * A paragraph that fails is not repaired. It is dropped, and the screen keeps
 * the calculator's own fixed sentences.
 */

/** Everything the advisor was shown: the numbers and the size labels. */
export interface Evidence {
  numbers: Set<number>;
  labels: Set<string>;
}

export function emptyEvidence(): Evidence {
  return { numbers: new Set(), labels: new Set() };
}

const LABEL = /\bW(\d{2})(?:\s*L(\d{2}))?\b/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

/** Add every number and label found in a tool's output to the evidence. */
export function collect(ev: Evidence, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    ev.numbers.add(Math.abs(value));
  } else if (typeof value === "string") {
    for (const m of value.matchAll(LABEL)) ev.labels.add(`W${m[1]}`);
    for (const m of value.replace(LABEL, " ").matchAll(NUMBER)) {
      ev.numbers.add(Number(m[0].replace(",", ".")));
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collect(ev, v);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collect(ev, v);
  }
}

/** A stated number is supported if it is a shown number, or that number rounded. */
function supported(n: number, numbers: Set<number>): boolean {
  for (const k of numbers) {
    if (Math.abs(k - n) < 0.051) return true;
    if (Number.isInteger(n) && Math.round(k) === n) return true;
  }
  return false;
}

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

  const short = (label: string | null) => label?.split(" ")[0] ?? null;
  const size = short(engineSize);

  // The size is the calculator's, or none when it refused. A refusal may name
  // the nearest size — the engine does too — but never as the pick.
  if (short(draft.size_named) !== size) {
    return { ok: false, reason: `names ${draft.size_named} but the calculator chose ${engineSize}` };
  }
  if (size && !new RegExp(`\\b${size}\\b`).test(text)) {
    return { ok: false, reason: `does not name the chosen size ${size}` };
  }

  // Every size it mentions must be one it was shown.
  for (const m of text.matchAll(LABEL)) {
    const l = `W${m[1]}`;
    if (!ev.labels.has(l)) return { ok: false, reason: `mentions ${l}, which no tool returned` };
  }

  // Every other number must be one it was shown.
  for (const m of text.replace(LABEL, " ").matchAll(NUMBER)) {
    const n = Number(m[0].replace(",", "."));
    if (!supported(n, ev.numbers)) {
      return { ok: false, reason: `states ${m[0]}, which no tool returned` };
    }
  }
  return { ok: true };
}
