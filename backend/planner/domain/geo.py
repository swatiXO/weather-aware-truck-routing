"""Small geometry helpers. Coordinates are (lat, lon) tuples in degrees."""
import math
from bisect import bisect_right

EARTH_RADIUS_MI = 3958.8


def haversine_mi(a, b) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_miles(coords) -> list[float]:
    out = [0.0]
    for prev, cur in zip(coords, coords[1:]):
        out.append(out[-1] + haversine_mi(prev, cur))
    return out


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def locate(cum: list[float], value: float) -> tuple[int, float]:
    """Index i and fraction t such that value lies between cum[i] and cum[i+1]."""
    if value <= cum[0]:
        return 0, 0.0
    if value >= cum[-1]:
        return len(cum) - 2, 1.0
    i = bisect_right(cum, value) - 1
    span = cum[i + 1] - cum[i]
    return i, 0.0 if span == 0 else (value - cum[i]) / span


def point_at(coords, cum: list[float], value: float):
    i, t = locate(cum, value)
    (lat1, lon1), (lat2, lon2) = coords[i], coords[i + 1]
    return lerp(lat1, lat2, t), lerp(lon1, lon2, t)


def bearing_deg(a, b) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return math.degrees(math.atan2(y, x)) % 360


def destination(origin, bearing: float, distance_mi: float):
    lat1, lon1 = map(math.radians, origin)
    brg = math.radians(bearing)
    d = distance_mi / EARTH_RADIUS_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(math.sin(brg) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180
