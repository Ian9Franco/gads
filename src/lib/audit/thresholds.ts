const MIN_WASTE_UNITS: Record<string, number> = {
  ARS: 15_000,
  CLP: 15_000,
  COP: 80_000,
  MXN: 400,
  UYU: 800,
  BRL: 80,
  USD: 25,
  EUR: 25,
};

export function minWasteMicros(currency: string): number {
  const units = MIN_WASTE_UNITS[currency] ?? 50;
  return units * 1_000_000;
}
