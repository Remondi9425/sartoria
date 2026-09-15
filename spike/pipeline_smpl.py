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

from . import capture, config as C, mesh as M, nlf, twin as T

CROWN_TOLERANCE = C.CROWN_TOLERANCE
MIN_MEASURED_FRAMES = 4


@dataclass
class Turn:
    """What the clip showed of the body turning."""
    coverage: float
    frontal_yaw: float | None
    profile_yaw: float | None
    blocking: str | None
    coaching: str | None


def judge_turn(yaws: list[float]) -> Turn:
    """Whether the camera ever saw the side.

    Depth is only measured if it did. From the front a body model still returns
    a full mesh, but its depth there is the model's prior rather than anything
    about this person — and frontal frames agree with one another, so agreement
    between them would report high confidence in a number never observed.
    """
    folded = [((y + 90.0) % 180.0) - 90.0 for y in yaws]
    if not folded:
        return Turn(0.0, None, None,
                    "We could not tell which way you were facing in any frame.",
                    None)

    frontal = min(folded, key=abs)
    profile = max(folded, key=abs)
    coverage = M.rotation_coverage(yaws)

    saw_front = abs(frontal) <= C.FRONTAL_YAW_TOL_DEG
    saw_side = abs(profile) >= C.PROFILE_YAW_MIN_DEG
    if not (saw_front and saw_side):
        missing = "from the side" if saw_front else "face on"
        return Turn(coverage, frontal, profile,
                    f"We never saw you {missing}. Turn all the way round "
                    f"slowly — without a side view we would be guessing how "
                    f"deep you are, not measuring it.", None)

    coaching = (None if coverage >= C.ROTATION_COVERAGE_MIN else
                "Turn more slowly next time — we caught the front and the "
                "side, but not much in between.")
    return Turn(coverage, frontal, profile, None, coaching)


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
    spreads: dict[str, float] = field(default_factory=dict)
    probe: dict | None = None
    frame_detail: list[dict] = field(default_factory=list)


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

    turn = judge_turn([m.yaw for m in meshes])

    quality = T.CaptureQuality(
        head_visible=frac("top") <= CROWN_TOLERANCE,
        feet_visible=frac("bottom") <= CROWN_TOLERANCE,
        body_in_frame=max(frac("left"), frac("right")) <= CROWN_TOLERANCE,
        usable_frames=len(meshes),
        rotation_coverage=round(turn.coverage, 2),
        frontal_yaw_deg=round(turn.frontal_yaw, 1) if turn.frontal_yaw is not None else None,
        profile_yaw_deg=round(turn.profile_yaw, 1) if turn.profile_yaw is not None else None,
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

    if turn.blocking:
        verdict.blocking.append(turn.blocking)
    if turn.coaching:
        verdict.coaching.append(turn.coaching)

    out = SmplOutcome(None, verdict, quality, len(frames), len(meshes))
    out.scale_correction = round(float(np.median([m.scale_factor for m in meshes]) / 100.0), 3)
    unc = [m.uncertainty for m in meshes if np.isfinite(m.uncertainty)]
    out.mean_uncertainty = round(float(np.mean(unc)), 4) if unc else None

    if verdict.blocking:
        verdict.ok = False
        return out

    out.probe = nlf.probe(meshes[len(meshes) // 2])
    paired = [(fm, nlf.measure_one(fm)) for fm in meshes]
    out.frame_detail = [
        {"uncertainty": round(fm.uncertainty, 2),
         "waist": round(m["waist"], 1), "hip": round(m["hip"], 1),
         "thigh": round(m["thigh"], 1), "knee": round(m["knee"], 1)}
        for fm, m in paired if m]
    per_frame = [m for _, m in paired if m]
    out.per_frame = per_frame
    out.measured = len(per_frame)

    if len(per_frame) < MIN_MEASURED_FRAMES:
        verdict.blocking.append(
            "We found you, but could not tell your legs apart in enough of the "
            "frames. Stand with your feet 20–30 cm apart and record again.")
        verdict.ok = False
        return out

    values, conf, spreads = nlf.reconcile(per_frame)
    out.spreads = spreads
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
