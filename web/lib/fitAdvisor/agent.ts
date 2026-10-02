/**
 * The Fit Advisor — agent 4 of the back-office mockup, made real.
 *
 * An agent in the plain sense: a model given tools and a goal, deciding for
 * itself which tools to call and in what order, looping until it has enough to
 * answer. What keeps it honest is what the tools are, not what the prompt asks:
 *
 * - every tool is deterministic arithmetic over the one pair on screen and the
 *   one body it is being fitted to, and none of them can change a size;
 * - the size comes from `run_fit_engine`, the same calculator as the rest of
 *   the app, and the paragraph is rejected unless it names that size;
 * - every number in the paragraph must be the figure a tool returned for the
 *   size and the part of the body it is written next to, in its unit, and a
 *   hem may not be described the wrong way round (`verify.ts`), or the
 *   paragraph is dropped.
 *
 * It never picks the size. It explains the one the calculator picked.
 *
 * The model call is injected so the loop can be tested without a network.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { DigitalTwin, Product } from "../engine/types";
import {
  comparableSizes, factsForSize, measurementSources, pairDetails, runEngine,
} from "./facts";
import { MODEL } from "../model";
import { collect, emptyEvidence, verify, type Draft } from "./verify";

type Beta = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Msg = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export type CreateMessage = (params: Params) => Promise<Beta>;

/** Rounds of tool calls allowed before the advisor must answer. A careful run
 *  asks for three tools at once, sometimes compares one size, and answers:
 *  two rounds. A third is slack; more is a loop, and every round is paid for. */
export const MAX_TURNS = 3;

export { MODEL } from "../model";

const SYSTEM =
  "You are the fit advisor in a jeans shop. The size has already been chosen by a " +
  "calculator from the customer's body measurements and the brand's size chart. " +
  "You never choose or change a size: you explain the one the calculator chose, in " +
  "the voice of a good tailor.\n\n" +
  "Use your tools to find out what you need. In your first turn, call run_fit_engine, " +
  "measurement_sources and pair_details together; every turn is paid for. Call " +
  "check_size when comparing with a neighbouring size would help the customer decide " +
  "(for example when the fit is snug or roomy at the waist). Call measurement_sources " +
  "before saying anything about where the numbers came from, and pair_details before " +
  "saying anything about the cloth or cut.\n\n" +
  "Rules for the explanation:\n" +
  "- 2 to 4 short sentences, plain English, addressed to the customer as \"you\".\n" +
  "- Name the chosen size (e.g. W31). Set size_named to the size run_fit_engine " +
  "returned, exactly (e.g. \"W31 L32\"), however snug or roomy it reads. Only if " +
  "run_fit_engine returned no size: say why, name the nearest size only as the closest " +
  "on the chart, never as a recommendation, and set size_named to null.\n" +
  "- Every number you write must appear in a tool result. Round only to whole " +
  "centimetres. Do not calculate new numbers.\n" +
  "- Write each figure with its unit (cm or %), in the same clause as the part of " +
  "the body it describes (waist, seat, leg). Each figure is checked against that " +
  "part of the body and that size.\n" +
  "- \"Room\" is room_to_top_cm and nothing else.\n" +
  "- Anything marked unreliable was not measured well enough: say so, give no figure.\n" +
  "- Say which way a hem goes: a positive length difference is length to turn up, a " +
  "negative one means the pair runs short.\n" +
  "- Never mention a video unless measurement_sources says the source is video.\n" +
  "- No questions, no sales talk, no mention of tools or calculators by name.";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    size_named: { type: ["string", "null"] },
  },
  required: ["explanation", "size_named"],
  additionalProperties: false,
} as const;

function tools(twin: DigitalTwin, product: Product): Anthropic.Beta.Messages.BetaTool[] {
  const none = { type: "object" as const, properties: {}, additionalProperties: false };
  return [
    {
      name: "run_fit_engine",
      description:
        "Runs the size calculator for this pair and this body. Returns the chosen size " +
        "(or why it refused), the headline, the neighbouring size worth naming, and how " +
        "the chosen size sits at the waist, seat, length and thigh, in centimetres.",
      input_schema: none,
      strict: true,
    },
    {
      name: "check_size",
      description:
        "How a nearby size of this same pair would sit on this body, in the same terms " +
        "as run_fit_engine. For comparison only: it does not change the chosen size.",
      input_schema: {
        type: "object",
        properties: { label: { type: "string", enum: comparableSizes(twin, product) } },
        required: ["label"],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "pair_details",
      description: "The cut, rise, fly, composition, stretch and chart type of this pair.",
      input_schema: none,
      strict: true,
    },
    {
      name: "measurement_sources",
      description:
        "Where the customer's measurements came from (video, typed in, read back from " +
        "a pair they own, or demo numbers) and how far each can be trusted.",
      input_schema: none,
      strict: true,
    },
  ];
}

function execute(name: string, input: unknown, twin: DigitalTwin, product: Product): unknown {
  switch (name) {
    case "run_fit_engine": return runEngine(twin, product);
    case "check_size": {
      const label = (input as { label?: unknown })?.label;
      const facts = typeof label === "string" ? factsForSize(twin, product, label) : null;
      if (!facts) throw new Error(`no size ${String(label)} in this pair`);
      return facts;
    }
    case "pair_details": return pairDetails(product);
    case "measurement_sources": return measurementSources(twin);
    default: throw new Error(`unknown tool ${name}`);
  }
}

export interface AdvisorResult {
  ok: true;
  explanation: string;
  size: string | null;
  /** The tools called, in order: what the advisor looked at before writing. */
  steps: string[];
}

export interface AdvisorFailure {
  ok: false;
  reason: string;
  steps: string[];
}

/** Runs the advisor for one pair and one body. Never throws on a bad answer. */
export async function runFitAdvisor(
  create: CreateMessage, twin: DigitalTwin, product: Product,
): Promise<AdvisorResult | AdvisorFailure> {
  const engine = runEngine(twin, product);
  const evidence = emptyEvidence();
  const steps: string[] = [];
  let calledEngine = false;

  const messages: Msg[] = [{
    role: "user",
    content: `Explain the size for ${product.brand} ${product.name} to this customer.`,
  }];
  const toolset = tools(twin, product);

  for (let turn = 0; turn <= MAX_TURNS; turn++) {
    const res = await create({
      model: MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: toolset,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages,
    });

    if (res.stop_reason === "refusal") return { ok: false, reason: "refused", steps };
    if (res.stop_reason === "max_tokens") return { ok: false, reason: "ran out of tokens", steps };

    const calls = res.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");

    if (res.stop_reason === "tool_use" && calls.length > 0) {
      if (turn === MAX_TURNS) return { ok: false, reason: "too many tool calls", steps };
      messages.push({ role: "assistant", content: res.content });
      const results: ToolResult[] = calls.map((call) => {
        steps.push(call.name === "check_size"
          ? `check_size ${String((call.input as { label?: unknown })?.label)}`
          : call.name);
        try {
          const out = execute(call.name, call.input, twin, product);
          if (call.name === "run_fit_engine") calledEngine = true;
          collect(evidence, out);
          return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) };
        } catch (e) {
          return {
            type: "tool_result", tool_use_id: call.id, is_error: true,
            content: e instanceof Error ? e.message : "tool failed",
          };
        }
      });
      messages.push({ role: "user", content: results });
      continue;
    }

    // The answer.
    if (!calledEngine) return { ok: false, reason: "answered without running the engine", steps };
    const text = res.content.find((b) => b.type === "text");
    let draft: Draft;
    try {
      const parsed = JSON.parse(text && "text" in text ? text.text : "") as Partial<Draft>;
      draft = {
        explanation: String(parsed.explanation ?? ""),
        size_named: typeof parsed.size_named === "string" ? parsed.size_named : null,
      };
    } catch {
      return { ok: false, reason: "answer was not JSON", steps };
    }
    const verdict = verify(draft, evidence, engine.size);
    if (!verdict.ok) return { ok: false, reason: verdict.reason, steps };
    return { ok: true, explanation: draft.explanation.trim(), size: engine.size, steps };
  }
  return { ok: false, reason: "too many tool calls", steps };
}
