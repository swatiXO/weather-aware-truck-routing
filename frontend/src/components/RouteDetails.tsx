import type { Checkpoint, Route } from "../api/types";
import type { Highlight } from "../hooks/usePlanner";
import { formatDuration } from "../lib/format";
import { CheckpointList } from "./CheckpointList";

interface Props {
  route: Route;
  intervalMi: number;
  highlight: Highlight | null;
  onHighlight: (h: Highlight | null) => void;
  onFocus: (cp: Checkpoint) => void;
}

/** Why the selected route ranks where it does, and its checkpoint-by-checkpoint weather. */
export function RouteDetails({ route, intervalMi, highlight, onHighlight, onFocus }: Props) {
  return (
    <section className="route-details">
      <div className="details-head">
        <h2>Route {route.id}</h2>
        <span className={`badge${route.recommended ? " recommended" : ""}`}>{route.recommended ? "Recommended" : `Ranked #${route.rank}`}</span>
      </div>
      <p className="rank-reason">{route.rank_reason}</p>
      {route.notes.map((n) => (
        <p key={n} className="route-note">
          {n}
        </p>
      ))}
      {route.breaks.length > 0 && (
        <p className="muted small">
          Includes {route.breaks.length} × 30-min HOS break · {formatDuration(route.drive_h)} driving
        </p>
      )}
      <details className="cp-details" open>
        <summary>
          Checkpoints ({route.checkpoints.length}, every {intervalMi} mi)
        </summary>
        <CheckpointList checkpoints={route.checkpoints} highlight={highlight} onHighlight={onHighlight} onFocus={onFocus} />
      </details>
    </section>
  );
}
