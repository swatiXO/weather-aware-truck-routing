"""Via-point fallback when ORS returns fewer than three alternatives."""
import pytest
from django.core.cache import cache

from planner.services import routing
from planner.services.geocoding import Place
from planner.services.http import UpstreamError
from planner.services.routing import RouteData, gross_weight_tonnes, overlap
from planner.domain.sampling import Step

ORIGIN, DEST = Place("O", 30, -100), Place("D", 34, -100)


def line(lon, duration_h):
    coords = [(30 + 4 * i / 100, lon) for i in range(101)]
    return RouteData(coords, 276, duration_h * 3600, [Step(0, 100, duration_h * 3600)])


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


def test_overlap():
    a, b = line(-100, 4), line(-102, 5)
    assert overlap(a, a) == 1.0
    assert overlap(a, b) == 0.0


def test_gross_weight_is_capped_at_80k_lb():
    assert gross_weight_tonnes(10_000) == pytest.approx(20.4, abs=0.1)
    assert gross_weight_tonnes(60_000) == pytest.approx(36.3, abs=0.1)


def test_fallback_fills_to_three_and_skips_duplicates(monkeypatch):
    calls = []

    def fake(points, load_lb, alternatives):
        calls.append((len(points), alternatives))
        if alternatives:
            raise UpstreamError("route too long for alternatives", 422)
        if len(points) == 2:
            return [line(-100, 4)]
        via_lon = points[1][1]
        if via_lon > -100:      # east-side via points yield a copy of the main route
            return [line(-100, 4.1)]
        return [line(round(via_lon, 1), 5)]

    monkeypatch.setattr(routing, "_directions", fake)
    routes, notes = routing.get_routes(ORIGIN, DEST, 40_000)

    assert len(routes) == 3
    assert notes == []
    assert calls[0] == (2, False)          # long trip: built-in alternatives skipped
    assert all(n == 3 for n, _ in calls[1:])
    assert routes[0].duration_s == 4 * 3600          # sorted fastest first
    for i, a in enumerate(routes):
        for b in routes[i + 1:]:
            assert overlap(a, b) < routing.MAX_OVERLAP


def test_note_when_no_distinct_alternatives(monkeypatch):
    monkeypatch.setattr(routing, "_directions", lambda pts, load, alternatives: [line(-100, 4)])
    routes, notes = routing.get_routes(ORIGIN, DEST, 40_000)
    assert len(routes) == 1
    assert "Only 1 distinct route" in notes[0]


def test_short_trip_falls_back_when_alternatives_rejected(monkeypatch):
    near = Place("N", 30.5, -100)
    calls = []

    def fake(points, load_lb, alternatives):
        calls.append(alternatives)
        if alternatives:
            raise UpstreamError("too long", 422)
        return [line(-100, 1)]

    monkeypatch.setattr(routing, "_directions", fake)
    routing.get_routes(ORIGIN, near, 40_000)
    assert calls[:2] == [True, False]


def test_near_identical_ors_alternatives_are_deduplicated(monkeypatch):
    near = Place("N", 30.5, -100)

    def fake(points, load_lb, alternatives):
        if alternatives:
            return [line(-100, 1), line(-102, 1.2), line(-102, 1.25)]  # last two share a footprint
        return [line(-104, 1.5)]

    monkeypatch.setattr(routing, "_directions", fake)
    routes, _ = routing.get_routes(ORIGIN, near, 40_000)
    assert [r.duration_s / 3600 for r in routes] == [1, 1.2, 1.5]


def test_unroutable_trip_has_friendly_message(monkeypatch):
    def fake(points, load_lb, alternatives):
        raise UpstreamError("Routing error: approximated route distance must not be greater than 6000000.0 meters", 422)

    monkeypatch.setattr(routing, "_directions", fake)
    with pytest.raises(UpstreamError) as exc:
        routing.get_routes(ORIGIN, DEST, 40_000)
    assert exc.value.message == routing.NO_ROUTE_MESSAGE


def test_outages_keep_their_own_message(monkeypatch):
    def fake(points, load_lb, alternatives):
        raise UpstreamError("Routing rate limit reached. Please wait a minute and try again.", 502)

    monkeypatch.setattr(routing, "_directions", fake)
    with pytest.raises(UpstreamError) as exc:
        routing.get_routes(ORIGIN, DEST, 40_000)
    assert "rate limit" in exc.value.message
