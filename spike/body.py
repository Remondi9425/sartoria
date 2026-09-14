"""Turn two silhouettes and a handful of landmarks into nine measurements.

The front view gives every width, the side view gives every depth, and the two
are aligned by height fraction rather than by pixel row because the person is
rarely the same distance from the camera in both.
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from . import config as C
from . import geometry as G


@dataclass(frozen=True)
class Landmarks:
    """Rows and columns in the FRONT frame, in pixels."""
    shoulder_y: float
    hip_y: float
    knee_y: float
    ankle_y: float
    knee_x: float               # picks which leg to measure


@dataclass
class Measurement:
    cm: float
    quality: str                # high | medium | low
    note: str = ""


class MeasurementError(RuntimeError):
    pass


def _t_of(y: float, crown: int, heel: int) -> float:
    """Height fraction: 0 at the heel, 1 at the crown."""
    return (heel - y) / float(heel - crown)


def _y_of(t: float, crown: int, heel: int) -> float:
    return heel - t * (heel - crown)


def _stability(mask: np.ndarray, y: float, near_x: float | None,
               band_px: int = 3) -> tuple[float, float]:
    """Mean and relative spread of the width over a few rows either side.

    A level sitting on a steep part of the body, or on a noisy mask edge, shows
    up here as a wide spread — which is the honest basis for a confidence label.
    """
    vals = [w for dy in range(-band_px, band_px + 1)
            if (w := G.width_px_at(mask, y + dy, near_x)) is not None]
    if not vals:
        raise MeasurementError(f"no body pixels near row {y:.0f}")
    arr = np.asarray(vals, dtype=float)
    mean = float(arr.mean())
    return mean, float(arr.std() / mean) if mean else 1.0


def _quality(name: str, cm: float, spread: float) -> tuple[str, str]:
    lo, hi = C.PLAUSIBLE_CM[name]
    if not lo <= cm <= hi:
        return "low", f"outside the plausible range {lo:.0f}–{hi:.0f} cm"
    if spread > 0.06:
        return "low", "silhouette width changes sharply at this level"
    if spread > 0.025:
        return "medium", ""
    return "high", ""


def measure(front: np.ndarray, side: np.ndarray, lm: Landmarks,
            height_cm: float) -> dict[str, Measurement]:
    """The nine measurements, in centimetres.

    Raises MeasurementError when the capture cannot support them at all — a
    missing crown, or legs that never separate.
    """
    fc, fh = G.crown_heel(front)
    sc, sh = G.crown_heel(side)
    scale_f = G.cm_per_px(height_cm, fc, fh)
    scale_s = G.cm_per_px(height_cm, sc, sh)

    crotch_y = G.find_crotch_y(front, int(lm.hip_y), int(lm.ankle_y))
    if crotch_y is None:
        raise MeasurementError(
            "the legs never separate in this frame — ask for a stance with a "
            "gap between the feet")

    # ── where each circumference sits ───────────────────────────────────────
    waist_y = lm.hip_y - C.WAIST_ABOVE_HIP_FRAC * (lm.hip_y - lm.shoulder_y)
    thigh_y = crotch_y + C.THIGH_BELOW_CROTCH_FRAC * (lm.knee_y - crotch_y)
    ankle_y = lm.ankle_y - C.ANKLE_ABOVE_JOINT_FRAC * (lm.ankle_y - lm.knee_y)

    seat = G.widest_between(front, int(lm.hip_y), int(crotch_y))
    if seat is None:
        raise MeasurementError("no usable rows between hip and crotch")
    hip_y = seat[0]

    # start below the knee: the knee is often wider than the calf, and the
    # calf belly sits in the upper third of the lower leg anyway
    calf_from = lm.knee_y + C.CALF_BELOW_KNEE_FRAC * (lm.ankle_y - lm.knee_y)
    calf = G.widest_between(front, int(calf_from), int(lm.ankle_y), lm.knee_x)
    calf_y = calf[0] if calf else (lm.knee_y + lm.ankle_y) / 2

    levels = {
        "waist": (waist_y, None),
        "hip":   (hip_y,   None),
        "thigh": (thigh_y, lm.knee_x),
        "knee":  (lm.knee_y, lm.knee_x),
        "calf":  (calf_y,  lm.knee_x),
        "ankle": (ankle_y, lm.knee_x),
    }

    out: dict[str, Measurement] = {}
    for name, (y, near_x) in levels.items():
        w_px, w_spread = _stability(front, y, near_x)
        t = _t_of(y, fc, fh)
        y_side = _y_of(t, sc, sh)
        d_px, d_spread = _stability(side, y_side, None)
        cm = G.circumference(w_px * scale_f, d_px * scale_s)
        q, note = _quality(name, cm, max(w_spread, d_spread))
        out[name] = Measurement(round(cm, 1), q, note)

    # ── lengths come straight off the height fractions ──────────────────────
    inseam = _t_of(crotch_y, fc, fh) * height_cm
    outseam = _t_of(waist_y, fc, fh) * height_cm
    for name, cm in (("inseam", inseam), ("outseam", outseam),
                     ("rise", outseam - inseam)):
        lo, hi = C.PLAUSIBLE_CM[name]
        q = "high" if lo <= cm <= hi else "low"
        note = "" if q == "high" else f"outside the plausible range {lo:.0f}–{hi:.0f} cm"
        out[name] = Measurement(round(cm, 1), q, note)

    return out
