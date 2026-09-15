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

# The weights URL, size and hash are pinned in modal_app.py, where they are
# used at image build time.

# SMPL's 24-joint kinematic tree. Asserted at runtime rather than trusted.
J_PELVIS, J_HIP_L, J_HIP_R = 0, 1, 2
J_KNEE_L, J_KNEE_R = 4, 5
J_ANKLE_L, J_ANKLE_R = 7, 8
J_NECK, J_SHOULDER_L, J_SHOULDER_R = 12, 16, 17
J_ELBOW_L, J_ELBOW_R = 18, 19
J_WRIST_L, J_WRIST_R = 20, 21
J_HAND_L, J_HAND_R = 22, 23
N_SMPL_JOINTS = 24

# A slice this thick, in cm, around each measurement height. Thin enough not to
# smear a taper, thick enough to catch points on a 6890-vertex body.
BAND_CM = 1.2

# How far from the arm's own bones to discard mesh points, in cm. An upper arm
# is about 5 cm thick; the margin covers a sleeve and the pose model's slack
# without reaching the ribcage at the heights we measure.
ARM_RADIUS_CM = 8.0
# How far the subject may move between sampled frames, and how much their
# apparent size may change, before the frame is treated as somebody else.
# Both are fractions of the body's own height, so they hold at any distance.
SUBJECT_JUMP = 0.35
SUBJECT_RESIZE = 0.15
# The chain ends mid-palm, but SMPL packs roughly eight hundred vertices into
# each hand and the fingers reach well past that joint. Left behind, they sit
# at hip height — which is why the seat and thigh were the only measurements
# wrong, while the knee below and the waist above were right.
HAND_REACH_CM = 14.0
# Fingers splay, so the palm is cleared as a sphere rather than a tube.
HAND_SPHERE_CM = 15.0


def _arm_chain(j: np.ndarray, shoulder: int, elbow: int, wrist: int,
               hand: int) -> np.ndarray:
    """The arm's bones, continued past the palm to cover the fingers."""
    pts = j[[shoulder, elbow, wrist, hand]]
    reach = pts[3] - pts[2]
    n = float(np.linalg.norm(reach))
    if n > 1e-6:
        pts = np.vstack([pts, pts[3] + reach / n * HAND_REACH_CM])
    return pts


@dataclass
class FrameMesh:
    """One frame's body, already upright and in centimetres."""
    points: np.ndarray            # (6890, 3)
    joints: np.ndarray            # (24, 3)
    uncertainty: float            # mean predicted vertex uncertainty
    scale_factor: float           # how far the model's size guess was off
    outside_frame: dict            # which image edges the body ran past
    raw_bbox: list                 # extents as the model emitted them
    rot_bbox: list                 # extents after standing the body upright
    raw_p98: list                  # the same extents ignoring the outer 1%
    height_cm: float = 0.0         # the stature the mesh was scaled to
    yaw: float = 0.0               # 0 square to the camera, ±90 side-on


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
    detections: list[list[float]] = []
    tracked: tuple[np.ndarray, float] | None = None
    skipped = 0
    for img in images[::stride]:
        t = torch.from_numpy(np.ascontiguousarray(img[:, :, ::-1])).permute(2, 0, 1)
        if torch.cuda.is_available():
            t = t.cuda()
        with torch.inference_mode():
            pred = model.detect_smpl_batched(t.unsqueeze(0))

        verts = pred["vertices3d"]
        if verts is None or len(verts) == 0 or len(verts[0]) == 0:
            continue                                    # nobody in this frame

        # The model is multi-person: a room can hold a second person, and a
        # poster of one. Choosing the tallest in every frame independently
        # means the subject can change halfway through a clip and the
        # measurements average two bodies.
        #
        # So the tallest is chosen once, and after that the detection nearest
        # to where the subject was a moment ago. A frame whose best candidate
        # has jumped, or changed size, is dropped rather than guessed at.
        people = verts[0]
        centres = [pv.mean(axis=0).float().cpu().numpy() for pv in people]
        heights = [float(pv[:, 1].max() - pv[:, 1].min()) for pv in people]
        detections.append([round(h, 1) for h in heights])

        if tracked is None:
            who = int(np.argmax(heights))
        else:
            prev_centre, prev_height = tracked
            moved = [float(np.linalg.norm(c - prev_centre)) for c in centres]
            who = int(np.argmin(moved))
            jumped = moved[who] > SUBJECT_JUMP * prev_height
            resized = abs(heights[who] - prev_height) > SUBJECT_RESIZE * prev_height
            if jumped or resized:
                skipped += 1
                continue
        tracked = (centres[who], heights[who])

        v = people[who].float().cpu().numpy()
        j = pred["joints3d"][0][who].float().cpu().numpy()
        if j.shape[0] != N_SMPL_JOINTS:
            raise RuntimeError(
                f"expected the {N_SMPL_JOINTS}-joint SMPL skeleton, got {j.shape[0]} — "
                f"the measurement sites are indexed against SMPL and would be wrong")

        unc = pred.get("vertex_uncertainties")
        u = float(unc[0][who].float().mean().cpu()) if unc is not None else float("nan")

        # NLF completes a body that runs past the frame, so a projected vertex
        # outside the image is the model inferring rather than seeing.
        v2d = pred["vertices2d"][0][who].float().cpu().numpy()
        h, w = img.shape[:2]
        outside = {
            "top": bool((v2d[:, 1] < 0).any()), "bottom": bool((v2d[:, 1] > h).any()),
            "left": bool((v2d[:, 0] < 0).any()), "right": bool((v2d[:, 0] > w).any()),
        }

        up = M.upright(v, j[J_PELVIS], j[J_NECK])
        jf = M.upright(j, j[J_PELVIS], j[J_NECK])
        pts, k = M.rescale_to_height(up, height_cm)
        # max-minus-min is decided by the two most extreme vertices, so it
        # cannot tell a genuinely deep body from a handful of stray ones.
        raw_bbox = [float(np.ptp(v[:, i])) for i in range(3)]
        raw_p98 = [float(np.percentile(v[:, i], 99) - np.percentile(v[:, i], 1))
                   for i in range(3)]
        # Measured before standing the body upright, so it keeps its relation
        # to where the camera was.
        yaw = M.yaw_deg(j[J_HIP_L], j[J_HIP_R])
        rot_bbox = [float(np.ptp(up[:, i])) for i in range(3)]
        out.append(FrameMesh(pts, jf * k, u, k, outside, raw_bbox, rot_bbox,
                             raw_p98, height_cm, yaw))
    if detections:
        most = max(len(d) for d in detections)
        print(f"detections per frame: up to {most}; "
              f"{skipped} frame(s) dropped for an unstable subject")
    return out


def _chains(j: np.ndarray) -> list[np.ndarray]:
    """Arms, legs and spine, in the order the labels use."""
    return [
        _arm_chain(j, J_SHOULDER_L, J_ELBOW_L, J_WRIST_L, J_HAND_L),   # 0
        _arm_chain(j, J_SHOULDER_R, J_ELBOW_R, J_WRIST_R, J_HAND_R),   # 1
        j[[J_HIP_L, J_KNEE_L, J_ANKLE_L]],                             # 2
        j[[J_HIP_R, J_KNEE_R, J_ANKLE_R]],                             # 3
        j[[J_PELVIS, J_NECK]],                                         # 4
    ]


ARM, LEG_L, LEG_R = (0, 1), 2, 3


def _without_arms(points: np.ndarray, j: np.ndarray) -> np.ndarray:
    """Everything whose nearest bone is not an arm."""
    lab = M.label_by_nearest_chain(points, _chains(j))
    return points[~np.isin(lab, ARM)]


def _one_leg(points: np.ndarray, j: np.ndarray, which: int) -> np.ndarray:
    lab = M.label_by_nearest_chain(points, _chains(j))
    return points[lab == which]


def measure_one(fm: FrameMesh) -> dict[str, float] | None:
    """The nine measurements from a single body.

    The levels are found on the body rather than assumed from stature: the
    natural waist is the narrowest girth above the hips, the seat the widest
    below them. With a real cross-section those are measurable, which they were
    not from a silhouette.
    """
    j = fm.joints
    # A horizontal slice through a standing body catches the torso and both
    # arms, and a hull drawn round that measures the person's whole width. On
    # the first real recording it turned an 85 cm waist into 149 cm.
    p = _without_arms(fm.points, j)

    leg = _one_leg(fm.points, j, LEG_L)      # one leg, whole, and only it

    heel = float(p[:, 1].min())
    y_hip = _y(j, J_HIP_L, J_HIP_R)
    y_knee = _y(j, J_KNEE_L, J_KNEE_R)
    y_ankle = _y(j, J_ANKLE_L, J_ANKLE_R)
    y_shoulder = _y(j, J_SHOULDER_L, J_SHOULDER_R)

    crotch = M.crotch_height(p, j[J_HIP_L], j[J_HIP_R], j[J_PELVIS],
                             fm.height_cm)

    def profile(lo: float, hi: float, limb: bool, n: int = 26):
        """Girth at n heights, with the height each came from."""
        out = []
        for y in np.linspace(lo, hi, n):
            g = M.girth_at(leg if limb else p, y, BAND_CM)
            if g is not None:
                out.append((g, float(y)))
        return out

    def pick(prof, q: float):
        """A quantile of the profile rather than its extreme.

        The seat is the widest girth below the hips and the waist the narrowest
        above them — but a raw max or min is decided by whichever single slice
        went wrong, and on the first real recording that produced a 197 cm hip.
        A quantile keeps the anatomy and drops the artefact.
        """
        if not prof:
            return None, None
        vals = np.array([g for g, _ in prof])
        target = float(np.quantile(vals, q))
        return min(prof, key=lambda gy: abs(gy[0] - target))

    waist, y_waist = pick(profile(y_hip, y_hip + 0.55 * (y_shoulder - y_hip), False), 0.10)

    # Start clear of the crotch. A slice level with it still cuts both
    # thighs, and taking the widest reading then selects precisely those —
    # which is how a 95 cm seat read 185.
    seat, _ = pick(profile(crotch + 0.35 * (y_hip - crotch),
                           y_hip + 0.25 * (y_hip - crotch), False), 0.90)
    # Likewise below it: right at the crotch the thigh is still merging
    # into the buttock.
    thigh = M.girth_at(leg, crotch - 0.16 * (crotch - y_knee), BAND_CM)
    knee = M.girth_at(leg, y_knee, BAND_CM)
    calf, _ = pick(profile(y_knee - 0.18 * (y_knee - y_ankle), y_ankle, True), 0.90)
    ankle, _ = pick(profile(y_ankle - 0.05 * (y_knee - y_ankle),
                            y_ankle + 0.22 * (y_knee - y_ankle), True), 0.10)

    if None in (waist, seat, thigh, knee, calf, ankle, y_waist):
        return None

    inseam = crotch - heel
    outseam = y_waist - heel
    return {
        "waist": waist, "hip": seat, "thigh": thigh, "knee": knee,
        "calf": calf, "ankle": ankle,
        "inseam": inseam, "outseam": outseam, "rise": outseam - inseam,
        # Not a measurement: where the waist landed, so the leg cloud can be
        # cropped at the same place the outseam was taken from.
        "_y_waist": y_waist,
    }


# How many surface points to send back.
#
# Every leg vertex, in practice: the cap is above what the region holds. With
# fewer, the discs that close the cloud into a surface have to be wide enough
# to bridge the gaps, and a body built from wide discs looks like it is built
# from discs. Denser points mean smaller ones. Around 4000 costs 80 KB, which
# is less than one of the photographs on the product screen.
CLOUD_POINTS = 6000


def leg_cloud(fm: FrameMesh, y_waist: float) -> list[list[float]] | None:
    """The customer's legs as a cloud of surface points, in centimetres.

    Only the legs. The mesh NLF returns is a whole body including a head, and
    the product is about how trousers fit — so the part above the waist is
    dropped rather than sent to a browser and cropped there. What is not
    transmitted cannot be mishandled, and this is a scan of a person.

    No faces: the triangles that would turn these points into a surface belong
    to the SMPL model files, which carry a licence we deliberately avoided
    needing. A dense enough point cloud reads as a limb anyway.
    """
    j = fm.joints
    pts = _without_arms(fm.points, j)          # hands hang to mid-thigh
    keep = pts[pts[:, 1] <= y_waist + 2.0]
    if len(keep) < 200:
        return None

    if len(keep) > CLOUD_POINTS:
        # Shuffled, not strided. The mesh is ordered in rings, so taking every
        # Nth vertex drops whole rings and the render came out in horizontal
        # bands. Seeded, so the same clip gives the same body twice.
        idx = np.random.default_rng(0).permutation(len(keep))[:CLOUD_POINTS]
        keep = keep[np.sort(idx)]

    # Centred on the hips and standing on zero, so the browser receives
    # something it can draw without knowing anything about our frame.
    centre = np.array([
        float(np.median(keep[:, 0])), float(keep[:, 1].min()),
        float(np.median(keep[:, 2])),
    ])
    return [[round(float(v), 1) for v in p] for p in (keep - centre)]


def reconcile(per_frame: list[dict[str, float]]
              ) -> tuple[dict[str, float], dict[str, str], dict[str, float]]:
    """Median across frames, with the spread deciding the confidence.

    Agreement between independent views is the only evidence available that a
    number is right — there is no tape measure inside the pipeline.
    """
    out: dict[str, float] = {}
    conf: dict[str, str] = {}
    spreads: dict[str, float] = {}
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
        spreads[site] = round(spread, 2) if np.isfinite(spread) else None
    return out, conf, spreads


# ── evidence, not guesses ───────────────────────────────────────────────────
JOINT_NAMES = {
    0: "pelvis", 1: "hip_L", 2: "hip_R", 4: "knee_L", 5: "knee_R",
    7: "ankle_L", 8: "ankle_R", 12: "neck", 15: "head",
    16: "shoulder_L", 17: "shoulder_R", 18: "elbow_L", 19: "elbow_R",
    20: "wrist_L", 21: "wrist_R", 22: "hand_L", 23: "hand_R",
}


def probe(fm: FrameMesh) -> dict:
    """What one frame's body actually looks like to the measuring code.

    Reports the joints by height fraction so the skeleton's ordering can be
    checked rather than assumed, and the extent of each slice so an inflated
    girth can be traced to something wide being in it.
    """
    j = fm.joints
    raw = fm.points
    stripped = _without_arms(raw, j)

    lo, hi = float(raw[:, 1].min()), float(raw[:, 1].max())
    span = hi - lo or 1.0
    joints = {name: round((float(j[i][1]) - lo) / span, 3)
              for i, name in JOINT_NAMES.items() if i < len(j)}

    y_hip = _y(j, J_HIP_L, J_HIP_R)
    y_knee = _y(j, J_KNEE_L, J_KNEE_R)
    crotch = M.crotch_height(stripped, j[J_HIP_L], j[J_HIP_R], j[J_PELVIS],
                             fm.height_cm)

    def look(y: float, label: str) -> dict:
        sl = M.slice_at(stripped, y, BAND_CM)
        kept = M.drop_specks(sl) if len(sl) >= 8 else sl
        return {
            "level": label,
            "height_frac": round((y - lo) / span, 3),
            "points": int(len(sl)),
            "after_specks": int(len(kept)),
            "x_cm": round(float(np.ptp(kept[:, 0])), 1) if len(kept) else None,
            "z_cm": round(float(np.ptp(kept[:, 1])), 1) if len(kept) else None,
            "girth_cm": round(M.girth_at(stripped, y, BAND_CM), 1)
                        if len(kept) >= 8 else None,
        }

    slices = []
    if crotch is not None:
        for f, label in ((0.0, "crotch"), (0.35, "mid pelvis"), (1.0, "hip joint")):
            slices.append(look(crotch + f * (y_hip - crotch), label))
    slices.append(look(y_hip + 0.30 * (_y(j, J_SHOULDER_L, J_SHOULDER_R) - y_hip),
                       "waist band"))

    # Where the depth actually comes from. A standing body should be about
    # 25 cm deep at every height; whichever band is not tells us what the mesh
    # is really doing.
    ys = raw[:, 1]
    lo_y, hi_y = float(ys.min()), float(ys.max())
    bands = []
    for f in np.linspace(0, 1, 11)[:-1]:
        y0, y1 = lo_y + f * (hi_y - lo_y), lo_y + (f + 0.1) * (hi_y - lo_y)
        sel = raw[(ys >= y0) & (ys < y1)]
        bands.append({
            "from_frac": round(f, 1),
            "n": int(len(sel)),
            "x_cm": round(float(np.ptp(sel[:, 0])), 1) if len(sel) else None,
            "z_cm": round(float(np.ptp(sel[:, 2])), 1) if len(sel) else None,
        })

    def bbox(a):
        return {"x": round(float(np.ptp(a[:, 0])), 1),
                "y": round(float(np.ptp(a[:, 1])), 1),
                "z": round(float(np.ptp(a[:, 2])), 1)}

    # The hull the hip measurement actually draws, so its shape can be seen
    # instead of inferred from one number.
    hull = []
    if crotch is not None:
        y_seat = crotch + 0.6 * (y_hip - crotch)
        sl = M.slice_at(stripped, y_seat, BAND_CM)
        if len(sl) >= 8:
            hull = [[round(float(a), 1), round(float(b), 1)]
                    for a, b in M.convex_hull(M.drop_specks(sl))]

    return {
        "views_png": _draw(raw, stripped),
        "points_before_arm_strip": int(len(raw)),
        "points_after": int(len(stripped)),
        "bbox_as_model_emitted": [round(x, 1) for x in fm.raw_bbox],
        "bbox_middle_98_percent": [round(x, 1) for x in fm.raw_p98],
        "bbox_after_upright": [round(x, 3) for x in fm.rot_bbox],
        "depth_by_height_band": bands,
        "mesh_bbox_cm": bbox(raw),
        "mesh_bbox_after_strip_cm": bbox(stripped),
        "seat_hull_xz": hull,
        "joint_height_fraction": joints,
        "crotch_height_frac": round((crotch - lo) / span, 3) if crotch else None,
        "slices": slices,
    }


def _draw(raw: np.ndarray, stripped: np.ndarray, size: int = 420) -> str:
    """The mesh as a picture, front and side, as a data URI.

    Numbers said the body was 75 cm deep and every explanation for that was
    wrong in a different way. A scatter of the vertices settles in one look
    what another diagnostic column would only narrow down.
    """
    import base64

    import cv2

    def panel(pts: np.ndarray, a: int, b: int, title: str) -> np.ndarray:
        img = np.full((size, size // 2, 3), 250, np.uint8)
        if not len(pts):
            return img
        u, v = pts[:, a], pts[:, b]
        lo_u, hi_u = float(u.min()), float(u.max())
        lo_v, hi_v = float(v.min()), float(v.max())
        span = max(hi_u - lo_u, hi_v - lo_v) or 1.0
        cu = ((u - (lo_u + hi_u) / 2) / span * (size * 0.42) + size // 4).astype(int)
        cv_ = (size - 10 - (v - lo_v) / span * (size * 0.9)).astype(int)
        for x, y in zip(cu, cv_):
            if 0 <= x < size // 2 and 0 <= y < size:
                img[y, x] = (90, 60, 40)
        cv2.putText(img, title, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42,
                    (40, 40, 40), 1, cv2.LINE_AA)
        return img

    grid = np.hstack([
        panel(raw, 0, 1, "front x-y (all)"),
        panel(raw, 2, 1, "side z-y (all)"),
        panel(stripped, 2, 1, "side z-y (no arms)"),
    ])
    ok, buf = cv2.imencode(".png", grid)
    return ("data:image/png;base64," + base64.b64encode(buf).decode()) if ok else ""
