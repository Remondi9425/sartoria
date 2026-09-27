/**
 * A stand-in for the model, so the Fit Advisor can be seen without an API key.
 *
 * Switched on by FIT_ADVISOR_DEMO=1, and only when no ANTHROPIC_API_KEY is set.
 * It plays the model's part in the same loop — asks for the same tools, reads
 * what they return, answers in the same JSON — and its paragraph goes through
 * the same verifier. What it cannot show is how a real model writes: the
 * sentences are templates, and the screen says so.
 *
 * Nothing leaves the server in this mode.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "./agent";
import type { EngineRun, RangeFact, SizeFacts } from "./facts";

type Beta = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

let seq = 0;

function message(stop: Beta["stop_reason"], content: unknown[]): Beta {
  return {
    id: `demo_${seq++}`, type: "message", role: "assistant", model: "fit-advisor-demo",
    content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Beta;
}

const toolCall = (name: string, input: object = {}) =>
  ({ type: "tool_use", id: `demo_tu_${seq++}`, name, input });

/** Every tool result so far, keyed by the tool that produced it. */
function results(params: Params): Map<string, unknown[]> {
  const names = new Map<string, string>();
  const out = new Map<string, unknown[]>();
  for (const m of params.messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === "tool_use") names.set(b.id, b.name);
      if (b.type === "tool_result" && !b.is_error && typeof b.content === "string") {
        const name = names.get(b.tool_use_id) ?? "?";
        out.set(name, [...(out.get(name) ?? []), JSON.parse(b.content)]);
      }
    }
  }
  return out;
}

const cm = (n: number) => `${Math.round(Math.abs(n))} cm`;
const short = (label: string) => label.split(" ")[0];

function waistLine(size: string, w: RangeFact): string {
  const where = `your waist sits ${w.position_pct}% of the way up its ` +
    `${Math.round(w.size_range_cm[0])}–${Math.round(w.size_range_cm[1])} cm range`;
  if (w.reads === "snug") return `${size} is your size, on the snug side: ${where}, so it will feel close at first.`;
  if (w.reads === "roomy") return `${size} is your size, with a little room: ${where}.`;
  return `${size} is your size: ${where}, right where it should be.`;
}

function write(engine: EngineRun, alt: SizeFacts | undefined, source: string | undefined): string {
  if (!engine.size || !engine.facts) {
    const nearest = engine.alternative ? short(engine.alternative) : null;
    return engine.refused_because?.includes("outside")
      ? `Your waist falls outside this pair's size chart, so we would rather not guess.` +
        (nearest ? ` The nearest size on the chart is ${nearest}, but it is not a recommendation.` : "")
      : `Your waist was not measured well enough to call a size in this pair.` +
        (nearest ? ` The nearest size on the chart is ${nearest}.` : "");
  }
  const f = engine.facts;
  const size = short(engine.size);
  const parts = [waistLine(size, f.waist)];

  if ("unreliable" in f.seat) parts.push("Your seat was not measured well enough to say how it will sit.");
  else if (f.seat.reads === "snug") parts.push("It will be close through the seat.");
  else if (f.seat.reads === "roomy") parts.push("There is room in the seat.");
  if (f.thigh_hint) parts.push("This is a narrow cut, so expect it snug at the thigh.");

  if (!("unreliable" in f.length)) {
    const d = f.length.difference_cm;
    if (f.length.reads === "turn up") parts.push(`The leg is ${cm(d)} longer than yours, so plan a small hem.`);
    if (f.length.reads === "runs short") parts.push(`The leg is ${cm(d)} shorter than yours: this pair runs short on you.`);
  }
  if (alt) {
    parts.push(`${short(alt.size)} would put your waist ${alt.waist.position_pct}% up its range instead.`);
  }
  if (source === "typed in by you") parts.push("These figures are the ones you typed in.");
  return parts.join(" ");
}

/** The demo "model": same tools, same loop, template sentences. */
export const demoCreate: CreateMessage = async (params) => {
  const seen = results(params);
  const engine = seen.get("run_fit_engine")?.[0] as EngineRun | undefined;

  if (!engine) return message("tool_use", [toolCall("run_fit_engine"), toolCall("measurement_sources")]);

  // Compare with the neighbour the engine names, once, when there is one.
  if (engine.size && engine.alternative && !seen.has("check_size")) {
    return message("tool_use", [toolCall("check_size", { label: engine.alternative })]);
  }

  const alt = seen.get("check_size")?.[0] as SizeFacts | undefined;
  const source = (seen.get("measurement_sources")?.[0] as { source?: string } | undefined)?.source;
  const explanation = write(engine, alt, source);
  return message("end_turn", [{
    type: "text",
    text: JSON.stringify({ explanation, size_named: engine.size }),
  }]);
};
