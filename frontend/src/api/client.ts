import type { HeatmapGrid, HeatmapResponse, Plan, PlanRequest } from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }
  const body = await resp.json().catch(() => ({}));
  // Our views send {error}; DRF's own responses (e.g. 429 throttling) send {detail}.
  if (!resp.ok) throw new ApiError(body.error ?? body.detail ?? `Request failed (${resp.status})`, body.fields);
  return body as T;
}

function decodeHeatmap(h: HeatmapResponse): HeatmapGrid {
  const bin = atob(h.risk);
  const values = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) values[i] = bin.charCodeAt(i);
  return { start: new Date(h.start), hours: h.hours, cellDeg: h.cell_deg, points: h.points, values };
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  plan: (req: PlanRequest) => request<Plan>("/api/plan", { method: "POST", body: JSON.stringify(req) }),
  heatmap: async (planId: string) => decodeHeatmap(await request<HeatmapResponse>(`/api/heatmap/${planId}`)),
};
