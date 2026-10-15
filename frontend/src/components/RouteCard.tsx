import type { RiskName, Route, RouteSummary } from "../api/types";
import { formatDuration, formatMiles, formatTime } from "../lib/format";
import { RISK_LABEL, RISK_ORDER, riskHex } from "../lib/risk";
import { FactorChips } from "./FactorChips";

interface Props {
  route: Route;
  selected: boolean;
  onSelect: () => void;
}

const MILES_KEY: Record<RiskName, keyof RouteSummary & `${string}_mi`> = {
  LOW: "low_mi",
  MODERATE: "moderate_mi",
  HIGH: "high_mi",
  SEVERE: "severe_mi",
  NO_TRAVEL: "no_travel_mi",
};

export function RouteCard({ route, selected, onSelect }: Props) {
  const s = route.summary;
  const miles = (r: RiskName) => s[MILES_KEY[r]];
  // High and worse, most serious first; these are what the ranking cares about.
  const flagged = (["NO_TRAVEL", "SEVERE", "HIGH"] as const).filter((r) => miles(r) > 0);

  return (
    <button className={`route-card${selected ? " selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <div className="route-head">
        <span className="route-name">Route {route.id}</span>
        <span className={`badge${route.recommended ? " recommended" : ""}`}>{route.recommended ? "Recommended" : `#${route.rank}`}</span>
      </div>
      <FactorChips route={route} />

      <div className="route-stats">
        <strong>{formatDuration(route.duration_h)}</strong>
        <span>{formatMiles(route.distance_mi)}</span>
        <span>Arrive {formatTime(route.arrival)}</span>
      </div>

      <div className="risk-bar" aria-label="Miles by risk level">
        {RISK_ORDER.filter((r) => miles(r) > 0).map((r) => (
          <span key={r} style={{ flexGrow: miles(r), background: riskHex(r) }} title={`${RISK_LABEL[r]}: ${Math.round(miles(r))} mi`} />
        ))}
      </div>
      <div className="risk-miles">
        {flagged.length ? flagged.map((r) => `${Math.round(miles(r))} mi ${RISK_LABEL[r].toLowerCase()}`).join(" · ") : "No high-risk miles"}
        {" · "}avg risk {s.avg_risk.toFixed(2)}
      </div>

      <p className="rank-reason">{route.rank_reason}</p>
      {route.notes.map((n) => (
        <p key={n} className="route-note">{n}</p>
      ))}
      {route.breaks.length > 0 && (
        <p className="muted small">
          Includes {route.breaks.length} × 30-min HOS break · {formatDuration(route.drive_h)} driving
        </p>
      )}
    </button>
  );
}
