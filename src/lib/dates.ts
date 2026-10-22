export type DateWindow = {
  recentStart: string;
  recentEnd: string;
  previousStart: string;
  previousEnd: string;
};

function isoInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function auditWindow(now: Date, timeZone: string, days = 14): DateWindow {
  const today = isoInTimeZone(now, timeZone);
  const recentEnd = addDays(today, -1);
  const recentStart = addDays(recentEnd, -(days - 1));
  const previousEnd = addDays(recentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return { recentStart, recentEnd, previousStart, previousEnd };
}

export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}
