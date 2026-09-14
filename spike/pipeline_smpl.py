"""The SMPL measurement path, end to end.

Replaces the silhouette method rather than sitting beside it: one automatic way
of measuring, and when it cannot deliver, the app asks which jeans the person
already owns instead of falling back to a weaker guess.

Note what this drops. There is no segmentation mask and no MediaPipe here — the
gates are read off the projected mesh instead. NLF completes a body even when
part of it is outside the frame, so a vertex landing beyond the image edge is
precisely the signal that its position was inferred rather than seen, which is
what the head gate was always about.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import capture, config as C, nlf, twin as T

CROWN_TOLERANCE = C.CROWN_TOLERANCE
MIN_MEASURED_FRAMES = 4


@dataclass
class SmplOutcome:
    twin: T.DigitalTwin | None
    verdict: capture.Verdict
    quality: T.CaptureQuality
    frames_read: int = 0
    meshes: int = 0
    measured: int = 0
    scale_correction: float | None = None       # 1.0 = the model's size was right
    mean_uncertainty: float | None = None
    per_frame: list[dict[str, float]] = field(default_factory=list)


def run(video: str | Path, height_cm: float, session_id: str, model) -> SmplOutcome:
    frames = capture.read_frames(video)
    images = [f.image for f in frames]

    meshes, outside = nlf.meshes_from_frames(model, images, height_cm), []
    verdict = capture.Verdict(ok=True)

    if not meshes:
        verdict.blocking.append(
            "We could not find a person in this clip. Film your whole body, "
            "head to feet, against a plain background.")
        verdict.ok = False
        return SmplOutcome(None, verdict, T.CaptureQuality(
            None, None, None, 0, 0.0, None, None), len(frames))

    for fm in meshes:
        outside.append(fm.outside_frame)
    frac = lambda k: sum(o[k] for o in outside) / len(outside)

    quality = T.CaptureQuality(
        head_visible=frac("top") <= CROWN_TOLERANCE,
        feet_visible=frac("bottom") <= CROWN_TOLERANCE,
        body_in_frame=max(frac("left"), frac("right")) <= CROWN_TOLERANCE,
        usable_frames=len(meshes),
        rotation_coverage=0.0,
        frontal_yaw_deg=None, profile_yaw_deg=None,
    )

    if not quality.head_visible:
        verdict.blocking.append(
            "We can't see the top of your head. We need your whole body, head "
            "to feet, to turn the video into centimetres — move the phone "
            "further away and record again.")
    if not quality.feet_visible:
        verdict.blocking.append(
            "Your feet are cut off. Without them there is nothing to measure "
            "the leg against — step back and record again.")
    if len(meshes) < MIN_MEASURED_FRAMES:
        verdict.blocking.append(
            f"Only {len(meshes)} usable frames — we need at least "
            f"{MIN_MEASURED_FRAMES}. Film for about ten seconds.")

    out = SmplOutcome(None, verdict, quality, len(frames), len(meshes))
    out.scale_correction = round(float(np.median([m.scale_factor for m in meshes]) / 100.0), 3)
    unc = [m.uncertainty for m in meshes if np.isfinite(m.uncertainty)]
    out.mean_uncertainty = round(float(np.mean(unc)), 4) if unc else None

    if verdict.blocking:
        verdict.ok = False
        return out

    per_frame = [m for m in (nlf.measure_one(fm) for fm in meshes) if m]
    out.per_frame = per_frame
    out.measured = len(per_frame)

    if len(per_frame) < MIN_MEASURED_FRAMES:
        verdict.blocking.append(
            "We found you, but could not tell your legs apart in enough of the "
            "frames. Stand with your feet 20–30 cm apart and record again.")
        verdict.ok = False
        return out

    values, conf = nlf.reconcile(per_frame)
    missing = [s for s in C.ALL_MEASUREMENTS if s not in values]
    if missing:
        verdict.blocking.append(
            f"We could not read {', '.join(missing)} from this clip. Record "
            f"again, turning all the way round.")
        verdict.ok = False
        return out

    ms = {s: T.Measurement(values[s], conf[s]) for s in C.ALL_MEASUREMENTS}
    out.twin = T.build(session_id, height_cm, ms, quality)
    out.twin.processing_method = "nlf_smpl_hull_v1"
    return out
