/** "This pair fits me", read back through the brand's own chart.
 *
 *  The charts are copied by hand from three websites, so the first thing worth
 *  pinning is that they are shaped like size charts at all: a typo that makes
 *  W33 smaller than W32 would quietly move somebody's size.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { BRAND_CHARTS, BRANDS, chartFor } from "../lib/brands";
import { PRODUCTS } from "../lib/catalog";
import { calculator } from "../lib/engine";
import { twinFromOwnedPair } from "../lib/engine/wardrobe";

test("every brand has a men's and a women's chart", () => {
  for (const b of BRANDS) for (const line of ["men", "women"] as const) {
    assert.ok(chartFor(b, line).sizes.length > 5, `${b} ${line}`);
  }
});

test("every chart grows with the size on the label", () => {
  for (const c of BRAND_CHARTS) {
    const name = `${c.brand} ${c.line}`;
    for (let i = 1; i < c.sizes.length; i++) {
      const [a, b] = [c.sizes[i - 1], c.sizes[i]];
      assert.ok(b.w > a.w && b.waist_cm > a.waist_cm && b.hip_cm > a.hip_cm, `${name} W${b.w}`);
      if (a.thigh_cm !== undefined && b.thigh_cm !== undefined) {
        assert.ok(b.thigh_cm > a.thigh_cm, `${name} thigh W${b.w}`);
      }
    }
    for (let i = 1; i < c.lengths.length; i++) {
      assert.ok(c.lengths[i].inseam_cm > c.lengths[i - 1].inseam_cm, `${name} L`);
    }
  }
});

test("the W and L on the label are roughly inches", () => {
  for (const c of BRAND_CHARTS) {
    // Loose on purpose: women's labels drift from inches as they grow —
    // Levi's women's W34 is published as 96 cm, not 86. A misplaced digit
    // is still caught.
    for (const s of c.sizes) {
      assert.ok(Math.abs(s.waist_cm - s.w * 2.54) <= 10, `${c.brand} ${c.line} W${s.w}`);
    }
    for (const x of c.lengths) {
      assert.ok(Math.abs(x.inseam_cm - x.l * 2.54) <= 1, `${c.brand} ${c.line} L${x.l}`);
    }
  }
});

test("the pair becomes the body its size is cut for, and says how sure it is", () => {
  const levis = chartFor("Levi's", "men");
  const t = twinFromOwnedPair(levis, 32, 32, 178)!;
  assert.equal(t.measurements_cm.waist, 81.3);
  assert.equal(t.measurements_cm.hip, 97.8);
  assert.equal(t.measurements_cm.thigh, 57.2, "Levi's publishes the thigh");
  assert.equal(t.measurements_cm.inseam, 81.3);
  assert.equal(t.data_quality_tier, "C");
  assert.notEqual(t.measurement_confidence.waist, "high",
    "a size fits a range of bodies and must never be reported as high confidence");
});

test("a thigh the brand does not publish is inferred and labelled weak", () => {
  const t = twinFromOwnedPair(chartFor("Lee", "men"), 32, 32, 178)!;
  assert.equal(t.measurement_confidence.thigh, "low");
});

test("a W or L the chart does not have gives nothing, not a guess", () => {
  const lee = chartFor("Lee", "men");
  assert.equal(twinFromOwnedPair(lee, 35, 32, 178), null);
  assert.equal(twinFromOwnedPair(lee, 32, 38, 178), null);
});

test("a common owned size is enough for the advisor to pick something", () => {
  for (const c of BRAND_CHARTS.filter((c) => c.line === "men")) {
    const t = twinFromOwnedPair(c, 32, 32, 178)!;
    assert.ok(PRODUCTS.some((p) => calculator.recommend(t, p).size !== null), c.brand);
  }
});
