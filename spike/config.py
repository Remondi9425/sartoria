"""Constants for the measurement spike.

Everything in here is a calibration target, not a truth. The whole point of the
spike is to find out which of these numbers are wrong and by how much.
"""
from dataclasses import dataclass

# ── capture gates (the deck's blocking checks) ──────────────────────────────
MIN_USABLE_FRAMES = 12          # below this there is nothing to average over
EDGE_MARGIN_PX = 2              # mask touching this close to a border = cropped
MIN_MASK_AREA_FRAC = 0.04       # person smaller than this = too far away

# ── coaching signals (never blocking) ───────────────────────────────────────
BLUR_LAPLACIAN_MIN = 55.0       # variance of Laplacian, below = soft
BRIGHTNESS_MIN, BRIGHTNESS_MAX = 40.0, 225.0
ROTATION_COVERAGE_MIN = 0.55    # fraction of the yaw range we want to see

# ── frame selection ─────────────────────────────────────────────────────────
FRONTAL_YAW_TOL_DEG = 18.0      # |yaw| under this counts as facing the camera
PROFILE_YAW_MIN_DEG = 62.0      # |yaw| over this counts as side-on
TARGET_FRAMES = 90              # sample at most this many frames from the clip

# ── where the measurements sit on the body ──────────────────────────────────
# MediaPipe has no waist landmark, so the natural waist is inferred from the
# hip and shoulder ones. The fraction comes from adult stature proportions —
# natural waist ~0.612 of height, hip joint ~0.522, acromion ~0.820:
#     (0.612 - 0.522) / (0.820 - 0.522) = 0.302
# Calibration target number one: the first real tape measurements will move it,
# and it almost certainly differs between men and women.
WAIST_ABOVE_HIP_FRAC = 0.302
# Thigh is measured just below the crotch, as a fraction of crotch-to-knee.
THIGH_BELOW_CROTCH_FRAC = 0.08
# The calf belly is hunted for below this point, as a fraction of knee-to-ankle.
CALF_BELOW_KNEE_FRAC = 0.15
# Ankle circumference sits slightly above the ankle joint, where it is narrowest.
ANKLE_ABOVE_JOINT_FRAC = 0.04

# ── plausibility envelope (the Anthropometric Validator's job, in miniature) ──
# cm, generous adult ranges — outside these we refuse rather than guess.
PLAUSIBLE_CM = {
    "waist":   (55.0, 160.0),
    "hip":     (70.0, 170.0),
    "thigh":   (35.0, 95.0),
    "knee":    (28.0, 60.0),
    "calf":    (25.0, 60.0),
    "ankle":   (16.0, 38.0),
    "inseam":  (55.0, 105.0),
    "outseam": (80.0, 135.0),
    "rise":    (18.0, 42.0),
}

CIRCUMFERENCES = ("waist", "hip", "thigh", "knee", "calf", "ankle")
LENGTHS = ("inseam", "outseam", "rise")
ALL_MEASUREMENTS = CIRCUMFERENCES + LENGTHS

POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
POSE_MODEL_PATH = "models/pose_landmarker_heavy.task"


@dataclass(frozen=True)
class Landmark:
    """MediaPipe pose landmark indices we actually use."""
    NOSE = 0
    SHOULDER_L, SHOULDER_R = 11, 12
    HIP_L, HIP_R = 23, 24
    KNEE_L, KNEE_R = 25, 26
    ANKLE_L, ANKLE_R = 27, 28
    HEEL_L, HEEL_R = 29, 30
    FOOT_L, FOOT_R = 31, 32


LM = Landmark()
