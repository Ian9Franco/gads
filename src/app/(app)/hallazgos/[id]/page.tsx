import Link from "next/link";
import { notFound } from "next/navigation";
import { decisionAction, explainAction } from "@/app/actions";
import { confidenceLabel, SEVERITY_LABEL, STATUS_LABEL } from "@/components/labels";
import { formatDate } from "@/lib/format";
import { getStore } from "@/lib/store";

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ explicacion?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const store = getStore();
  const [finding, decisions, customers] = await Promise.all([
    store.getFinding(id),
    store.listDecisions(id),
    store.listCustomers(),
  ]);
  if (!finding) notFound();
  const customer = customers.find((item) => item.id === finding.customerId) ?? null;
  const percent = Math.round(finding.confidence * 100);

  return (
    <>
      <p className="kicker">
        <Link href="/hallazgos">Hallazgos</Link> · {customer?.name}
      </p>
      <div className="meta">
        <span className={`badge ${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
        <span className="badge neutral">{STATUS_LABEL[finding.status]}</span>
        <span className="badge neutral">Confianza {confidenceLabel(finding.confidence)} · {percent}%</span>
      </div>
      <h1>{finding.title}</h1>
      <p className="lede">{finding.summary}</p>
      <p className="note">
        Período {formatDate(finding.periodStart)} – {formatDate(finding.periodEnd)}
        {finding.campaignName ? ` · ${finding.campaignName}` : ""} · {finding.entityName}
      </p>
      <section className="metrics" aria-label="Métricas del hallazgo">
        {finding.metrics.map((metric) => (
          <article key={metric.label} className="metric">
            <span>{metric.label}</span>
            <b>{metric.value}</b>
          </article>
        ))}
      </section>
      <section className="card">
        <h2>Sugerencia</h2>
        <p>{finding.suggestion}</p>
        {finding.impactEstimate ? <p className="note">{finding.impactEstimate}</p> : null}
      </section>
      <section className="card" style={{ marginTop: "0.8rem" }}>
        <h2>Por qué esta confianza</h2>
        <p>{finding.confidenceReason}</p>
      </section>
      {finding.caution ? <p className="callout caution">{finding.caution}</p> : null}
      {finding.interpretation ? (
        <section className="card" style={{ marginTop: "0.8rem" }}>
          <h2>Lectura</h2>
          <p>{finding.interpretation}</p>
          <p className="note">
            Paráfrasis de la evidencia. No agrega un diagnóstico. Modelo: {finding.interpretationModel}.
          </p>
        </section>
      ) : (
        <form action={explainAction} className="actions" style={{ marginTop: "0.8rem" }}>
          <input type="hidden" name="findingId" value={finding.id} />
          <button className="secondary" type="submit">
            Redactar lectura con IA
          </button>
          <p className="note">Si la redacción cita una cifra que no está en la evidencia, no se guarda.</p>
        </form>
      )}
      {query.explicacion ? <p className="callout error">{query.explicacion}</p> : null}
      <section className="card" style={{ marginTop: "0.8rem" }}>
        <h2>Tu decisión</h2>
        <p className="note">Queda registrada acá. Google Ads no se modifica.</p>
        <form action={decisionAction}>
          <input type="hidden" name="findingId" value={finding.id} />
          <label>
            Nota
            <textarea name="note" placeholder="Qué viste al revisarlo" />
          </label>
          <div className="actions" style={{ marginTop: "0.7rem" }}>
            <button type="submit" name="decision" value="accepted">La voy a hacer</button>
            <button type="submit" name="decision" value="done">Ya lo hice</button>
            <button className="secondary" type="submit" name="decision" value="dismissed">Descartar</button>
            {finding.status !== "open" ? (
              <button className="secondary" type="submit" name="decision" value="reopened">Reabrir</button>
            ) : null}
          </div>
        </form>
        {decisions.length > 0 ? (
          <ol>
            {decisions.map((decision) => (
              <li key={decision.id}>
                {decisionLabel(decision.action)}
                {decision.note ? ` — ${decision.note}` : ""}
                <span className="note"> · {new Date(decision.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </>
  );
}

function decisionLabel(action: string): string {
  if (action === "accepted") return "Marcado para hacer";
  if (action === "done") return "Marcado como hecho";
  if (action === "dismissed") return "Descartado";
  return "Reabierto";
}
