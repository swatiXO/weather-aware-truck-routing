import type { Plan } from "../api/types";
import { formatTime } from "../lib/format";

interface Props {
  plan: Plan;
  onEdit: () => void;
}

/** Compact stand-in for the form once a trip is planned, so the results get the space. */
export function TripSummary({ plan, onEdit }: Props) {
  return (
    <div className="trip-summary">
      <div className="trip-summary-main">
        <div className="trip-route" title={`${plan.origin.label} → ${plan.destination.label}`}>
          {plan.origin.label} <span className="arrow">→</span> {plan.destination.label}
        </div>
        <div className="muted small">
          Departs {formatTime(plan.departure)} · {plan.load_lb.toLocaleString()} lb · every {plan.interval_mi} mi
          {plan.hos_breaks ? " · HOS breaks" : ""}
        </div>
      </div>
      <button className="secondary" onClick={onEdit}>
        Edit trip
      </button>
    </div>
  );
}
