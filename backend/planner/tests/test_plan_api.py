"""Full /api/plan and /api/heatmap flow with every third-party call mocked."""
import base64
from datetime import datetime, timedelta, timezone

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from planner.domain.forecast import HourlySeries
from planner.domain.sampling import Step
from planner.services.geocoding import Place
from planner.services.routing import RouteData


def line(lon, n=101, lat_span=4.0):
    return [(30 + lat_span * i / (n - 1), lon) for i in range(n)]


ROUTES = [
    RouteData(line(-100.0), 4.0 * 3600, [Step(0, 100, 4.0 * 3600)]),  # fast, windy
    RouteData(line(-101.0), 4.5 * 3600, [Step(0, 100, 4.5 * 3600)]),  # calm
    RouteData(line(-102.0), 5.0 * 3600, [Step(0, 100, 5.0 * 3600)]),  # calm, slowest
]


def fake_series(points, start, hours):
    def series(wind):
        return HourlySeries(start, [wind] * hours, [wind + 5] * hours, [0.0] * hours, [0.0] * hours)
    # 40 mph wind along the -100 meridian, calm elsewhere.
    return {p: series(40.0 if abs(p[1] + 100) < 0.5 else 5.0) for p in points}


@pytest.fixture
def mocked(monkeypatch):
    cache.clear()
    places = {"Origin": Place("Origin, TX", 30, -101), "Dest": Place("Dest, TX", 34, -101)}
    monkeypatch.setattr("planner.pipeline.geocode", lambda text: places[text])
    monkeypatch.setattr("planner.pipeline.get_routes", lambda o, d, load: (list(ROUTES), []))
    monkeypatch.setattr("planner.pipeline.fetch_series", fake_series)


def request_body(**overrides):
    body = {
        "origin": "Origin",
        "destination": "Dest",
        "departure": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        "load_lb": 42_000,
        "interval_mi": 25,
    }
    body.update(overrides)
    return body


def test_plan_recommends_calm_route_and_explains_why(mocked):
    resp = APIClient().post("/api/plan", request_body(), format="json")
    assert resp.status_code == 200, resp.json()
    plan = resp.json()

    assert plan["recommended_route_id"] == "B"
    assert [r["id"] for r in plan["routes"]] == ["B", "C", "A"]
    windy = plan["routes"][-1]
    # 40 mph with 42,000 lb is escalated from High to Severe by the load rule.
    assert windy["summary"]["severe_mi"] == pytest.approx(windy["distance_mi"], abs=0.5)
    assert all(c["load_adjusted"] and c["driver"] == "load" for c in windy["checkpoints"])
    assert plan["routes"][0]["rank_reason"] == "Recommended over C: it is 30 min faster"
    assert windy["rank_reason"].startswith("B has")
    assert "fewer severe miles" in windy["rank_reason"]

    cp = plan["routes"][0]["checkpoints"]
    assert cp[0]["mile"] == 0 and cp[1]["mile"] == 25
    assert plan["routes"][0]["track"][0][2] == 0


def test_lighter_load_is_only_high_risk(mocked):
    plan = APIClient().post("/api/plan", request_body(load_lb=30_000), format="json").json()
    windy = next(r for r in plan["routes"] if r["id"] == "A")
    assert windy["summary"]["severe_mi"] == 0
    assert windy["summary"]["max_risk"] == "HIGH"


def test_heatmap_after_plan(mocked):
    client = APIClient()
    plan = client.post("/api/plan", request_body(), format="json").json()
    resp = client.get(f"/api/heatmap/{plan['plan_id']}")
    assert resp.status_code == 200
    data = resp.json()
    grid = base64.b64decode(data["risk"])
    assert data["hours"] == 49
    assert len(grid) == 49 * len(data["points"])
    assert max(grid) == 3 and min(grid) == 0


def test_heatmap_unknown_plan_is_404(mocked):
    assert APIClient().get("/api/heatmap/nope").status_code == 404


@pytest.mark.parametrize("overrides, field", [
    ({"load_lb": 90_000}, "load_lb"),
    ({"interval_mi": 30}, "interval_mi"),
    ({"departure": "2020-01-01T00:00:00Z"}, "departure"),
    ({"departure": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()}, "departure"),
])
def test_validation_errors(mocked, overrides, field):
    resp = APIClient().post("/api/plan", request_body(**overrides), format="json")
    assert resp.status_code == 400
    assert field in resp.json()["fields"]


def test_plan_requests_are_rate_limited_per_client(mocked):
    client = APIClient()
    codes = [client.post("/api/plan", request_body(), format="json").status_code for _ in range(7)]
    assert codes[:6] == [200] * 6
    assert codes[6] == 429
    assert "throttled" in client.post("/api/plan", request_body(), format="json").json()["detail"]


def test_heatmap_stretches_to_cover_long_trips(mocked, monkeypatch):
    # One 70-hour route: the heatmap should run to arrival, not stop at hour 48.
    long_route = RouteData(line(-100.0), 70 * 3600, [Step(0, 100, 70 * 3600)])
    monkeypatch.setattr("planner.pipeline.get_routes", lambda o, d, load: ([long_route], []))
    client = APIClient()
    plan = client.post("/api/plan", request_body(hos_breaks=False), format="json").json()
    data = client.get(f"/api/heatmap/{plan['plan_id']}").json()
    assert 71 <= data["hours"] <= 73
    assert len(base64.b64decode(data["risk"])) == data["hours"] * len(data["points"])


def test_heatmap_uses_bigger_cells_when_the_corridor_is_large(mocked, monkeypatch):
    client = APIClient()
    plan = client.post("/api/plan", request_body(), format="json").json()
    normal = client.get(f"/api/heatmap/{plan['plan_id']}").json()

    cache.delete(f"heatmap:{plan['plan_id']}")
    monkeypatch.setattr("planner.pipeline.MAX_HEATMAP_CELLS", len(normal["points"]) - 1)
    coarse = client.get(f"/api/heatmap/{plan['plan_id']}").json()

    assert normal["cell_deg"] == 0.5
    assert coarse["cell_deg"] > 0.5
    assert len(coarse["points"]) < len(normal["points"])
