"""Measured against a tape measure.

The headline is not the mean absolute error, it is the BIAS per site. Random
error you average away with more frames; a systematic offset — which is what
the elliptical cross-section assumption produces — you can only find by
measuring real people and then correct with a constant.
"""
from __future__ import annotations

import csv
import json
import statistics as stats
from dataclasses import dataclass
from pathlib import Path

from . import config as C


@dataclass
class SiteResult:
    name: str
    n: int
    bias_cm: float          # mean signed error: positive = we over-measure
    mae_cm: float
    p50_cm: float
    within_1cm: float
    within_2cm: float


def load_truth(path: str | Path) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sid = (row.get("session_id") or "").strip()
            if not sid or sid.startswith("#"):
                continue
            out[sid] = {k: float(v) for k, v in row.items()
                        if k in C.ALL_MEASUREMENTS and v not in (None, "")}
    return out


def load_twins(folder: str | Path) -> dict[str, dict]:
    out = {}
    for p in sorted(Path(folder).glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if d.get("status") == "capture_rejected":
            continue
        out[d["session_id"]] = d
    return out


def compare(truth: dict[str, dict[str, float]],
            twins: dict[str, dict]) -> tuple[list[SiteResult], dict]:
    errors: dict[str, list[float]] = {m: [] for m in C.ALL_MEASUREMENTS}
    for sid, t in truth.items():
        tw = twins.get(sid)
        if not tw:
            continue
        got = tw["measurements_cm"]
        for m, real in t.items():
            if m in got:
                errors[m].append(got[m] - real)

    results = []
    for m in C.ALL_MEASUREMENTS:
        e = errors[m]
        if not e:
            continue
        absd = [abs(x) for x in e]
        results.append(SiteResult(
            name=m, n=len(e),
            bias_cm=round(stats.fmean(e), 2),
            mae_cm=round(stats.fmean(absd), 2),
            p50_cm=round(stats.median(absd), 2),
            within_1cm=round(sum(x <= 1.0 for x in absd) / len(absd), 3),
            within_2cm=round(sum(x <= 2.0 for x in absd) / len(absd), 3),
        ))

    summary = {
        "sessions_with_truth": len(truth),
        "sessions_measured": sum(1 for s in truth if s in twins),
        "sessions_rejected_or_missing": sum(1 for s in truth if s not in twins),
    }
    return results, summary


def verdict(results: list[SiteResult]) -> str:
    """The decision the spike exists to produce.

    Waist and inseam are what actually pick a jeans size; the rest is texture.
    """
    key = {r.name: r for r in results if r.name in ("waist", "inseam")}
    if len(key) < 2:
        return "NO VERDICT — waist and inseam both need ground truth"
    worst = max(r.mae_cm for r in key.values())
    corrected = max(abs(r.mae_cm - abs(r.bias_cm)) for r in key.values())
    if worst <= 2.0:
        return f"VIDEO ROUTE HOLDS — worst of waist/inseam is {worst:.1f} cm MAE"
    if corrected <= 2.0:
        return (f"VIDEO ROUTE HOLDS AFTER CALIBRATION — {worst:.1f} cm raw, "
                f"about {corrected:.1f} cm once the per-site bias is removed")
    if worst <= 4.0:
        return (f"BORDERLINE at {worst:.1f} cm MAE — usable only with the "
                f"wardrobe anchor as a cross-check")
    return (f"VIDEO ROUTE FAILS at {worst:.1f} cm MAE — the wardrobe anchor "
            f"should become the primary path")


def report(results: list[SiteResult], summary: dict) -> str:
    w = 9
    head = (f"{'site':<9}{'n':>4}{'bias':>{w}}{'MAE':>{w}}{'median':>{w}}"
            f"{'≤1cm':>{w}}{'≤2cm':>{w}}")
    lines = [head, "-" * len(head)]
    for r in results:
        lines.append(f"{r.name:<9}{r.n:>4}{r.bias_cm:>+{w}.2f}{r.mae_cm:>{w}.2f}"
                     f"{r.p50_cm:>{w}.2f}{r.within_1cm:>{w}.0%}{r.within_2cm:>{w}.0%}")
    lines += ["", f"sessions with ground truth : {summary['sessions_with_truth']}",
              f"measured                   : {summary['sessions_measured']}",
              f"rejected or missing        : {summary['sessions_rejected_or_missing']}",
              "", verdict(results)]
    return "\n".join(lines)


def write_csv(results: list[SiteResult], path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["site", "n", "bias_cm", "mae_cm", "median_cm",
                     "within_1cm", "within_2cm"])
        for r in results:
            wr.writerow([r.name, r.n, r.bias_cm, r.mae_cm, r.p50_cm,
                         r.within_1cm, r.within_2cm])
