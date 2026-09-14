"""Video in, usable frames out — plus the verdict on whether the clip is usable
at all.

The distinction the deck insists on is kept here: blocking gates name a cause
and stop everything, coaching signals only nudge.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from . import config as C
from . import geometry as G


@dataclass
class Frame:
    index: int
    image: np.ndarray           # BGR
    blur: float                 # variance of Laplacian — higher is sharper
    brightness: float


@dataclass
class Verdict:
    ok: bool
    blocking: list[str] = field(default_factory=list)
    coaching: list[str] = field(default_factory=list)

    def message(self) -> str:
        """What the Capture Coach would say. One cause, in plain words."""
        if self.blocking:
            return self.blocking[0]
        if self.coaching:
            return self.coaching[0]
        return "Capture looks good."


def read_frames(path: str | Path, target: int = C.TARGET_FRAMES) -> list[Frame]:
    """Evenly sampled frames. Sampling rather than taking the first N keeps the
    whole turn, which is where the side-on views live."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise FileNotFoundError(f"cannot open video: {path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    wanted = set(np.linspace(0, max(total - 1, 0), min(target, max(total, 1)),
                             dtype=int).tolist()) if total else None

    frames, i = [], 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        if wanted is None or i in wanted:
            grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            frames.append(Frame(
                index=i, image=img,
                blur=float(cv2.Laplacian(grey, cv2.CV_64F).var()),
                brightness=float(grey.mean()),
            ))
        i += 1
    cap.release()
    if not frames:
        raise ValueError(f"no frames decoded from {path}")
    return frames


def judge(masks: list[np.ndarray], frames: list[Frame],
          yaws: list[float]) -> Verdict:
    """The gates, applied to the clip as a whole."""
    v = Verdict(ok=True)
    if not masks:
        v.blocking.append(
            "We could not find a person in this clip. Film your whole body, "
            "head to feet, against a plain background.")
        v.ok = False
        return v

    borders = [G.touches_border(m, C.EDGE_MARGIN_PX) for m in masks]
    frac = lambda k: sum(b[k] for b in borders) / len(borders)

    if frac("top") > 0.5:
        v.blocking.append(
            "We can't see the top of your head. We need your full body, head "
            "to feet, to turn the scan into centimetres — move the phone "
            "further away and record again.")
    if frac("bottom") > 0.5:
        v.blocking.append(
            "Your feet are cut off. Without them there is nothing to measure "
            "the leg against — step back and record again.")
    if frac("left") > 0.5 or frac("right") > 0.5:
        v.blocking.append(
            "You are wider than the frame. Hold the phone upright and step back.")
    if len(masks) < C.MIN_USABLE_FRAMES:
        v.blocking.append(
            f"Only {len(masks)} usable frames — we need at least "
            f"{C.MIN_USABLE_FRAMES}. Film for about ten seconds.")

    areas = [m.mean() for m in masks]
    if float(np.mean(areas)) < C.MIN_MASK_AREA_FRAC:
        v.blocking.append(
            "You are too far away to measure accurately. Come closer, keeping "
            "your whole body in frame.")

    cov = G.rotation_coverage(yaws)
    if cov < C.ROTATION_COVERAGE_MIN:
        v.coaching.append(
            "Turn all the way round slowly — we only saw you from a narrow "
            "range of angles, and the side view is what gives depth.")
    if float(np.median([f.blur for f in frames])) < C.BLUR_LAPLACIAN_MIN:
        v.coaching.append("The video is a little soft — hold the phone still.")
    b = float(np.median([f.brightness for f in frames]))
    if b < C.BRIGHTNESS_MIN:
        v.coaching.append("It is quite dark — try a brighter room.")
    elif b > C.BRIGHTNESS_MAX:
        v.coaching.append("The shot is blown out — move away from the window.")

    v.ok = not v.blocking
    return v
