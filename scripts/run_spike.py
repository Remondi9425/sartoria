#!/usr/bin/env python3
"""One clip and a height in, one digital twin out.

    python scripts/run_spike.py data/videos/andrea.mp4 --height 178
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from spike import capture, geometry as G, pose, twin
from spike.body import MeasurementError, measure


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("video", type=Path)
    ap.add_argument("--height", type=float, required=True, help="stature in cm")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--session", default=None)
    a = ap.parse_args()

    session = a.session or a.video.stem
    frames = capture.read_frames(a.video)
    obs = pose.observe(frames)
    masks = [o.mask for o in obs]
    yaws = [o.yaw for o in obs]
    verdict = capture.judge(masks, frames, yaws)

    borders = [G.touches_border(m) for m in masks]
    front, side = pose.pick_views(obs)
    # with nothing detected these are unknown, not fine
    seen = lambda k: (not any(b[k] for b in borders)) if borders else None
    quality = twin.CaptureQuality(
        head_visible=seen("top"),
        feet_visible=seen("bottom"),
        body_in_frame=(not any(b["left"] or b["right"] for b in borders))
                      if borders else None,
        usable_frames=len(obs),
        rotation_coverage=round(G.rotation_coverage(yaws), 2),
        frontal_yaw_deg=round(front.yaw, 1) if front else None,
        profile_yaw_deg=round(side.yaw, 1) if side else None,
    )

    if not verdict.ok:
        out = twin.refused(session, a.height, verdict, quality)
    elif front is None or side is None:
        missing = "facing the camera" if front is None else "side on"
        verdict.blocking.append(
            f"We never saw you {missing}. Turn all the way round slowly so we "
            f"can see both your width and your depth.")
        out = twin.refused(session, a.height, verdict, quality)
    else:
        try:
            ms = measure(front.mask, side.mask, pose.landmarks_for(front), a.height)
            out = twin.build(session, a.height, ms, quality).to_json()
        except MeasurementError as e:
            verdict.blocking.append(str(e))
            out = twin.refused(session, a.height, verdict, quality)

    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(out, encoding="utf-8")
        print(f"wrote {a.out}")
    else:
        print(out)
    for c in verdict.coaching:
        print(f"  coaching: {c}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
