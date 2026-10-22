import Link from "next/link";
import { confidenceLabel, SEVERITY_LABEL, STATUS_LABEL } from "@/components/labels";
import type { Severity } from "@/lib/audit/types";
import { formatDate } from "@/lib/format";
import { getStore } from "@/lib/store";
import type { FindingStatus } from "@/lib/store/types";

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; gravedad?: string; cuenta?: string }>;
}) {
  const params = await searchParams;
  const status = (params.estado || "open") as FindingStatus | "all";
  const severity = (params.gravedad || "all") as Severity | "all";
  const store = getStore();
  const [customers, findings] = await Promise.all([
    store.listCustomers(),
    store.listFindings({
      status,
      severity,
      customerId: params.cuenta || undefined,
    }),
  ]);
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));

  return (
    <>
      <p className="kicker">Hallazgos</p>
      <h1>Evidencia, no intuición.</h1>
      <form className="filters" method="get">
        <label>
          Estado
          <select name="estado" defaultValue={status}>
            <option value="open">Abiertos</option>
            <option value="accepted">Para hacer</option>
            <option value="done">Hechos</option>
            <option value="dismissed">Descartados</option>
            <option value="resolved">Resueltos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label>
          Gravedad
          <select name="gravedad" defaultValue={severity}>
            <option value="all">Todas</option>
            <option value="error">Errores</option>
            <option value="warning">Avisos</option>
            <option value="opportunity">Oportunidades</option>
          </select>
        </label>
        <label>
          Cuenta
          <select name="cuenta" defaultValue={params.cuenta || ""}>
            <option value="">Todas</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>
      {findings.length === 0 ? (
        <p className="callout">No hay hallazgos con estos filtros.</p>
      ) : (
        <div className="finding-list">
          {findings.map((finding) => (
            <article key={finding.id} className="card">
              <Link className="block" href={`/hallazgos/${finding.id}`}>
                <div className="meta">
                  <span className={`badge ${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
                  <span>{names.get(finding.customerId)}</span>
                  <span>{STATUS_LABEL[finding.status]}</span>
                  <span>Confianza {confidenceLabel(finding.confidence)}</span>
                </div>
                <h2>{finding.title}</h2>
                <p>{finding.summary}</p>
                <p className="note">
                  {finding.entityName} · {formatDate(finding.periodStart)} – {formatDate(finding.periodEnd)}
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
