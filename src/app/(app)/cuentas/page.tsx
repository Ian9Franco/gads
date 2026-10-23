import Link from "next/link";
import { auditAction, auditAllAction } from "@/app/actions";
import { formatCustomerId, formatDate } from "@/lib/format";
import { getStore } from "@/lib/store";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; conectada?: string; auditada?: string; aviso?: string; lote?: string; fallidas?: string }>;
}) {
  const params = await searchParams;
  const store = getStore();
  const [customers, runs] = await Promise.all([store.listCustomers(), store.listRuns()]);

  return (
    <>
      <p className="kicker">Cuentas</p>
      <h1>Las cuentas que podés auditar.</h1>
      <p className="lede">
        Si entrás por una cuenta administradora, el acceso figura como MCC. Si el cliente te invitó a su cuenta, figura como acceso directo. Las dos se descubren solas al conectar Google.
      </p>
      {params.conectada ? <p className="callout">Conexión guardada. Corré la primera auditoría cuando quieras.</p> : null}
      {params.aviso ? <p className="callout">{params.aviso}</p> : null}
      {params.lote ? (
        <p className="callout">
          Auditorías hechas: {params.lote}. Con error: {params.fallidas ?? "0"}.
        </p>
      ) : null}
      {params.error ? <p className="callout error">{params.error}</p> : null}
      <p className="actions">
        <Link className="button" href="/api/google/start">Conectar Google Ads</Link>
        {customers.some((customer) => !customer.isDemo) ? (
          <form action={auditAllAction}>
            <button type="submit">Auditar todas</button>
          </form>
        ) : null}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Acceso</th>
              <th>Última auditoría</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const last = runs.find((run) => run.customerId === customer.id);
              return (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.name}</strong>
                    <div className="note">
                      {customer.isDemo ? "Muestra" : formatCustomerId(customer.externalId)} · {customer.currencyCode}
                    </div>
                    {customer.lastAuditError ? <div className="note">{customer.lastAuditError}</div> : null}
                  </td>
                  <td>{accessLabel(customer.access, customer.loginCustomerId)}</td>
                  <td>
                    {customer.lastAuditAt ? formatDate(customer.lastAuditAt.slice(0, 10)) : "Todavía no"}
                    {last?.message ? <div className="note">{last.message}</div> : null}
                    {params.auditada === customer.id ? <div className="note">Auditoría actualizada.</div> : null}
                  </td>
                  <td>
                    <form action={auditAction}>
                      <input type="hidden" name="customerId" value={customer.id} />
                      <button type="submit">Auditar</button>
                    </form>
                    <div style={{ marginTop: "0.4rem" }}>
                      <Link href={`/hallazgos?cuenta=${customer.id}&estado=all`}>Ver hallazgos</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function accessLabel(access: string, loginCustomerId: string | null): string {
  if (access === "demo") return "Cuenta de muestra";
  if (access === "mcc" && loginCustomerId) return `MCC ${formatCustomerId(loginCustomerId)}`;
  if (access === "direct") return "Invitación directa";
  return access;
}
