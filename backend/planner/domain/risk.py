"""Weather risk classification for a single checkpoint.

Thresholds come straight from the assessment brief. Bands include their
lower bound and exclude their upper bound (25 <= wind < 35 is MODERATE), so
every real-valued reading maps to exactly one level. Rain and snow "No Travel"
are strictly greater than the top value, as written in the brief.
"""
from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


# (lower bound, level), checked from the top down; values below every bound are LOW.
WIND_BANDS = [(55.0, Risk.NO_TRAVEL), (45.0, Risk.SEVERE), (35.0, Risk.HIGH), (25.0, Risk.MODERATE)]
RAIN_BANDS = [(0.50, Risk.SEVERE), (0.25, Risk.HIGH), (0.10, Risk.MODERATE)]
SNOW_BANDS = [(2.0, Risk.SEVERE), (1.0, Risk.HIGH), (0.5, Risk.MODERATE)]
RAIN_NO_TRAVEL_ABOVE = 1.00
SNOW_NO_TRAVEL_ABOVE = 3.0


@dataclass(frozen=True)
class Assessment:
    risk: Risk
    wind: Risk
    rain: Risk
    snow: Risk
    driver: str  # "wind" | "rain" | "snow" | "load" | "none"
    load_adjusted: bool


def _banded(value: float, bands) -> Risk:
    for bound, level in bands:
        if value >= bound:
            return level
    return Risk.LOW


def wind_level(mph: float) -> Risk:
    return _banded(mph, WIND_BANDS)


def rain_level(in_per_hr: float) -> Risk:
    if in_per_hr > RAIN_NO_TRAVEL_ABOVE:
        return Risk.NO_TRAVEL
    return _banded(in_per_hr, RAIN_BANDS)


def snow_level(in_per_hr: float) -> Risk:
    if in_per_hr > SNOW_NO_TRAVEL_ABOVE:
        return Risk.NO_TRAVEL
    return _banded(in_per_hr, SNOW_BANDS)


def apply_load_rules(base: Risk, wind_mph: float, load_lb: float) -> Risk:
    """Load rules only ever raise risk, never lower it."""
    if wind_mph >= 55:
        return Risk.NO_TRAVEL
    if wind_mph >= 45 and load_lb > 30_000:
        return Risk.NO_TRAVEL
    if wind_mph >= 35 and load_lb > 40_000:
        return max(base, Risk.SEVERE)
    return base


def classify(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    w, r, s = wind_level(wind_mph), rain_level(rain_in_hr), snow_level(snow_in_hr)
    base = max(w, r, s)
    final = apply_load_rules(base, wind_mph, load_lb)

    if final > base:
        driver = "load"
    elif base == Risk.LOW:
        driver = "none"
    else:
        # Ties go to wind, then snow, then rain (the order drivers care about most).
        driver = next(name for name, lvl in (("wind", w), ("snow", s), ("rain", r)) if lvl == base)

    return Assessment(final, w, r, s, driver, final > base)


def classify_level(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> int:
    """Fast path for the heatmap grid: just the final level as an int."""
    base = max(wind_level(wind_mph), rain_level(rain_in_hr), snow_level(snow_in_hr))
    return int(apply_load_rules(base, wind_mph, load_lb))
