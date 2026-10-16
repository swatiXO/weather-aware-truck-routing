import { useEffect, useState } from "react";

import type { PlanRequest } from "../api/types";
import { nextWholeHour, toLocalInput } from "../lib/format";

interface Props {
  loading: boolean;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (req: PlanRequest) => void;
  runExample?: number; // bump to fill in and plan the example trip (used by the intro panel)
}

const INTERVALS = [10, 25, 50] as const;
const EXAMPLE = { origin: "Dallas, TX", destination: "Denver, CO" };

export function TripForm({ loading, fieldErrors, onSubmit, runExample = 0 }: Props) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departure, setDeparture] = useState(() => toLocalInput(nextWholeHour()));
  const [load, setLoad] = useState("42000");
  const [interval, setIntervalMi] = useState<(typeof INTERVALS)[number]>(25);
  const [hos, setHos] = useState(true);

  const request = (from: string, to: string): PlanRequest => ({
    origin: from,
    destination: to,
    departure: new Date(departure).toISOString(),
    load_lb: Number(load),
    interval_mi: interval,
    hos_breaks: hos,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(request(origin, destination));
  };

  useEffect(() => {
    if (!runExample) return;
    setOrigin(EXAMPLE.origin);
    setDestination(EXAMPLE.destination);
    onSubmit(request(EXAMPLE.origin, EXAMPLE.destination));
    // Only re-run when the intro panel asks again, not on every keystroke.
  }, [runExample]);

  const err = (name: string) => fieldErrors?.[name]?.[0] && <span className="field-error">{fieldErrors[name][0]}</span>;

  return (
    <form className="trip-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="origin">Origin</label>
        <input id="origin" required value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="City, state or lat, lon" />
        {err("origin")}
      </div>
      <div className="field">
        <div className="field-head">
          <label htmlFor="destination">Destination</label>
          <button
            type="button"
            className="link small"
            onClick={() => {
              setOrigin(destination);
              setDestination(origin);
            }}
            title="Swap origin and destination"
          >
            ⇅ Swap
          </button>
        </div>
        <input id="destination" required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, state or lat, lon" />
        {err("destination")}
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="departure">Departure</label>
          <input id="departure" type="datetime-local" required value={departure} onChange={(e) => setDeparture(e.target.value)} />
          {err("departure")}
        </div>
        <div className="field narrow">
          <label htmlFor="load">Load (lb)</label>
          <input id="load" type="number" required min={1} max={80000} step={1} value={load} onChange={(e) => setLoad(e.target.value)} />
          {err("load_lb")}
        </div>
      </div>
      <div className="row align-end">
        <div className="field">
          <span className="label">Checkpoint every</span>
          <div className="segmented" role="radiogroup" aria-label="Checkpoint interval">
            {INTERVALS.map((v) => (
              <button type="button" key={v} role="radio" aria-checked={interval === v} className={interval === v ? "on" : ""} onClick={() => setIntervalMi(v)}>
                {v} mi
              </button>
            ))}
          </div>
        </div>
        <label className="checkbox" title="Adds a 30-minute break after every 8 hours of driving">
          <input type="checkbox" checked={hos} onChange={(e) => setHos(e.target.checked)} /> HOS breaks
        </label>
      </div>
      <button type="submit" className="primary" disabled={loading}>
        {loading ? "Planning…" : "Plan routes"}
      </button>
    </form>
  );
}
