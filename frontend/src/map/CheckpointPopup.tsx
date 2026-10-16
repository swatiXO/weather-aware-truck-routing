import type { Checkpoint } from "../api/types";
import { RiskDot } from "../components/RiskDot";
import { formatTime } from "../lib/format";
import { RISK_LABEL, riskHex } from "../lib/risk";
import { FACTORS } from "../lib/weather";

export function CheckpointPopup({ cp }: { cp: Checkpoint }) {
  const w = cp.weather;
  const reading = {
    wind: `${Math.round(w.wind_mph)} mph (gusts ${Math.round(w.gust_mph)})`,
    rain: `${w.rain_in_hr.toFixed(2)} in/hr`,
    snow: `${w.snow_in_hr.toFixed(2)} in/hr`,
  };

  return (
    <div className="cp-popup">
      <div className="cp-title">
        Mile {Math.round(cp.mile)} · <span style={{ color: riskHex(cp.risk) }}>{RISK_LABEL[cp.risk]}</span>
      </div>
      <div className="muted">ETA {formatTime(cp.eta)}</div>
      <table>
        <tbody>
          {FACTORS.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{reading[key]}</td>
              <td>
                <RiskDot risk={cp.levels[key]} />
                {RISK_LABEL[cp.levels[key]]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cp.load_adjusted && <div className="tag-note">Raised to {RISK_LABEL[cp.risk]} by the load-weight rules</div>}
    </div>
  );
}
