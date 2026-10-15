import polyline from "@mapbox/polyline";
import { describe, expect, it } from "vitest";

import type { Checkpoint, RiskName } from "../api/types";
import { decodePath, haversineMi, positionAt, riskSegments } from "./geo";

const cp = (mile: number, risk: RiskName) => ({ mile, risk }) as Checkpoint;

describe("geo helpers", () => {
  it("decodes polylines to lon/lat", () => {
    const path = decodePath(polyline.encode([[30, -100], [31, -100]], 5));
    expect(path).toEqual([[-100, 30], [-100, 31]]);
  });

  it("splits a route at checkpoints, taking the worse endpoint risk", () => {
    const path = Array.from({ length: 11 }, (_, i) => [-100, 30 + i * 0.1] as [number, number]);
    const total = haversineMi(path[0], path[10]);
    const segs = riskSegments(path, [cp(0, "LOW"), cp(total / 2, "SEVERE"), cp(total, "LOW")]);
    expect(segs.map((s) => s.risk)).toEqual(["SEVERE", "SEVERE"]);
    expect(segs[0].path[0]).toEqual(path[0]);
    expect(segs[1].path.at(-1)).toEqual(path[10]);
    expect(segs[0].path.at(-1)![1]).toBeCloseTo(30.5, 3);
  });

  it("interpolates truck position and pauses during breaks", () => {
    const track: [number, number, number][] = [[30, -100, 0], [31, -100, 3600], [31, -100, 5400], [32, -100, 9000]];
    expect(positionAt(track, -10)).toEqual([-100, 30]);
    expect(positionAt(track, 1800)[1]).toBeCloseTo(30.5);
    expect(positionAt(track, 4500)).toEqual([-100, 31]);
    expect(positionAt(track, 99999)).toEqual([-100, 32]);
  });
});
