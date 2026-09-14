# SartorIA — measurement engine

One question, and nothing else:

> **Does a phone video give leg measurements good enough to pick a jeans size?**

Everything else about this project is downstream of that number. Until it
exists, the rest is opinion.

## How it measures

A parametric body model, not a silhouette. [NLF](https://github.com/isarandi/nlf)
(*Neural Localizer Fields*, NeurIPS '24) recovers an SMPL mesh from each frame;
the mesh is stood upright, scaled to the height the person typed, and then
sliced horizontally at each measurement site.

The girth of a slice is the perimeter of its **convex hull** — because a tape
measure pulled round a thigh spans the dips rather than sinking into them. That
is the reason for using a mesh at all: an ellipse *assumes* a cross-section,
a hull *measures* the one that is there.

The levels are found on the body rather than assumed from stature. The natural
waist is the narrowest girth above the hips; the seat is the widest below them.
Neither was measurable before.

Every frame is measured on its own and the results reconciled by median. How far
the frames disagree is the confidence: there is no tape measure inside the
pipeline, so agreement between independent views is the only evidence available
that a number is right.

**Scale still comes from the height you type.** Monocular depth is ambiguous, so
the model's absolute size is a prior rather than a measurement. That is why a
cropped crown is still a hard failure — and NLF *completes* a body that runs out
of shot, so a projected vertex beyond the image edge is exactly the signal that
its position was inferred rather than seen.

### Licence — read this before building a business on it

The NLF code is MIT. The released **weights are for noncommercial research
use.** Correct for a Project Work; a blocker for a company. Settle it
deliberately rather than discover it later.

## Where things run

Nothing heavy is installed on a laptop.

| part | where | why |
|---|---|---|
| `spike/mesh.py` | anywhere | plain numpy; tested against shapes whose girth is known in closed form |
| `spike/nlf.py` | Modal, GPU | torch plus 493 MB of weights |
| `spike/serve.py` | Modal, CPU | validates the upload and calls the GPU function; an HTTP request that never reaches the model does not pay for a GPU |

```bash
.venv/bin/python -m pytest tests/ -q     # the measuring maths, in a second
.venv/bin/modal deploy modal_app.py      # the engine
```

**Deployed:** `https://remondi9425--sartoria-engine-engine.modal.run`

Measured on the live service: about **4 s** warm end to end (2.4 s of that
server-side), and **110 s** cold — a GPU container plus loading half a gigabyte
of TorchScript. Baking the weights into the image is why the cold start is not
much worse.

After a redeploy, containers warm from the previous version keep serving for a
minute or so. If a change seems not to have landed, that is usually why.

## Filming

The protocol is not fussiness. Each rule maps to a specific failure.

| do this | why |
|---|---|
| Stand about 2.5–3 m back, whole body in frame with a palm's margin above the head and below the feet | a cropped crown is a hard failure — there is no scale without it |
| **Fitted** clothing: leggings or shorts and a close top | loose fabric becomes the body's surface, and nothing downstream can tell |
| **Barefoot** or thin socks | shoes add 2–4 cm and move the heel reference |
| Feet 20–30 cm apart | the crotch is found where the slice stops being one body and becomes two legs |
| Turn slowly through a full circle over about 10 seconds | frames that disagree are the only confidence signal there is |
| Even light, no window behind you | |

Save as `data/videos/<name>.mp4`. The filename becomes the session id.

## Taking the tape measurements

The harder half. **The ground truth has error too**, and if it is sloppier than
the thing being tested the whole exercise is worthless.

- A flexible tailor's tape, snug but not compressing.
- **Have someone else measure you.** Self-measuring the waist carries 1–2 cm of
  error, the same size as the effect we are trying to detect.
- Measure twice, write down the second reading.

| site | where |
|---|---|
| waist | natural waist — narrowest point between ribs and hips, *not* where you wear your jeans |
| hip | widest point around the buttocks |
| thigh | 2 cm below the crotch |
| knee | over the middle of the kneecap |
| calf | widest point |
| ankle | narrowest point, just above the ankle bone |
| inseam | crotch to floor, barefoot |
| outseam | natural waist to floor |
| rise | outseam minus inseam (do not measure separately) |

Record in `data/ground_truth.csv`. An empty cell is honest; a zero is not.

## Evaluating

```bash
.venv/bin/python scripts/evaluate.py
```

Prints a per-site table and a verdict. The column that matters most is **bias**,
not MAE: random error averages away with more frames, a systematic offset does
not, and only real people can reveal one.

`POST /debug` returns every frame's own answer alongside the reconciled figure.
With a mesh method the useful diagnostic is not a picture — it is how far the
frames disagree. A site they agree on is measured; one they do not is a guess
wearing a number.

## What is still untested

The engine has never seen a real person. Everything above is verified against
synthetic shapes and a clip of noise. The first recording of an actual body is
the next step, and it needs a camera, not more code.
