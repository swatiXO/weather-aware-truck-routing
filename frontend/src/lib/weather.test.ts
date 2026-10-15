import { describe, expect, it } from "vitest";

import type { Checkpoint, Driver, RiskName, Route } from "../api/types";
import { describeRouteWeather, factorPeaks } from "./weather";

function cp(mile: number, risk: RiskName, driver: Driver = "none", weather: Partial<Checkpoint["weather"]> = {}, levels: Partial<Checkpoint["levels"]> = {}): Checkpoint {
  return {
    mile,
    lat: 0,
    lon: 0,
    eta: "2026-10-16T12:00:00Z",
    weather: { wind_mph: 10, gust_mph: 15, rain_in_hr: 0, snow_in_hr: 0, ...weather },
    levels: { wind: "LOW", rain: "LOW", snow: "LOW", ...levels },
    risk,
    driver,
    load_adjusted: driver === "load",
  };
}

function route(checkpoints: Checkpoint[], maxRisk: RiskName): Route {
  return { checkpoints, summary: { max_risk: maxRisk } } as Route;
}

describe("route weather summary", () => {
  it("calls out a clear route with its peak wind", () => {
    const r = route([cp(0, "LOW", "none", { wind_mph: 12 }), cp(25, "LOW", "none", { wind_mph: 21 })], "LOW");
    expect(describeRouteWeather(r, 40_000)).toBe("Clear the whole way: winds peak at 21 mph, no rain or snow.");
  });

  it("names the worst stretch, its cause and any repeats", () => {
    const r = route(
      [cp(0, "LOW"), cp(25, "HIGH", "rain", { rain_in_hr: 0.31 }), cp(50, "HIGH", "rain"), cp(75, "LOW"), cp(100, "HIGH", "wind")],
      "HIGH",
    );
    const text = describeRouteWeather(r, 40_000);
    expect(text).toMatch(/^High risk near miles 25–50, .+: heavy rain \(0\.31 in\/hr\) \(\+1 more stretch\)\.$/);
  });

  it("explains load-raised risk with the load", () => {
    const r = route([cp(0, "SEVERE", "load", { wind_mph: 38 })], "SEVERE");
    expect(describeRouteWeather(r, 42_000)).toContain("38 mph wind with a 42,000 lb load");
  });

  it("takes each factor's worst level separately", () => {
    const r = route([cp(0, "HIGH", "wind", {}, { wind: "HIGH" }), cp(25, "MODERATE", "snow", {}, { snow: "MODERATE" })], "HIGH");
    expect(factorPeaks(r)).toEqual({ wind: "HIGH", rain: "LOW", snow: "MODERATE", loadAdjusted: false });
  });
});
