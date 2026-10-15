// Mirrors the Django API responses (backend/planner/pipeline.py).

export type RiskName = "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "NO_TRAVEL";
export type Driver = "wind" | "rain" | "snow" | "load" | "none";

export interface Checkpoint {
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  weather: { wind_mph: number; gust_mph: number; rain_in_hr: number; snow_in_hr: number };
  levels: { wind: RiskName; rain: RiskName; snow: RiskName };
  risk: RiskName;
  driver: Driver;
  load_adjusted: boolean;
}

export interface Break {
  mile: number;
  lat: number;
  lon: number;
  start: string;
  end: string;
}

export interface RouteSummary {
  no_travel_mi: number;
  severe_mi: number;
  high_mi: number;
  moderate_mi: number;
  low_mi: number;
  avg_risk: number;
  max_risk: RiskName;
}

export interface Route {
  id: string;
  geometry: string; // encoded polyline, precision 5
  distance_mi: number;
  drive_h: number;
  duration_h: number;
  arrival: string;
  rank: number;
  recommended: boolean;
  rank_reason: string;
  notes: string[];
  summary: RouteSummary;
  breaks: Break[];
  checkpoints: Checkpoint[];
  track: [number, number, number][]; // lat, lon, seconds after departure
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface Plan {
  plan_id: string;
  origin: Place;
  destination: Place;
  departure: string;
  load_lb: number;
  interval_mi: number;
  hos_breaks: boolean;
  recommended_route_id: string | null;
  notes: string[];
  routes: Route[]; // ranked, best first
}

export interface HeatmapResponse {
  start: string;
  hours: number;
  cell_deg: number; // each point is the centre of a cell this many degrees wide
  points: [number, number][];
  risk: string; // base64 bytes, hours x points, row-major by hour
}

/** The heatmap after decoding: risk level of point i at hour h is values[h * points.length + i]. */
export interface HeatmapGrid {
  start: Date;
  cellDeg: number;
  points: [number, number][]; // (lat, lon) cell centres
  values: Uint8Array;
}

export interface PlanRequest {
  origin: string;
  destination: string;
  departure: string;
  load_lb: number;
  interval_mi: 10 | 25 | 50;
  hos_breaks: boolean;
}
