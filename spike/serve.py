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

import logging
import os
import re
import uuid
from dataclasses import asdict
from typing import Any, Callable, Protocol

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import RateLimit, TokenError, verify
from . import twin as T

MAX_BYTES = 80 * 1024 * 1024
MIN_BYTES = 10_000                       # smaller than any real ten-second clip
MIN_HEIGHT_CM, MAX_HEIGHT_CM = 140.0, 210.0
ALLOWED_SUFFIXES = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}

log = logging.getLogger("sartoria.engine")


class SubmitFn(Protocol):
    """Start the measurement and return a handle. Must not block."""
    def __call__(self, clip: bytes, height_cm: float, session_id: str,
                 suffix: str) -> str: ...


class PollFn(Protocol):
    """The result if it is ready, or None."""
    def __call__(self, job_id: str) -> dict[str, Any] | None: ...


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


class Rejected(Exception):
    """Something the caller can fix, phrased for the caller."""


# The diagnostic endpoint returns every frame's own answer and the mesh as a
# picture. Useful while building, not something to leave reachable.
DEBUG_ENABLED = os.environ.get("SARTORIA_DEBUG_ENDPOINT", "").lower() in ("1", "true", "yes")


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


def _require_token(request: Request, limiter: RateLimit | None = None) -> None:
    """Refuse callers without a live token, and throttle the ones with one.

    The endpoint starts a GPU container and its URL is in a public bundle, so
    "nobody knows the address" was never a control.
    """
    secret = os.environ.get("SARTORIA_TOKEN_SECRET")
    if not secret:
        return                                # unset: local development

    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else ""
    try:
        verify(token, secret)
    except TokenError as e:
        log.warning("rejected token: %s", e)
        raise HTTPException(status_code=401, detail="not authorised")

    if limiter is None:
        return
    who = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
           or (request.client.host if request.client else "unknown"))
    if not limiter.allow(who):
        raise HTTPException(status_code=429, detail="too many requests")


def make_app(submit_fn: SubmitFn | Callable[..., str],
             poll_fn: PollFn | Callable[..., Any]) -> FastAPI:
    """Submit-and-poll, not one long request.

    Measuring takes twenty seconds warm and nearly two minutes cold, and a
    request held open that long does not survive: the platform answers a 303
    redirect to a polling URL, which curl cannot follow across the method
    change and a browser rejects outright — "Failed to fetch" after 150
    seconds, with no useful error.

    So the upload returns a job id as soon as the bytes are in, and the client
    asks for the result. Which is what should have been built anyway: a phone
    on a slow connection should not be holding a GPU open while it uploads.
    """
    app = FastAPI(title="SartorIA measurement engine", version="0.3.0")

    # Two budgets, because the two endpoints cost different things. Starting a
    # job spins up a GPU; asking whether it has finished does not, and a single
    # job asks dozens of times — throttling both alike makes one scan look like
    # an attack.
    starts = RateLimit(limit=10, window_seconds=600)
    polls = RateLimit(limit=1200, window_seconds=600)

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
        """The bytes and a suffix we chose, not one the caller did."""
        data = upload.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise Rejected("That clip is larger than 80 MB. Ten seconds is "
                           "plenty — try recording a shorter one.")
        if len(data) < MIN_BYTES:
            raise Rejected("That file is too small to be a video. Record for "
                           "about ten seconds.")
        # The filename comes from the client, and it ends up as a temp-file
        # suffix on the worker. Take the extension only if we recognise it, and
        # never anything with a path separator in it.
        name = (upload.filename or "").lower()
        suffix = "." + name.rsplit(".", 1)[-1] if "." in name else ""
        if suffix not in ALLOWED_SUFFIXES:
            suffix = ".mp4"
        return data, suffix

    def _height(value: float) -> float:
        if not (MIN_HEIGHT_CM <= value <= MAX_HEIGHT_CM):
            raise Rejected(
                f"That height is outside the range we can work with "
                f"({MIN_HEIGHT_CM:.0f}–{MAX_HEIGHT_CM:.0f} cm). The scale "
                f"comes from it, so it has to be right.")
        return float(value)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "engine": "nlf_smpl_hull_v1"}

    @app.post("/analyse")
    async def analyse(
        request: Request,
        video: UploadFile = File(...),
        height_cm: float = Form(...),
        session_id: str = Form(default=""),
    ) -> JSONResponse:
        """Take the clip, start the work, hand back a ticket."""
        _require_token(request, starts)
        sid = session_id or f"web-{uuid.uuid4().hex[:8]}"
        try:
            clip, suffix = _read(video)
            job_id = submit_fn(clip=clip, height_cm=_height(height_cm),
                               session_id=sid, suffix=suffix)
            return JSONResponse({"status": "accepted", "job_id": job_id,
                                 "session_id": sid}, status_code=202)
        except Rejected as e:
            return JSONResponse(_refusal(sid, height_cm, str(e)), status_code=200)
        except Exception:
            # The cause goes to the logs. What comes back is what the person can
            # act on — an exception type and message is neither useful to them
            # nor ours to hand out.
            log.exception("submit failed for session %s", sid)
            return JSONResponse(_refusal(
                sid, height_cm,
                "Something went wrong reading that clip. Try recording again — "
                "ten seconds, whole body in frame."), status_code=200)

    @app.get("/result/{job_id}")
    def result(job_id: str, request: Request) -> JSONResponse:
        """The twin once it exists. Until then, say so and say nothing else."""
        _require_token(request, polls)
        try:
            body = poll_fn(job_id=job_id)
        except Exception:
            log.exception("polling failed for job %s", job_id)
            return JSONResponse(_refusal(
                "", 0.0,
                "The measurement failed partway through. Record again — ten "
                "seconds, whole body in frame."), status_code=200)
        if body is None:
            return JSONResponse({"status": "working"}, status_code=200)
        return JSONResponse(body)

    @app.post("/debug")
    async def debug_view(
        request: Request,
        video: UploadFile = File(...),
        height_cm: float = Form(...),
    ) -> JSONResponse:
        """Everything /analyse computed, including each frame's own answer.

        With a mesh method the useful diagnostic is not a picture — it is how
        far the frames disagree. A site the frames agree on is measured; one
        they do not is a guess wearing a number.
        """
        if not DEBUG_ENABLED:
            return JSONResponse({"error": "not found"}, status_code=404)
        _require_token(request, starts)
        try:
            clip, suffix = _read(video)
            return JSONResponse({
                "status": "accepted",
                "job_id": submit_fn(clip=clip, height_cm=_height(height_cm),
                                    session_id="debug", suffix=suffix)},
                status_code=202)
        except Rejected as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        except Exception:
            log.exception("debug submit failed")
            return JSONResponse({"error": "debug run failed"}, status_code=500)

    return app
