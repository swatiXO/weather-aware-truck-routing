import re
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from .http import UpstreamError, cache_key, request_json

LATLON = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
CACHE_TTL_S = 7 * 24 * 3600


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float


def geocode(text: str) -> Place:
    """Resolve a free-text place, or accept a raw "lat, lon" pair."""
    m = LATLON.match(text)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return Place(f"{lat:.4f}, {lon:.4f}", lat, lon)

    key = cache_key("geocode", text.strip().lower())
    cached = cache.get(key)
    if cached:
        return cached

    data = request_json(
        "GET",
        f"{settings.ORS_BASE_URL}/geocode/search",
        service="Geocoding",
        params={"text": text, "size": 1, "boundary.country": "US,CA"},
        headers={"Authorization": settings.ORS_API_KEY},
    )
    features = data.get("features") or []
    if not features:
        raise UpstreamError(f'Couldn\'t find "{text}". Try adding a state, e.g. "Dallas, TX".', 400)
    f = features[0]
    lon, lat = f["geometry"]["coordinates"]
    place = Place(f["properties"].get("label", text), lat, lon)
    cache.set(key, place, CACHE_TTL_S)
    return place
