/** Typed measurements: kept as typed, never trusted more than a tape allows.
 *
 *  The claims worth pinning are the honest ones: the three numbers the size is
 *  decided on come through untouched, nothing typed is ever "high", and the
 *  sites nobody typed are labelled as guesses.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "../lib/catalog";
import { calculator } from "../lib/engine";
import { manualIsValid, twinFromManual } from "../lib/engine/manual";

const typed = { waist: 84, hip: 98, inseam: 81.5 };

test("the three typed numbers reach the twin unchanged", () => {
  const t = twinFromManual(typed, 174);
  assert.equal(t.measurements_cm.waist, 84);
  assert.equal(t.measurements_cm.hip, 98);
  assert.equal(t.measurements_cm.inseam, 81.5);
  assert.equal(t.height_cm, 174);
});

test("typed is medium at best, and everything inferred says so", () => {
  const c = twinFromManual(typed, 174).measurement_confidence;
  assert.deepEqual([c.waist, c.hip, c.inseam], ["medium", "medium", "medium"]);
  for (const site of ["thigh", "knee", "calf", "ankle", "outseam", "rise"] as const) {
    assert.equal(c[site], "low", site);
  }
});

test("a typed body is enough for the advisor to pick a size", () => {
  const t = twinFromManual(typed, 174);
  assert.ok(PRODUCTS.some((p) => calculator.recommend(t, p).size !== null));
});

test("missing, non-numeric and implausible values are refused", () => {
  assert.ok(manualIsValid(typed));
  assert.ok(!manualIsValid({ waist: 84, hip: 98 }));
  assert.ok(!manualIsValid({ ...typed, hip: Number.NaN }));
  assert.ok(!manualIsValid({ ...typed, hip: 300 }));
  assert.ok(!manualIsValid({ ...typed, waist: 8.4 }));
});
