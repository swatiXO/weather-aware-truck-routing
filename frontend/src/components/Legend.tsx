import { useState } from "react";

import { RISK_LABEL, RISK_ORDER } from "../lib/risk";
import { RiskDot } from "./RiskDot";

interface Props {
  showHeatmap: boolean;
  onToggleHeatmap: (on: boolean) => void;
}

/** Risk colours are always visible; the symbol key folds away so it doesn't cover the map. */
export function Legend({ showHeatmap, onToggleHeatmap }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend">
      <div className="legend-row">
        {RISK_ORDER.map((r) => (
          <span key={r} className="legend-item">
            <RiskDot risk={r} />
            {RISK_LABEL[r]}
          </span>
        ))}
        <label className="checkbox" title="Risk across the area at the slider's time">
          <input type="checkbox" checked={showHeatmap} onChange={(e) => onToggleHeatmap(e.target.checked)} /> Heatmap
        </label>
        <button className="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
          Key {open ? "▴" : "▾"}
        </button>
      </div>
      {open && (
        <div className="legend-row">
          <span className="legend-item">
            <span className="sym start" />
            Start
          </span>
          <span className="legend-item">
            <span className="sym end" />
            End
          </span>
          <span className="legend-item">
            <span className="sym break" />
            30-min HOS break
          </span>
          <span className="legend-item">
            <span className="sym truck" />
            Truck at slider time
          </span>
          <span className="legend-item muted">Tiles: area risk at the slider's time</span>
        </div>
      )}
    </div>
  );
}
