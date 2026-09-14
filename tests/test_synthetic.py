"""End to end on a body whose measurements are known by construction.

This proves the extraction — scale, crotch, levels, widths, depths. It cannot
prove the elliptical cross-section assumption, because the mannequin is built
from ellipses. Only a tape measure can test that.
"""
import pytest

from spike import config as C
from spike.body import measure
from spike.synthetic import Mannequin


@pytest.fixture(scope="module")
def measured():
    m = Mannequin()
    front, side = m.render("front"), m.render("side")
    return m, measure(front, side, m.landmarks(), m.height_cm)


def test_every_measurement_is_present(measured):
    _, got = measured
    assert set(got) == set(C.ALL_MEASUREMENTS)


@pytest.mark.parametrize("name", C.CIRCUMFERENCES)
def test_extraction_recovers_the_girth_at_the_level_it_aimed_at(measured, name):
    """Tight: given where the pipeline decided to measure, is the number right?"""
    m, got = measured
    # invert: which height fraction produces this girth on the mannequin?
    truth_at_level = min(
        (abs(m.girth_at_t(t / 1000) - got[name].cm), t / 1000)
        for t in range(10, 1000))
    assert truth_at_level[0] < 0.6, (
        f"{name}: {got[name].cm} cm does not match any real level of the body")


@pytest.mark.parametrize("name,tol_pct", [
    ("waist", 3.0), ("hip", 3.0), ("thigh", 4.0),
    ("knee", 6.0), ("calf", 6.0), ("ankle", 12.0),
])
def test_levels_land_close_to_the_intended_anatomy(measured, name, tol_pct):
    """Looser: do the level heuristics aim at the right place at all?

    The ankle tolerance is wide on purpose — we measure above the joint, where
    the leg is already thickening, and how far above is a calibration target.
    """
    m, got = measured
    truth = m.true_measurements()[name]
    err = abs(got[name].cm - truth) / truth * 100
    assert err < tol_pct, f"{name}: {got[name].cm} cm vs {truth:.1f} cm ({err:.1f}%)"


@pytest.mark.parametrize("name", C.LENGTHS)
def test_lengths_are_recovered_almost_exactly(measured, name):
    m, got = measured
    assert got[name].cm == pytest.approx(m.true_measurements()[name], abs=1.0)


def test_scale_is_what_makes_it_work(measured):
    """A body reported 10 cm taller should read about 10/178 larger everywhere."""
    m, got = measured
    front, side = m.render("front"), m.render("side")
    wrong = measure(front, side, m.landmarks(), m.height_cm + 10.0)
    ratio = wrong["waist"].cm / got["waist"].cm
    assert ratio == pytest.approx(188.0 / 178.0, rel=1e-3)


def test_a_bigger_body_is_measured_bigger(measured):
    big = Mannequin(height_cm=190.0)
    got_big = measure(big.render("front"), big.render("side"),
                      big.landmarks(), big.height_cm)
    _, got = measured
    assert got_big["inseam"].cm > got["inseam"].cm


def test_confidence_is_reported_for_every_measurement(measured):
    _, got = measured
    assert all(v.quality in ("high", "medium", "low") for v in got.values())
