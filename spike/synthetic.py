"""A mannequin whose measurements we already know.

Real bodies arrive later; this exists so the extraction code can be proved
correct today. It validates scale, crotch finding, level placement and width
reading. It does NOT validate the elliptical cross-section assumption — the
mannequin is built from ellipses, so that assumption is true by construction
here and can only be tested against a real tape measure.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np

from . import geometry as G


@dataclass(frozen=True)
class Level:
    t: float          # height above the floor as a fraction of total height
    a_cm: float       # semi-axis across the body (half of the frontal width)
    b_cm: float       # semi-axis front-to-back (half of the depth)


@dataclass(frozen=True)
class Mannequin:
    """Elliptical cross-sections stacked up a vertical axis, splitting into two
    legs below the crotch."""
    height_cm: float = 178.0
    leg_gap_cm: float = 2.0                     # clear air between the thighs
    torso: dict[str, Level] = field(default_factory=lambda: {
        "waist": Level(0.612, 14.9, 10.4),      # ~82 cm girth
        "hip":   Level(0.522, 17.4, 12.2),      # ~96 cm girth
    })
    legs: dict[str, Level] = field(default_factory=lambda: {
        "thigh": Level(0.450, 9.2, 8.0),        # ~54 cm
        "knee":  Level(0.280, 6.3, 6.0),        # ~39 cm
        "calf":  Level(0.200, 6.6, 6.3),        # ~41 cm, wider than the knee
        "ankle": Level(0.050, 3.7, 3.4),        # ~22 cm
    })
    t_crotch: float = 0.470
    t_shoulder: float = 0.820

    # ── the answers the pipeline has to recover ─────────────────────────────
    def true_measurements(self) -> dict[str, float]:
        out = {}
        for name, lv in {**self.torso, **self.legs}.items():
            out[name] = G.ellipse_perimeter(lv.a_cm, lv.b_cm)
        out["inseam"] = self.t_crotch * self.height_cm
        out["outseam"] = self.torso["waist"].t * self.height_cm
        out["rise"] = out["outseam"] - out["inseam"]
        return out

    # ── silhouette rendering ────────────────────────────────────────────────
    def _profile_at(self, t: float) -> tuple[float, float, bool]:
        """Interpolated (a, b) at height fraction t, and whether it is leg."""
        leg = t < self.t_crotch
        src = self.legs if leg else self.torso
        pts = sorted([(lv.t, lv.a_cm, lv.b_cm) for lv in src.values()])
        if not leg:                              # extend the torso up to the shoulder
            top = max(pts)
            pts = pts + [(self.t_shoulder, top[1] * 1.02, top[2] * 0.95),
                         (1.0, top[1] * 0.42, top[2] * 0.46)]
        ts = [p[0] for p in pts]
        a = float(np.interp(t, ts, [p[1] for p in pts]))
        b = float(np.interp(t, ts, [p[2] for p in pts]))
        return a, b, leg

    def render(self, view: str, px_per_cm: float = 6.0,
               pad_cm: float = 12.0) -> np.ndarray:
        """A boolean silhouette. view is 'front' or 'side'.

        In the side view the two legs sit at the same depth and occlude each
        other exactly, which is what a real camera sees too.
        """
        if view not in ("front", "side"):
            raise ValueError("view must be 'front' or 'side'")
        H = int(round((self.height_cm + 2 * pad_cm) * px_per_cm))
        max_half = max(lv.a_cm for lv in {**self.torso, **self.legs}.values())
        W = int(round((2 * max_half + self.leg_gap_cm + 2 * pad_cm) * px_per_cm))
        mask = np.zeros((H, W), dtype=bool)
        cx = W / 2.0
        y_floor = H - pad_cm * px_per_cm

        for y in range(H):
            t = (y_floor - y) / (self.height_cm * px_per_cm)
            if not 0.0 <= t <= 1.0:
                continue
            a, b, leg = self._profile_at(t)
            half = (a if view == "front" else b) * px_per_cm
            if leg and view == "front":
                off = (a + self.leg_gap_cm / 2.0) * px_per_cm
                for c in (cx - off, cx + off):
                    mask[y, max(0, int(round(c - half))):int(round(c + half))] = True
            else:
                mask[y, max(0, int(round(cx - half))):int(round(cx + half))] = True
        return mask

    # ── helpers so tests can ask what the truth is at a given level ─────────
    def y_of_t(self, t: float, px_per_cm: float = 6.0, pad_cm: float = 12.0) -> float:
        H = int(round((self.height_cm + 2 * pad_cm) * px_per_cm))
        return (H - pad_cm * px_per_cm) - t * self.height_cm * px_per_cm

    def t_of_y(self, y: float, px_per_cm: float = 6.0, pad_cm: float = 12.0) -> float:
        H = int(round((self.height_cm + 2 * pad_cm) * px_per_cm))
        return ((H - pad_cm * px_per_cm) - y) / (self.height_cm * px_per_cm)

    def girth_at_t(self, t: float) -> float:
        """True circumference at any height — lets a test check the extraction
        separately from whether the level heuristics aim at the right spot."""
        a, b, _ = self._profile_at(t)
        return G.ellipse_perimeter(a, b)

    def landmarks(self, px_per_cm: float = 6.0, pad_cm: float = 12.0):
        """What a perfect pose estimator would report for this mannequin."""
        from .body import Landmarks
        max_half = max(lv.a_cm for lv in {**self.torso, **self.legs}.values())
        W = int(round((2 * max_half + self.leg_gap_cm + 2 * pad_cm) * px_per_cm))
        thigh_a = self.legs["thigh"].a_cm
        return Landmarks(
            shoulder_y=self.y_of_t(self.t_shoulder, px_per_cm, pad_cm),
            hip_y=self.y_of_t(self.torso["hip"].t, px_per_cm, pad_cm),
            knee_y=self.y_of_t(self.legs["knee"].t, px_per_cm, pad_cm),
            ankle_y=self.y_of_t(self.legs["ankle"].t, px_per_cm, pad_cm),
            knee_x=W / 2.0 + (thigh_a + self.leg_gap_cm / 2.0) * px_per_cm,
        )
