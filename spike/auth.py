"""Short-lived signed tokens for the measurement endpoint.

The engine's URL is in the front end's bundle — anything prefixed
NEXT_PUBLIC_ is, by definition — and the endpoint starts a GPU container. CORS
does not help: it is a rule browsers apply to other people's pages, not a
restriction on anyone holding a shell.

So the front end's server mints a token, the browser carries it, and the worker
checks it. The secret stays on the server at both ends and never reaches the
bundle. This is a speed bump with an expiry date, not an identity system: it
stops the URL being a free GPU for whoever finds it.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


class TokenError(Exception):
    """Phrased for a log, not for a caller: never echo this back."""


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def mint(secret: str, ttl_seconds: int = 900, purpose: str = "measure") -> str:
    payload = {"exp": int(time.time()) + ttl_seconds, "p": purpose}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(sig)}"


def verify(token: str, secret: str, purpose: str = "measure") -> dict:
    """The payload, or TokenError. Never returns a partially trusted result."""
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise TokenError("malformed token") from None

    try:
        given = _unb64(sig)
    except Exception:
        # Junk must be refused, not raise something the caller did not expect.
        raise TokenError("unreadable signature") from None

    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    # Constant time: a check that leaks its comparison lets a signature be
    # discovered one byte at a time.
    if not hmac.compare_digest(given, expected):
        raise TokenError("bad signature")

    try:
        payload = json.loads(_unb64(body))
    except Exception:
        raise TokenError("unreadable payload") from None

    if payload.get("p") != purpose:
        raise TokenError(f"wrong purpose: {payload.get('p')!r}")
    if not isinstance(payload.get("exp"), int):
        raise TokenError("no expiry")
    if payload["exp"] < time.time():
        raise TokenError("expired")
    return payload


class RateLimit:
    """A sliding window per caller, held in memory.

    Deliberately modest: containers come and go, so this bounds one container's
    exposure rather than the service's. The token is the real gate; this stops
    a single holder from spending the whole budget in a minute.
    """

    def __init__(self, limit: int = 10, window_seconds: int = 600) -> None:
        self.limit = limit
        self.window = window_seconds
        self._seen: dict[str, list[float]] = {}

    def allow(self, who: str) -> bool:
        now = time.time()
        hits = [t for t in self._seen.get(who, []) if now - t < self.window]
        if len(hits) >= self.limit:
            self._seen[who] = hits
            return False
        hits.append(now)
        self._seen[who] = hits
        return True
