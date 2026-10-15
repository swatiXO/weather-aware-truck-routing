from datetime import datetime, timedelta, timezone

import pytest

from planner.domain.geo import cumulative_miles
from planner.domain.sampling import (
    HOS_BREAK_S, Step, breaks_before, checkpoint_miles, cumulative_seconds, sample_route, track,
)

DEPART = datetime(2026, 10, 16, 6, 0, tzinfo=timezone.utc)


def straight_route(n_points=101, lat_span=4.0):
    """A north-south line; 1 degree of latitude is ~69 miles."""
    return [(30 + lat_span * i / (n_points - 1), -100.0) for i in range(n_points)]


def test_checkpoint_miles_include_both_ends():
    assert checkpoint_miles(60, 25) == [0, 25, 50, 60]
    assert checkpoint_miles(50, 25) == [0, 25, 50]
    assert checkpoint_miles(10, 25) == [0, 10]


def test_step_durations_are_spread_by_distance():
    coords = straight_route(5)
    cum = cumulative_miles(coords)
    # First half slow (city), second half fast (highway).
    secs = cumulative_seconds(coords, cum, [Step(0, 2, 3600), Step(2, 4, 1800)])
    assert secs[0] == 0
    assert secs[1] == pytest.approx(1800)
    assert secs[2] == pytest.approx(3600)
    assert secs[4] == pytest.approx(5400)


def test_checkpoints_are_evenly_spaced_with_increasing_etas():
    coords = straight_route()
    total_s = 4 * 3600
    cps, breaks, cum, _ = sample_route(coords, [Step(0, 100, total_s)], DEPART, 25, hos=False)
    gaps = [b.mile - a.mile for a, b in zip(cps, cps[1:])]
    assert all(g == pytest.approx(25) for g in gaps[:-1])
    assert 0 < gaps[-1] <= 25
    assert cps[0].eta == DEPART
    assert cps[-1].eta == DEPART + timedelta(seconds=total_s)
    assert all(a.eta < b.eta for a, b in zip(cps, cps[1:]))
    assert breaks == []


@pytest.mark.parametrize("hours, expected", [(0, 0), (7.9, 0), (8, 0), (8.01, 1), (16, 1), (16.5, 2)])
def test_breaks_before(hours, expected):
    assert breaks_before(hours * 3600, hos=True) == expected
    assert breaks_before(hours * 3600, hos=False) == 0


def test_hos_break_inserted_after_8h_driving():
    coords = straight_route()
    drive_s = 10 * 3600
    cps, breaks, *_ = sample_route(coords, [Step(0, 100, drive_s)], DEPART, 25, hos=True)
    assert len(breaks) == 1
    assert breaks[0].start == DEPART + timedelta(hours=8)
    assert breaks[0].end - breaks[0].start == timedelta(seconds=HOS_BREAK_S)
    assert cps[-1].eta == DEPART + timedelta(seconds=drive_s + HOS_BREAK_S)
    # Checkpoints before the break are unaffected.
    early = [c for c in cps if c.drive_s <= 8 * 3600]
    assert all(c.eta == DEPART + timedelta(seconds=c.drive_s) for c in early)


def test_track_pauses_during_break():
    coords = straight_route()
    _, _, cum, secs = sample_route(coords, [Step(0, 100, 10 * 3600)], DEPART, 25, hos=True)
    pts = track(coords, cum, secs, hos=True)
    assert pts[0][2] == 0
    assert pts[-1][2] == 10 * 3600 + HOS_BREAK_S
    pause = [(a, b) for a, b in zip(pts, pts[1:]) if a[:2] == b[:2]]
    assert len(pause) == 1
    assert pause[0][1][2] - pause[0][0][2] == HOS_BREAK_S
    assert all(a[2] <= b[2] for a, b in zip(pts, pts[1:]))
