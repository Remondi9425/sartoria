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


class UnreadableClip(RuntimeError):
    """The bytes never became frames — a decoder problem, not a capture one."""


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


_ROTATIONS = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180,
              270: cv2.ROTATE_90_COUNTERCLOCKWISE}


def _rotate(img: np.ndarray, degrees: float) -> np.ndarray:
    code = _ROTATIONS.get(int(degrees) % 360)
    return cv2.rotate(img, code) if code is not None else img


def read_frames(path: str | Path, target: int = C.TARGET_FRAMES) -> list[Frame]:
    """Evenly sampled frames. Sampling rather than taking the first N keeps the
    whole turn, which is where the side-on views live."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise UnreadableClip(
            "We could not open that video file at all. It may be a format this "
            "browser produced that we cannot read yet — tell us which browser "
            "and phone you used.")
    # Phones record landscape and store "rotate 90" in the container. OpenCV
    # reads that flag but does not apply it unless asked, so an iPhone clip
    # arrives on its side — and a body model handed a person lying down either
    # fails outright or measures a horizontal stranger.
    rotation = float(cap.get(cv2.CAP_PROP_ORIENTATION_META) or 0.0)
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    applied = bool(cap.get(cv2.CAP_PROP_ORIENTATION_AUTO))

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    wanted = set(np.linspace(0, max(total - 1, 0), min(target, max(total, 1)),
                             dtype=int).tolist()) if total else None

    frames, i = [], 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        if wanted is None or i in wanted:
            if rotation and not applied:          # older builds ignore the flag
                img = _rotate(img, rotation)
            grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            frames.append(Frame(
                index=i, image=img,
                blur=float(cv2.Laplacian(grey, cv2.CV_64F).var()),
                brightness=float(grey.mean()),
            ))
        i += 1
    cap.release()
    if not frames:
        raise UnreadableClip(
            "The video opened but contained no readable frames. Record again, "
            "and let it run the full ten seconds before stopping.")
    return frames
