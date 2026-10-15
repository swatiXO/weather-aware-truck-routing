import { RISK_LABEL, RISK_ORDER, riskHex } from "../lib/risk";

interface Props {
  showHeatmap: boolean;
  onToggleHeatmap: (on: boolean) => void;
}

export function Legend({ showHeatmap, onToggleHeatmap }: Props) {
  return (
    <div className="legend">
      <div className="legend-row">
        {RISK_ORDER.map((r) => (
          <span key={r} className="legend-item">
            <span className="dot" style={{ background: riskHex(r) }} />
            {RISK_LABEL[r]}
          </span>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-item"><span className="sym start" />Start</span>
        <span className="legend-item"><span className="sym end" />End</span>
        <span className="legend-item"><span className="sym break" />30-min HOS break</span>
        <span className="legend-item"><span className="sym truck" />Truck at slider time</span>
        <label className="checkbox">
          <input type="checkbox" checked={showHeatmap} onChange={(e) => onToggleHeatmap(e.target.checked)} /> Heatmap (area risk at slider time)
        </label>
      </div>
    </div>
  );
}
