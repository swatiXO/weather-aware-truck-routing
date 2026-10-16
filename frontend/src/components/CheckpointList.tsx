import { useEffect, useRef } from "react";

import type { Checkpoint } from "../api/types";
import type { Highlight } from "../hooks/usePlanner";
import { formatShortTime } from "../lib/format";
import { RISK_LABEL } from "../lib/risk";
import { describeConditions } from "../lib/weather";
import { RiskDot } from "./RiskDot";

interface Props {
  checkpoints: Checkpoint[];
  highlight: Highlight | null;
  onHighlight: (h: Highlight | null) => void;
  onFocus: (cp: Checkpoint) => void;
}

export function CheckpointList({ checkpoints, highlight, onHighlight, onFocus }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // Hovering a dot on the map brings its row into view.
  useEffect(() => {
    if (highlight?.from === "map") box.current?.querySelector(`[data-mile="${highlight.mile}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  return (
    <div className="checkpoints" ref={box} onMouseLeave={() => onHighlight(null)}>
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
            <tr
              key={cp.mile}
              data-mile={cp.mile}
              className={highlight?.mile === cp.mile ? "hl" : undefined}
              onMouseEnter={() => onHighlight({ mile: cp.mile, from: "list" })}
              onClick={() => onFocus(cp)}
            >
              <td>{Math.round(cp.mile)}</td>
              <td>{formatShortTime(cp.eta)}</td>
              <td>
                <RiskDot risk={cp.risk} />
                {RISK_LABEL[cp.risk]}
                {cp.load_adjusted && (
                  <span className="tag" title="Raised by the load-weight rules">
                    load
                  </span>
                )}
              </td>
              <td className="muted">{describeConditions(cp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
