import { describe, expect, it } from "vitest";

import type { Route } from "../api/types";
import { sliderMarks, truckStatus } from "./timeline";

const at = (h: number) => new Date(Date.UTC(2026, 9, 16, h));
const iso = (h: number) => at(h).toISOString();

const route = {
  checkpoints: [
    { mile: 0, eta: iso(6) },
    { mile: 100, eta: iso(8) },
    { mile: 200, eta: iso(10) },
  ],
  breaks: [{ start: iso(9), end: new Date(at(9).getTime() + 30 * 60_000).toISOString() }],
} as unknown as Route;

describe("truck status", () => {
  it("covers before, during and after the trip", () => {
    expect(truckStatus(route, at(5))).toBe("truck not yet departed");
    expect(truckStatus(route, at(7))).toBe("truck en route, near mile 50");
    expect(truckStatus(route, at(9))).toBe("truck on a 30-min HOS break near mile 150");
    expect(truckStatus(route, at(11))).toBe("truck has arrived");
  });
});

describe("slider marks", () => {
  it("pins an arrival beyond the slider to its end", () => {
    const marks = sliderMarks(at(0), iso(0), iso(60), 48);
    expect(marks.at(-1)).toMatchObject({ hour: 48, kind: "arrive" });
    expect(marks.at(-1)?.label).toMatch(/^Arrives .+ →$/);
  });
});

describe("slider length", () => {
  it("puts the arrival at the end of a trip-length slider", () => {
    const marks = sliderMarks(at(0), iso(0), iso(5), 5);
    expect(marks.at(-1)).toMatchObject({ hour: 5, label: "Arrive" });
    expect(marks.some((m) => m.kind === "day" && m.hour >= 5)).toBe(false);
  });
});
