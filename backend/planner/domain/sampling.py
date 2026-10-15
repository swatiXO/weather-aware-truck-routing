"""Checkpoint placement and ETA calculation along a route.

Route timing uses the routing provider's per-step durations (spread over each
step's coordinates by distance), so slow urban stretches and fast interstate
stretches produce realistic ETAs. Optional HOS breaks add 30 minutes after
every 8 hours of cumulative driving.
"""
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from .geo import cumulative_miles, locate, lerp, point_at

HOS_DRIVE_LIMIT_S = 8 * 3600
HOS_BREAK_S = 30 * 60


@dataclass(frozen=True)
class Step:
    start: int  # index into the route coordinates
    end: int
    duration_s: float


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lat: float
    lon: float
    drive_s: float  # driving time from departure, excluding breaks
    eta: datetime


@dataclass(frozen=True)
class Break:
    mile: float
    lat: float
    lon: float
    start: datetime
    end: datetime


def cumulative_seconds(coords, cum_mi: list[float], steps: list[Step]) -> list[float]:
    """Driving seconds from departure to each coordinate."""
    per_segment = [0.0] * (len(coords) - 1)
    for step in steps:
        dist = cum_mi[step.end] - cum_mi[step.start]
        segs = range(step.start, step.end)
        if not segs:
            continue
        for k in segs:
            share = (cum_mi[k + 1] - cum_mi[k]) / dist if dist > 0 else 1 / len(segs)
            per_segment[k] += step.duration_s * share
    out = [0.0]
    for s in per_segment:
        out.append(out[-1] + s)
    return out


def breaks_before(drive_s: float, hos: bool) -> int:
    """Breaks taken before arriving at a point reached after `drive_s` of driving.

    Arriving at exactly 8h means the break hasn't started yet.
    """
    if not hos or drive_s <= 0:
        return 0
    return max(0, math.ceil(drive_s / HOS_DRIVE_LIMIT_S) - 1)


def elapsed_s(drive_s: float, hos: bool) -> float:
    """Wall-clock seconds since departure once `drive_s` of driving is done."""
    return drive_s + breaks_before(drive_s, hos) * HOS_BREAK_S


def break_drive_times(total_drive_s: float, hos: bool) -> list[float]:
    """Driving time at which each HOS break starts (none at the very end of the trip)."""
    if not hos:
        return []
    return [n * HOS_DRIVE_LIMIT_S for n in range(1, math.ceil(total_drive_s / HOS_DRIVE_LIMIT_S))]


def drive_time_at(cum_mi: list[float], cum_s: list[float], mile: float) -> float:
    i, t = locate(cum_mi, mile)
    return lerp(cum_s[i], cum_s[i + 1], t)


def mile_at_drive_time(cum_mi: list[float], cum_s: list[float], seconds: float) -> float:
    i, t = locate(cum_s, seconds)
    return lerp(cum_mi[i], cum_mi[i + 1], t)


def checkpoint_miles(total_mi: float, interval_mi: float) -> list[float]:
    """Origin, every `interval_mi`, then the destination (last gap may be shorter)."""
    marks = [0.0]
    m = interval_mi
    while m < total_mi - 1e-6:
        marks.append(m)
        m += interval_mi
    marks.append(total_mi)
    return marks


def sample_route(coords, steps: list[Step], departure: datetime, interval_mi: float, hos: bool):
    """Return (checkpoints, breaks, cum_mi, cum_s) for one route."""
    cum_mi = cumulative_miles(coords)
    cum_s = cumulative_seconds(coords, cum_mi, steps)
    total_mi = cum_mi[-1]

    checkpoints = []
    for mile in checkpoint_miles(total_mi, interval_mi):
        lat, lon = point_at(coords, cum_mi, mile)
        drive_s = drive_time_at(cum_mi, cum_s, mile)
        checkpoints.append(Checkpoint(mile, lat, lon, drive_s, departure + timedelta(seconds=elapsed_s(drive_s, hos))))

    breaks = []
    for n, drive_s in enumerate(break_drive_times(cum_s[-1], hos)):
        mile = mile_at_drive_time(cum_mi, cum_s, drive_s)
        lat, lon = point_at(coords, cum_mi, mile)
        start = departure + timedelta(seconds=drive_s + n * HOS_BREAK_S)
        breaks.append(Break(mile, lat, lon, start, start + timedelta(seconds=HOS_BREAK_S)))

    return checkpoints, breaks, cum_mi, cum_s


def track(coords, cum_mi, cum_s, hos: bool, every_mi: float = 2.0) -> list[tuple[float, float, int]]:
    """Downsampled (lat, lon, seconds-after-departure) points for the truck marker.

    Each HOS break appears as two points at the same position, so the marker
    pauses there while the slider moves through the break.
    """
    total = cum_mi[-1]
    miles = [i * every_mi for i in range(int(total // every_mi) + 1)] + [total]
    break_miles = {mile_at_drive_time(cum_mi, cum_s, t) for t in break_drive_times(cum_s[-1], hos)}

    out = []
    for mile in sorted(set(miles) | break_miles):
        lat, lon = (round(v, 5) for v in point_at(coords, cum_mi, mile))
        wall = elapsed_s(drive_time_at(cum_mi, cum_s, mile), hos)
        out.append((lat, lon, round(wall)))
        if mile in break_miles:
            out.append((lat, lon, round(wall + HOS_BREAK_S)))
    return out
