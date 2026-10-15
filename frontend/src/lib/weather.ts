import type { Checkpoint, RiskName, Route } from "../api/types";
import { formatShortTime } from "./format";
import { RISK_LABEL, worse } from "./risk";

const SIGNIFICANT_IN_HR = 0.01;

export interface FactorPeaks {
  wind: RiskName;
  rain: RiskName;
  snow: RiskName;
  loadAdjusted: boolean;
}

/** Worst level each weather factor reaches anywhere on the route. */
export function factorPeaks(route: Route): FactorPeaks {
  const peaks: FactorPeaks = { wind: "LOW", rain: "LOW", snow: "LOW", loadAdjusted: false };
  for (const cp of route.checkpoints) {
    peaks.wind = worse(peaks.wind, cp.levels.wind);
    peaks.rain = worse(peaks.rain, cp.levels.rain);
    peaks.snow = worse(peaks.snow, cp.levels.snow);
    peaks.loadAdjusted ||= cp.load_adjusted;
  }
  return peaks;
}

/** Compact conditions for tables and tooltips, e.g. `18 mph wind, 0.12" rain/h`. */
export function describeConditions(cp: Checkpoint): string {
  const w = cp.weather;
  const parts = [`${Math.round(w.wind_mph)} mph wind`];
  if (w.rain_in_hr >= SIGNIFICANT_IN_HR) parts.push(`${w.rain_in_hr.toFixed(2)}" rain/h`);
  if (w.snow_in_hr >= SIGNIFICANT_IN_HR) parts.push(`${w.snow_in_hr.toFixed(2)}" snow/h`);
  return parts.join(", ");
}

/** Short reason a checkpoint got its risk level, e.g. "38 mph wind with a 42,000 lb load". */
export function causeOf(cp: Checkpoint, loadLb: number): string {
  const w = cp.weather;
  switch (cp.driver) {
    case "load":
      return `${Math.round(w.wind_mph)} mph wind with a ${loadLb.toLocaleString()} lb load`;
    case "rain":
      return `heavy rain (${w.rain_in_hr.toFixed(2)} in/hr)`;
    case "snow":
      return `snow (${w.snow_in_hr.toFixed(2)} in/hr)`;
    default:
      return `${Math.round(w.wind_mph)} mph wind`;
  }
}

/** One sentence on the worst weather a route runs into, e.g. for the recommendation hero. */
export function describeRouteWeather(route: Route, loadLb: number): string {
  const cps = route.checkpoints;
  const worst = route.summary.max_risk;

  if (worst === "LOW") {
    const wind = Math.max(...cps.map((c) => c.weather.wind_mph));
    const wet = cps.some((c) => c.weather.rain_in_hr >= SIGNIFICANT_IN_HR || c.weather.snow_in_hr >= SIGNIFICANT_IN_HR);
    return `Clear the whole way: winds peak at ${Math.round(wind)} mph${wet ? ", only light precipitation" : ", no rain or snow"}.`;
  }

  // First run of consecutive checkpoints at the worst level.
  const start = cps.findIndex((c) => c.risk === worst);
  let end = start;
  while (end + 1 < cps.length && cps[end + 1].risk === worst) end++;
  const runs = cps.filter((c, i) => c.risk === worst && (i === 0 || cps[i - 1].risk !== worst)).length;

  const first = cps[start];
  const miles = start === end ? `mile ${Math.round(first.mile)}` : `miles ${Math.round(first.mile)}–${Math.round(cps[end].mile)}`;
  const more = runs > 1 ? ` (+${runs - 1} more stretch${runs > 2 ? "es" : ""})` : "";
  return `${RISK_LABEL[worst]} risk near ${miles}, ${formatShortTime(first.eta)}: ${causeOf(first, loadLb)}${more}.`;
}
