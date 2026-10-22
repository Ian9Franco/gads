import Link from "next/link";
import { confidenceLabel, SEVERITY_LABEL, STATUS_LABEL } from "@/components/labels";
import { formatDate } from "@/lib/format";
import { getStore } from "@/lib/store";

export default async function HomePage() {
  const store = getStore();
  const [customers, findings] = await Promise.all([store.listCustomers(), store.listFindings()]);
  const open = findings.filter((finding) => finding.status === "open");
  const today = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));

  return (
    <>
      <p className="kicker">{today}</p>
      <h1>Lo que conviene revisar hoy.</h1>
      <p className="lede">
        Cada hallazgo sale de una regla sobre métricas reales del período. La confianza mide la muestra y el seguimiento, no una opinión del modelo. Nada de esto modifica las campañas.
      </p>
      <section className="stats" aria-label="Resumen">
        <article className="stat">
          <b>{open.filter((finding) => finding.severity === "error").length}</b>
          <span>Errores abiertos</span>
        </article>
        <article className="stat">
          <b>{open.filter((finding) => finding.severity === "opportunity").length}</b>
          <span>Oportunidades abiertas</span>
        </article>
        <article className="stat">
          <b>{customers.filter((customer) => !customer.isDemo).length}</b>
          <span>Cuentas conectadas</span>
        </article>
      </section>
      {customers.every((customer) => customer.isDemo) ? (
        <p className="callout">
          Estás viendo la cuenta de muestra Da Milán. <Link href="/conectar">Conectá Google Ads</Link> para auditar las cuentas a las que tenés acceso, sea por MCC o por invitación directa.
        </p>
      ) : null}
      <div className="finding-list">
        {open.slice(0, 6).map((finding) => (
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
                {formatDate(finding.periodStart)} – {formatDate(finding.periodEnd)}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
