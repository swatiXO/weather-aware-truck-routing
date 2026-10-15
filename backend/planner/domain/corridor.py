"""Grid points covering the trip corridor, used for the weather heatmap.

Walks each route, drops a point every `step_mi` plus points offset to either
side, then snaps everything to a coarse lat/lon grid so overlapping routes
don't produce duplicate weather lookups.
"""
from .geo import bearing_deg, destination, point_at

# Open-Meteo's free tier counts every location as one API call (600/min, 5,000/h),
# so the grid is coarse: ~0.5 deg cells (~30 mi) over a ~100 mi wide corridor.
# Sample spacing stays below the cell size so the corridor has no gaps.
DEFAULT_STEP_MI = 25.0
DEFAULT_OFFSETS_MI = (-50.0, -25.0, 0.0, 25.0, 50.0)
DEFAULT_GRID_DEG = 0.5
LOOKAHEAD_MI = 2.0


def snap(value: float, grid: float) -> float:
    return round(round(value / grid) * grid, 4)


def corridor_points(routes, step_mi=DEFAULT_STEP_MI, offsets_mi=DEFAULT_OFFSETS_MI, grid_deg=DEFAULT_GRID_DEG):
    """`routes` is a list of (coords, cum_mi). Returns sorted unique (lat, lon) grid points."""
    seen = set()
    for coords, cum in routes:
        total = cum[-1]
        mile = 0.0
        while True:
            here = point_at(coords, cum, mile)
            ahead = point_at(coords, cum, min(total, mile + LOOKAHEAD_MI))
            behind = point_at(coords, cum, max(0.0, mile - LOOKAHEAD_MI))
            heading = bearing_deg(behind, ahead)
            for off in offsets_mi:
                p = here if off == 0 else destination(here, heading + (90 if off > 0 else -90), abs(off))
                seen.add((snap(p[0], grid_deg), snap(p[1], grid_deg)))
            if mile >= total:
                break
            mile = min(total, mile + step_mi)
    return sorted(seen)
