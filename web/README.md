# SartorIA — customer app

The seven-screen customer flow, as a real Next.js application with the
**measurement engine stubbed**.

It exists so the flow can be shown, clicked and argued about while the question
of whether a phone video actually yields usable measurements is still open —
that is what `../spike` is for. Every number on screen is invented, and the app
says so on its first screen.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # the size calculator, 12 tests
npm run fit-table    # what every product recommends for one body
```

## What is stubbed and what is real

This distinction is the point of the whole structure, so it is worth being
exact about it.

| piece | state | why |
|---|---|---|
| `lib/engine/stub.ts` | **stubbed** | needs the vision pipeline; the spike has not reported yet |
| `lib/engine/advisor.ts` | **real** | picking a size is arithmetic, and arithmetic has no reason to be a stub |
| `lib/engine/wardrobe.ts` | **real** | reading a body back out of a chart is also just arithmetic |
| `lib/catalog.ts` | **invented** | four fictional brands; see below |

When the spike returns a verdict and the Python pipeline sits behind an API
route, **only `lib/engine/index.ts` changes** — swap `createStubEngine` for the
real client. Nothing in `components/` imports anything from `engine/` except
types, so no screen moves.

The field names in `lib/engine/types.ts` are snake_case on purpose: that file is
the wire contract and it has to match `spike/twin.py` character for character. A
translation layer between the two would be one more place for them to drift.

## The brands are fictional

Marea, Fosco, Vela and Nebbia do not exist. Their size charts are realistic in
shape and copied from nobody. Putting a real denim label's name, charts and
prices into a demo would misrepresent a real company, and the charts are the
one thing in this project that must not be faked convincingly.

## The size calculator

`lib/engine/advisor.ts` is deliberately **not** an AI call. The same body and
the same chart must always produce the same size, and the reason has to be
inspectable — tap *Why this size?* on the product screen to see which
measurements were used and whether the chart was a body chart or a
garment-flat one.

It also **refuses**. If the waist falls outside a brand's chart, or the waist
measurement itself is low confidence, it returns no size and says so. A system
that always has an opinion is lying about its confidence.

Two bugs it had, both caught by writing the tests:

- Contiguous **closed** size ranges put an 82 cm waist in W30 `[78,82]` *and*
  W31 `[82,86]`, and the winner came down to array order. Ranges are half-open
  now, except the last row.
- The **hem** was driving the headline, so a pair that fitted perfectly read
  "with a little room" because its length was 1 cm off. A hem is a length to be
  turned up, not a fit problem.

## Demo scenarios

The refusal paths are worth showing rather than describing:

| URL | what it does |
|---|---|
| `/` | the happy path |
| `/?demo=no-head` | the head gate fires — the one rule that cannot be bent |
| `/?demo=no-turn` | only ever saw the front, so there is no depth |
| `/?demo=unsure` | low-confidence waist, so the advisor abstains |

From the refusal screen there is a way on that needs no camera at all: *tell us
a pair you already own*. That path is real logic, not a stub — the midpoint of
the range a size is cut for is the best single estimate of the body inside it,
and it carries something the video never will, which is how the person likes
jeans to sit.

## The camera

The filming screen asks for the real camera, because the framing guides only
mean something against a real body. Where it is unavailable — a locked-down
browser, no camera, a denied permission — it falls back to a silhouette. The
video is not recorded or uploaded anywhere; the stub ignores it entirely.

## Layout

```
app/page.tsx              the flow, as one state machine
components/screens/       one file per screen, plus the refusal and the wardrobe
components/art/           jeans, silhouette and the measurement diagram, all drawn
lib/engine/types.ts       the contract — mirrors spike/twin.py
lib/engine/index.ts       the one place the engine is chosen
lib/engine/advisor.ts     real arithmetic, tested
lib/engine/wardrobe.ts    real arithmetic, tested
test/advisor.test.ts      12 tests over the only real logic in the app
```
