# Fanger · Auditor de Google Ads

Auditor de solo lectura para las cuentas de Google Ads a las que tenés acceso. Detecta errores y oportunidades con reglas sobre métricas del período, guarda tu decisión y no modifica campañas.

Sirve para los dos modos de acceso:

- **MCC:** el usuario administra una cuenta administradora. El auditor lista los clientes y consulta cada uno con `login-customer-id`.
- **Invitación directa:** cada cliente sumó tu correo a su cuenta. Esas cuentas aparecen en `listAccessibleCustomers` y se leen sin MCC.

La muestra **Da Milán** está disponible sin credenciales.

## Qué revisa

- Gasto de campaña, palabra clave o término de búsqueda sin conversiones, solo si hay seguimiento activo.
- Caída de CTR entre los 14 días recientes y los 14 anteriores.
- Campaña con CPA mejor que la cuenta y impresiones perdidas por presupuesto.
- Presupuesto concentrado en una campaña que rinde peor.
- Anuncios rechazados y anuncios con CTR muy por debajo de su campaña.
- Recomendaciones de Google, marcadas para revisar. No se toman como beneficiosas por defecto.

Si no hay acciones de conversión activas, el hallazgo es de seguimiento y no se diagnostica “gasto sin conversiones”.

La lectura con IA, si la pedís, solo puede parafrasear las cifras del hallazgo. Si cita un número que no está en la evidencia, se descarta.

## Solo lectura

Google Ads no ofrece un alcance OAuth exclusivamente de lectura. El cliente HTTP solo permite `listAccessibleCustomers` y `googleAds:search`. En Google Ads, dale a la identidad acceso de solo lectura.

## Configuración

Los pasos para salir de la muestra y leer clientes reales están en [docs/leer-clientes-reales.md](docs/leer-clientes-reales.md). Las mejoras hechas y las que faltan decidir están en [docs/mejoras.md](docs/mejoras.md).

1. Habilitá **Google Ads API** en un proyecto de Google Cloud. Desde el 9 de septiembre de 2026 el developer token no se usa. El nivel de acceso pertenece al proyecto.
2. Si el proyecto está en Test, pedí **Explorer** en la página de Google Ads API (hasta 2.880 operaciones por día contra cuentas reales).
3. Creá un cliente OAuth web con la URL de retorno `/api/google/callback`.
4. Copiá `.env.example` a `.env.local`.

Sin `SUPABASE_URL` y `SUPABASE_SECRET_KEY`, los datos quedan en `.data/store.json`. Con Supabase, aplicá `supabase/migrations/20261022183000_auditor_schema.sql`. Las tablas tienen RLS activado y ningún permiso para `anon` ni `authenticated`: las lee el servidor con la clave secreta.

`GET /api/cron/audit` corre la auditoría de las cuentas conectadas. En Vercel está programada a las 08:00, hora de Argentina. Requiere `CRON_SECRET`.

## Scripts

```bash
npm test
npm run dev
npm run build
```
