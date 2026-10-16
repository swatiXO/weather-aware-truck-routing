import type { Route } from "../api/types";
import { RISK_LABEL, riskHex } from "../lib/risk";
import { FACTORS, factorPeaks } from "../lib/weather";

/** Wind / Rain / Snow chips coloured by each factor's worst level on the route. */
export function FactorChips({ route }: { route: Route }) {
  const peaks = factorPeaks(route);
  return (
    <div className="factor-chips">
      {FACTORS.map(([key, label]) => {
        const level = peaks[key];
        return (
          <span
            key={key}
            className={`factor-chip${level === "LOW" ? " calm" : ""}`}
            style={level === "LOW" ? undefined : { background: riskHex(level) }}
            title={`Worst ${label.toLowerCase()} on this route: ${RISK_LABEL[level]}`}
          >
            {label}: {RISK_LABEL[level]}
          </span>
        );
      })}
      {peaks.loadAdjusted && (
        <span className="factor-chip load" title="The load-weight rules raised the risk at one or more checkpoints">
          Load raised risk
        </span>
      )}
    </div>
  );
}
