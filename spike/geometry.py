"""Pure geometry over silhouette masks — no MediaPipe, no video, no I/O.

Everything here is deterministic and testable against a body whose real
measurements we already know, which is what tests/test_synthetic.py does.
"""
from __future__ import annotations

import math
import numpy as np

Span = tuple[int, int]          # [x0, x1) of a contiguous run of body pixels


# ── silhouette primitives ───────────────────────────────────────────────────
def spans(row: np.ndarray, min_len: int = 2) -> list[Span]:
    """Contiguous runs of True in a 1-D boolean row, longer than min_len."""
    if not row.any():
        return []
    edges = np.diff(row.astype(np.int8))
    starts = list(np.flatnonzero(edges == 1) + 1)
    ends = list(np.flatnonzero(edges == -1) + 1)
    if row[0]:
        starts.insert(0, 0)
    if row[-1]:
        ends.append(len(row))
    return [(s, e) for s, e in zip(starts, ends) if e - s >= min_len]


def crown_heel(mask: np.ndarray) -> tuple[int, int]:
    """Topmost and bottommost body rows. The scale depends on both existing."""
    rows = np.flatnonzero(mask.any(axis=1))
    if rows.size == 0:
        raise ValueError("empty mask: no body pixels")
    return int(rows[0]), int(rows[-1])


def touches_border(mask: np.ndarray, margin: int = 2) -> dict[str, bool]:
    """Which frame edges the body runs into. Any True means the body is cropped."""
    m = margin
    return {
        "top": bool(mask[:m, :].any()),
        "bottom": bool(mask[-m:, :].any()),
        "left": bool(mask[:, :m].any()),
        "right": bool(mask[:, -m:].any()),
    }


def find_crotch_y(mask: np.ndarray, y_hip: int, y_ankle: int,
                  confirm_rows: int = 4) -> int | None:
    """The row where the two legs merge into one body.

    Scans upward from the ankles. Below the crotch a row cuts through two legs
    and yields two spans; at and above it, one. We require several consecutive
    single-span rows so a momentary touch between the knees does not win.
    """
    y_lo, y_hi = int(min(y_hip, y_ankle)), int(max(y_hip, y_ankle))
    y_lo, y_hi = max(y_lo, 0), min(y_hi, mask.shape[0] - 1)
    run = 0
    for y in range(y_hi, y_lo - 1, -1):
        n = len(spans(mask[y]))
        if n == 1:
            run += 1
            if run >= confirm_rows:
                return y + confirm_rows - 1      # first single-span row going up
        elif n >= 2:
            run = 0
    return None


def width_px_at(mask: np.ndarray, y: int, near_x: float | None = None) -> float | None:
    """Horizontal extent of the body at row y.

    With two spans (below the crotch) the one nearest near_x is taken, so a
    single leg is measured rather than the gap between them.
    """
    y = int(round(y))
    if not 0 <= y < mask.shape[0]:
        return None
    ss = spans(mask[y])
    if not ss:
        return None
    if len(ss) == 1 or near_x is None:
        s = max(ss, key=lambda t: t[1] - t[0])
    else:
        s = min(ss, key=lambda t: abs((t[0] + t[1]) / 2 - near_x))
    return float(s[1] - s[0])


def widest_between(mask: np.ndarray, y_from: int, y_to: int,
                   near_x: float | None = None) -> tuple[int, float] | None:
    """Row of maximum width in a band, and that width. Used for seat and calf,
    where the anatomy defines the level rather than a landmark."""
    y0, y1 = sorted((int(y_from), int(y_to)))
    best = None
    for y in range(max(y0, 0), min(y1, mask.shape[0] - 1) + 1):
        w = width_px_at(mask, y, near_x)
        if w is not None and (best is None or w > best[1]):
            best = (y, w)
    return best


# ── scale ───────────────────────────────────────────────────────────────────
def cm_per_px(height_cm: float, y_crown: int, y_heel: int) -> float:
    """The one number that turns ratios into centimetres.

    This is why a cropped head is fatal: without both ends of the person there
    is no denominator, and every measurement stays a ratio forever.
    """
    extent = abs(y_heel - y_crown)
    if extent < 1:
        raise ValueError("crown and heel are the same row — no usable extent")
    return float(height_cm) / float(extent)


# ── circumference ───────────────────────────────────────────────────────────
def ellipse_perimeter(a: float, b: float) -> float:
    """Ramanujan's second approximation. Error stays under 1e-5 for the
    eccentricities a human limb produces."""
    if a < 0 or b < 0:
        raise ValueError("semi-axes must be non-negative")
    if a + b == 0:
        return 0.0
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def circumference(width: float, depth: float) -> float:
    """Girth from a frontal width and a side-on depth, assuming the cross
    section is an ellipse.

    That assumption is the single largest modelling error in this pipeline: a
    waist is flatter than an ellipse and a calf is rounder, so expect a bias
    that differs per site. Measuring that bias is the point of the spike.
    """
    return ellipse_perimeter(width / 2.0, depth / 2.0)


# ── frame orientation ───────────────────────────────────────────────────────
def yaw_deg(shoulder_l: np.ndarray, shoulder_r: np.ndarray) -> float:
    """Body rotation about the vertical axis, from the 3-D shoulder vector.

    0° faces the camera, ±90° is side-on. Needs world landmarks (metres),
    not the normalised image ones.
    """
    dx = float(shoulder_r[0] - shoulder_l[0])
    dz = float(shoulder_r[2] - shoulder_l[2])
    return math.degrees(math.atan2(dz, dx))


def rotation_coverage(yaws: list[float]) -> float:
    """How much of a half-turn the clip actually shows, 0..1.

    Twelve 15° buckets over ±90°; the fraction of them with at least one frame.
    """
    if not yaws:
        return 0.0
    buckets = {min(11, max(0, int((y + 90.0) / 15.0))) for y in yaws}
    return len(buckets) / 12.0
