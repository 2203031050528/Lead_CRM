const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const pad = (n: number) => String(n).padStart(2, "0");

export const formatMoney = (v: string | number | null | undefined) => money.format(Number(v ?? 0));

/** Parses API values. Date-only strings ("2026-10-08") are local dates, not UTC midnight. */
export function parseDate(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

export function formatDate(v: string | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = parseDate(v);
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** "3 hours ago", "in 2 days", "yesterday". Works for past and future. */
export function timeAgo(v: string): string {
  const seconds = (parseDate(v).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const [unit, size] = units.find(([, s]) => abs >= s) ?? units[units.length - 1];
  return relative.format(Math.round(seconds / size), unit);
}

/** Local calendar date as YYYY-MM-DD. */
export const localDateString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Value for <input type="datetime-local"> in the browser's timezone. */
export const toLocalInput = (d: Date) => `${localDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** <input type="datetime-local"> value → ISO string (the input is local time). */
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today, 3:00 PM", "Tomorrow, 9:00 AM", "Mon, Oct 12, 3:00 PM". */
export function formatDue(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export const isPast = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() < Date.now();

const compactMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat();

/** $1.2M, $408K, $950 — for stat tiles and chart labels. */
export const formatCompactMoney = (v: string | number) => compactMoney.format(Number(v));
export const formatCount = (v: number) => count.format(v);
export const formatPercent = (ratio: number) =>
  `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.1 ? 1 : 0)}%`;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
