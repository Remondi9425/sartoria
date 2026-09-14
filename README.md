# SartorIA — measurement spike

One question, and nothing else:

> **Does a phone video give leg measurements good enough to pick a jeans size?**

Every architectural argument about this project is downstream of that number.
Until it exists, the rest is opinion. So this directory contains no UI, no
database and no agents — just the shortest path from a clip to a figure we can
put next to a tape measure.

The answer decides the product:

| result (waist / inseam) | what it means |
|---|---|
| MAE ≤ 2 cm | the video route holds; build on it |
| ≤ 2 cm only after removing a per-site bias | it holds, with a calibration constant |
| 2–4 cm | borderline — usable only with the wardrobe anchor as a cross-check |
| > 4 cm | the wardrobe anchor becomes the primary path, and the video is a bonus |

---

## Setup

This machine is an Intel Mac and its system Python is 3.14, which is too new
for MediaPipe. The project runs on a pinned 3.12 managed by `uv`.

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv -r <(echo "mediapipe>=0.10.14
opencv-python>=4.10
numpy>=1.26,<2.3
pytest>=8.0")
```

Then check the geometry is intact — these run in under a second and need no
video, no model and no network:

```bash
.venv/bin/python -m pytest tests/ -q
```

---

## Filming

The protocol is not fussiness. Each rule below maps to a specific failure in
the pipeline, named in the right-hand column.

| do this | why |
|---|---|
| Plain wall, clothes that contrast with it | the whole method is silhouette-based; a busy background corrupts the mask |
| Phone **vertical**, propped on something stable, roughly chest height | handheld drift changes the scale between frames |
| Stand about 2.5–3 m away, whole body in frame with a palm's margin above the head and below the feet | a cropped crown is a hard failure — there is no scale without it |
| **Fitted** clothing: leggings or shorts and a close top | loose fabric is measured instead of the body, and nothing downstream can tell |
| **Barefoot** or thin socks | shoes add 2–4 cm and move the heel reference |
| Arms held slightly away from the body | touching arms merge into the torso silhouette |
| Feet 20–30 cm apart | the crotch is found where the two legs separate; feet together and it cannot be found at all |
| Turn slowly through a **full circle** over about 10 seconds | width comes from the front view and depth from the side; one without the other gives no circumference |
| Even light, no window behind you | backlighting turns the body into a dark blob with no edge |

Save as `data/videos/<name>.mp4`. The filename becomes the session id.

## Taking the tape measurements

This is the harder half. **The ground truth has error too**, and if it is
sloppier than the thing being tested the whole exercise is worthless.

- Use a flexible tailor's tape, snug but not compressing the flesh.
- **Have someone else measure you.** Self-measuring the waist carries 1–2 cm of
  error, which is the same size as the effect we are trying to detect.
- Measure twice and write down the second reading.

| site | where |
|---|---|
| waist | natural waist — the narrowest point between ribs and hips, *not* where you happen to wear your jeans |
| hip | the widest point around the buttocks |
| thigh | 2 cm below the crotch |
| knee | over the middle of the kneecap |
| calf | the widest point |
| ankle | the narrowest point, just above the ankle bone |
| inseam | crotch to floor, barefoot — press a book up between the legs and measure to the floor |
| outseam | natural waist to floor |
| rise | outseam minus inseam (do not measure it separately) |

Record everything in `data/ground_truth.csv`. Leave a cell empty if you did not
measure it; an empty cell is honest, a zero is not.

Note the ambiguity in "waist": brands publish charts against both the natural
waist and the point where the garment sits. Which one a chart means is a
separate problem, and it belongs to the Catalog Ingestor, not here.

---

## Running as a service

The same pipeline behind HTTP, which is how the web app reaches it:

```bash
.venv/bin/uvicorn spike.serve:app --port 8000 --reload
```

| endpoint | what it gives back |
|---|---|
| `POST /analyse` | the twin, or a refusal with a named cause — never a bare 500 |
| `POST /debug` | the same run, plus annotated frames showing every level it chose |
| `GET /health` | is it up |

Then set `NEXT_PUBLIC_ENGINE_URL=http://127.0.0.1:8000` in `web/.env.local` and
the customer app measures for real instead of inventing numbers.

Verified: a clip recorded in Chrome comes back as **VP9 inside an MP4
container**, which is an odd pairing, and OpenCV decodes it — 84 frames from a
3-second capture. A clip it genuinely cannot open now says so specifically,
rather than being reported as "no person in the clip".

## Running on a file

```bash
# one clip
.venv/bin/python scripts/run_spike.py data/videos/andrea.mp4 --height 178 --out out/andrea.json

# everything, once ground_truth.csv is filled in
for v in data/videos/*.mp4; do
  # height must come from the csv; this is why the spike is not yet a batch job
  .venv/bin/python scripts/run_spike.py "$v" --height 178 --out "out/$(basename "${v%.*}").json"
done
.venv/bin/python scripts/evaluate.py
```

When a number looks wrong, look before changing a constant:

```bash
python scripts/debug_clip.py data/videos/andrea.mp4 --height 178
```

That writes `out/debug/front.png` with the mask edge, the crown and heel rows,
the crotch, and every measurement level drawn where the code chose it — plus
the width it read at each one. Most failures are not arithmetic: they are the
waist landing on a belt, the mask swallowing an arm, or the crotch found at the
knees.

`evaluate.py` prints a per-site table and a verdict. The column that matters
most is **bias**, not MAE: random error averages away with more frames, but a
systematic offset — which is exactly what the cross-section assumption below
produces — can only be found by measuring real people, and then subtracted.

---

## How it actually works

1. **Frames** — sample up to 90 frames across the clip, so the whole turn is
   represented rather than just the opening second.
2. **Pose and mask** — MediaPipe `PoseLandmarker` (heavy) gives 33 landmarks
   plus a person segmentation mask per frame.
3. **Gates** — head or feet cropped, body wider than the frame, too few frames,
   person too small: each stops everything and returns a named cause. Blur,
   lighting and insufficient rotation only produce advice.
4. **Scale** — `height_cm ÷ (heel row − crown row)`. This is why a cropped
   crown is fatal rather than merely inconvenient: without both ends of the
   person there is no denominator, and every measurement stays a ratio.
5. **Views** — body yaw is computed from the 3-D shoulder vector; the most
   face-on frame gives every width, the most side-on frame every depth. They
   are aligned by height fraction, not by pixel row, because the person is
   rarely the same distance from the camera in both.
6. **Levels** — knee and ankle come from landmarks; seat and calf from the
   widest row in an anatomical band; the crotch from where the silhouette stops
   having two legs; the waist from a stature proportion, because MediaPipe has
   no waist landmark.
7. **Girth** — each cross-section is treated as an ellipse with the measured
   width and depth as its axes, and its perimeter taken by Ramanujan's
   approximation.

## What is wrong with it

Stated up front, because the evaluation exists to quantify exactly these.

- **Bodies are not ellipses.** A waist is flatter, a calf is rounder. This
  produces a systematic per-site bias, and it is the single largest modelling
  error here. It is also the easiest to fix once measured.
- **One camera has perspective.** The scale assumes the person is flat-on and
  far away. At 2.5 m they are neither, and the parts nearer the lens read
  slightly larger.
- **The waist is inferred, not seen.** `WAIST_ABOVE_HIP_FRAC` comes from
  published adult proportions and is calibration target number one. It almost
  certainly differs between men and women.
- **The legs occlude each other side-on.** The depth of a thigh is really the
  depth of both thighs overlapping.
- **Clothing is measured, not the body.** Nothing in the pipeline can tell the
  difference. The capture rules are the only defence.
- **Ten people is not a sample.** It can show a method is hopeless, or that it
  is promising. It cannot establish accuracy.

## What the tests prove, and what they do not

`tests/test_synthetic.py` runs the whole extraction against a mannequin built
from stacked ellipses whose measurements are known exactly. It proves the
scale, the crotch detection, the level placement and the width reading.

It **cannot** prove the elliptical cross-section assumption, because the
mannequin is built from ellipses — that assumption is true by construction
there. Only a tape measure around a real person can test it. That is the whole
reason this spike needs real people and not more code.

## Layout

```
spike/
  config.py      constants, every one a calibration target
  geometry.py    pure maths over masks — no MediaPipe, no I/O, fully tested
  capture.py     video to frames; the blocking gates and the coaching signals
  pose.py        MediaPipe wrapper; landmarks, masks, body yaw, view selection
  body.py        the nine measurements
  twin.py        the digital-twin record and its quality tier
  synthetic.py   a mannequin whose answers are known
  evaluate.py    error against the tape, and the verdict
scripts/
  run_spike.py   one clip + a height -> one twin
  evaluate.py    every twin vs ground_truth.csv
```
