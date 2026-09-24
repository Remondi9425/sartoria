/**
 * Needs, and what they are allowed to do.
 *
 * The size calculator answers "will these fit". This answers "which of the
 * ones that fit suit how you wear jeans", which is a different question and a
 * smaller one: it only ever reorders. It cannot promote a pair that does not
 * fit, and it cannot demote one out of sight — a customer who asked for a size
 * gets the sizes, in an order that matches the fitting ticket.
 *
 * Real arithmetic, not a stub, and deliberately never an LLM: the same ticket
 * gives the same order every time, and every step of it is explicable to the
 * person it is about. The tailor's chat may *name* a need from typed words;
 * it never scores one. A need it could not map to a known id is kept as a
 * note on the ticket and has no effect on the order.
 *
 * This is not profiling in the sense the regulation worries about. Nothing is
 * inferred from behaviour, nothing is tracked across sites, and nothing is
 * decided about the customer — they state a need and the shelf is arranged to
 * match. See PRIVACY.md.
 */
import type { Product } from "./engine/types";

export type Fit = Product["fit"];

/** How close each cut sits, from nearest the leg to furthest. Ordered rather
 *  than merely named, so "close" and "easy" can lean without being binary. */
export const CLOSENESS: Record<Fit, number> = {
  slim: 0, tapered: 1, straight: 2, relaxed: 3,
};

/** The needs the ranking knows how to read. Anything else is a note. */
export type NeedId =
  | "cycling" | "travel" | "office" | "close" | "easy" | "thighs" | "gap"
  | "short" | "seated" | "wheelchair" | "closures" | "nostretch" | "soft"
  | "tagless";

export interface Need {
  /** A known NeedId, or `note-…` for something typed that maps to none. */
  id: NeedId | `note-${string}`;
  /** What the ticket says, in the customer's terms. */
  label: string;
}

/** Stretch is read off the label rather than stored twice. */
export function hasStretch(p: Product): boolean {
  return /elastane/i.test(p.composition);
}

/** The longest leg the pair is cut in, in centimetres. */
export function inseamOf(p: Product): number {
  return Math.max(...p.chart.rows.map((r) => r.inseam_cm));
}

export interface Scored {
  score: number;
  /** Why it moved up, in words the customer can check against the pair. */
  reasons: string[];
}

/**
 * How well one pair answers the ticket, with the reasons.
 *
 * Exported because a score a customer cannot see is a score nobody can argue
 * with; the ledger shows the reasons rather than the number.
 */
export function scoreNeeds(p: Product, needs: Need[]): Scored {
  let score = 0;
  const reasons: string[] = [];
  const add = (v: number, why: string | null) => {
    score += v;
    if (why && v > 0 && !reasons.includes(why)) reasons.push(why);
  };
  const stretch = hasStretch(p);
  const high = p.rise === "high";
  const close = CLOSENESS[p.fit];

  for (const n of needs) {
    switch (n.id) {
      case "cycling":
        add(stretch ? 1 : 0, "Stretch");
        add(high ? 1 : 0, "High back rise");
        break;
      case "travel":
        add(stretch ? 1 : 0, "Stretch");
        break;
      case "office":
        add(p.colours.some((c) => c.id === "dark") ? 1 : 0, "Comes in dark rinse");
        add(p.fit === "slim" || p.fit === "straight" ? 0.5 : 0, "Clean cut");
        break;
      case "close":
        add(1 - close / 3, close <= 1 ? "Closer cut" : null);
        break;
      case "easy":
        add(close / 3, close >= 2 ? "Easier cut" : null);
        break;
      case "thighs":
        add(p.fit === "relaxed" || p.fit === "tapered" ? 1 : 0, "Room at the thigh");
        break;
      case "gap":
        add(stretch ? 0.5 : 0, "Stretch");
        add(high ? 0.5 : 0, "Higher rise");
        break;
      case "short": {
        const inseam = inseamOf(p);
        add(inseam >= 82 ? 1 : 0, `Longer leg (${inseam} cm)`);
        break;
      }
      case "seated":
        add(high ? 1 : 0, "High back rise");
        add(stretch ? 0.5 : 0, "Stretch");
        break;
      case "wheelchair":
        add(high ? 1 : 0, "High back rise");
        add(stretch ? 1 : 0, "Stretch");
        add(p.fly === "zip" ? 0.5 : 0, "Zip fly");
        break;
      case "closures":
        add(p.fly === "zip" ? 1 : -0.5, "Zip fly");
        break;
      case "nostretch":
        add(stretch ? -1 : 1, "Rigid denim");
        break;
      case "soft":
        add(p.soft ? 1 : 0, "Soft hand");
        break;
      case "tagless":
        add(p.tagless ? 1 : 0, "Printed label");
        break;
      default:
        // A note: on the ticket, and nowhere in the arithmetic.
        break;
    }
  }
  return { score, reasons };
}

/**
 * The same jeans, in the order the ticket asks for, each with its reasons.
 *
 * Stable: equal scores keep the catalogue's own order, so an empty ticket — or
 * one made only of notes — leaves the rail exactly as it was.
 */
export function rankByNeeds<T extends Product>(
  products: T[], needs: Need[],
): (Scored & { product: T })[] {
  return products
    .map((product, i) => ({ product, i, ...scoreNeeds(product, needs) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map(({ product, score, reasons }) => ({ product, score, reasons }));
}
