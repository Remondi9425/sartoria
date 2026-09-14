"""The measurement engine behind HTTP.

Runs the same code as the CLI — see pipeline.run — so what the browser gets is
what the tests cover. Development only: no auth, CORS wide open to localhost,
and it holds the uploaded clip on disk only for as long as it takes to read it.

    .venv/bin/uvicorn spike.serve:app --port 8000 --reload
"""
from __future__ import annotations

import base64
import json
import os
import tempfile
import time
import uuid
from dataclasses import asdict
from pathlib import Path

import cv2
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import debug as D
from . import twin as T
from .capture import UnreadableClip
from .pipeline import run

app = FastAPI(title="SartorIA measurement engine", version="0.1.0")

# Local development by default. Deployments set SARTORIA_ALLOWED_ORIGINS to the
# front end's real origin — a comma-separated list, no trailing slashes.
_origins = [o.strip().rstrip("/") for o in os.environ.get(
    "SARTORIA_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Vercel gives every deployment its own hostname, so the preview URLs are
    # matched by pattern rather than listed one by one.
    allow_origin_regex=os.environ.get("SARTORIA_ALLOWED_ORIGIN_REGEX") or None,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

MAX_BYTES = 80 * 1024 * 1024


def _save(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "clip.webm").suffix or ".webm"
    fd = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        fd.close(); Path(fd.name).unlink(missing_ok=True)
        raise ValueError("clip is larger than 80 MB")
    fd.write(data); fd.close()
    return Path(fd.name)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": "silhouette_ellipse_v1"}


@app.post("/analyse")
async def analyse(
    video: UploadFile = File(...),
    height_cm: float = Form(...),
    session_id: str = Form(default=""),
) -> JSONResponse:
    """A twin, or a refusal with a named cause. Never a bare 500."""
    sid = session_id or f"web-{uuid.uuid4().hex[:8]}"
    path = None
    began = time.perf_counter()
    try:
        path = _save(video)
        out = run(path, height_cm, sid)
        took = round(time.perf_counter() - began, 2)

        if out.twin is not None:
            body = json.loads(out.twin.to_json())
            body["status"] = "ok"
            body["took_seconds"] = took
            return JSONResponse(body)

        body = json.loads(T.refused(sid, height_cm, out.verdict, out.quality))
        body["took_seconds"] = took
        return JSONResponse(body, status_code=200)

    except Exception as e:                       # a crash is still an answer
        unreadable = isinstance(e, UnreadableClip)
        return JSONResponse({
            "session_id": sid,
            "height_cm": height_cm,
            "status": "capture_rejected",
            "reason": str(e) if unreadable else
                      "Something went wrong reading that clip. Try recording "
                      "again — ten seconds, whole body in frame.",
            "all_reasons": [f"{type(e).__name__}: {e}"],
            "coaching": [],
            "capture_quality": asdict(T.CaptureQuality(
                None, None, None, 0, 0.0, None, None)),
            "processing_method": T.METHOD,
        }, status_code=200)
    finally:
        if path:
            path.unlink(missing_ok=True)         # the clip is never kept


@app.post("/debug")
async def debug_view(
    video: UploadFile = File(...),
    height_cm: float = Form(...),
) -> JSONResponse:
    """Everything /analyse saw, drawn on the frames it chose."""
    path = None
    try:
        path = _save(video)
        out = run(path, height_cm, "debug")
        payload: dict = {"diagnostics": D.diagnostics(out), "images": {}}

        frames = {}
        if out.front is not None and out.landmarks is not None:
            cap = cv2.VideoCapture(str(path))
            cap.set(cv2.CAP_PROP_POS_FRAMES, out.front.frame_index)
            ok, img = cap.read()
            if ok:
                frames["front"] = D.annotate_front(
                    img, out.front.mask, out.landmarks, height_cm)
            if out.side is not None:
                cap.set(cv2.CAP_PROP_POS_FRAMES, out.side.frame_index)
                ok, img = cap.read()
                if ok:
                    frames["side"] = D.annotate_side(img, out.side.mask)
            cap.release()

        for name, img in frames.items():
            ok, buf = cv2.imencode(".png", img)
            if ok:
                payload["images"][name] = (
                    "data:image/png;base64," + base64.b64encode(buf).decode())

        if out.twin is not None:
            payload["twin"] = json.loads(out.twin.to_json())
        return JSONResponse(payload)
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)
    finally:
        if path:
            path.unlink(missing_ok=True)
