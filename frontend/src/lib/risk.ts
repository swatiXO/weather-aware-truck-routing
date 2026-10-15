import type { RiskName } from "../api/types";

export const RISK_ORDER: RiskName[] = ["LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL"];

export const RISK_LABEL: Record<RiskName, string> = {
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  SEVERE: "Severe",
  NO_TRAVEL: "No Travel",
};

// One palette everywhere: cards, checkpoints, route segments, heatmap, legend.
export const RISK_RGB: Record<RiskName, [number, number, number]> = {
  LOW: [34, 160, 90],
  MODERATE: [234, 179, 8],
  HIGH: [245, 124, 0],
  SEVERE: [220, 38, 38],
  NO_TRAVEL: [88, 28, 135],
};

export const riskHex = (r: RiskName) => `rgb(${RISK_RGB[r].join(",")})`;
export const riskIndex = (r: RiskName) => RISK_ORDER.indexOf(r);
export const worse = (a: RiskName, b: RiskName): RiskName => (riskIndex(a) >= riskIndex(b) ? a : b);
