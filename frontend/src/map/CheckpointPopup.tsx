import type { Checkpoint } from "../api/types";
import { formatTime } from "../lib/format";
import { RISK_LABEL, riskHex } from "../lib/risk";

export function CheckpointPopup({ cp }: { cp: Checkpoint }) {
  const w = cp.weather;
  const rows = [
    ["Wind", `${Math.round(w.wind_mph)} mph (gusts ${Math.round(w.gust_mph)})`, cp.levels.wind],
    ["Rain", `${w.rain_in_hr.toFixed(2)} in/hr`, cp.levels.rain],
    ["Snow", `${w.snow_in_hr.toFixed(2)} in/hr`, cp.levels.snow],
  ] as const;

  return (
    <div className="cp-popup">
      <div className="cp-title">
        Mile {Math.round(cp.mile)} · <span style={{ color: riskHex(cp.risk) }}>{RISK_LABEL[cp.risk]}</span>
      </div>
      <div className="muted">ETA {formatTime(cp.eta)}</div>
      <table>
        <tbody>
          {rows.map(([label, value, level]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
              <td>{RISK_LABEL[level]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cp.load_adjusted && <div className="tag-note">Raised to {RISK_LABEL[cp.risk]} by the load-weight rules</div>}
    </div>
  );
}
