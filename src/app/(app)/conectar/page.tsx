import Link from "next/link";
import { googleConfigured } from "@/lib/google-ads/client";
import { usingSupabase } from "@/lib/store";

const ERRORS: Record<string, string> = {
  "faltan-credenciales": "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.",
  "estado-invalido": "La vuelta de Google no coincidió con la sesión. Probá conectar de nuevo.",
  "sin-refresh-token": "Google no entregó un refresh token. Volvé a conectar y aceptá el permiso.",
  "sin-cuentas": "La identidad no tiene cuentas de Google Ads accesibles.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] ?? params.error : null;

  return (
    <>
      <p className="kicker">Conexión</p>
      <h1>MCC o invitación directa.</h1>
      <p className="lede">
        No hace falta elegir de antemano. Al autorizar, el auditor lista las cuentas donde tu usuario tiene acceso directo. Si una es administradora, baja a sus clientes. Si el cliente te invitó con tu correo, esa cuenta aparece como acceso directo.
      </p>
      {error ? <p className="callout error">{error}</p> : null}
      <div className="two">
        <article className="card">
          <h2>Cuenta administradora</h2>
          <p>Entrá con el usuario que administra la MCC. El auditor guarda el identificador de la MCC y lo envía como login-customer-id al leer cada cliente.</p>
        </article>
        <article className="card">
          <h2>Invitación individual</h2>
          <p>Si cada cliente te sumó a su cuenta, esa cuenta vuelve en la lista de accesibles y se consulta sin MCC.</p>
        </article>
      </div>
      <section className="card" style={{ marginTop: "0.8rem" }}>
        <h2>Antes de conectar</h2>
        <ol>
          <li>En Google Cloud, habilitá Google Ads API. Desde el 9 de septiembre de 2026 el developer token ya no se usa: el nivel de acceso vive en el proyecto de Cloud.</li>
          <li>Si el proyecto está en Test, pedí acceso Explorer en la página de Google Ads API. Explorer permite unas 2.880 operaciones por día contra cuentas reales.</li>
          <li>Creá un cliente OAuth de tipo aplicación web y agregá la URL de retorno <code>/api/google/callback</code>.</li>
          <li>En Google Ads, dale a esa identidad acceso de solo lectura. La API no ofrece un alcance OAuth que sea exclusivamente de lectura: el permiso de la cuenta y el bloqueo del servidor impiden cambios.</li>
        </ol>
        <p>
          {googleConfigured() ? (
            <Link className="button" href="/api/google/start">Conectar con Google</Link>
          ) : (
            <span className="note">Cuando estén las credenciales, este botón inicia OAuth.</span>
          )}
        </p>
        <p className="note">
          Los datos {usingSupabase() ? "se guardan en Supabase." : "se guardan en un archivo local hasta que configures SUPABASE_URL y SUPABASE_SECRET_KEY."} El refresh token no sale al navegador.
        </p>
      </section>
    </>
  );
}
