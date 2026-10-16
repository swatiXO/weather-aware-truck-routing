// deck.gl layers for the map, built as plain functions so MapView stays about the map itself.
import type { Layer } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from "@deck.gl/layers";

import type { Break, Checkpoint, HeatmapGrid, Plan, RiskName, Route } from "../api/types";
import { positionAt, riskSegments, type LonLat, type RiskSegment } from "../lib/geo";
import { RISK_ORDER, RISK_RGB } from "../lib/risk";

type RGBA = [number, number, number, number];

// Chrome colours, tuned for the dark basemap.
const TEAL: RGBA = [0, 128, 128, 255];
const TURQUOISE: RGBA = [64, 224, 208, 255];
const CORAL: RGBA = [248, 73, 96, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const NAVY: RGBA = [10, 18, 28, 235];
const SLATE_BORDER: RGBA = [148, 163, 184, 190];
const ALT_ALPHA = 150; // unselected routes: risk-coloured but quieter than the selected one
const BREAK_BLUE: RGBA = [96, 165, 250, 255];
const LABEL_SLATE: RGBA = [34, 48, 68, 245];

// Low-risk cells stay faint so the risky ones stand out.
const HEAT_ALPHA: Record<RiskName, number> = { LOW: 55, MODERATE: 130, HIGH: 150, SEVERE: 170, NO_TRAVEL: 185 };
export const HEAT_COLORS = RISK_ORDER.map((r) => [...RISK_RGB[r], HEAT_ALPHA[r]] as RGBA);

export interface HeatCell {
  index: number;
  polygon: LonLat[];
}

export interface RouteLabel {
  id: string;
  text: string;
  position: LonLat;
}

export function heatCells(grid: HeatmapGrid): HeatCell[] {
  const h = grid.cellDeg / 2;
  return grid.points.map(([lat, lon], index) => ({
    index,
    polygon: [[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h]],
  }));
}

export function heatmapLayer(grid: HeatmapGrid, cells: HeatCell[], hour: number) {
  const offset = hour * grid.points.length;
  // Geometry is built once per plan; moving the slider only re-evaluates colours.
  return new SolidPolygonLayer<HeatCell>({
    id: "weather-heatmap",
    data: cells,
    getPolygon: (c) => c.polygon,
    getFillColor: (c) => HEAT_COLORS[grid.values[offset + c.index]] ?? HEAT_COLORS[0],
    updateTriggers: { getFillColor: hour },
    transitions: { getFillColor: 250 },
    pickable: true, // hover shows the risk in that cell
  });
}

export type AltSegment = RiskSegment & { id: string };
export type AltCheckpoint = Checkpoint & { routeId: string };

/**
 * The unselected routes, risk-coloured so all three can be compared at a glance. Only their
 * risky checkpoints get dots; the line colour already says "Low" everywhere else.
 * Built once per plan/selection (not per slider tick), since splitting paths is the slow part.
 */
export function otherRoutes(plan: Plan, selectedId: string, paths: Map<string, LonLat[]>) {
  const others = plan.routes.filter((r) => r.id !== selectedId);
  return {
    segments: others.flatMap((r) => riskSegments(paths.get(r.id) ?? [], r.checkpoints).map((s): AltSegment => ({ ...s, id: r.id }))),
    checkpoints: others.flatMap((r) => r.checkpoints.filter((c) => c.risk !== "LOW").map((c): AltCheckpoint => ({ ...c, routeId: r.id }))),
  };
}

interface RouteLayerInput {
  plan: Plan;
  selected: Route;
  segments: RiskSegment[];
  others: ReturnType<typeof otherRoutes>;
  labels: RouteLabel[];
  truckSeconds: number | null;
  highlightMile: number | null; // checkpoint hovered in the table or on the map
  onHoverCheckpoint: (mile: number | null) => void;
  onSelectRoute: (id: string) => void;
  onFocus: (cp: Checkpoint) => void;
}

const pixels = { radiusUnits: "pixels", stroked: true } as const;
const roundedPath = { widthUnits: "pixels", capRounded: true, jointRounded: true } as const;

export function routeLayers({ plan, selected, segments, others, labels, truckSeconds, highlightMile, onHoverCheckpoint, onSelectRoute, onFocus }: RouteLayerInput): Layer[] {
  const isSelected = (d: RouteLabel) => d.id === selected.id;

  const layers: Layer[] = [
    // Thin dark casing so the quieter routes still stand out against green heatmap tiles.
    new PathLayer<AltSegment>({ id: "alt-outline", data: others.segments, getPath: (d) => d.path, getColor: NAVY, getWidth: 6, ...roundedPath }),
    new PathLayer<AltSegment>({
      id: "alt-routes",
      data: others.segments,
      getPath: (d) => d.path,
      getColor: (d) => [...RISK_RGB[d.risk], ALT_ALPHA],
      getWidth: 3,
      ...roundedPath,
      pickable: true,
      onClick: ({ object }) => object && onSelectRoute(object.id),
    }),
    new ScatterplotLayer<AltCheckpoint>({
      id: "alt-checkpoints",
      data: others.checkpoints,
      getPosition: (c) => [c.lon, c.lat],
      getFillColor: (c) => RISK_RGB[c.risk],
      getLineColor: NAVY,
      getRadius: 4,
      lineWidthMinPixels: 1,
      pickable: true,
      onClick: ({ object }) => object && onSelectRoute(object.routeId),
      ...pixels,
    }),
    // A dark outline under the risk-coloured route keeps it readable over the heatmap.
    new PathLayer<RiskSegment>({ id: "selected-outline", data: segments, getPath: (d) => d.path, getColor: NAVY, getWidth: 10, ...roundedPath }),
    new PathLayer<RiskSegment>({
      id: "selected-route",
      data: segments,
      getPath: (d) => d.path,
      getColor: (d) => RISK_RGB[d.risk],
      getWidth: 6,
      pickable: true, // hover shows the route summary
      ...roundedPath,
    }),
    new ScatterplotLayer<Break>({
      id: "breaks",
      data: selected.breaks,
      getPosition: (b) => [b.lon, b.lat],
      getFillColor: BREAK_BLUE,
      getLineColor: WHITE,
      getRadius: 7,
      lineWidthMinPixels: 2,
      pickable: true,
      ...pixels,
    }),
    new ScatterplotLayer<Checkpoint>({
      id: "checkpoints",
      data: selected.checkpoints,
      getPosition: (c) => [c.lon, c.lat],
      getFillColor: (c) => RISK_RGB[c.risk],
      getLineColor: (c) => (c.mile === highlightMile ? TURQUOISE : NAVY),
      getRadius: (c) => (c.mile === highlightMile ? 10 : 6),
      getLineWidth: (c) => (c.mile === highlightMile ? 3 : 2),
      lineWidthUnits: "pixels",
      pickable: true,
      onClick: ({ object }) => object && onFocus(object),
      onHover: ({ object }) => onHoverCheckpoint(object ? object.mile : null),
      updateTriggers: { getLineColor: highlightMile, getRadius: highlightMile, getLineWidth: highlightMile },
      ...pixels,
    }),
    new ScatterplotLayer<{ position: LonLat; end: boolean }>({
      id: "endpoints",
      data: [
        { position: [plan.origin.lon, plan.origin.lat], end: false },
        { position: [plan.destination.lon, plan.destination.lat], end: true },
      ],
      getPosition: (d) => d.position,
      getFillColor: (d) => (d.end ? CORAL : WHITE),
      getLineColor: (d) => (d.end ? WHITE : TEAL),
      getRadius: 9,
      lineWidthMinPixels: 3,
      ...pixels,
    }),
    new TextLayer<RouteLabel>({
      id: "route-labels",
      data: labels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      characterSet: "auto",
      getSize: 14,
      getColor: WHITE,
      fontFamily: "DM Sans, system-ui, sans-serif",
      fontWeight: 700,
      background: true,
      backgroundPadding: [7, 4],
      getBackgroundColor: (d) => (isSelected(d) ? TEAL : LABEL_SLATE),
      getBorderColor: (d) => (isSelected(d) ? TURQUOISE : SLATE_BORDER),
      getBorderWidth: 1,
      pickable: true,
      onClick: ({ object }) => object && onSelectRoute(object.id),
      updateTriggers: { getBackgroundColor: selected.id, getBorderColor: selected.id },
    }),
  ];

  if (truckSeconds !== null) {
    layers.push(
      new ScatterplotLayer<LonLat>({
        id: "truck",
        data: [positionAt(selected.track, truckSeconds)],
        getPosition: (p) => p,
        getFillColor: WHITE,
        getLineColor: TURQUOISE,
        getRadius: 11,
        lineWidthMinPixels: 5,
        ...pixels,
      }),
    );
  }
  return layers;
}
