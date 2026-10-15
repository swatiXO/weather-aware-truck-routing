"""Turning hourly forecast series into a reading at an exact moment."""
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class Reading:
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class HourlySeries:
    """Hourly values for one location. `start` is the UTC time of index 0."""
    start: datetime
    wind_mph: list[float]
    gust_mph: list[float]
    rain_in_hr: list[float]
    snow_in_hr: list[float]

    def __len__(self):
        return len(self.wind_mph)

    def at(self, moment: datetime) -> Reading:
        """Linear interpolation between the two surrounding hours, clamped to the series."""
        offset_h = (moment.astimezone(timezone.utc) - self.start).total_seconds() / 3600
        offset_h = min(max(offset_h, 0.0), len(self) - 1)
        i = min(int(offset_h), len(self) - 2) if len(self) > 1 else 0
        t = offset_h - i

        def interp(values):
            if len(values) == 1:
                return values[0]
            a, b = values[i], values[i + 1]
            a = 0.0 if a is None else a
            b = 0.0 if b is None else b
            return a + (b - a) * t

        return Reading(interp(self.wind_mph), interp(self.gust_mph), interp(self.rain_in_hr), interp(self.snow_in_hr))
