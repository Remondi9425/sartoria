/** What a Fit Advisor run is allowed to cost, and when it runs at all (#45).
 *  No network: a run that would reach the model is never started here. */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";

import { POST } from "../app/api/advisor/route";
import { productById } from "../lib/catalog";
import { MAX_TURNS } from "../lib/fitAdvisor/agent";
import { comparableSizes, labelsOf, pairDetails } from "../lib/fitAdvisor/facts";
import { collect, emptyEvidence } from "../lib/fitAdvisor/verify";
import { referenceTwin } from "./fixtures";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

const ask = () => new NextRequest("https://app.test/api/advisor", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
  body: JSON.stringify({ product_id: "nope" }),
});

test("a key alone does not switch the advisor on", async () => {
  process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
  delete process.env.FIT_ADVISOR_ENABLED;
  assert.equal((await POST(ask())).status, 503);
  process.env.FIT_ADVISOR_ENABLED = "0";
  assert.equal((await POST(ask())).status, 503);
});

test("switched on, it still needs the key", async () => {
  process.env.FIT_ADVISOR_ENABLED = "1";
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await POST(ask())).status, 503);
});

test("switched on with a key, a bad request is refused before any model run", async () => {
  process.env.FIT_ADVISOR_ENABLED = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic-test-key";
  assert.equal((await POST(ask())).status, 400);
});

test("the advisor is offered a handful of sizes, not the whole chart", () => {
  const p = productById("fosco-comfort-straight")!;   // W32–W56 in four lengths
  const twin = referenceTwin({ waist: 120, hip: 132, inseam: 78 });
  const near = comparableSizes(twin, p);
  assert.ok(labelsOf(p).length > 90);
  assert.ok(near.length <= 7, near.join(", "));
  // The calculator picks W47 L30. Two waists either side in L30, and W47 in
  // its other lengths; nothing further away, and not the chosen size itself.
  assert.deepEqual([...near].sort(), ["W45 L30", "W46 L30", "W47 L28", "W47 L32",
                                      "W47 L34", "W48 L30", "W49 L30"]);
});

test("a refusal is compared around the nearest size", () => {
  const p = productById("vela-high-skinny")!;          // stops at W36
  const near = comparableSizes(referenceTwin({ waist: 140 }), p);
  assert.ok(near.length > 0 && near.every((s) => /^W3[4-6] /.test(s)), near.join(", "));
});

test("the pair's details name its span, and that span may still be mentioned", () => {
  const p = productById("marea-slim-tapered")!;
  const d = pairDetails(p);
  assert.equal(d.waists, "W26–W40");
  assert.deepEqual(d.lengths, ["L30", "L32", "L34"]);
  assert.ok(!("sizes" in d), "the full list of labels is no longer sent");
  const ev = emptyEvidence();
  collect(ev, d);
  assert.ok(ev.labels.has("W26") && ev.labels.has("W40") && !ev.labels.has("W41"));
  assert.ok(ev.lengths.has("L34") && !ev.lengths.has("L36"));
});

test("a run has at most a few paid rounds", () => {
  assert.ok(MAX_TURNS <= 3);
});
