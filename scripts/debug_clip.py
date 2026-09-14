#!/usr/bin/env python3
"""Run a clip through the engine and write out what it saw.

    python scripts/debug_clip.py data/videos/andrea.mp4 --height 178

Writes out/debug/front.png and side.png with every measurement level drawn
where the code chose it, plus the diagnostics as JSON. When a number looks
wrong, look at these before changing any constant.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2

from spike import debug as D
from spike.pipeline import run


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("video", type=Path)
    ap.add_argument("--height", type=float, required=True)
    ap.add_argument("--out", type=Path, default=Path("out/debug"))
    a = ap.parse_args()

    out = run(a.video, a.height, a.video.stem)
    a.out.mkdir(parents=True, exist_ok=True)

    diag = D.diagnostics(out)
    (a.out / "diagnostics.json").write_text(json.dumps(diag, indent=2))
    print(json.dumps(diag, indent=2))

    if out.front is not None and out.landmarks is not None:
        cap = cv2.VideoCapture(str(a.video))
        cap.set(cv2.CAP_PROP_POS_FRAMES, out.front.frame_index)
        ok, img = cap.read()
        if ok:
            cv2.imwrite(str(a.out / "front.png"),
                        D.annotate_front(img, out.front.mask, out.landmarks, a.height))
            print(f"wrote {a.out / 'front.png'}")
        if out.side is not None:
            cap.set(cv2.CAP_PROP_POS_FRAMES, out.side.frame_index)
            ok, img = cap.read()
            if ok:
                cv2.imwrite(str(a.out / "side.png"),
                            D.annotate_side(img, out.side.mask))
                print(f"wrote {a.out / 'side.png'}")
        cap.release()

    if out.twin is not None:
        (a.out / "twin.json").write_text(out.twin.to_json())
        print(f"wrote {a.out / 'twin.json'}")
        for k, v in out.twin.measurements_cm.items():
            print(f"  {k:<8} {v:>6.1f} cm   {out.twin.measurement_confidence[k]}")
    else:
        print("\nno twin — blocked:")
        for r in out.verdict.blocking:
            print("  ·", r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
