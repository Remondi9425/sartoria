"""Measuring a body from a cloud of surface points.

No MediaPipe, no torch, no body-model files — just numpy over points, so this is
testable on a shape whose answers are known. The neural part lives in nlf.py and
only produces the points.

The central choice here is the convex hull. A tape measure pulled round a thigh
spans the dips; it does not sink into them. So the girth of a cross-section is
the perimeter of its convex hull, not of the outline itself. That is also why
this is better than the ellipse it replaces: an ellipse assumed a shape, a hull
measures the one that is there.
"""
from __future__ import annotations

import numpy as np

Points = np.ndarray            # (N, 3), metres, +Y up after canonicalise()


# ── hull ────────────────────────────────────────────────────────────────────
def convex_hull(xz: np.ndarray) -> np.ndarray:
    """Andrew's monotone chain. Returns the hull in order, counter-clockwise."""
    if len(xz) < 3:
        return xz
    p = xz[np.lexsort((xz[:, 1], xz[:, 0]))]
    cross = lambda o, a, b: ((a[0] - o[0]) * (b[1] - o[1])
                             - (a[1] - o[1]) * (b[0] - o[0]))

    def half(pts):
        out: list[np.ndarray] = []
        for q in pts:
            while len(out) >= 2 and cross(out[-2], out[-1], q) <= 0:
                out.pop()
            out.append(q)
        return out[:-1]

    return np.array(half(p) + half(p[::-1]))


def perimeter(poly: np.ndarray) -> float:
    if len(poly) < 3:
        return 0.0
    d = poly - np.roll(poly, -1, axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


# ── slicing ─────────────────────────────────────────────────────────────────
def _limb_split(xs: np.ndarray) -> float | None:
    """Where a slice falls into two limbs, in x. None if it is one body.

    These are surface points, so a single cross-section is a closed loop with
    nothing inside it — "is the middle empty" cannot tell one limb from two.
    What does is the gap in the x projection: within one loop the points are
    spread evenly, and between two loops there is an interval containing
    nothing at all.

    Compared against the spread of the other gaps rather than against the
    body's width, so it holds for any units and any build. An absolute
    threshold does not: real thighs can sit two centimetres apart.
    """
    if len(xs) < 12:
        return None
    xs = np.sort(xs)
    gaps = np.diff(xs)
    if not len(gaps):
        return None
    typical = float(np.percentile(gaps, 95))
    i = int(np.argmax(gaps))
    if typical <= 0 or gaps[i] < 5 * typical:
        return None
    if (i + 1) < 4 or (len(xs) - i - 1) < 4:      # need a real limb either side
        return None
    return float((xs[i] + xs[i + 1]) / 2)


def slice_at(points: Points, y: float, band: float,
             near_x: float | None = None) -> np.ndarray:
    """Points within ±band of height y, projected to the horizontal plane.

    Below the crotch a slice contains two legs. near_x keeps the one nearest
    that coordinate, so a girth is measured round one limb and not round the
    pair — which would read roughly double.
    """
    m = np.abs(points[:, 1] - y) <= band
    sel = points[m][:, [0, 2]]
    if near_x is None or len(sel) == 0:
        return sel
    cut = _limb_split(sel[:, 0])
    if cut is None:
        return sel
    return sel[sel[:, 0] > cut] if near_x > cut else sel[sel[:, 0] < cut]


def girth_at(points: Points, y: float, band: float,
             near_x: float | None = None) -> float | None:
    """Circumference at height y, in the units the points are in."""
    sl = slice_at(points, y, band, near_x)
    if len(sl) < 8:
        return None
    return perimeter(convex_hull(sl))


# ── canonicalise ────────────────────────────────────────────────────────────
def upright(points: Points, pelvis: np.ndarray, neck: np.ndarray) -> Points:
    """Rotate so the body's own spine is vertical.

    The camera is never level and the person is never square to it. Slicing a
    tilted body horizontally would cut ellipses through the limbs and read every
    girth too large.
    """
    up = neck - pelvis
    n = np.linalg.norm(up)
    if n < 1e-6:
        return points
    up = up / n
    target = np.array([0.0, 1.0, 0.0])
    v = np.cross(up, target)
    c = float(np.dot(up, target))
    if np.linalg.norm(v) < 1e-8:
        return points if c > 0 else -points
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + vx + vx @ vx * (1 / (1 + c))
    return points @ R.T


def rescale_to_height(points: Points, height_cm: float) -> tuple[Points, float]:
    """Monocular depth is ambiguous, so the model's absolute size is a prior,
    not a measurement. The one number the person typed replaces it.

    Returns the points in centimetres and the factor applied, which is worth
    reporting: a factor far from 1 means the model's guess at this body was poor.
    """
    extent = float(points[:, 1].max() - points[:, 1].min())
    if extent < 1e-6:
        raise ValueError("degenerate mesh: no vertical extent")
    k = height_cm / extent
    return points * k, k


def crotch_height(points: Points, y_hip: float, y_knee: float,
                  band: float = 0.6, steps: int = 60) -> float | None:
    """The lowest height at which the slice is still one body rather than two legs.

    Walks down from the hip. A slice through two legs has a gap; the widest gap
    between neighbouring points along x gives it away.
    """
    for y in np.linspace(y_hip, y_knee, steps):
        sl = slice_at(points, y, band)
        if len(sl) >= 12 and _limb_split(sl[:, 0]) is not None:
            return float(y)                  # first slice that is two legs
    return None
