import type { Route } from "../api/types";

// The brief's forecast window; short trips can expand the slider to it.
export const BRIEF_WINDOW_HOURS = 48;

export interface SliderMark {
  hour: number; // fractional hours from the slider's start
  label: string;
  kind: "depart" | "arrive" | "day";
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const arrivalFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric" });

export function floorHour(iso: string): Date {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3600_000;

/** Depart / arrive markers plus a tick at each local midnight, for a slider running 0..maxHour. */
export function sliderMarks(start: Date, departure: string, arrival: string | null, maxHour: number): SliderMark[] {
  const marks: SliderMark[] = [{ hour: hoursBetween(start, new Date(departure)), label: "Depart", kind: "depart" }];

  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  for (; hoursBetween(start, midnight) < maxHour; midnight.setDate(midnight.getDate() + 1)) {
    marks.push({ hour: hoursBetween(start, midnight), label: dayFmt.format(midnight), kind: "day" });
  }

  if (arrival) {
    const h = hoursBetween(start, new Date(arrival));
    // Very long trips can arrive after the forecast data ends; pin the marker there and say when.
    marks.push(
      h <= maxHour
        ? { hour: h, label: "Arrive", kind: "arrive" }
        : { hour: maxHour, label: `Arrives ${arrivalFmt.format(new Date(arrival))} →`, kind: "arrive" },
    );
  }
  return marks;
}

/** Where the truck is at `at`, in words. Checkpoint ETAs already include HOS breaks. */
export function truckStatus(route: Route, at: Date): string {
  const t = at.getTime();
  const cps = route.checkpoints;
  const eta = (i: number) => Date.parse(cps[i].eta);
  if (t < eta(0)) return "truck not yet departed";
  if (t === eta(0)) return "truck at the start";
  if (t >= eta(cps.length - 1)) return "truck has arrived";

  const i = cps.findIndex((_, k) => eta(k) > t);
  const mile = Math.round(cps[i - 1].mile + ((cps[i].mile - cps[i - 1].mile) * (t - eta(i - 1))) / (eta(i) - eta(i - 1)));
  const onBreak = route.breaks.some((b) => t >= Date.parse(b.start) && t < Date.parse(b.end));
  return onBreak ? `truck on a 30-min HOS break near mile ${mile}` : `truck en route, near mile ${mile}`;
}
