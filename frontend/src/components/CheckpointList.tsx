import type { Checkpoint } from "../api/types";
import { formatShortTime } from "../lib/format";
import { RISK_LABEL, riskHex } from "../lib/risk";
import { describeConditions } from "../lib/weather";

interface Props {
  checkpoints: Checkpoint[];
  onFocus: (cp: Checkpoint) => void;
}

export function CheckpointList({ checkpoints, onFocus }: Props) {
  return (
    <div className="checkpoints">
      <table>
        <thead>
          <tr>
            <th>Mile</th>
            <th>ETA</th>
            <th>Risk</th>
            <th>Conditions</th>
          </tr>
        </thead>
        <tbody>
          {checkpoints.map((cp) => (
            <tr key={cp.mile} onClick={() => onFocus(cp)}>
              <td>{Math.round(cp.mile)}</td>
              <td>{formatShortTime(cp.eta)}</td>
              <td>
                <span className="dot" style={{ background: riskHex(cp.risk) }} />
                {RISK_LABEL[cp.risk]}
                {cp.load_adjusted && <span className="tag" title="Raised by the load-weight rules">load</span>}
              </td>
              <td className="muted">{describeConditions(cp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
