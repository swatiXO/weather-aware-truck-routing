import type { Route } from "../api/types";
import { formatDuration, formatShortTime } from "../lib/format";
import { RISK_LABEL, RISK_ORDER, riskHex, riskIndex } from "../lib/risk";
import { FACTORS, factorPeaks } from "../lib/weather";
import { RiskDot } from "./RiskDot";

interface Props {
  routes: Route[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Row {
  label: string;
  cell: (r: Route) => React.ReactNode;
  score: (r: Route) => number; // lower is better; the best route in each row is highlighted
}

const severeMiles = (r: Route) => r.summary.severe_mi + r.summary.no_travel_mi;
const MILES_AT = { LOW: "low_mi", MODERATE: "moderate_mi", HIGH: "high_mi", SEVERE: "severe_mi", NO_TRAVEL: "no_travel_mi" } as const;

const ROWS: Row[] = [
  { label: "Time", cell: (r) => formatDuration(r.duration_h), score: (r) => r.duration_h },
  { label: "Distance", cell: (r) => `${Math.round(r.distance_mi).toLocaleString()} mi`, score: (r) => r.distance_mi },
  { label: "Arrives", cell: (r) => formatShortTime(r.arrival), score: (r) => Date.parse(r.arrival) },
  { label: "Severe+ mi", cell: (r) => Math.round(severeMiles(r)), score: severeMiles },
  { label: "High mi", cell: (r) => Math.round(r.summary.high_mi), score: (r) => r.summary.high_mi },
  ...FACTORS.map(
    ([key, label]): Row => ({
      label: `Worst ${label.toLowerCase()}`,
      cell: (r) => {
        const level = factorPeaks(r)[key];
        return (
          <>
            <RiskDot risk={level} />
            {RISK_LABEL[level]}
          </>
        );
      },
      score: (r) => riskIndex(factorPeaks(r)[key]),
    }),
  ),
];

/** The three routes side by side, one column each, with the best value in every row marked. */
export function RouteComparison({ routes, selectedId, onSelect }: Props) {
  const sel = (r: Route) => (r.id === selectedId ? "sel" : "");

  return (
    <table className="comparison">
      <thead>
        <tr>
          <th />
          {routes.map((r) => (
            <th key={r.id} className={sel(r)}>
              <button onClick={() => onSelect(r.id)} aria-pressed={r.id === selectedId}>
                Route {r.id}
                <span className={`badge${r.recommended ? " recommended" : ""}`}>{r.recommended ? "Best" : `#${r.rank}`}</span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const scores = routes.map(row.score);
          const best = Math.min(...scores);
          const tie = scores.every((s) => s === best); // nothing to point out when all routes match
          return (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {routes.map((r, i) => (
                <td key={r.id} className={`${sel(r)} ${!tie && scores[i] === best ? "best" : ""}`} onClick={() => onSelect(r.id)}>
                  {row.cell(r)}
                </td>
              ))}
            </tr>
          );
        })}
        <tr>
          <th scope="row">Risk mix</th>
          {routes.map((r) => (
            <td key={r.id} className={sel(r)} onClick={() => onSelect(r.id)}>
              <div className="risk-bar" title="Miles at each risk level">
                {RISK_ORDER.filter((lvl) => r.summary[MILES_AT[lvl]] > 0).map((lvl) => (
                  <span key={lvl} style={{ flexGrow: r.summary[MILES_AT[lvl]], background: riskHex(lvl) }} />
                ))}
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
