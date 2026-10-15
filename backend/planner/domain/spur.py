"""Removing out-and-back spurs around a via point.

When a via point snaps to a side road, the router drives up that road and
straight back again. Walking outward from the via point, we keep extending the
spur while the path before the via point lies on top of the path after it,
then splice the two sides together.
"""
import math

from .geo import EARTH_RADIUS_MI

MAX_SPUR_MI = 40.0
MATCH_MI = 0.1  # how close "the same road" must be (covers divided highways)
SLACK_MI = 2.0


def _point_segment_mi(p, a, b) -> float:
    """Distance from p to segment ab, using a local flat projection (fine at these scales)."""
    k = math.cos(math.radians(p[0]))

    def xy(q):
        return math.radians(q[1]) * k * EARTH_RADIUS_MI, math.radians(q[0]) * EARTH_RADIUS_MI

    (px, py), (ax, ay), (bx, by) = xy(p), xy(a), xy(b)
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def find_spur(coords, cum_mi: list[float], via: int) -> tuple[int, int] | None:
    """Indices (a, b) such that coords[a+1:b] is an out-and-back detour through `via`.

    Returns None when the path doesn't double back on itself at the via point.
    """
    best = None
    j_min = via
    i = via - 1
    while i >= 0 and cum_mi[via] - cum_mi[i] <= MAX_SPUR_MI:
        reach = cum_mi[via] + (cum_mi[via] - cum_mi[i]) + SLACK_MI
        match = None
        j = j_min
        while j < len(coords) - 1 and cum_mi[j] <= reach:
            if _point_segment_mi(coords[i], coords[j], coords[j + 1]) <= MATCH_MI:
                match = j + 1
                break
            j += 1
        if match is None:
            break
        best = (i, match)
        j_min = match - 1
        i -= 1
    if best is None or cum_mi[best[1]] - cum_mi[best[0]] < 2 * MATCH_MI:
        return None
    return best


def splice(coords, cum_s: list[float], a: int, b: int):
    """Drop coords[a+1:b] and the time spent on them. Returns (coords, cum_s)."""
    removed = cum_s[b] - cum_s[a]
    return coords[: a + 1] + coords[b:], cum_s[: a + 1] + [t - removed for t in cum_s[b:]]
