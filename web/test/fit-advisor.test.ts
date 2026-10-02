/** The Fit Advisor: the facts it is given, the loop it runs, and the check that
 *  decides whether its paragraph is shown. The model is scripted — these tests
 *  are about what the code lets through, not about what a model would write. */
import assert from "node:assert/strict";
import { test } from "node:test";

import type Anthropic from "@anthropic-ai/sdk";
import { PRODUCTS, productById } from "../lib/catalog";
import { sizeCalculator } from "../lib/engine/advisor";
import { MAX_TURNS, runFitAdvisor, type CreateMessage } from "../lib/fitAdvisor/agent";
import { factsForSize, runEngine, sourceOf } from "../lib/fitAdvisor/facts";
import { advisorRequest } from "../lib/fitAdvisor/request";
import { collect, emptyEvidence, verify } from "../lib/fitAdvisor/verify";
import { referenceTwin } from "./fixtures";

const marea = productById("marea-slim-tapered")!;
type Beta = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

// ── facts ───────────────────────────────────────────────────────────────────

test("the facts for the chosen size agree with the calculator's verdicts", () => {
  for (const p of PRODUCTS) {
    for (const waist of [70, 78, 82, 88, 94]) {
      const twin = referenceTwin({ waist, hip: waist + 17 });
      const fit = sizeCalculator.recommend(twin, p);
      if (!fit.size) continue;
      const f = factsForSize(twin, p, fit.size)!;
      assert.equal(f.waist.reads, fit.areas.find((a) => a.area === "waist")?.verdict, p.id);
      if (!("unreliable" in f.seat)) {
        assert.equal(f.seat.reads, fit.areas.find((a) => a.area === "hip")?.verdict, p.id);
      }
      assert.equal(f.thigh_hint === "snug", fit.areas.some((a) => a.area === "thigh"), p.id);
    }
  }
});

test("the reference body sits mid-range at the waist in its size", () => {
  const f = factsForSize(referenceTwin(), marea, "W32 L32")!;
  assert.deepEqual(f.waist.size_range_cm, [81, 83.5]);
  assert.equal(f.waist.position_pct, 40);
  assert.ok(!("unreliable" in f.length));
  assert.equal(f.length.difference_cm, 0.5);
  assert.equal(f.length.reads, "right length");
});

test("a measurement read with low confidence yields no figure at all", () => {
  const twin = referenceTwin();
  twin.measurement_confidence.hip = "low";
  twin.measurement_confidence.inseam = "low";
  const f = factsForSize(twin, marea, "W32 L32")!;
  assert.ok("unreliable" in f.seat);
  assert.ok("unreliable" in f.length);
  const ev = emptyEvidence();
  collect(ev, f);
  assert.ok(!ev.numbers.has(99), "the unreliable seat leaked into the evidence");
});

test("typed-in and read-back numbers are never described as a video", () => {
  const twin = referenceTwin();
  twin.processing_method = "manual_entry_v1";
  assert.equal(sourceOf(twin), "typed in by you");
  assert.equal(advisorRequest(twin, marea).source, "manual_entry");
  twin.processing_method = "wardrobe_anchor_v2";
  assert.equal(sourceOf(twin), "read back from a pair you own");
  twin.processing_method = "nlf_smpl_v3";
  assert.equal(advisorRequest(twin, marea).source, "video");
});

test("the request carries three numbers and nothing that identifies anyone", () => {
  const req = advisorRequest(referenceTwin(), marea);
  assert.deepEqual(Object.keys(req).sort(),
    ["confidence", "hip", "inseam", "product_id", "source", "waist"]);
});

// ── verifier ────────────────────────────────────────────────────────────────

function evidenceFor(twin = referenceTwin()) {
  const ev = emptyEvidence();
  collect(ev, runEngine(twin, marea));
  return ev;
}

test("a paragraph built from the engine's numbers passes", () => {
  const v = verify({
    explanation: "W32 is right for you: your waist sits inside its 81–83.5 cm " +
      "range, and the leg is the right length.",
    size_named: "W32 L32",
  }, evidenceFor(), "W32 L32");
  assert.deepEqual(v, { ok: true });
});

test("an invented number is caught", () => {
  const v = verify({
    explanation: "W32 fits, with 3.5 cm of room at the waist.",
    size_named: "W32",
  }, evidenceFor(), "W32 L32");
  assert.equal(v.ok, false);
});

test("naming a different size than the calculator is caught", () => {
  const v = verify({ explanation: "Go for W33.", size_named: "W33" },
                   evidenceFor(), "W32 L32");
  assert.equal(v.ok, false);
});

test("a size nobody looked at cannot be mentioned", () => {
  const v = verify({ explanation: "W32 fits; W35 would be loose.", size_named: "W32" },
                   evidenceFor(), "W32 L32");
  assert.equal(v.ok, false);
});

test("when the calculator refuses, the advisor may not pick", () => {
  const twin = referenceTwin({ waist: 140 });
  const ev = evidenceFor(twin);
  const nearest = runEngine(twin, marea).alternative!.split(" ")[0];
  assert.equal(verify({ explanation: `Your waist is off this chart; ${nearest} is the nearest.`,
                        size_named: null }, ev, null).ok, true);
  assert.equal(verify({ explanation: `Take ${nearest}.`, size_named: nearest }, ev, null).ok,
               false);
});

// ── the loop ────────────────────────────────────────────────────────────────

let n = 0;
function reply(stop: Beta["stop_reason"], content: unknown[]): Beta {
  return {
    id: `msg_${n++}`, type: "message", role: "assistant", model: "test",
    content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Beta;
}
const call = (name: string, input: object = {}) =>
  ({ type: "tool_use", id: `tu_${n++}`, name, input });
const answer = (explanation: string, size_named: string | null) =>
  reply("end_turn", [{ type: "text", text: JSON.stringify({ explanation, size_named }) }]);

function scripted(...turns: Beta[]): { create: CreateMessage; seen: Params[] } {
  const seen: Params[] = [];
  return {
    seen,
    create: async (p) => {
      seen.push(structuredClone(p));
      const next = turns.shift();
      if (!next) throw new Error("script ran out");
      return next;
    },
  };
}

test("the agent calls its tools, then writes a paragraph that passes", async () => {
  const { create, seen } = scripted(
    reply("tool_use", [call("run_fit_engine"), call("measurement_sources")]),
    reply("tool_use", [call("check_size", { label: "W33 L32" })]),
    answer("W32 is your size: your 82 cm waist sits inside it. W33 starts at 83.5 cm, " +
           "above your waist, so it would sit loose. The leg is the right length.", "W32 L32"),
  );
  const out = await runFitAdvisor(create, referenceTwin(), marea);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.steps, ["run_fit_engine", "measurement_sources", "check_size W33 L32"]);
  // The tool results went back to the model, both in one user turn.
  const last = seen[2].messages.at(-1)!;
  assert.equal(last.role, "user");
  assert.ok(Array.isArray(last.content) && last.content.length === 1);
});

test("an answer given without running the engine is dropped", async () => {
  const { create } = scripted(answer("W32 is right for you.", "W32"));
  const out = await runFitAdvisor(create, referenceTwin(), marea);
  assert.equal(out.ok, false);
});

test("a paragraph with an invented figure is dropped, not shown", async () => {
  const { create } = scripted(
    reply("tool_use", [call("run_fit_engine")]),
    answer("W32 is your size, with 7 cm to spare at the seat.", "W32"),
  );
  const out = await runFitAdvisor(create, referenceTwin(), marea);
  assert.equal(out.ok, false);
});

test("a size the pair is not cut in is an error result, not a crash", async () => {
  const { create, seen } = scripted(
    reply("tool_use", [call("run_fit_engine"), call("check_size", { label: "W99" })]),
    answer("W32 is your size.", "W32 L32"),
  );
  const out = await runFitAdvisor(create, referenceTwin(), marea);
  assert.equal(out.ok, true);
  const results = seen[1].messages.at(-1)!.content as { is_error?: boolean }[];
  assert.equal(results[1].is_error, true);
});

test("a refusal ends the run", async () => {
  const { create } = scripted(reply("refusal", []));
  assert.equal((await runFitAdvisor(create, referenceTwin(), marea)).ok, false);
});

test("an agent that never stops calling tools is cut off", async () => {
  const turns = Array.from({ length: MAX_TURNS + 1 },
    () => reply("tool_use", [call("pair_details")]));
  const { create, seen } = scripted(...turns);
  const out = await runFitAdvisor(create, referenceTwin(), marea);
  assert.equal(out.ok, false);
  assert.equal(seen.length, MAX_TURNS + 1);
});
