import type { RiskName } from "../api/types";
import { riskHex } from "../lib/risk";

export function RiskDot({ risk }: { risk: RiskName }) {
  return <span className="dot" style={{ background: riskHex(risk) }} aria-hidden="true" />;
}
