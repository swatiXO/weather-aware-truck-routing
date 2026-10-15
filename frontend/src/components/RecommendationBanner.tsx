import type { Plan } from "../api/types";
import { formatDuration, formatTime } from "../lib/format";
import { riskIndex } from "../lib/risk";
import { describeRouteWeather } from "../lib/weather";
import { FactorChips } from "./FactorChips";

interface Props {
  plan: Plan;
  onSelect: (routeId: string) => void;
}

/** Answers "which route should I take, and why?" before the driver reads any details. */
export function RecommendationBanner({ plan, onSelect }: Props) {
  const [best, runnerUp] = plan.routes;
  if (!best) return null;
  const safe = best.recommended;
  // Only worth mentioning the alternative if its weather is actually worse.
  const contrast = runnerUp && riskIndex(runnerUp.summary.max_risk) > riskIndex(best.summary.max_risk) ? runnerUp : null;

  return (
    <button className={`recommendation${safe ? "" : " unsafe"}`} onClick={() => onSelect(best.id)}>
      <div className="rec-eyebrow">{safe ? "Recommended" : "No safe route at this departure"}</div>
      <div className="rec-title">{safe ? `Take Route ${best.id}` : `Least exposure: Route ${best.id}`}</div>
      <FactorChips route={best} />
      <div className="rec-meta">
        {formatDuration(best.duration_h)} · arrives {formatTime(best.arrival)}
      </div>

      <div className="rec-weather">
        <span className="rec-label">Weather</span>
        {describeRouteWeather(best, plan.load_lb)}
      </div>
      {contrast && (
        <div className="rec-weather avoided">
          <span className="rec-label">Avoids</span>
          Route {contrast.id}: {describeRouteWeather(contrast, plan.load_lb)}
        </div>
      )}

      <div className="rec-reason">
        {safe
          ? best.rank_reason.replace(/^Recommended over (\w+): it /, (_, id) => `Why: over Route ${id}, it `)
          : "Every route crosses No Travel conditions. Consider a later departure."}
      </div>
    </button>
  );
}
