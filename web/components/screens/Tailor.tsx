"use client";

/**
 * The fitting ticket: five questions about how the customer wears jeans.
 *
 * The size is settled by the time anyone gets here. The ticket only decides
 * the order the ledger is read in, which is why every question can be skipped
 * by tapping "no preference" and why skipping the whole thing is one tap on
 * the screen before.
 *
 * Tapped answers never leave this browser. A typed answer is sent — once, with
 * nothing but the question and its chips — to be read by a model, and the
 * screen says so where the typing happens.
 */
import { useEffect, useRef, useState } from "react";
import { Button, TypingDots, Wordmark } from "@/components/ui";
import type { DigitalTwin } from "@/lib/engine/types";
import type { Need } from "@/lib/preferences";
import {
  DONE, FALLBACK_REPLY, INTRO, QUESTIONS, fillAck, shortLabel, ticketValue,
  type Chip, type QuestionKey,
} from "@/lib/tailor";

export interface Ticket {
  /** What each row reads. */
  answers: Partial<Record<QuestionKey, string>>;
  /** The need each answer recorded, if any — one per question, so a
   *  re-answer replaces rather than adds. */
  needs: Partial<Record<QuestionKey, Need>>;
}

export const EMPTY_TICKET: Ticket = { answers: {}, needs: {} };

/** The needs in question order, as the ledger ranks by them. */
export function needsOf(t: Ticket): Need[] {
  return QUESTIONS.flatMap((q) => (t.needs[q.key] ? [t.needs[q.key]!] : []));
}

const CHIP_MS = 850;
const INTRO_MS = 1000;
const TYPED_TIMEOUT_MS = 9000;

const firstOpen = (t: Ticket) => {
  const i = QUESTIONS.findIndex((q) => !t.answers[q.key]);
  return i === -1 ? QUESTIONS.length : i;
};

/** A number for the ticket, and the size a tailor would chalk on it — read
 *  off the customer's own waist and inseam, in inches. */
function ticketHeader(twin: DigitalTwin | null) {
  if (!twin) return "No. —";
  let h = 0;
  for (const c of twin.session_id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const no = String(h % 10000).padStart(4, "0");
  const w = Math.round(twin.measurements_cm.waist / 2.54);
  const l = Math.round(twin.measurements_cm.inseam / 2.54);
  return `No. ${no} · W${w} L${l}`;
}

interface Reading { option: string | null; need: string; reply: string }

async function readTyped(q: (typeof QUESTIONS)[number], text: string): Promise<Reading | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TYPED_TIMEOUT_MS);
  try {
    const r = await fetch("/api/tailor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q.q, options: q.chips.map((c) => c.label), text }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as Reading;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export function Tailor({
  twin, ticket, onChange, onDone,
}: {
  twin: DigitalTwin | null;
  ticket: Ticket;
  onChange: (t: Ticket) => void;
  onDone: () => void;
}) {
  const [qi, setQi] = useState(() => firstOpen(ticket));
  const fresh = firstOpen(ticket) === 0;
  const [typing, setTyping] = useState(fresh);
  const [ack, setAck] = useState(fresh ? INTRO : "");
  const [input, setInput] = useState("");
  // Bumped on every answer, so a slow reply to an earlier one cannot land on
  // a later question.
  const turn = useRef(0);
  const latest = useRef(ticket);
  useEffect(() => { latest.current = ticket; }, [ticket]);

  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setTyping(false), INTRO_MS);
    return () => window.clearTimeout(t);
  }, [fresh]);

  const done = qi >= QUESTIONS.length;
  const q = QUESTIONS[qi];
  const answered = QUESTIONS.filter((x) => ticket.answers[x.key]).length;

  function record(key: QuestionKey, value: string, need: Need | null, reply: string) {
    const t = latest.current;
    const needs = { ...t.needs };
    if (need) needs[key] = need; else delete needs[key];
    const next = { answers: { ...t.answers, [key]: value }, needs };
    latest.current = next;
    onChange(next);
    setAck(reply);
    setTyping(false);
    setQi(firstOpen(next));
  }

  function tap(c: Chip) {
    if (typing || done) return;
    const my = ++turn.current, key = q.key;
    setTyping(true);
    window.setTimeout(() => {
      if (turn.current !== my) return;
      record(key, ticketValue(c), c.need, fillAck(c.ack, twin));
    }, CHIP_MS);
  }

  async function typed() {
    const text = input.trim();
    if (!text || typing || done) return;
    const my = ++turn.current, question = q;
    setInput("");
    setTyping(true);
    const r = await readTyped(question, text);
    if (turn.current !== my) return;
    const chip = r?.option ? question.chips.find((c) => c.label === r.option) : undefined;
    if (chip) {
      record(question.key, ticketValue(chip), chip.need, r!.reply || fillAck(chip.ack, twin));
    } else {
      const label = r?.need?.trim() || shortLabel(text);
      // A need the ranking does not know: written on the ticket, weighed by
      // nothing.
      record(question.key, label, { id: `note-${question.key}`, label },
             r?.reply || FALLBACK_REPLY);
    }
  }

  /** Tapping a row goes back to that question; the rest of the ticket stays. */
  function revisit(i: number) {
    if (typing) return;
    turn.current++;
    setAck("");
    setQi(i);
  }

  return (
    <div className="flex h-full flex-col bg-ground text-chalk">
      <div className="flex flex-none items-center justify-between px-6 pt-6">
        <Wordmark size={21} />
        <p className="figure text-[10px] font-medium tracking-[.14em] text-faint uppercase">
          Tailor · {answered}/{QUESTIONS.length}
        </p>
      </div>

      {/* The ticket: paper, punched, filled in as the customer answers. */}
      <div className="relative mx-5 mt-4 flex-none rounded-[14px] bg-chalk px-5 pb-3.5 pt-[18px]
                      text-ticket-ink shadow-[0_12px_30px_-12px_rgba(0,0,0,.6)]">
        <div className="pointer-events-none absolute inset-1.5 rounded-[10px] border
                        border-dashed border-ticket-ink/25" />
        <span className="absolute left-1/2 top-[-5px] -ml-[7px] h-3.5 w-3.5 rounded-full bg-ground" />
        <div className="flex items-baseline justify-between pb-2">
          <p className="figure text-[10px] font-semibold tracking-[.18em] uppercase">
            Fitting ticket
          </p>
          <p className="figure text-[10px] font-medium text-ticket-ink/55">
            {ticketHeader(twin)}
          </p>
        </div>
        {QUESTIONS.map((row, i) => {
          const current = i === qi && !done;
          return (
            <button key={row.key} type="button" onClick={() => revisit(i)}
                    className="flex w-full items-baseline gap-2 py-1 text-left"
                    aria-label={`${row.ticket}: ${ticket.answers[row.key] ?? "not answered"}. Change.`}>
              <span className={`figure w-[60px] flex-none text-[9.5px] tracking-[.14em] uppercase
                                ${current ? "font-semibold text-ticket-accent"
                                          : "font-medium text-ticket-ink/50"}`}>
                {row.ticket}{current && " ▸"}
              </span>
              <span className="flex-1 -translate-y-1 border-b border-dotted border-ticket-ink/30" />
              <span className="max-w-[190px] text-right font-serif text-[18px] leading-none italic">
                {ticket.answers[row.key] ?? "—"}
              </span>
            </button>
          );
        })}
        {done && (
          <span className="fade-in absolute bottom-10 right-[18px] rotate-[-9deg] rounded-md border-2
                           border-ticket-accent bg-chalk/85 px-[9px] py-1 font-mono text-[11px]
                           font-bold tracking-[.16em] text-ticket-accent">
            READY TO CUT
          </span>
        )}
      </div>

      {/* Only the latest exchange: what was just said, and what is asked now. */}
      <div className="flex flex-1 flex-col justify-end gap-2.5 overflow-y-auto px-6 pb-2 pt-[22px]"
           aria-live="polite">
        {/* The intro stays up while the first question is being "written". */}
        {ack && (!typing || ack === INTRO) && (
          <p className="fade-in font-serif text-[17px] leading-[1.3] text-mute italic">{ack}</p>
        )}
        {typing && <div className="py-1.5"><TypingDots /></div>}
        {!typing && !done && q && (
          <p key={q.key} className="fade-in font-serif text-[27px] leading-[1.1]">{q.q}</p>
        )}
        {!typing && done && (
          <p className="fade-in font-serif text-[27px] leading-[1.1]">{DONE}</p>
        )}
      </div>

      <div className="flex flex-none flex-col gap-2.5 px-5 pb-6 pt-3">
        {!typing && !done && q && (
          <>
            <div className="flex flex-wrap gap-2">
              {q.chips.map((c) => (
                <button key={c.label} type="button" onClick={() => tap(c)}
                        className="rounded-[10px] border border-chalk/25 bg-surface px-[13px] py-2.5
                                   text-[13px] font-medium transition hover:border-amber">
                  {c.label}
                </button>
              ))}
            </div>
            <form className="flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); void typed(); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                     maxLength={280} aria-label="Your own answer"
                     placeholder="Something else? Write it on the ticket…"
                     className="min-w-0 flex-1 border-b border-chalk/25 bg-transparent px-0.5 py-2.5
                                font-serif text-[17px] text-chalk italic outline-none
                                placeholder:text-faint focus:border-amber" />
              <button type="submit" disabled={!input.trim()}
                      className="flex-none px-1 py-2.5 text-[13px] font-semibold text-amber
                                 disabled:opacity-40">
                Add
              </button>
            </form>
            <p className="text-[10.5px] leading-[1.45] text-faint">
              Tapped answers stay on this phone. Typed ones go to an AI model to
              be read, then are discarded.
            </p>
          </>
        )}
        {done && (
          <Button onClick={onDone}>See my size, brand by brand</Button>
        )}
        <p className="text-[10.5px] leading-[1.45] text-faint">
          The ticket reorders jeans that already fit. It never changes your size.
        </p>
      </div>
    </div>
  );
}
