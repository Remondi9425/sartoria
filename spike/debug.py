"""Annotated frames, so a wrong number can be looked at instead of guessed at.

Every level the measurement code chose is drawn where it chose it. Most failures
are not arithmetic — they are the waist landing on a belt, the mask swallowing
an arm, or the crotch found at the knees.
"""
from __future__ import annotations

import cv2
import numpy as np

from . import config as C
from . import geometry as G
from .body import Landmarks
from .pipeline import Outcome

INK = (46, 28, 26)          # BGR
AMBER = (88, 164, 224)
RUST = (47, 86, 196)
GO = (149, 192, 111)
WHITE = (255, 255, 255)


def _edge(mask: np.ndarray) -> np.ndarray:
    m = (mask.astype(np.uint8)) * 255
    return cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))


def annotate_front(img: np.ndarray, mask: np.ndarray, lm: Landmarks,
                   height_cm: float) -> np.ndarray:
    out = img.copy()
    out[_edge(mask) > 0] = AMBER

    crown, heel = G.crown_heel(mask)
    scale = G.cm_per_px(height_cm, crown, heel)
    for y, label in ((crown, "crown"), (heel, "heel")):
        cv2.line(out, (0, y), (out.shape[1], y), GO, 1)
        cv2.putText(out, label, (6, max(14, y - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, GO, 1, cv2.LINE_AA)

    crotch = G.find_crotch_y(mask, int(lm.hip_y), int(lm.ankle_y))
    if crotch is not None:
        cv2.line(out, (0, crotch), (out.shape[1], crotch), RUST, 1)
        cv2.putText(out, "crotch", (6, crotch - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, RUST, 1, cv2.LINE_AA)

    # every level the measurement code picked, drawn where it picked it
    waist_y = lm.hip_y - C.WAIST_ABOVE_HIP_FRAC * (lm.hip_y - lm.shoulder_y)
    levels: list[tuple[str, float, float | None]] = [("waist", waist_y, None)]
    if crotch is not None:
        seat = G.widest_between(mask, int(lm.hip_y), int(crotch))
        if seat:
            levels.append(("hip", seat[0], None))
        levels.append(("thigh",
                       crotch + C.THIGH_BELOW_CROTCH_FRAC * (lm.knee_y - crotch),
                       lm.knee_x))
    levels.append(("knee", lm.knee_y, lm.knee_x))
    calf_from = lm.knee_y + C.CALF_BELOW_KNEE_FRAC * (lm.ankle_y - lm.knee_y)
    calf = G.widest_between(mask, int(calf_from), int(lm.ankle_y), lm.knee_x)
    if calf:
        levels.append(("calf", calf[0], lm.knee_x))
    levels.append(("ankle",
                   lm.ankle_y - C.ANKLE_ABOVE_JOINT_FRAC * (lm.ankle_y - lm.knee_y),
                   lm.knee_x))

    for name, y, near_x in levels:
        yi = int(round(y))
        ss = G.spans(mask[yi]) if 0 <= yi < mask.shape[0] else []
        if not ss:
            continue
        s = (max(ss, key=lambda t: t[1] - t[0]) if near_x is None
             else min(ss, key=lambda t: abs((t[0] + t[1]) / 2 - near_x)))
        cv2.line(out, (s[0], yi), (s[1], yi), INK, 2)
        cv2.putText(out, f"{name} {(s[1] - s[0]) * scale:.1f}cm",
                    (s[1] + 6, yi + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.42,
                    INK, 1, cv2.LINE_AA)

    for y, tag in ((lm.shoulder_y, "sh"), (lm.hip_y, "hip"),
                   (lm.knee_y, "kn"), (lm.ankle_y, "ank")):
        cv2.circle(out, (int(lm.knee_x), int(y)), 4, RUST, -1)
        cv2.putText(out, tag, (int(lm.knee_x) + 7, int(y)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.36, RUST, 1, cv2.LINE_AA)
    return out


def annotate_side(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = img.copy()
    out[_edge(mask) > 0] = AMBER
    crown, heel = G.crown_heel(mask)
    for y in (crown, heel):
        cv2.line(out, (0, y), (out.shape[1], y), GO, 1)
    cv2.putText(out, "side view - gives depth", (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 2, cv2.LINE_AA)
    return out


def diagnostics(o: Outcome) -> dict:
    """The numbers that explain an outcome, whatever it was."""
    d: dict = {
        "frames_read": o.frames_read,
        "frames_with_a_person": o.observations,
        "mask_shape": list(o.mask_shape) if o.mask_shape else None,
        "blocking": o.verdict.blocking,
        "coaching": o.verdict.coaching,
        "error": o.error,
    }
    if o.front is not None:
        crown, heel = G.crown_heel(o.front.mask)
        d["front"] = {
            "yaw_deg": round(o.front.yaw, 1),
            "crown_row": crown, "heel_row": heel,
            "person_height_px": heel - crown,
            "cm_per_px": round(G.cm_per_px(
                o.twin.height_cm if o.twin else 174.0, crown, heel), 4),
        }
    if o.side is not None:
        d["side"] = {"yaw_deg": round(o.side.yaw, 1)}
    return d
