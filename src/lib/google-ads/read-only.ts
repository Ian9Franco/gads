const ALLOWED: { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/customers:listAccessibleCustomers$/ },
  { method: "POST", pattern: /^\/customers\/\d+\/googleAds:search$/ },
  { method: "POST", pattern: /^\/customers\/\d+\/googleAds:searchStream$/ },
];

export class ReadOnlyViolation extends Error {
  constructor(method: string, path: string) {
    super(
      `Operación bloqueada. Este auditor solo consulta Google Ads (${method} ${path}).`,
    );
    this.name = "ReadOnlyViolation";
  }
}

export function assertReadOnly(method: string, path: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const allowed = ALLOWED.some(
    (entry) => entry.method === method.toUpperCase() && entry.pattern.test(normalized),
  );
  if (!allowed) throw new ReadOnlyViolation(method.toUpperCase(), normalized);
}
