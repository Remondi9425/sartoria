/**
 * The tailor's five questions, and what each tapped answer puts on the ticket.
 *
 * Written copy, not generated: a tapped answer never leaves the browser and
 * never touches a model. Only a typed answer does — see `app/api/tailor`.
 */
import type { DigitalTwin } from "./engine/types";
import type { NeedId } from "./preferences";

export type QuestionKey = "use" | "sit" | "body" | "day" | "feel";

export interface Chip {
  /** What the customer taps. */
  label: string;
  /** The need it records, or null for "no preference". */
  need: { id: NeedId; label: string } | null;
  /** What the tailor says back. `{thigh}` and `{inseam}` are filled in. */
  ack: string;
}

export interface Question {
  key: QuestionKey;
  /** The row on the fitting ticket. */
  ticket: string;
  q: string;
  chips: Chip[];
}

const chip = (label: string, id: NeedId | null, needLabel: string | null, ack: string): Chip =>
  ({ label, need: id && needLabel ? { id, label: needLabel } : null, ack });

export const QUESTIONS: Question[] = [
  { key: "use", ticket: "For", q: "What will you mostly wear them for?", chips: [
    chip("Everyday", null, null, "Everyday it is. Comfort over a long day matters most, then."),
    chip("Office", "office", "Office", "For the office I will lean towards darker washes and cleaner cuts."),
    chip("Cycling", "cycling", "Cycling", "Cycling changes things: stretch and a higher back rise matter more than the look."),
    chip("Travel", "travel", "Travel", "For travel, some stretch helps on long journeys."),
  ] },
  { key: "sit", ticket: "Sit", q: "How do you like jeans to sit on you?", chips: [
    chip("Close to the leg", "close", "Close fit", "Close it is. Your size stays the same; slimmer cuts go first."),
    chip("As the chart intends", null, null, "Good. I will not push you towards any cut."),
    chip("With room to move", "easy", "Room to move", "Room to move. Same size, easier cuts first."),
  ] },
  { key: "body", ticket: "Build", q: "Is there anything jeans usually get wrong on you?", chips: [
    chip("Tight across the thighs", "thighs", "Room at the thigh", "That matches your numbers: a {thigh} cm thigh. Cuts with room there go first."),
    chip("Gap at the back of the waist", "gap", "No waist gap", "A gap at the back usually means the seat fits and the waist does not. Stretch and a higher rise help."),
    chip("Always too short", "short", "Longer leg", "Your inseam came out at {inseam} cm. I will favour the longer lengths."),
    chip("Nothing in particular", null, null, "Good to hear."),
  ] },
  { key: "day", ticket: "Day", q: "Do you spend most of the day seated, or need easier closures?", chips: [
    chip("Seated most of the day", "seated", "Seated all day", "Seated all day: a higher back rise will stop the waistband digging in."),
    chip("I use a wheelchair", "wheelchair", "Wheelchair user", "Thank you. I will favour a high back rise, stretch and a zip fly."),
    chip("Easier closures", "closures", "Easy closures", "Zip flies first, then. Button flies go further down."),
    chip("Neither", null, null, "Noted."),
  ] },
  { key: "feel", ticket: "Fabric", q: "Any fabrics or details that bother you?", chips: [
    chip("No stretch", "nostretch", "Rigid denim only", "Rigid denim only. Stretch jeans go to the back of the rail."),
    chip("Softest fabric possible", "soft", "Soft hand", "Soft it is. Washed and blended denims first."),
    chip("No scratchy labels", "tagless", "Printed labels", "Pairs with printed labels go first."),
    chip("Anything is fine", null, null, "Great."),
  ] },
];

export const INTRO =
  "I have your numbers, so your size is settled. Five quick questions about how " +
  "you wear jeans. They change the order I show things in, never the size.";

export const DONE = "That's your ticket. I'll read it against every brand's chart.";

export const FALLBACK_REPLY = "Noted. I'll keep that in mind.";

/** The tailor quotes the customer's own numbers back, never invented ones. */
export function fillAck(ack: string, twin: DigitalTwin | null): string {
  const m = twin?.measurements_cm;
  return ack
    .replace("{thigh}", m ? String(Math.round(m.thigh)) : "—")
    .replace("{inseam}", m ? String(Math.round(m.inseam)) : "—");
}

/** What a ticket row reads: the need's label, else the chip's. */
export function ticketValue(c: Chip): string {
  return c.need?.label ?? c.label;
}

/** How a free-text answer is truncated when the model cannot be reached. */
export function shortLabel(text: string): string {
  const t = text.trim();
  return t.length > 30 ? `${t.slice(0, 28)}…` : t;
}
