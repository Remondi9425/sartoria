"""The measurement engine on Modal.

    .venv/bin/modal serve modal_app.py      # live-reloading, for trying it
    .venv/bin/modal deploy modal_app.py     # a stable URL

Serves exactly the FastAPI app in spike/serve.py, so the container runs the same
code as the laptop and the same code the tests cover.

No GPU. The silhouette method is MediaPipe on CPU and takes a few seconds for a
ten-second clip; a GPU here would be paid for and idle. If the spike says the
method needs a heavier model, add `gpu="T4"` to the decorator and nothing else
changes — which is the actual argument for being on Modal rather than a box.
"""
from __future__ import annotations

import os

import modal

MODEL_DIR = "/opt/models"
MODEL_PATH = f"{MODEL_DIR}/pose_landmarker_heavy.task"

# The front end's origin. Set it at deploy time:
#   modal deploy modal_app.py   (after editing, or via a Modal secret)
ALLOWED_ORIGINS = os.environ.get(
    "SARTORIA_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
# Vercel gives every deployment its own hostname, so previews are matched by
# pattern rather than listed.
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "SARTORIA_ALLOWED_ORIGIN_REGEX",
    r"https://sartoria.*\.vercel\.app",
)


def _bake_model() -> None:
    """Fetch the pose model at image build time.

    Downloading 30 MB on every cold start would put it on the critical path of
    the first request after an idle period, which is most requests when a
    service scales to zero.
    """
    import pathlib
    from urllib.request import urlopen

    from spike.config import POSE_MODEL_URL

    p = pathlib.Path(MODEL_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(POSE_MODEL_URL) as r, open(p, "wb") as f:
        f.write(r.read())
    size = p.stat().st_size
    assert size > 1_000_000, f"model download looks wrong: {size} bytes"
    print(f"baked pose model: {size / 1e6:.1f} MB")


image = (
    modal.Image.debian_slim(python_version="3.12")
    # OpenCV needs these even in the headless build; without them `import cv2`
    # fails at container start with a bare ImportError.
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "mediapipe==0.10.21",
        "opencv-python-headless>=4.10",
        "numpy>=1.26,<2",
        "fastapi>=0.115",
        "python-multipart>=0.0.9",
    )
    .env({
        "SARTORIA_POSE_MODEL": MODEL_PATH,
        "SARTORIA_ALLOWED_ORIGINS": ALLOWED_ORIGINS,
        "SARTORIA_ALLOWED_ORIGIN_REGEX": ALLOWED_ORIGIN_REGEX,
    })
    .add_local_python_source("spike", copy=True)
    .run_function(_bake_model)
)

app = modal.App("sartoria-engine", image=image)


@app.function(
    cpu=2.0,            # MediaPipe is happy on two cores; more buys little
    memory=4096,        # frames of a 1080p clip add up
    timeout=300,
    scaledown_window=300,
    max_containers=4,
)
@modal.asgi_app()
def engine():
    from spike.serve import app as fastapi_app
    return fastapi_app
