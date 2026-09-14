"""SMPL body estimation with NLF, and the nine measurements taken off the mesh.

Runs only where torch and the weights are — that means Modal, not a laptop. The
measuring itself lives in mesh.py, which is plain numpy and tested on shapes
whose girth is known in closed form.

Licence: the NLF code is MIT, but the released weights are for **noncommercial
research use**. Fine for a Project Work; not fine for a business, and that has
to be settled before SartorIA is one.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config as C
from . import mesh as M

NLF_WEIGHTS_URL = "https://github.com/isarandi/nlf/releases/download/v0.3.2/nlf_l_multi_0.3.2.torchscript"

# SMPL's 24-joint kinematic tree. Asserted at runtime rather than trusted.
J_PELVIS, J_HIP_L, J_HIP_R = 0, 1, 2
J_KNEE_L, J_KNEE_R = 4, 5
J_ANKLE_L, J_ANKLE_R = 7, 8
J_NECK, J_SHOULDER_L, J_SHOULDER_R = 12, 16, 17
N_SMPL_JOINTS = 24

# A slice this thick, in cm, around each measurement height. Thin enough not to
# smear a taper, thick enough to catch points on a 6890-vertex body.
BAND_CM = 1.2


@dataclass
class FrameMesh:
    """One frame's body, already upright and in centimetres."""
    points: np.ndarray            # (6890, 3)
    joints: np.ndarray            # (24, 3)
    uncertainty: float            # mean predicted vertex uncertainty
    scale_factor: float           # how far the model's size guess was off
    outside_frame: dict            # which image edges the body ran past


def load_model(path: str | Path):
    import torch
    import torchvision  # noqa: F401 — the TorchScript graph will not load without it
    model = torch.jit.load(str(path))
    return model.cuda().eval() if torch.cuda.is_available() else model.eval()


def _y(joints: np.ndarray, *idx: int) -> float:
    return float(np.mean([joints[i][1] for i in idx]))


def meshes_from_frames(model, images: list[np.ndarray], height_cm: float,
                       stride: int = 4) -> list[FrameMesh]:
    """Run NLF over a sample of frames and return each body, upright and scaled.

    Every frame is measured on its own and the results reconciled later. A
    single mesh from a single frame is one opinion; the median of many is a
    measurement.
    """
    import torch

    out: list[FrameMesh] = []
    for img in images[::stride]:
        t = torch.from_numpy(np.ascontiguousarray(img[:, :, ::-1])).permute(2, 0, 1)
        if torch.cuda.is_available():
            t = t.cuda()
        with torch.inference_mode():
            pred = model.detect_smpl_batched(t.unsqueeze(0))

        verts = pred["vertices3d"]
        if verts is None or len(verts) == 0 or len(verts[0]) == 0:
            continue                                    # nobody in this frame
        v = verts[0][0].float().cpu().numpy()
        j = pred["joints3d"][0][0].float().cpu().numpy()
        if j.shape[0] != N_SMPL_JOINTS:
            raise RuntimeError(
                f"expected the {N_SMPL_JOINTS}-joint SMPL skeleton, got {j.shape[0]} — "
                f"the measurement sites are indexed against SMPL and would be wrong")

        unc = pred.get("vertex_uncertainties")
        u = float(unc[0][0].float().mean().cpu()) if unc is not None else float("nan")

        # NLF completes a body that runs past the frame, so a projected vertex
        # outside the image is the model inferring rather than seeing.
        v2d = pred["vertices2d"][0][0].float().cpu().numpy()
        h, w = img.shape[:2]
        outside = {
            "top": bool((v2d[:, 1] < 0).any()), "bottom": bool((v2d[:, 1] > h).any()),
            "left": bool((v2d[:, 0] < 0).any()), "right": bool((v2d[:, 0] > w).any()),
        }

        up = M.upright(v, j[J_PELVIS], j[J_NECK])
        jf = M.upright(j, j[J_PELVIS], j[J_NECK])
        pts, k = M.rescale_to_height(up, height_cm)
        out.append(FrameMesh(pts, jf * k, u, k, outside))
    return out


def measure_one(fm: FrameMesh) -> dict[str, float] | None:
    """The nine measurements from a single body.

    The levels are found on the body rather than assumed from stature: the
    natural waist is the narrowest girth above the hips, the seat is the widest
    below them. With a real cross-section those are measurable, which they were
    not from a silhouette.
    """
    p, j = fm.points, fm.joints
    heel = float(p[:, 1].min())
    y_hip = _y(j, J_HIP_L, J_HIP_R)
    y_knee = _y(j, J_KNEE_L, J_KNEE_R)
    y_ankle = _y(j, J_ANKLE_L, J_ANKLE_R)
    y_shoulder = _y(j, J_SHOULDER_L, J_SHOULDER_R)
    knee_x = float(j[J_KNEE_L][0])

    crotch = M.crotch_height(p, y_hip, y_knee, band=BAND_CM)
    if crotch is None:
        return None

    def scan(lo: float, hi: float, pick, near_x=None, n: int = 26):
        vals = [(M.girth_at(p, y, BAND_CM, near_x), y)
                for y in np.linspace(lo, hi, n)]
        vals = [(g, y) for g, y in vals if g is not None]
        return pick(vals) if vals else (None, None)

    lowest, highest = (lambda v: min(v)), (lambda v: max(v))

    waist, y_waist = scan(y_hip, y_hip + 0.55 * (y_shoulder - y_hip), lowest)
    seat, _ = scan(crotch, y_hip, highest)
    thigh = M.girth_at(p, crotch - 0.08 * (crotch - y_knee), BAND_CM, knee_x)
    knee = M.girth_at(p, y_knee, BAND_CM, knee_x)
    calf, _ = scan(y_knee - 0.18 * (y_knee - y_ankle), y_ankle, highest, knee_x)
    ankle, _ = scan(y_ankle - 0.05 * (y_knee - y_ankle),
                    y_ankle + 0.22 * (y_knee - y_ankle), lowest, knee_x)

    if None in (waist, seat, thigh, knee, calf, ankle):
        return None

    inseam = crotch - heel
    outseam = y_waist - heel
    return {
        "waist": waist, "hip": seat, "thigh": thigh, "knee": knee,
        "calf": calf, "ankle": ankle,
        "inseam": inseam, "outseam": outseam, "rise": outseam - inseam,
    }


def reconcile(per_frame: list[dict[str, float]]) -> tuple[dict[str, float], dict[str, str]]:
    """Median across frames, with the spread deciding the confidence.

    Agreement between independent views is the only evidence available that a
    number is right — there is no tape measure inside the pipeline.
    """
    out: dict[str, float] = {}
    conf: dict[str, str] = {}
    for site in C.ALL_MEASUREMENTS:
        vals = np.array([m[site] for m in per_frame if site in m], dtype=float)
        if len(vals) == 0:
            continue
        med = float(np.median(vals))
        out[site] = round(med, 1)
        spread = float(np.percentile(vals, 84) - np.percentile(vals, 16)) / 2 if len(vals) > 3 else float("inf")
        rel = spread / med if med else float("inf")
        lo, hi = C.PLAUSIBLE_CM[site]
        conf[site] = ("low" if not lo <= med <= hi or rel > 0.05
                      else "medium" if rel > 0.02 else "high")
    return out, conf
