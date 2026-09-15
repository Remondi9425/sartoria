"""Constants for the measurement engine.

Everything here is a calibration target, not a truth. Finding out which of these
numbers are wrong, and by how much, is what the first real recordings are for.
"""
import os

# ── capture gates ───────────────────────────────────────────────────────────
# Below this there is nothing to reconcile across frames.
MIN_USABLE_FRAMES = 12
# How many frames may lose the crown past the frame edge before the scale is
# unsupported. NLF completes a body that runs out of shot, so a vertex landing
# outside the image is the model inferring rather than seeing.
CROWN_TOLERANCE = 0.4
# Sample at most this many frames from a clip.
TARGET_FRAMES = 90

# Turning. A body model returns a full 3-D mesh from a single frontal view, but
# its depth there is the model's prior, not an observation of this person — and
# frontal frames agree with each other, so agreement would report high
# confidence in a number nobody measured. A side view is what makes depth real.
FRONTAL_YAW_TOL_DEG = 25.0      # |yaw| under this counts as facing the camera
PROFILE_YAW_MIN_DEG = 55.0      # |yaw| over this counts as side-on
ROTATION_COVERAGE_MIN = 0.45    # fraction of the half-turn we want to have seen

# ── plausibility envelope ───────────────────────────────────────────────────
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

# Overridable so a container can bake the weights in at build time rather than
# fetch half a gigabyte on every cold start.
NLF_MODEL_PATH = os.environ.get(
    "SARTORIA_NLF_MODEL", "models/nlf_l_multi.torchscript")
