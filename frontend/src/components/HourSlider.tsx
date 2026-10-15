import { useEffect } from "react";

import { formatTime } from "../lib/format";
import { SLIDER_HOURS, type SliderMark } from "../lib/timeline";

interface Props {
  start: Date;
  hour: number;
  playing: boolean;
  disabled: boolean;
  status?: string;
  marks: SliderMark[];
  onChange: (hour: number) => void;
  onTogglePlay: () => void;
}

const STEP_MS = 300;
const THUMB_PX = 16;

export function HourSlider({ start, hour, playing, disabled, status, marks, onChange, onTogglePlay }: Props) {
  useEffect(() => {
    if (!playing) return;
    // Loop back to the start so "play" can be left running during a demo.
    const id = window.setInterval(() => onChange(hour >= SLIDER_HOURS ? 0 : hour + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, hour, onChange]);

  const at = new Date(start.getTime() + hour * 3600_000);
  // Match the thumb's travel range so marks line up with the hour they label.
  const position = (h: number) => `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${Math.min(Math.max(h / SLIDER_HOURS, 0), 1)})`;

  return (
    <div className="hour-slider">
      <button className="play" onClick={onTogglePlay} disabled={disabled} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="track">
        <input
          type="range"
          min={0}
          max={SLIDER_HOURS}
          step={1}
          value={hour}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Forecast hour"
        />
        <div className="marks" aria-hidden="true">
          {marks.map((m) => (
            <span key={`${m.kind}-${m.hour}`} className={`mark ${m.kind}`} style={{ left: position(m.hour) }}>
              <span className="mark-label">{m.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="hour-label">
        {status ?? (
          <>
            <strong>{formatTime(at)}</strong>
            <span className="muted"> · departure +{hour}h</span>
          </>
        )}
      </div>
    </div>
  );
}
