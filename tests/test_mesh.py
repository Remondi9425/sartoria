"""Measuring shapes whose girth is known in closed form.

Runs in milliseconds on any machine: no torch, no model weights, no GPU. The
neural part only produces points; everything judged here is what we do with them.
"""
import math

import numpy as np
import pytest

from spike import mesh as M


def ellipse_perimeter(a: float, b: float) -> float:
    """Ramanujan's second approximation — a reference value to check the hull
    against, not shipped code."""
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def cylinder(r_x: float, r_z: float, y0: float, y1: float,
             n_ring: int = 220, n_layer: int = 90, cx: float = 0.0) -> np.ndarray:
    """A vertical elliptical cylinder as a cloud of surface points."""
    th = np.linspace(0, 2 * np.pi, n_ring, endpoint=False)
    ys = np.linspace(y0, y1, n_layer)
    x = (cx + r_x * np.cos(th))[None, :].repeat(n_layer, 0).ravel()
    z = (r_z * np.sin(th))[None, :].repeat(n_layer, 0).ravel()
    y = ys[:, None].repeat(n_ring, 1).ravel()
    return np.stack([x, y, z], axis=1)


def test_hull_perimeter_of_a_circle_is_two_pi_r():
    pts = cylinder(10.0, 10.0, 0, 1)
    got = M.girth_at(pts, 0.5, band=0.6)
    assert got == pytest.approx(2 * math.pi * 10.0, rel=2e-3)


def test_hull_perimeter_matches_an_ellipse():
    a, b = 9.2, 8.0
    pts = cylinder(a, b, 0, 1)
    got = M.girth_at(pts, 0.5, band=0.6)
    assert got == pytest.approx(ellipse_perimeter(a, b), rel=3e-3)


def test_the_hull_spans_a_dent_the_way_a_tape_measure_does():
    """The reason for using a hull at all: a tape bridges concavities."""
    pts = cylinder(10.0, 10.0, 0, 1)
    dented = pts.copy()
    bite = (dented[:, 0] > 6) & (np.abs(dented[:, 2]) < 3)
    dented[bite, 0] -= 3.0                        # press a groove into one side
    assert M.girth_at(dented, 0.5, band=0.6) == pytest.approx(
        M.girth_at(pts, 0.5, band=0.6), rel=5e-3)


def test_upright_fixes_a_tilted_body_before_slicing():
    """A tilted body sliced horizontally reads every girth too large."""
    pts = cylinder(10.0, 10.0, 0, 100)
    t = math.radians(22)
    R = np.array([[math.cos(t), -math.sin(t), 0],
                  [math.sin(t), math.cos(t), 0], [0, 0, 1]])
    tilted = pts @ R.T
    pelvis, neck = np.array([0, 10.0, 0]) @ R.T, np.array([0, 90.0, 0]) @ R.T

    naive = M.girth_at(tilted, float(np.median(tilted[:, 1])), band=0.7)
    fixed = M.girth_at(M.upright(tilted, pelvis, neck), 50.0, band=0.7)
    truth = 2 * math.pi * 10.0

    assert naive > truth * 1.03, "the tilt should have inflated the naive reading"
    assert fixed == pytest.approx(truth, rel=5e-3)


def test_rescaling_uses_the_height_the_person_typed():
    pts = cylinder(0.10, 0.10, 0.0, 1.74)         # metres, as the model emits
    scaled, k = M.rescale_to_height(pts, 174.0)
    assert scaled[:, 1].max() - scaled[:, 1].min() == pytest.approx(174.0)
    assert k == pytest.approx(100.0, rel=1e-6)
    assert M.girth_at(scaled, 87.0, band=1.0) == pytest.approx(
        2 * math.pi * 10.0, rel=3e-3)


def test_a_leg_is_measured_alone_not_together_with_its_twin():
    left = cylinder(6.0, 6.0, 0, 80, cx=-12.0)
    right = cylinder(6.0, 6.0, 0, 80, cx=12.0)
    both = np.vstack([left, right])
    assert M.girth_at(both, 40.0, band=1.0, near_x=12.0) == pytest.approx(
        2 * math.pi * 6.0, rel=3e-3)
    # without near_x the hull wraps both legs and reads far too large
    assert M.girth_at(both, 40.0, band=1.0) > 2 * math.pi * 6.0 * 1.5


def test_crotch_is_found_where_the_legs_part():
    torso = cylinder(16.0, 11.0, 90, 140)
    left = cylinder(7.0, 7.0, 0, 90, cx=-9.0)
    right = cylinder(7.0, 7.0, 0, 90, cx=9.0)
    body = np.vstack([torso, left, right])
    y = M.crotch_height(body, y_hip=120.0, y_knee=40.0, band=1.0)
    assert y is not None and y == pytest.approx(90.0, abs=4.0)


def test_a_slice_with_nothing_in_it_returns_nothing_rather_than_zero():
    pts = cylinder(10.0, 10.0, 0, 10)
    assert M.girth_at(pts, 500.0, band=0.5) is None
