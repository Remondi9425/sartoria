"""MediaPipe wrapper: frames in, landmarks and silhouettes out.

Nothing here decides anything about the body. It only reports what the pose
model saw, so that every judgement lives in code we can read and test.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.request import urlopen

import numpy as np

from . import config as C
from . import geometry as G
from .body import Landmarks
from .capture import Frame


@dataclass
class Observation:
    frame_index: int
    mask: np.ndarray            # boolean, frame-sized
    landmarks_px: np.ndarray    # (33, 2) in pixels
    yaw: float                  # degrees, 0 = facing the camera


def ensure_model(path: str = C.POSE_MODEL_PATH, url: str = C.POSE_MODEL_URL) -> Path:
    p = Path(path)
    if p.exists() and p.stat().st_size > 1_000_000:
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    print(f"fetching pose model → {p} (one time, ~30 MB)")
    with urlopen(url) as r, open(p, "wb") as f:
        f.write(r.read())
    return p


def observe(frames: list[Frame], mask_threshold: float = 0.5) -> list[Observation]:
    """Run the pose model over the sampled frames."""
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    opts = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(ensure_model())),
        running_mode=vision.RunningMode.VIDEO,
        output_segmentation_masks=True,
        num_poses=1,
    )
    out: list[Observation] = []
    with vision.PoseLandmarker.create_from_options(opts) as model:
        for ts, f in enumerate(frames):
            rgb = f.image[:, :, ::-1].copy()
            res = model.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts * 33)
            if not res.pose_landmarks or not res.segmentation_masks:
                continue
            h, w = f.image.shape[:2]
            px = np.array([[lm.x * w, lm.y * h] for lm in res.pose_landmarks[0]])
            world = np.array([[lm.x, lm.y, lm.z] for lm in res.pose_world_landmarks[0]])
            out.append(Observation(
                frame_index=f.index,
                mask=np.asarray(res.segmentation_masks[0].numpy_view()) > mask_threshold,
                landmarks_px=px,
                yaw=G.yaw_deg(world[C.LM.SHOULDER_L], world[C.LM.SHOULDER_R]),
            ))
    return out


def pick_views(obs: list[Observation]) -> tuple[Observation | None, Observation | None]:
    """The most face-on and the most side-on frame in the clip.

    Sharpness is not consulted: the mask matters more than the texture, and the
    blur check has already run over the clip as a whole.
    """
    frontal = [o for o in obs if abs(o.yaw) <= C.FRONTAL_YAW_TOL_DEG]
    profile = [o for o in obs if abs(o.yaw) >= C.PROFILE_YAW_MIN_DEG]
    best_front = min(frontal, key=lambda o: abs(o.yaw)) if frontal else None
    best_side = max(profile, key=lambda o: abs(o.yaw)) if profile else None
    return best_front, best_side


def landmarks_for(o: Observation) -> Landmarks:
    """Average left and right where the body is symmetric; keep one knee's x so
    a single leg can be picked out of the silhouette."""
    p = o.landmarks_px
    mid = lambda a, b: float((p[a][1] + p[b][1]) / 2)
    return Landmarks(
        shoulder_y=mid(C.LM.SHOULDER_L, C.LM.SHOULDER_R),
        hip_y=mid(C.LM.HIP_L, C.LM.HIP_R),
        knee_y=mid(C.LM.KNEE_L, C.LM.KNEE_R),
        ankle_y=mid(C.LM.ANKLE_L, C.LM.ANKLE_R),
        knee_x=float(p[C.LM.KNEE_L][0]),
    )
