"""Hourly forecasts from Open-Meteo, fetched in batches of many locations."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from ..domain.forecast import HourlySeries
from .http import UpstreamError, request_json

BATCH_SIZE = 100
MAX_WORKERS = 4
CACHE_TTL_S = 30 * 60
HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"


def _key(point, start: datetime, hours: int) -> str:
    return f"wx:{point[0]:.2f}:{point[1]:.2f}:{start:%Y%m%d%H}:{hours}"


def _fetch_batch(points, start: datetime, hours: int) -> list[HourlySeries]:
    end = start + timedelta(hours=hours - 1)
    data = request_json(
        "GET",
        settings.OPEN_METEO_URL,
        service="Weather",
        params={
            "latitude": ",".join(f"{p[0]:.4f}" for p in points),
            "longitude": ",".join(f"{p[1]:.4f}" for p in points),
            "hourly": HOURLY_VARS,
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "start_hour": start.strftime("%Y-%m-%dT%H:00"),
            "end_hour": end.strftime("%Y-%m-%dT%H:00"),
        },
    )
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise UpstreamError("Weather service returned an unexpected response.")
    out = []
    for item in items:
        h = item["hourly"]
        rain = [(r or 0) + (s or 0) for r, s in zip(h["rain"], h["showers"])]
        out.append(HourlySeries(start, h["wind_speed_10m"], h["wind_gusts_10m"], rain, h["snowfall"]))
    return out


def fetch_series(points, start: datetime, hours: int) -> dict[tuple[float, float], HourlySeries]:
    """Forecast for each point from `start` (a whole UTC hour) for `hours` hours."""
    result, missing = {}, []
    for p in dict.fromkeys(points):
        cached = cache.get(_key(p, start, hours))
        if cached is not None:
            result[p] = cached
        else:
            missing.append(p)

    batches = [missing[i:i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    if batches:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            for batch, series in zip(batches, pool.map(lambda b: _fetch_batch(b, start, hours), batches)):
                for p, s in zip(batch, series):
                    result[p] = s
                    cache.set(_key(p, start, hours), s, CACHE_TTL_S)
    return result
