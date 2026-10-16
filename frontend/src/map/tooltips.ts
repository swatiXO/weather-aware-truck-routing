// Hover text for the map. Route lines and labels show that route's summary.
import type { PickingInfo } from "@deck.gl/core";

import type { Break, Checkpoint, HeatmapGrid, Plan, Route } from "../api/types";
import { formatDuration, formatShortTime, formatTime } from "../lib/format";
import { RISK_LABEL, RISK_ORDER } from "../lib/risk";
import { describeConditions, factorPeaks } from "../lib/weather";
import type { HeatCell } from "./layers";

function routeSummary(route: Route, selected: boolean): string {
  const s = route.summary;
  const peaks = factorPeaks(route);
  const flagged = [
    [s.no_travel_mi, "no travel"],
    [s.severe_mi, "severe"],
    [s.high_mi, "high"],
  ].filter(([mi]) => (mi as number) > 0).map(([mi, label]) => `${Math.round(mi as number)} mi ${label}`);

  return [
    `Route ${route.id} · ${route.recommended ? "Recommended" : `#${route.rank}`}`,
    `${formatDuration(route.duration_h)} · ${Math.round(route.distance_mi)} mi · arrives ${formatTime(route.arrival)}`,
    `Wind: ${RISK_LABEL[peaks.wind]} · Rain: ${RISK_LABEL[peaks.rain]} · Snow: ${RISK_LABEL[peaks.snow]}`,
    flagged.length ? flagged.join(" · ") : "No high-risk miles",
    ...(selected ? [] : ["Click to select"]),
  ].join("\n");
}

/** Hover text for every pickable layer; route lines and labels show that route's summary. */
export function makeTooltip(plan: Plan | null, selectedId: string | null, heatmap: HeatmapGrid | null, hour: number) {
  return ({ object, layer }: PickingInfo) => {
    if (!object || !layer || !plan) return null;
    const routeById = (id: string) => plan.routes.find((r) => r.id === id);
    switch (layer.id) {
      case "breaks": {
        const b = object as Break;
        return { text: `30-min HOS break · mile ${Math.round(b.mile)}\n${formatShortTime(b.start)} – ${formatShortTime(b.end)}` };
      }
      case "checkpoints":
      case "alt-checkpoints": {
        const c = object as Checkpoint & { routeId?: string };
        const route = c.routeId ? `Route ${c.routeId} · ` : "";
        const hint = c.routeId ? "\nClick to select this route" : "";
        return { text: `${route}Mile ${Math.round(c.mile)} · ${RISK_LABEL[c.risk]}\n${formatShortTime(c.eta)} · ${describeConditions(c)}${hint}` };
      }
      case "weather-heatmap": {
        if (!heatmap) return null;
        const level = RISK_ORDER[heatmap.values[hour * heatmap.points.length + (object as HeatCell).index]] ?? "LOW";
        const at = new Date(heatmap.start.getTime() + hour * 3600_000);
        // One forecast point per ~30 mi tile, so say where it was taken.
        return { text: `Risk at this tile's centre at ${formatShortTime(at)}: ${RISK_LABEL[level]}\nCheckpoints show the exact weather on the road` };
      }
      case "selected-route":
      case "alt-routes":
      case "route-labels": {
        const route = routeById(layer.id === "selected-route" ? selectedId ?? "" : (object as { id: string }).id);
        return route ? { text: routeSummary(route, route.id === selectedId) } : null;
      }
      default:
        return null;
    }
  };
}
