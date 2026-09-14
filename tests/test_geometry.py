"""The maths, on its own."""
import math
import numpy as np
import pytest

from spike import geometry as G


def test_spans_finds_runs_and_ignores_specks():
    row = np.array([0, 1, 1, 1, 0, 0, 1, 0, 1, 1], dtype=bool)
    assert G.spans(row, min_len=2) == [(1, 4), (8, 10)]   # the lone True at 6 drops out


def test_spans_handles_runs_touching_both_edges():
    row = np.array([1, 1, 0, 1, 1], dtype=bool)
    assert G.spans(row, min_len=2) == [(0, 2), (3, 5)]


def test_ellipse_perimeter_matches_a_circle():
    assert G.ellipse_perimeter(5.0, 5.0) == pytest.approx(2 * math.pi * 5.0, rel=1e-9)


def test_ellipse_perimeter_matches_numeric_integration():
    a, b = 9.2, 8.0
    n = 2_000_000
    th = (np.arange(n) + 0.5) * (2 * math.pi / n)          # midpoint rule
    exact = float(np.hypot(-a * np.sin(th), b * np.cos(th)).sum() * (2 * math.pi / n))
    assert G.ellipse_perimeter(a, b) == pytest.approx(exact, rel=1e-6)


def test_circumference_is_driven_by_both_axes():
    assert G.circumference(20.0, 10.0) < G.circumference(20.0, 20.0)


def test_cm_per_px_scales_linearly():
    assert G.cm_per_px(180.0, 0, 900) == pytest.approx(0.2)
    with pytest.raises(ValueError):
        G.cm_per_px(180.0, 500, 500)


def test_crown_heel_rejects_an_empty_mask():
    with pytest.raises(ValueError):
        G.crown_heel(np.zeros((10, 10), dtype=bool))


def test_touches_border_spots_a_cropped_head():
    m = np.zeros((40, 40), dtype=bool)
    m[0:20, 10:30] = True
    assert G.touches_border(m)["top"] is True
    assert G.touches_border(m)["bottom"] is False


def test_yaw_is_zero_facing_the_camera_and_ninety_side_on():
    facing = G.yaw_deg(np.array([-0.2, 0, 0.0]), np.array([0.2, 0, 0.0]))
    side = G.yaw_deg(np.array([0.0, 0, -0.2]), np.array([0.0, 0, 0.2]))
    assert facing == pytest.approx(0.0, abs=1e-9)
    assert abs(side) == pytest.approx(90.0, abs=1e-9)


def test_rotation_coverage_rewards_a_spread_of_angles():
    assert G.rotation_coverage([0.0] * 50) < 0.1
    assert G.rotation_coverage(list(range(-90, 91, 10))) > 0.9
    assert G.rotation_coverage([]) == 0.0


def test_find_crotch_y_locates_where_two_legs_become_one():
    m = np.zeros((100, 60), dtype=bool)
    m[20:50, 20:40] = True          # torso
    m[50:100, 20:28] = True         # left leg
    m[50:100, 32:40] = True         # right leg
    assert G.find_crotch_y(m, y_hip=30, y_ankle=95) == pytest.approx(49, abs=2)


def test_width_picks_the_leg_nearest_the_knee_not_the_gap():
    m = np.zeros((100, 60), dtype=bool)
    m[50:100, 20:28] = True
    m[50:100, 32:40] = True
    assert G.width_px_at(m, 70, near_x=36.0) == 8.0
