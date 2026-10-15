import pytest

from planner.domain.risk import Risk, classify, classify_level, rain_level, snow_level, wind_level

L, M, H, S, N = Risk.LOW, Risk.MODERATE, Risk.HIGH, Risk.SEVERE, Risk.NO_TRAVEL


@pytest.mark.parametrize("mph, expected", [
    (0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, N), (80, N),
])
def test_wind_bands(mph, expected):
    assert wind_level(mph) == expected


@pytest.mark.parametrize("inches, expected", [
    (0, L), (0.099, L), (0.10, M), (0.249, M), (0.25, H), (0.499, H), (0.50, S), (1.00, S), (1.01, N),
])
def test_rain_bands(inches, expected):
    assert rain_level(inches) == expected


@pytest.mark.parametrize("inches, expected", [
    (0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, N),
])
def test_snow_bands(inches, expected):
    assert snow_level(inches) == expected


def test_overall_risk_is_worst_factor():
    a = classify(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0.6, load_lb=10_000)
    assert (a.wind, a.rain, a.snow, a.risk) == (L, H, M, H)
    assert a.driver == "rain"
    assert not a.load_adjusted


def test_calm_weather_has_no_driver():
    a = classify(5, 0, 0, 40_000)
    assert a.risk == L and a.driver == "none"


@pytest.mark.parametrize("load", [0, 10_000, 80_000])
def test_wind_55_is_no_travel_for_any_load(load):
    assert classify(55, 0, 0, load).risk == N


@pytest.mark.parametrize("mph, load, expected, adjusted", [
    (45, 30_000, S, False),   # at the limit: rule needs > 30,000
    (45, 30_001, N, True),
    (54.9, 30_001, N, True),
    (35, 40_000, H, False),   # at the limit: rule needs > 40,000
    (35, 40_001, S, True),
    (44.9, 40_001, S, True),
    (34.9, 80_000, M, False),  # below 35 mph no load rule applies
])
def test_load_rules(mph, load, expected, adjusted):
    a = classify(mph, 0, 0, load)
    assert a.risk == expected
    assert a.load_adjusted is adjusted
    if adjusted:
        assert a.driver == "load"


def test_load_rule_never_lowers_risk():
    # 40 mph wind + heavy load says "Severe", but snow already says No Travel.
    a = classify(40, 0, 3.5, 45_000)
    assert a.risk == N
    assert not a.load_adjusted


@pytest.mark.parametrize("args", [
    (10, 0, 0, 1000), (30, 0.2, 0, 1000), (40, 0, 1.5, 41_000), (50, 0, 0, 31_000), (20, 1.2, 0, 0),
])
def test_fast_path_matches_full_classifier(args):
    assert classify_level(*args) == int(classify(*args).risk)
