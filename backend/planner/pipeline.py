"""Builds a trip plan: geocode -> route -> checkpoints -> weather -> risk -> rank.

This is the only module that combines the I/O services with the pure domain
logic. Views stay thin and call into here.
"""
import base64
import math
import uuid
from datetime import datetime, timedelta, timezone

import polyline
from django.core.cache import cache

from .domain.corridor import DEFAULT_GRID_DEG, corridor_points
from .domain.forecast import Reading
from .domain.geo import cumulative_miles
from .domain.recommend import RouteSummary, rank, summarize
from .domain.risk import Assessment, Risk, classify, classify_level
from .domain.sampling import Checkpoint, sample_route, track
from .services.geocoding import geocode
from .services.http import UpstreamError
from .services.routing import get_routes
from .services.weather import fetch_series

HEATMAP_HOURS = 49  # hour 0 .. hour 48
FORECAST_HORIZON = timedelta(days=15)
PLAN_TTL_S = 3600
ROUTE_IDS = ("A", "B", "C")


def floor_hour(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _wx_key(lat: float, lon: float) -> tuple[float, float]:
    # ~1 km precision: nearby checkpoints on overlapping routes share one lookup.
    return round(lat, 2), round(lon, 2)


def build_plan(origin_text: str, destination_text: str, departure: datetime, load_lb: float,
               interval_mi: float, hos: bool) -> dict:
    origin, dest = geocode(origin_text), geocode(destination_text)
    if (round(origin.lat, 3), round(origin.lon, 3)) == (round(dest.lat, 3), round(dest.lon, 3)):
        raise UpstreamError("Origin and destination are the same place.", 400)

    routes, notes = get_routes(origin, dest, load_lb)
    sampled = [(route, *sample_route(route.coords, route.steps, departure, interval_mi, hos)) for route in routes]

    latest_eta = max(cps[-1].eta for _, cps, *_ in sampled)
    if latest_eta > datetime.now(timezone.utc) + FORECAST_HORIZON:
        raise UpstreamError("This trip ends beyond the 15-day weather forecast. Choose an earlier departure.", 422)

    # One batched forecast fetch covering every checkpoint on every route.
    start = floor_hour(departure)
    hours = math.ceil((latest_eta - start).total_seconds() / 3600) + 2
    series = fetch_series([_wx_key(c.lat, c.lon) for _, cps, *_ in sampled for c in cps], start, hours)

    summaries, payloads = [], {}
    for route_id, (route, cps, breaks, cum_mi, cum_s) in zip(ROUTE_IDS, sampled):
        readings = [series[_wx_key(c.lat, c.lon)].at(c.eta) for c in cps]
        assessments = [classify(r.wind_mph, r.rain_in_hr, r.snow_in_hr, load_lb) for r in readings]
        wall_s = (cps[-1].eta - departure).total_seconds()

        summaries.append(summarize(route_id, [c.mile for c in cps], [a.risk for a in assessments], wall_s))
        payloads[route_id] = {
            "id": route_id,
            "geometry": polyline.encode(route.coords, 5),
            "distance_mi": round(cum_mi[-1], 1),
            "drive_h": round(cum_s[-1] / 3600, 2),
            "duration_h": round(wall_s / 3600, 2),
            "arrival": _iso(cps[-1].eta),
            "breaks": [{"mile": round(b.mile, 1), "lat": round(b.lat, 5), "lon": round(b.lon, 5),
                        "start": _iso(b.start), "end": _iso(b.end)} for b in breaks],
            "checkpoints": [_checkpoint_json(c, r, a) for c, r, a in zip(cps, readings, assessments)],
            "track": track(route.coords, cum_mi, cum_s, hos),
        }

    ranked = rank(summaries)
    for s in ranked:
        payloads[s.route_id].update(_ranking_json(s))

    recommended = next((s.route_id for s in ranked if s.recommended), None)
    if recommended is None:
        notes.append("No safe route at this departure time: every option crosses No Travel conditions.")

    # The heatmap is requested separately, so remember what it needs.
    plan_id = uuid.uuid4().hex[:12]
    cache.set(f"plan:{plan_id}", {"routes": [_downsample(r.coords) for r in routes],
                                  "departure": departure, "load_lb": load_lb}, PLAN_TTL_S)

    return {
        "plan_id": plan_id,
        "origin": {"label": origin.label, "lat": origin.lat, "lon": origin.lon},
        "destination": {"label": dest.label, "lat": dest.lat, "lon": dest.lon},
        "departure": _iso(departure),
        "load_lb": load_lb,
        "interval_mi": interval_mi,
        "hos_breaks": hos,
        "recommended_route_id": recommended,
        "notes": notes,
        "routes": [payloads[s.route_id] for s in ranked],
    }


def _checkpoint_json(c: Checkpoint, r: Reading, a: Assessment) -> dict:
    return {
        "mile": round(c.mile, 1),
        "lat": round(c.lat, 5),
        "lon": round(c.lon, 5),
        "eta": _iso(c.eta),
        "weather": {
            "wind_mph": round(r.wind_mph, 1),
            "gust_mph": round(r.gust_mph, 1),
            "rain_in_hr": round(r.rain_in_hr, 3),
            "snow_in_hr": round(r.snow_in_hr, 3),
        },
        "levels": {"wind": a.wind.name, "rain": a.rain.name, "snow": a.snow.name},
        "risk": a.risk.name,
        "driver": a.driver,
        "load_adjusted": a.load_adjusted,
    }


def _ranking_json(s: RouteSummary) -> dict:
    return {
        "rank": s.rank,
        "recommended": s.recommended,
        "rank_reason": s.rank_reason,
        "notes": s.notes,
        "summary": {
            "no_travel_mi": round(s.no_travel_mi, 1),
            "severe_mi": round(s.severe_mi, 1),
            "high_mi": round(s.high_mi, 1),
            "moderate_mi": round(s.miles_by_level[Risk.MODERATE], 1),
            "low_mi": round(s.miles_by_level[Risk.LOW], 1),
            "avg_risk": round(s.avg_risk, 3),
            "max_risk": s.max_risk.name,
        },
    }


def _downsample(coords, every_mi: float = 0.5):
    """Thin a route to roughly one point per `every_mi`; plenty for the heatmap corridor."""
    cum = cumulative_miles(coords)
    out, last = [coords[0]], 0.0
    for i in range(1, len(coords)):
        if cum[i] - last >= every_mi or i == len(coords) - 1:
            out.append(coords[i])
            last = cum[i]
    return out


def build_heatmap(plan_id: str) -> dict | None:
    """Risk level for every corridor cell for hours 0..48 after departure, or None if the plan expired."""
    if cached := cache.get(f"heatmap:{plan_id}"):
        return cached
    ctx = cache.get(f"plan:{plan_id}")
    if ctx is None:
        return None

    points = corridor_points([(c, cumulative_miles(c)) for c in ctx["routes"]])
    start = floor_hour(ctx["departure"])
    series = fetch_series(points, start, HEATMAP_HOURS)

    # Row-major by hour, one byte per cell: compact enough to send all 49 hours at once.
    n = len(points)
    grid = bytearray(HEATMAP_HOURS * n)
    for j, p in enumerate(points):
        s = series[p]
        for h in range(HEATMAP_HOURS):
            grid[h * n + j] = classify_level(s.wind_mph[h] or 0, s.rain_in_hr[h] or 0, s.snow_in_hr[h] or 0, ctx["load_lb"])

    result = {
        "start": _iso(start),
        "hours": HEATMAP_HOURS,
        "cell_deg": DEFAULT_GRID_DEG,
        "points": [[lat, lon] for lat, lon in points],
        "risk": base64.b64encode(bytes(grid)).decode(),
    }
    cache.set(f"heatmap:{plan_id}", result, PLAN_TTL_S)
    return result
