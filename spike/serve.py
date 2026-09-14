"""The measurement engine behind HTTP.

A thin front: it validates the upload, hands the bytes to whatever function
actually measures, and shapes the answer. The measuring runs on a GPU
container — see modal_app.py — so this layer stays cheap and does not hold a
GPU open while someone uploads over a phone connection.

Local development points the web app straight at the deployed engine; there is
no laptop-sized version of a half-gigabyte model, and pretending otherwise
would mean testing something other than what ships.
"""
from __future__ import annotations

import os
import re
import time
import uuid
from dataclasses import asdict
from typing import Any, Callable, Protocol

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import twin as T

MAX_BYTES = 80 * 1024 * 1024


class MeasureFn(Protocol):
    def __call__(self, clip: bytes, height_cm: float, session_id: str,
                 suffix: str) -> dict[str, Any]: ...


def _vercel_origin_regex(project: str | None) -> str | None:
    """Every Vercel deployment gets its own hostname, so previews are matched
    by pattern rather than listed one by one.

    Built here from a plain project name rather than carried in as a regex: an
    escaped pattern cannot survive being set as an environment variable in a
    container image, because the Dockerfile parser rejects the escape sequences
    before Python ever sees them.
    """
    if not project:
        return None
    return "https://" + re.escape(project.strip()) + r"(-[a-z0-9-]+)?\.vercel\.app"


def _refusal(sid: str, height_cm: float, reason: str,
             detail: str | None = None) -> dict[str, Any]:
    """Every failure is an answer with a cause, never a bare 500."""
    return {
        "session_id": sid,
        "height_cm": height_cm,
        "status": "capture_rejected",
        "reason": reason,
        "all_reasons": [detail or reason],
        "coaching": [],
        "capture_quality": asdict(T.CaptureQuality(None, None, None, 0, 0.0, None, None)),
        "processing_method": "nlf_smpl_hull_v1",
    }


def make_app(measure_fn: MeasureFn | Callable[..., dict]) -> FastAPI:
    app = FastAPI(title="SartorIA measurement engine", version="0.2.0")

    origins = [o.strip().rstrip("/") for o in os.environ.get(
        "SARTORIA_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=_vercel_origin_regex(os.environ.get("SARTORIA_VERCEL_PROJECT")),
        allow_methods=["POST", "GET"],
        allow_headers=["*"],
    )

    def _read(upload: UploadFile) -> tuple[bytes, str]:
        data = upload.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("clip is larger than 80 MB")
        name = upload.filename or "clip.mp4"
        suffix = "." + name.rsplit(".", 1)[-1] if "." in name else ".mp4"
        return data, suffix

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "engine": "nlf_smpl_hull_v1"}

    @app.post("/analyse")
    async def analyse(
        video: UploadFile = File(...),
        height_cm: float = Form(...),
        session_id: str = Form(default=""),
    ) -> JSONResponse:
        sid = session_id or f"web-{uuid.uuid4().hex[:8]}"
        began = time.perf_counter()
        try:
            clip, suffix = _read(video)
            body = measure_fn(clip=clip, height_cm=height_cm,
                              session_id=sid, suffix=suffix)
            body["took_seconds"] = round(time.perf_counter() - began, 2)
            return JSONResponse(body)
        except Exception as e:
            return JSONResponse(_refusal(
                sid, height_cm,
                "Something went wrong reading that clip. Try recording again — "
                "ten seconds, whole body in frame.",
                f"{type(e).__name__}: {e}"), status_code=200)

    @app.post("/debug")
    async def debug_view(
        video: UploadFile = File(...),
        height_cm: float = Form(...),
    ) -> JSONResponse:
        """Everything /analyse computed, including each frame's own answer.

        With a mesh method the useful diagnostic is not a picture — it is how
        far the frames disagree. A site the frames agree on is measured; one
        they do not is a guess wearing a number.
        """
        try:
            clip, suffix = _read(video)
            body = measure_fn(clip=clip, height_cm=height_cm,
                              session_id="debug", suffix=suffix)
            return JSONResponse(body)
        except Exception as e:
            return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)

    return app
