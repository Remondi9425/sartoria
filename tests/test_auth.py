"""Tokens for the endpoint that starts GPUs."""
import time

import pytest

from spike.auth import RateLimit, TokenError, mint, verify

SECRET = "a-secret-that-never-reaches-the-bundle"


def test_a_token_we_minted_verifies():
    assert verify(mint(SECRET), SECRET)["p"] == "measure"


def test_a_token_from_another_secret_does_not():
    with pytest.raises(TokenError):
        verify(mint("someone else's secret"), SECRET)


def test_a_tampered_payload_does_not():
    token = mint(SECRET)
    body, sig = token.split(".", 1)
    with pytest.raises(TokenError):
        verify(f"{body[:-2]}XY.{sig}", SECRET)


def test_an_expired_token_does_not():
    with pytest.raises(TokenError):
        verify(mint(SECRET, ttl_seconds=-1), SECRET)


def test_a_token_for_another_purpose_does_not():
    with pytest.raises(TokenError):
        verify(mint(SECRET, purpose="debug"), SECRET, purpose="measure")


@pytest.mark.parametrize("junk", ["", "nonsense", "a.b", "....", "x." * 40])
def test_junk_is_refused_rather_than_crashing(junk):
    with pytest.raises(TokenError):
        verify(junk, SECRET)


def test_the_rate_limit_lets_a_normal_run_through_and_stops_a_flood():
    r = RateLimit(limit=3, window_seconds=60)
    assert [r.allow("1.2.3.4") for _ in range(3)] == [True, True, True]
    assert r.allow("1.2.3.4") is False
    assert r.allow("5.6.7.8") is True, "one caller must not block another"


def test_the_window_slides():
    r = RateLimit(limit=1, window_seconds=1)
    assert r.allow("x") is True
    assert r.allow("x") is False
    time.sleep(1.05)
    assert r.allow("x") is True


def test_polling_is_not_budgeted_like_starting_a_job():
    """One scan polls dozens of times. Sharing a budget with the endpoint that
    starts GPUs made a single normal run look like an attack — it did, to me,
    within a minute of the limit going in."""
    starts = RateLimit(limit=10, window_seconds=600)
    polls = RateLimit(limit=1200, window_seconds=600)
    assert all(polls.allow("1.2.3.4") for _ in range(60))
    assert starts.allow("1.2.3.4") is True
