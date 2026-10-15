"""Truck routes from OpenRouteService (driving-hgv profile).

ORS can return alternative routes directly, but only for shorter trips on the
public API. When we get fewer than three, we generate more by routing through
a via point offset to either side of the main route's midpoint, and keep only
results that differ enough from the routes we already have.
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from django.conf import settings
from django.core.cache import cache

from ..domain.geo import METERS_PER_MILE, bearing_deg, cumulative_miles, destination, haversine_mi, point_at
from ..domain.sampling import Step, cumulative_seconds
from ..domain.spur import find_spur, splice
from .http import UpstreamError, cache_key, request_json

log = logging.getLogger(__name__)

TARGET_ROUTES = 3
# The public ORS API only computes alternative routes for trips under 100 km of road;
# skip the request when the straight-line distance already rules that out.
ALTERNATIVES_MAX_STRAIGHT_MI = 55.0
MAX_OVERLAP = 0.85
# Fractions of trip length to push the via point sideways. Each pair (one per side of
# the route) is requested in parallel; later pairs are only tried if we're still short.
VIA_OFFSET_PAIRS = ((0.15, -0.15), (0.3, -0.3), (0.08, -0.08))
TRACTOR_TRAILER_TARE_LB = 35_000  # empty tractor + trailer, used to estimate gross weight
LB_PER_TONNE = 2204.62
CACHE_TTL_S = 6 * 3600
NO_ROUTE_MESSAGE = "No truck route found between these places. They may not be connected by road."


@dataclass
class RouteData:
    coords: list[tuple[float, float]]  # (lat, lon)
    distance_mi: float
    duration_s: float
    steps: list[Step]
    waypoints: list[int] = field(default_factory=list)  # coordinate index of each requested point


def gross_weight_tonnes(load_lb: float) -> float:
    return round(min(load_lb + TRACTOR_TRAILER_TARE_LB, 80_000) / LB_PER_TONNE, 1)


def _directions(points_latlon, load_lb: float, alternatives: bool) -> list[RouteData]:
    body = {
        "coordinates": [[lon, lat] for lat, lon in points_latlon],
        "instructions": True,  # per-step durations, used for checkpoint ETAs
        # Let points snap to the nearest road however far away it is. Via points are
        # synthetic and often land in empty country; ORS's 350 m default rejects most of them.
        "radiuses": [-1] * len(points_latlon),
        "options": {
            "vehicle_type": "hgv",
            "profile_params": {"restrictions": {"weight": gross_weight_tonnes(load_lb)}},
        },
    }
    if alternatives:
        body["alternative_routes"] = {"target_count": TARGET_ROUTES, "weight_factor": 1.6, "share_factor": 0.6}

    key = cache_key("ors", body)
    cached = cache.get(key)
    if cached is not None:
        return cached

    data = request_json(
        "POST",
        f"{settings.ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
        service="Routing",
        json=body,
        headers={"Authorization": settings.ORS_API_KEY},
    )
    routes = [_parse_feature(f) for f in data.get("features", [])]
    cache.set(key, routes, CACHE_TTL_S)
    return routes


def _parse_feature(feature) -> RouteData:
    coords = [(lat, lon) for lon, lat, *_ in feature["geometry"]["coordinates"]]
    props = feature["properties"]
    steps = [
        Step(s["way_points"][0], s["way_points"][1], s["duration"])
        for seg in props.get("segments", [])
        for s in seg.get("steps", [])
    ]
    summary = props.get("summary", {})
    return RouteData(
        coords=coords,
        distance_mi=summary.get("distance", 0) / METERS_PER_MILE,
        duration_s=summary.get("duration", 0),
        steps=steps,
        waypoints=props.get("way_points", []),
    )


def remove_via_spur(route: RouteData) -> RouteData:
    """Cut the dead-end detour a via point can add (drive up a side road and back)."""
    if len(route.waypoints) != 3:
        return route
    cum_mi = cumulative_miles(route.coords)
    spur = find_spur(route.coords, cum_mi, route.waypoints[1])
    if spur is None:
        return route
    cum_s = cumulative_seconds(route.coords, cum_mi, route.steps)
    coords, secs = splice(route.coords, cum_s, *spur)
    steps = [Step(i, i + 1, secs[i + 1] - secs[i]) for i in range(len(coords) - 1)]
    log.info("Removed %.1f mi via-point spur", cum_mi[spur[1]] - cum_mi[spur[0]])
    return RouteData(coords, cumulative_miles(coords)[-1], secs[-1], steps)


def _footprint(route: RouteData, cell_deg: float = 0.02) -> set[tuple[int, int]]:
    return {(round(lat / cell_deg), round(lon / cell_deg)) for lat, lon in route.coords}


def overlap(a: RouteData, b: RouteData) -> float:
    """Share of route a's footprint that route b also covers (0..1)."""
    fa = _footprint(a)
    return len(fa & _footprint(b)) / len(fa) if fa else 1.0


def _is_distinct(candidate: RouteData, existing: list[RouteData]) -> bool:
    return all(overlap(candidate, r) < MAX_OVERLAP and overlap(r, candidate) < MAX_OVERLAP for r in existing)


def get_routes(origin, destination_, load_lb: float) -> tuple[list[RouteData], list[str]]:
    """Return up to three distinct routes, fastest first, plus notes for the user."""
    o, d = (origin.lat, origin.lon), (destination_.lat, destination_.lon)
    routes = _distinct(_base_routes(o, d, load_lb))
    if len(routes) < TARGET_ROUTES:
        routes = _add_via_routes(routes, o, d, load_lb)

    notes = [] if len(routes) >= TARGET_ROUTES else [f"Only {len(routes)} distinct route(s) exist between these places."]
    return sorted(routes, key=lambda r: r.duration_s)[:TARGET_ROUTES], notes


def _base_routes(o, d, load_lb: float) -> list[RouteData]:
    """ORS's own answer: up to three alternatives on short trips, otherwise just the best route."""
    if haversine_mi(o, d) <= ALTERNATIVES_MAX_STRAIGHT_MI:
        try:
            return _directions([o, d], load_lb, alternatives=True)
        except UpstreamError as exc:
            log.info("Alternative routes unavailable (%s); requesting a single route", exc.message)
    try:
        routes = _directions([o, d], load_lb, alternatives=False)
    except UpstreamError as exc:
        # 422 covers ORS's "route not found", "too long" and "point not routable".
        if exc.status == 422:
            raise UpstreamError(NO_ROUTE_MESSAGE, 422) from exc
        raise
    if not routes:
        raise UpstreamError(NO_ROUTE_MESSAGE, 422)
    return routes


def _distinct(routes: list[RouteData]) -> list[RouteData]:
    kept: list[RouteData] = []
    for r in routes:
        if _is_distinct(r, kept):
            kept.append(r)
    return kept


def _add_via_routes(routes: list[RouteData], o, d, load_lb: float) -> list[RouteData]:
    """Push a via point out to either side of the main route's midpoint until we have enough routes."""
    routes = list(routes)
    cum = cumulative_miles(routes[0].coords)
    mid = point_at(routes[0].coords, cum, cum[-1] / 2)
    heading = bearing_deg(o, d)

    def via_route(frac: float) -> RouteData | None:
        via = destination(mid, heading + (90 if frac > 0 else -90), abs(frac) * cum[-1])
        try:
            candidate = _directions([o, via, d], load_lb, alternatives=False)
        except UpstreamError as exc:
            # Usually the via point landed somewhere with no road nearby; the next offset may work.
            log.info("Via point %s failed: %s", via, exc.message)
            return None
        return remove_via_spur(candidate[0]) if candidate else None

    with ThreadPoolExecutor(max_workers=2) as pool:
        for pair in VIA_OFFSET_PAIRS:
            if len(routes) >= TARGET_ROUTES:
                break
            # pool.map keeps the pair's order, so results stay deterministic.
            for route in pool.map(via_route, pair):
                if route and len(routes) < TARGET_ROUTES and _is_distinct(route, routes):
                    routes.append(route)
    return routes
