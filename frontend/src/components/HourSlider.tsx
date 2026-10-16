import { useEffect } from "react";

import { formatTime } from "../lib/format";
import { BRIEF_WINDOW_HOURS, type SliderMark } from "../lib/timeline";

interface Props {
  start: Date;
  hour: number;
  maxHour: number;
  playing: boolean;
  disabled: boolean;
  status?: string; // replaces the time label, e.g. while loading
  note?: string; // appended to the time label, e.g. where the truck is
  marks: SliderMark[];
  fullWindow?: { on: boolean; onToggle: (on: boolean) => void }; // only offered for trips under 48h
  onChange: (hour: number) => void;
  onTogglePlay: () => void;
}

const STEP_MS = 300;
const THUMB_PX = 16;

export function HourSlider({ start, hour, maxHour, playing, disabled, status, note, marks, fullWindow, onChange, onTogglePlay }: Props) {
  useEffect(() => {
    if (!playing) return;
    // Loop back to the start so "play" can be left running during a demo.
    const id = window.setInterval(() => onChange(hour >= maxHour ? 0 : hour + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, hour, maxHour, onChange]);

  const at = new Date(start.getTime() + hour * 3600_000);
  // Match the thumb's travel range so marks line up with the hour they label.
  const position = (h: number) => `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${Math.min(Math.max(h / maxHour, 0), 1)})`;
  const arrival = marks.find((m) => m.label === "Arrive" && m.hour < maxHour);

  return (
    <div className="hour-slider">
      <button className="play" onClick={onTogglePlay} disabled={disabled} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="track">
        <input
          type="range"
          min={0}
          max={maxHour}
          step={1}
          value={hour}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Forecast hour"
        />
        <div className="marks" aria-hidden="true">
          {/* In the full 48h view, shade the forecast-only part after the truck has arrived. */}
          {arrival && <span className="after-arrival" style={{ left: position(arrival.hour) }} />}
          {marks.map((m) => (
            <span key={`${m.kind}-${m.hour}`} className={`mark ${m.kind}${m.hour >= maxHour ? " at-end" : ""}`} style={{ left: position(m.hour) }}>
              <span className="mark-label">{m.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="hour-label">
        {status ?? (
          <>
            <strong>{formatTime(at)}</strong>
            <span className="muted">
              {" "}· +{hour}h{note && ` · ${note}`}
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
