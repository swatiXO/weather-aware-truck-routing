import pytest

from planner.domain.recommend import rank, summarize
from planner.domain.risk import Risk

L, M, H, S, N = Risk.LOW, Risk.MODERATE, Risk.HIGH, Risk.SEVERE, Risk.NO_TRAVEL
HOUR = 3600


def test_segment_takes_worse_endpoint():
    s = summarize("r1", [0, 25, 50, 60], [L, S, L, L], 3 * HOUR)
    # Both stretches touching the severe checkpoint count as severe.
    assert s.severe_mi == 50
    assert s.miles_by_level[L] == 10
    assert s.max_risk == S


def test_average_risk_is_distance_weighted():
    s = summarize("r1", [0, 10, 100], [H, H, L], HOUR)
    # 10 mi at HIGH (2), 90 mi at HIGH because the segment's start is HIGH.
    assert s.avg_risk == pytest.approx(2.0)
    s = summarize("r1", [0, 10, 100, 110], [L, L, L, H], HOUR)
    assert s.avg_risk == pytest.approx(2 * 10 / 110)


def make(route_id, risks, hours, step=25):
    miles = [i * step for i in range(len(risks))]
    return summarize(route_id, miles, risks, hours * HOUR)


def test_fewest_severe_miles_wins_over_speed():
    fast = make("fast", [L, S, L], 5)
    safe = make("safe", [L, H, H], 7)
    ordered = rank([fast, safe])
    assert [s.route_id for s in ordered] == ["safe", "fast"]
    assert safe.recommended
    assert "fewer severe miles" in safe.rank_reason
    assert "2h 00m slower" in safe.rank_reason


def test_high_miles_break_severe_tie():
    a = make("a", [L, H, L], 5)
    b = make("b", [L, M, L], 6)
    assert rank([a, b])[0].route_id == "b"


def test_average_risk_breaks_high_tie():
    a = make("a", [L, M, M], 5)
    b = make("b", [L, L, M], 6)
    assert rank([a, b])[0].route_id == "b"


def test_duration_is_last_tiebreaker():
    a = make("a", [L, L, L], 6)
    b = make("b", [L, L, L], 5)
    ordered = rank([a, b])
    assert ordered[0].route_id == "b"
    assert ordered[0].rank_reason == "Recommended over a: it is 1h 00m faster"


def test_any_no_travel_goes_to_bottom_even_with_fewer_severe_miles():
    blocked = make("blocked", [L, N, L], 4)
    risky = make("risky", [S, S, S, S], 6)
    ordered = rank([blocked, risky])
    assert ordered[0].route_id == "risky"
    assert ordered[0].recommended
    assert "avoids No Travel" in ordered[0].rank_reason
    assert ordered[1].notes and "Not recommended" in ordered[1].notes[0]


def test_nothing_recommended_when_every_route_has_no_travel():
    ordered = rank([make("a", [L, N], 3), make("b", [N, N], 4)])
    assert ordered[0].route_id == "a"
    assert not any(s.recommended for s in ordered)
    assert ordered[0].rank_reason.startswith("Ranked above")


def test_ranks_are_assigned_in_order():
    ordered = rank([make("a", [L, S], 1), make("b", [L, H], 1), make("c", [L, L], 1)])
    assert [(s.route_id, s.rank) for s in ordered] == [("c", 1), ("b", 2), ("a", 3)]


def test_reason_says_and_when_safer_route_is_also_faster():
    safe_fast = make("a", [L, L, L], 5)
    risky_slow = make("b", [L, M, L], 6)
    best = rank([safe_fast, risky_slow])[0]
    assert best.rank_reason == "Recommended over b: it has lower average risk (0.00 vs 1.00), and is 1h 00m faster"
