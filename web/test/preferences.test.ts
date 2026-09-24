/** The ticket reorders the ledger and is not allowed to do anything else.
 *
 *  The constraint worth testing is the negative one: a need must never change
 *  which jeans fit, only which appear first. A recommender that quietly drops
 *  a pair because somebody once said "cycling" is worse than no recommender.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "../lib/catalog";
import { calculator } from "../lib/engine";
import {
  hasStretch, rankByNeeds, scoreNeeds, type Need, type NeedId,
} from "../lib/preferences";
import { QUESTIONS, fillAck } from "../lib/tailor";
import { referenceTwin } from "./fixtures";

const ids = (needs: Need[]) => rankByNeeds(PRODUCTS, needs).map((r) => r.product.id);
const need = (id: NeedId): Need => ({ id, label: id });
const EVERY: NeedId[] = QUESTIONS.flatMap((q) => q.chips.flatMap((c) => c.need ? [c.need.id] : []));

test("an empty ticket leaves the catalogue exactly as it was", () => {
  assert.deepEqual(ids([]), PRODUCTS.map((p) => p.id));
});

test("a note the ranking does not know moves nothing", () => {
  assert.deepEqual(ids([{ id: "note-1", label: "Pockets deep enough for a phone" }]),
                   PRODUCTS.map((p) => p.id));
});

test("reordering never adds or removes a pair", () => {
  for (const id of EVERY) {
    const out = ids([need(id)]);
    assert.equal(out.length, PRODUCTS.length, `${id}: a pair went missing`);
    assert.deepEqual(new Set(out), new Set(PRODUCTS.map((p) => p.id)));
  }
});

test("the ticket never changes a size", () => {
  const twin = referenceTwin();
  const before = new Map(PRODUCTS.map((p) => [p.id, calculator.recommend(twin, p).size]));
  const all = EVERY.map(need);
  for (const r of rankByNeeds(PRODUCTS, all)) {
    assert.equal(calculator.recommend(twin, r.product).size, before.get(r.product.id));
  }
});

test("the same ticket gives the same order every time", () => {
  const t = [need("cycling"), need("thighs"), need("soft")];
  assert.deepEqual(ids(t), ids(t));
});

test("every need the chat can record is one the ranking reads", () => {
  for (const id of EVERY) {
    const moved = PRODUCTS.some((p) => scoreNeeds(p, [need(id)]).score !== 0);
    assert.ok(moved, `${id} scores every pair zero`);
  }
});

test("rigid denim only puts every stretch pair behind every rigid one", () => {
  const out = rankByNeeds(PRODUCTS, [need("nostretch")]).map((r) => hasStretch(r.product));
  const firstStretch = out.indexOf(true);
  assert.ok(out.slice(firstStretch).every(Boolean), "a rigid pair came after a stretch one");
});

test("a reason is only ever one the pair supports", () => {
  for (const p of PRODUCTS) {
    const { reasons } = scoreNeeds(p, [need("closures"), need("tagless"), need("soft")]);
    if (reasons.includes("Zip fly")) assert.equal(p.fly, "zip");
    if (reasons.includes("Printed label")) assert.ok(p.tagless);
    if (reasons.includes("Soft hand")) assert.ok(p.soft);
    assert.equal(new Set(reasons).size, reasons.length, "a reason was repeated");
  }
});

test("equal scores keep the catalogue's own order", () => {
  // Everything scores the same on travel among rigid pairs, so they keep
  // their relative order.
  const rigid = PRODUCTS.filter((p) => !hasStretch(p)).map((p) => p.id);
  const out = ids([need("travel")]).filter((id) => rigid.includes(id));
  assert.deepEqual(out, rigid);
});

test("the tailor quotes the customer's own numbers", () => {
  const twin = referenceTwin({ thigh: 61, inseam: 84 });
  assert.match(fillAck("a {thigh} cm thigh", twin), /61 cm/);
  assert.match(fillAck("came out at {inseam} cm", twin), /84 cm/);
});
