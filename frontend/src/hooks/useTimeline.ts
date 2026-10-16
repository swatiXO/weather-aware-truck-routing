import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { HeatmapGrid, Plan, Route } from "../api/types";
import { BRIEF_WINDOW_HOURS, floorHour, hoursBetween, riskBands, sliderMarks, truckStatus } from "../lib/timeline";

const PLAY_STEP_MS = 300;

const isTypingTarget = (t: EventTarget | null) =>
  (t instanceof HTMLInputElement && t.type !== "range") || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement;

/** Everything the forecast slider needs: its range, the current hour, playback and labels. */
export function useTimeline(plan: Plan | null, selected: Route | null, heatmap: UseQueryResult<HeatmapGrid>) {
  const [rawHour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullWindow, setFullWindow] = useState(false);

  useEffect(() => {
    setHour(0);
    setPlaying(false);
  }, [plan?.plan_id]);

  const start = useMemo(() => heatmap.data?.start ?? (plan ? floorHour(plan.departure) : new Date()), [heatmap.data, plan]);

  // The slider runs to the selected route's arrival. Short trips can expand it to the brief's
  // 0-48h window; either way it can't go past the hours the heatmap actually has.
  const tripHours = selected ? Math.max(1, Math.ceil(hoursBetween(start, new Date(selected.arrival)))) : BRIEF_WINDOW_HOURS;
  const shortTrip = tripHours < BRIEF_WINDOW_HOURS;
  const dataHours = heatmap.data ? heatmap.data.hours - 1 : BRIEF_WINDOW_HOURS;
  const maxHour = Math.min(dataHours, shortTrip && fullWindow ? BRIEF_WINDOW_HOURS : tripHours);
  const hour = Math.min(rawHour, maxHour); // switching to a shorter route mustn't leave the thumb off the end
  const ready = !!heatmap.data;

  const marks = useMemo(
    () => (plan ? sliderMarks(start, plan.departure, selected?.arrival ?? null, maxHour) : []),
    [plan, start, selected?.arrival, maxHour],
  );
  const bands = useMemo(() => (selected ? riskBands(selected, start, maxHour) : []), [selected, start, maxHour]);

  // Loop back to the start so "play" can be left running during a demo.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (Math.min(h, maxHour) >= maxHour ? 0 : Math.min(h, maxHour) + 1)), PLAY_STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, maxHour]);

  // Space toggles playback, unless the user is typing or pressing a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !ready || isTypingTarget(e.target) || document.querySelector(".tour")) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  const time = new Date(start.getTime() + hour * 3600_000);

  let status: string | undefined;
  if (!plan) status = "Plan a trip to see the forecast";
  else if (heatmap.isLoading) status = "Loading forecast grid…";
  else if (heatmap.isError) status = `Heatmap unavailable: ${heatmap.error.message}`;

  return {
    start,
    hour,
    setHour,
    maxHour,
    marks,
    bands,
    ready,
    status,
    playing,
    togglePlay: () => setPlaying((p) => !p),
    truckSeconds: plan ? (time.getTime() - new Date(plan.departure).getTime()) / 1000 : null,
    truckNote: selected ? truckStatus(selected, time) : undefined,
    fullWindow:
      plan && shortTrip
        ? {
            on: fullWindow,
            onToggle: (on: boolean) => {
              setFullWindow(on);
              if (!on) setHour((h) => Math.min(h, tripHours));
            },
          }
        : undefined,
  };
}
