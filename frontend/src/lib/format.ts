const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const shortFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export const formatTime = (iso: string | Date) => timeFmt.format(typeof iso === "string" ? new Date(iso) : iso);
export const formatShortTime = (iso: string | Date) => shortFmt.format(typeof iso === "string" ? new Date(iso) : iso);

export function formatDuration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

export const formatMiles = (mi: number) => `${Math.round(mi).toLocaleString()} mi`;

/** Value for an <input type="datetime-local"> from a Date, in the browser's timezone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nextWholeHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
