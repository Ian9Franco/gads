export function moneyMicros(units: number): number {
  return Math.round(units * 1_000_000);
}

export function formatMoney(micros: number, currency: string): string {
  const amount = micros / 1_000_000;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
}

export function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 10) return id;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function ctr(metrics: { clicks: number; impressions: number }): number {
  if (metrics.impressions <= 0) return 0;
  return metrics.clicks / metrics.impressions;
}

export function cpa(metrics: { costMicros: number; conversions: number }): number | null {
  if (metrics.conversions <= 0) return null;
  return metrics.costMicros / metrics.conversions;
}
