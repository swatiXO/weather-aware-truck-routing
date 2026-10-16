import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibreWorker";

import type { Layer } from "@deck.gl/core";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Map, NavigationControl, Popup, useControl, type MapRef } from "react-map-gl/maplibre";

import type { Checkpoint, HeatmapGrid, Plan } from "../api/types";
import type { Highlight } from "../hooks/usePlanner";
import { formatDuration } from "../lib/format";
import { bounds, decodePath, pointAlong, riskSegments } from "../lib/geo";
import { CheckpointPopup } from "./CheckpointPopup";
import { heatCells, heatmapLayer, otherRoutes, routeLayers } from "./layers";
import { makeTooltip } from "./tooltips";

interface Props {
  plan: Plan | null;
  selectedId: string | null;
  onSelectRoute: (id: string) => void;
  heatmap: HeatmapGrid | null;
  showHeatmap: boolean;
  hour: number;
  truckSeconds: number | null; // seconds after departure at the slider hour
  focused: Checkpoint | null;
  onFocus: (cp: Checkpoint | null) => void;
  highlight: Highlight | null;
  onHighlight: (h: Highlight | null) => void;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 };
const FIT_PADDING = { top: 90, bottom: 130, left: 50, right: 60 }; // clear the legend, slider and zoom buttons
// Spread the A/B/C labels along their routes so they don't stack where routes share a road.
const LABEL_FRACTIONS = [0.5, 0.35, 0.65];

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export function MapView(props: Props) {
  const { plan, selectedId, onSelectRoute, heatmap, showHeatmap, hour, truckSeconds, focused, onFocus, highlight, onHighlight } = props;
  const mapRef = useRef<MapRef>(null);
  const selected = plan?.routes.find((r) => r.id === selectedId) ?? null;

  const paths = useMemo(() => new globalThis.Map((plan?.routes ?? []).map((r) => [r.id, decodePath(r.geometry)])), [plan]);
  const segments = useMemo(() => (selected ? riskSegments(paths.get(selected.id) ?? [], selected.checkpoints) : []), [selected, paths]);
  const others = useMemo(() => (plan && selectedId ? otherRoutes(plan, selectedId, paths) : null), [plan, selectedId, paths]);
  const labels = useMemo(
    () =>
      (plan?.routes ?? []).map((r, i) => ({
        id: r.id,
        text: `${r.id} · ${formatDuration(r.duration_h)}`,
        position: pointAlong(paths.get(r.id) ?? [], LABEL_FRACTIONS[i % 3]),
      })),
    [plan, paths],
  );
  const cells = useMemo(() => (heatmap ? heatCells(heatmap) : []), [heatmap]);
  const tooltip = useMemo(() => makeTooltip(plan, selectedId, heatmap, hour), [plan, selectedId, heatmap, hour]);

  const fitRoutes = useCallback(() => {
    if (paths.size) mapRef.current?.fitBounds(bounds([...paths.values()]), { padding: FIT_PADDING, duration: 900 });
  }, [paths]);
  useEffect(fitRoutes, [fitRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (focused && map) map.flyTo({ center: [focused.lon, focused.lat], zoom: Math.max(map.getZoom(), 7), duration: 700 });
  }, [focused]);

  // Hover events fire on every mouse move; only report changes, and only clear what the map set.
  const onHoverCheckpoint = (mile: number | null) => {
    if (mile !== null && (highlight?.mile !== mile || highlight.from !== "map")) onHighlight({ mile, from: "map" });
    else if (mile === null && highlight?.from === "map") onHighlight(null);
  };

  const layers: Layer[] = [];
  if (heatmap && showHeatmap) layers.push(heatmapLayer(heatmap, cells, hour));
  if (plan && selected && others) {
    layers.push(
      ...routeLayers({ plan, selected, segments, others, labels, truckSeconds, highlightMile: highlight?.mile ?? null, onHoverCheckpoint, onSelectRoute, onFocus }),
    );
  }

  return (
    <Map ref={mapRef} initialViewState={INITIAL_VIEW} mapStyle={MAP_STYLE} style={{ width: "100%", height: "100%" }} onClick={() => onFocus(null)}>
      <DeckOverlay layers={layers} getTooltip={tooltip} getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")} />
      <NavigationControl position="top-right" showCompass={false} />
      {plan && (
        <button className="map-btn fit-routes" onClick={fitRoutes} title="Zoom to show all routes">
          Fit routes
        </button>
      )}
      {focused && (
        <Popup longitude={focused.lon} latitude={focused.lat} anchor="bottom" offset={14} closeOnClick={false} onClose={() => onFocus(null)} maxWidth="280px">
          <CheckpointPopup cp={focused} />
        </Popup>
      )}
    </Map>
  );
}
