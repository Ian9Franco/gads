import { redirect } from "next/navigation";
import { connection } from "next/server";
import { loginAction } from "@/app/actions";
import { hasAccess, passwordRequired } from "@/lib/auth";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  if (!passwordRequired() || (await hasAccess())) redirect("/");
  const params = await searchParams;
  return (
    <main className="gate">
      <p className="kicker">Fanger</p>
      <h1>Acceso</h1>
      <p className="lede">Este auditor guarda tokens de Google Ads. Entrá con la clave del operador.</p>
      {params.error ? <p className="callout error">La clave no coincide.</p> : null}
      <form action={loginAction} className="grid">
        <label>
          Clave
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
