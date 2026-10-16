from datetime import datetime, timedelta, timezone

import pytest

from planner.domain.corridor import corridor_points
from planner.domain.forecast import HourlySeries, Reading
from planner.domain.risk import Risk, classify
from planner.domain.geo import cumulative_miles, destination, haversine_mi, point_at


def test_haversine_one_degree_latitude():
    assert haversine_mi((40, -100), (41, -100)) == pytest.approx(69.1, abs=0.2)


def test_destination_roundtrip():
    p = destination((40, -100), 90, 25)
    assert haversine_mi((40, -100), p) == pytest.approx(25, abs=0.01)


def test_point_at_interpolates():
    coords = [(40, -100), (41, -100)]
    cum = cumulative_miles(coords)
    lat, lon = point_at(coords, cum, cum[-1] / 2)
    assert lat == pytest.approx(40.5) and lon == pytest.approx(-100)


def test_corridor_covers_both_sides_and_dedupes():
    coords = [(35 + i * 0.05, -100.0) for i in range(41)]  # ~138 mi north
    cum = cumulative_miles(coords)
    pts = corridor_points([(coords, cum), (coords, cum)])
    lons = {p[1] for p in pts}
    assert min(lons) < -100.2 and max(lons) > -99.8   # ~25 mi offsets either side
    assert len(pts) == len(set(pts))                  # duplicate route adds nothing


START = datetime(2026, 10, 16, 6, tzinfo=timezone.utc)


def series():
    return HourlySeries(START, [10, 20, 40], [15, 25, 50], [0, 0.2, 0.4], [0, 0, 1.0])


def test_forecast_interpolates_between_hours():
    r = series().at(START + timedelta(minutes=30))
    assert r.wind_mph == pytest.approx(15)
    assert r.rain_in_hr == pytest.approx(0.1)


def test_forecast_clamps_outside_range():
    assert series().at(START - timedelta(hours=3)).wind_mph == 10
    assert series().at(START + timedelta(hours=10)).wind_mph == 40


def test_forecast_handles_other_timezones():
    local = (START + timedelta(hours=1)).astimezone(timezone(timedelta(hours=-6)))
    assert series().at(local).wind_mph == pytest.approx(20)


def test_readings_are_classified_as_displayed():
    # 24.96 mph is displayed as "25 mph", so it must be Moderate, not Low.
    r = Reading(24.96, 30.4, 0.098, 0.0).rounded()
    assert (r.wind_mph, r.rain_in_hr) == (25, 0.10)
    a = classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, 10_000)
    assert a.wind == Risk.MODERATE and a.rain == Risk.MODERATE
