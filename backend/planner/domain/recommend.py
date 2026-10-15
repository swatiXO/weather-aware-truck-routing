"""Route summaries and recommendation.

Each stretch between two consecutive checkpoints is assigned the worse of its
two endpoint risks (conservative, safety-first). Routes are then ranked by the
brief's priority order, with one addition in front: any No Travel mileage
pushes a route to the bottom.
"""
from dataclasses import dataclass, field

from .risk import Risk


@dataclass
class RouteSummary:
    route_id: str
    distance_mi: float
    duration_s: float
    miles_by_level: dict[Risk, float]
    avg_risk: float
    max_risk: Risk
    rank: int = 0
    rank_reason: str = ""
    recommended: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def no_travel_mi(self) -> float:
        return self.miles_by_level[Risk.NO_TRAVEL]

    @property
    def severe_mi(self) -> float:
        return self.miles_by_level[Risk.SEVERE]

    @property
    def high_mi(self) -> float:
        return self.miles_by_level[Risk.HIGH]

    def sort_key(self):
        return (self.no_travel_mi > 0, round(self.severe_mi, 1), round(self.high_mi, 1),
                round(self.avg_risk, 3), self.duration_s)


def summarize(route_id: str, miles: list[float], risks: list[Risk], duration_s: float) -> RouteSummary:
    by_level = {level: 0.0 for level in Risk}
    weighted = 0.0
    for i in range(len(miles) - 1):
        length = miles[i + 1] - miles[i]
        level = max(risks[i], risks[i + 1])
        by_level[level] += length
        weighted += int(level) * length
    total = miles[-1] - miles[0]
    return RouteSummary(
        route_id=route_id,
        distance_mi=total,
        duration_s=duration_s,
        miles_by_level=by_level,
        avg_risk=weighted / total if total > 0 else float(max(risks, default=Risk.LOW)),
        max_risk=max(risks, default=Risk.LOW),
    )


def _fmt_hours(seconds: float) -> str:
    minutes = round(abs(seconds) / 60)
    return f"{minutes} min" if minutes < 60 else f"{minutes // 60}h {minutes % 60:02d}m"


def _compare(a: RouteSummary, b: RouteSummary) -> tuple[str, bool]:
    """Why `a` ranks ahead of `b`, phrased from a's point of view.

    Follows the same order as `sort_key`. The flag is True when travel time
    was the deciding factor, so callers don't repeat the time difference.
    """
    if (a.no_travel_mi > 0) != (b.no_travel_mi > 0):
        return "avoids No Travel conditions", False
    for label, av, bv in (("severe", a.severe_mi, b.severe_mi), ("high-risk", a.high_mi, b.high_mi)):
        if round(av, 1) != round(bv, 1):
            return f"has {bv - av:.0f} fewer {label} miles", False
    if round(a.avg_risk, 3) != round(b.avg_risk, 3):
        return f"has lower average risk ({a.avg_risk:.2f} vs {b.avg_risk:.2f})", False
    if a.duration_s != b.duration_s:
        return f"is {_fmt_hours(b.duration_s - a.duration_s)} faster", True
    return "is equivalent", True


def _time_diff(a: RouteSummary, b: RouteSummary) -> str:
    """'40 min slower' / '1h 05m faster' for a compared with b; empty if under a minute."""
    diff = a.duration_s - b.duration_s
    return "" if abs(diff) < 60 else f"{_fmt_hours(diff)} {'slower' if diff > 0 else 'faster'}"


def rank(summaries: list[RouteSummary]) -> list[RouteSummary]:
    """Order routes best-first and explain each position in one line."""
    ordered = sorted(summaries, key=RouteSummary.sort_key)
    best = ordered[0]
    best.recommended = best.no_travel_mi == 0
    for i, s in enumerate(ordered, start=1):
        s.rank = i
        if s.no_travel_mi > 0:
            s.notes.append(f"Not recommended: {s.no_travel_mi:.0f} mi in No Travel conditions")

    if len(ordered) == 1:
        best.rank_reason = "Only route available"
        return ordered

    # The winner is explained against the runner-up; everyone else against the winner.
    runner_up = ordered[1]
    reason, by_time = _compare(best, runner_up)
    best.rank_reason = f"{'Recommended over' if best.recommended else 'Ranked above'} {runner_up.route_id}: it {reason}"
    if not by_time and (diff := _time_diff(best, runner_up)):
        best.rank_reason += f", {'but' if diff.endswith('slower') else 'and'} is {diff}"

    for s in ordered[1:]:
        reason, by_time = _compare(best, s)
        s.rank_reason = f"{best.route_id} {reason}"
        if not by_time and (diff := _time_diff(s, best)):
            s.rank_reason += f"; this route is {diff}"
    return ordered
