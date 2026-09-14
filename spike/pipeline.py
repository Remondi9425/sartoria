"""One clip in, one twin out — the whole measurement path in a single call.

Extracted from the CLI so the HTTP service and the command line run exactly the
same code. A worker that behaves differently from the thing we tested would be
worse than no worker.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import capture, geometry as G, pose, twin as T
from .body import MeasurementError, Landmarks, measure


@dataclass
class Outcome:
    """Either a twin or a refusal, plus everything needed to debug it."""
    twin: T.DigitalTwin | None
    verdict: capture.Verdict
    quality: T.CaptureQuality
    frames_read: int
    observations: int
    front: pose.Observation | None
    side: pose.Observation | None
    landmarks: Landmarks | None
    mask_shape: tuple[int, int] | None
    error: str | None = None

    def to_json(self) -> str:
        if self.twin is not None:
            return self.twin.to_json()
        return T.refused("", self.twin.height_cm if self.twin else 0.0,
                         self.verdict, self.quality)


def run(video: str | Path, height_cm: float, session_id: str) -> Outcome:
    frames = capture.read_frames(video)
    obs = pose.observe(frames)
    masks = [o.mask for o in obs]
    yaws = [o.yaw for o in obs]
    verdict = capture.judge(masks, frames, yaws)

    borders = [G.touches_border(m) for m in masks]
    seen = lambda k: (not any(b[k] for b in borders)) if borders else None
    front, side = pose.pick_views(obs)

    quality = T.CaptureQuality(
        head_visible=seen("top"),
        feet_visible=seen("bottom"),
        body_in_frame=(not any(b["left"] or b["right"] for b in borders))
                      if borders else None,
        usable_frames=len(obs),
        rotation_coverage=round(G.rotation_coverage(yaws), 2),
        frontal_yaw_deg=round(front.yaw, 1) if front else None,
        profile_yaw_deg=round(side.yaw, 1) if side else None,
    )
    out = Outcome(None, verdict, quality, len(frames), len(obs), front, side,
                  None, masks[0].shape if masks else None)

    if not verdict.ok:
        return out

    if front is None or side is None:
        missing = "facing the camera" if front is None else "side on"
        verdict.blocking.append(
            f"We never saw you {missing}. Turn all the way round slowly so we "
            f"can see both your width and your depth.")
        verdict.ok = False
        return out

    lm = pose.landmarks_for(front)
    out.landmarks = lm
    try:
        ms = measure(front.mask, side.mask, lm, height_cm)
    except MeasurementError as e:
        verdict.blocking.append(str(e))
        verdict.ok = False
        out.error = str(e)
        return out

    out.twin = T.build(session_id, height_cm, ms, quality)
    return out
