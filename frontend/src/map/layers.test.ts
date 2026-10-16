import type { Layer, PickingInfo } from "@deck.gl/core";
import { describe, expect, it } from "vitest";

import type { HeatmapGrid, Plan } from "../api/types";
import { RISK_LABEL, RISK_ORDER } from "../lib/risk";
import { HEAT_COLORS, heatCells, heatmapLayer, otherRoutes, type HeatCell } from "./layers";
import { makeTooltip } from "./tooltips";

// 3 cells x 2 hours: hour 0 is calm, hour 1 has Moderate, Severe and No Travel cells.
const grid: HeatmapGrid = {
  start: new Date("2026-10-16T12:00:00Z"),
  hours: 2,
  cellDeg: 0.5,
  points: [[35, -100], [35, -99.5], [35, -99]],
  values: new Uint8Array([0, 0, 0, 1, 3, 4]),
};
const cells = heatCells(grid);
const plan = { routes: [] } as unknown as Plan;
const fillAt = (hour: number) => heatmapLayer(grid, cells, hour).props.getFillColor as unknown as (c: HeatCell) => number[];

describe("heatmap layer", () => {
  it.each([0, 1])("draws and describes every cell from the same data at hour %i", (hour) => {
    const tooltip = makeTooltip(plan, null, grid, hour);
    cells.forEach((cell, i) => {
      const level = grid.values[hour * cells.length + i];
      expect(fillAt(hour)(cell)).toEqual(HEAT_COLORS[level]);
      const info = { object: cell, layer: { id: "weather-heatmap" } as Layer } as PickingInfo;
      expect(tooltip(info)?.text).toMatch(new RegExp(`: ${RISK_LABEL[RISK_ORDER[level]]}$`, "m"));
    });
  });
});

describe("other routes on the map", () => {
  it("risk-colours unselected routes and only marks their risky checkpoints", () => {
    const cp = (mile: number, risk: string, lat: number) => ({ mile, risk, lat, lon: -100 });
    const routes = [
      { id: "A", checkpoints: [cp(0, "LOW", 30), cp(69, "LOW", 31)] },
      { id: "B", checkpoints: [cp(0, "LOW", 30), cp(69, "SEVERE", 31)] },
    ];
    const paths = new Map(routes.map((r) => [r.id, [[-100, 30], [-100, 31]] as [number, number][]]));
    const others = otherRoutes({ routes } as unknown as Plan, "A", paths);

    expect(others.segments.map((s) => [s.id, s.risk])).toEqual([["B", "SEVERE"]]);
    expect(others.checkpoints.map((c) => [c.routeId, c.mile])).toEqual([["B", 69]]);
  });
});
