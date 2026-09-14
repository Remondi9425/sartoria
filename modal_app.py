"""The measurement engine on Modal.

    .venv/bin/modal deploy modal_app.py

Two things live here. The SMPL engine needs a GPU and half a gigabyte of
weights, so it runs as its own function; the web layer in front of it is a
plain container. Keeping them apart means an HTTP request that never reaches
the model does not pay for a GPU.

Nothing heavy is ever installed on a laptop: torch and the NLF weights exist
only inside these images.

Licence: the NLF code is MIT, but the released weights are for **noncommercial
research use**. Correct for a Project Work; a blocker for a business, and one
to settle deliberately rather than discover later.
"""
from __future__ import annotations

import os

import modal

MODEL_DIR = "/opt/models"
NLF_PATH = f"{MODEL_DIR}/nlf_l_multi.torchscript"

# Just the Vercel project name. serve.py builds the preview-URL pattern from it
# with re.escape — a regex with backslashes cannot survive being carried into a
# container image as an environment variable, because the Dockerfile parser
# rejects the escape sequences before Python ever sees them.
VERCEL_PROJECT = os.environ.get("SARTORIA_VERCEL_PROJECT", "sartoria")
ALLOWED_ORIGINS = os.environ.get(
    "SARTORIA_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)

COMMON_ENV = {
    "SARTORIA_ALLOWED_ORIGINS": ALLOWED_ORIGINS,
    "SARTORIA_VERCEL_PROJECT": VERCEL_PROJECT,
    "SARTORIA_NLF_MODEL": NLF_PATH,
}


def _bake_nlf() -> None:
    """Fetch the NLF weights at image build time.

    Half a gigabyte on the critical path of every cold start would be most of
    the wait, on a service that scales to zero.
    """
    import pathlib
    from urllib.request import urlopen

    from spike.nlf import NLF_WEIGHTS_URL

    p = pathlib.Path(NLF_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(NLF_WEIGHTS_URL) as r, open(p, "wb") as f:
        while chunk := r.read(1 << 22):
            f.write(chunk)
    size = p.stat().st_size
    assert size > 100_000_000, f"weights look wrong: {size} bytes"
    print(f"baked NLF weights: {size / 1e6:.0f} MB")


base = (
    modal.Image.debian_slim(python_version="3.12")
    # OpenCV needs these even headless; without them `import cv2` fails at
    # container start with a bare ImportError.
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "opencv-python-headless>=4.10",
        "numpy>=1.26,<2",
        "fastapi>=0.115",
        "python-multipart>=0.0.9",
    )
    .env(COMMON_ENV)
    .add_local_python_source("spike", copy=True)
)

gpu_image = (
    base.pip_install(
        "torch==2.5.1", "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .run_function(_bake_nlf)
)

app = modal.App("sartoria-engine", image=base)


@app.function(
    image=gpu_image,
    gpu="T4",             # the weights are a ViT-L; a T4 runs a clip in seconds
    memory=16384,
    timeout=600,
    # Short on purpose: a container warm from the previous version keeps
    # serving after a redeploy, and while iterating that reads as "the change
    # did not land". Raise it once the code settles.
    scaledown_window=60,
    max_containers=2,
)
def measure(clip: bytes, height_cm: float, session_id: str, suffix: str = ".mp4") -> dict:
    """One clip in, one twin — or a refusal with a named cause."""
    import json
    import tempfile
    from pathlib import Path

    from spike import nlf, twin as T
    from spike.pipeline_smpl import run

    global _MODEL
    try:
        _MODEL
    except NameError:
        _MODEL = nlf.load_model(NLF_PATH)

    tmp = Path(tempfile.mkstemp(suffix=suffix)[1])
    try:
        tmp.write_bytes(clip)
        out = run(tmp, height_cm, session_id, _MODEL)
        if out.twin is not None:
            body = json.loads(out.twin.to_json())
            body["status"] = "ok"
        else:
            body = json.loads(T.refused(session_id, height_cm, out.verdict, out.quality))
        body["diagnostics"] = {
            "frames_read": out.frames_read,
            "meshes": out.meshes,
            "measured_frames": out.measured,
            "scale_correction": out.scale_correction,
            "mean_vertex_uncertainty": out.mean_uncertainty,
            # How far the frames disagree, per site. With no tape measure inside
            # the pipeline this is the only evidence a number is real.
            "spread_cm": out.spreads,
            "probe": out.probe,
            "per_frame": out.frame_detail,
        }
        return body
    finally:
        tmp.unlink(missing_ok=True)


@app.function(
    image=base,
    cpu=1.0,
    memory=2048,
    timeout=120,
    scaledown_window=300,
)
@modal.asgi_app()
def engine():
    """The HTTP front. Cheap, and it never waits for the GPU."""
    from spike.serve import make_app

    def submit(clip: bytes, height_cm: float, session_id: str, suffix: str) -> str:
        return measure.spawn(clip=clip, height_cm=height_cm,
                             session_id=session_id, suffix=suffix).object_id

    def poll(job_id: str):
        call = modal.FunctionCall.from_id(job_id)
        try:
            return call.get(timeout=0)
        except TimeoutError:
            return None

    return make_app(submit_fn=submit, poll_fn=poll)
