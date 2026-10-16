import { formatTime } from "../lib/format";
import { riskHex } from "../lib/risk";
import { BRIEF_WINDOW_HOURS, type RiskBand, type SliderMark } from "../lib/timeline";

interface Props {
  start: Date;
  hour: number;
  maxHour: number;
  marks: SliderMark[];
  bands: RiskBand[]; // the selected route's risk over time, drawn as a strip above the track
  ready: boolean;
  status?: string; // replaces the time label, e.g. while loading
  note?: string; // appended to the time label, e.g. where the truck is
  playing: boolean;
  fullWindow?: { on: boolean; onToggle: (on: boolean) => void }; // only offered for trips under 48h
  onChange: (hour: number) => void;
  onTogglePlay: () => void;
}

const THUMB_PX = 16;

export function HourSlider({ start, hour, maxHour, marks, bands, ready, status, note, playing, fullWindow, onChange, onTogglePlay }: Props) {
  // Match the thumb's travel range so marks and bands line up with the hour they belong to.
  const at = (h: number) => `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${Math.min(Math.max(h / maxHour, 0), 1)})`;
  const span = (from: number, to: number) => `calc((100% - ${THUMB_PX}px) * ${(to - from) / maxHour})`;
  const arrival = marks.find((m) => m.label === "Arrive" && m.hour < maxHour);

  return (
    <div className="hour-slider">
      <button className="play" onClick={onTogglePlay} disabled={!ready} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="track">
        <div className="risk-strip" aria-hidden="true" title="Risk on the selected route at each hour">
          {bands.map((b) => (
            <span key={b.from} style={{ left: at(b.from), width: span(b.from, b.to), background: riskHex(b.risk) }} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={maxHour}
          step={1}
          value={hour}
          disabled={!ready}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Forecast hour"
        />
        <div className="marks" aria-hidden="true">
          {/* In the full 48h view, shade the forecast-only part after the truck has arrived. */}
          {arrival && <span className="after-arrival" style={{ left: at(arrival.hour) }} />}
          {marks.map((m) => (
            <span key={`${m.kind}-${m.hour}`} className={`mark ${m.kind}${m.hour >= maxHour ? " at-end" : ""}`} style={{ left: at(m.hour) }}>
              <span className="mark-label">{m.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="hour-label">
        {status ?? (
          <>
            <strong>{formatTime(new Date(start.getTime() + hour * 3600_000))}</strong>
            <span className="muted">
              {" "}
              · +{hour}h{note && ` · ${note}`}
            </span>
          </>
        )}
        {fullWindow && (
          <label className="checkbox full-window" title="The brief's 0–48 hour forecast window">
            <input type="checkbox" checked={fullWindow.on} onChange={(e) => fullWindow.onToggle(e.target.checked)} /> Show full {BRIEF_WINDOW_HOURS}h
          </label>
        )}
      </div>
    </div>
  );
}
