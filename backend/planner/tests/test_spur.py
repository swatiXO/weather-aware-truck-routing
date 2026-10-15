import pytest

from planner.domain.geo import cumulative_miles
from planner.domain.spur import find_spur, splice


def spur_route(offset_lon=0.0):
    """North along lon -100, a 10-step dead end east at lat 31, back, then on north.

    `offset_lon` shifts the return leg slightly, like the far side of a divided road.
    """
    north1 = [(30 + i * 0.1, -100.0) for i in range(11)]                 # 30.0 .. 31.0
    out = [(31.0, -100.0 + i * 0.02) for i in range(1, 11)]               # east 0.2 deg
    back = [(31.0 + offset_lon, -100.0 + i * 0.02) for i in range(9, 0, -1)]
    north2 = [(31.0 + i * 0.1, -100.0) for i in range(0, 11)]             # 31.0 .. 32.0
    coords = north1 + out + back + north2
    via = len(north1) + len(out) - 1                                      # tip of the spur
    return coords, via


@pytest.mark.parametrize("offset", [0.0, 0.0005])
def test_finds_and_removes_spur(offset):
    coords, via = spur_route(offset)
    cum = cumulative_miles(coords)
    spur = find_spur(coords, cum, via)
    assert spur is not None
    a, b = spur
    secs = [m * 60 for m in cum]  # 1 mile per minute
    new_coords, new_secs = splice(coords, secs, a, b)
    new_cum = cumulative_miles(new_coords)
    # Only the straight north line is left: ~138 mi instead of ~138 + 2 x 12 mi.
    assert new_cum[-1] == pytest.approx(138.2, abs=1.0)
    assert all(abs(lon + 100) < 0.03 for _, lon in new_coords)
    assert new_secs[-1] == pytest.approx(new_cum[-1] * 60, rel=0.02)
    assert all(x <= y for x, y in zip(new_secs, new_secs[1:]))


def test_no_spur_on_straight_route():
    coords = [(30 + i * 0.1, -100.0) for i in range(21)]
    assert find_spur(coords, cumulative_miles(coords), 10) is None


def test_no_spur_when_route_turns_without_doubling_back():
    coords = [(30 + i * 0.1, -100.0) for i in range(11)] + [(31.0, -100.0 + i * 0.1) for i in range(1, 11)]
    assert find_spur(coords, cumulative_miles(coords), 10) is None
