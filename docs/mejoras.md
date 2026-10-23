# Mejoras

Revisión del auditor después de la guía de clientes reales. Lo de abajo está partido en lo que ya quedó en el código y lo que conviene decidir antes de construirlo.

## Ya en el código

Estas fallas aparecían al leer cuentas de producción, no en la muestra Da Milán.

- La consulta de campañas ya no pide `search_budget_lost_impression_share` para todos los canales. Esa métrica solo existe en búsqueda. En una cuenta con Performance Max, Display o video, Google rechazaba la auditoría entera. Ahora el gasto sale de una consulta y las impresiones perdidas por presupuesto, de otra limitada a búsqueda. Si la segunda falla, el resto de la auditoría sigue y la nota queda en la cuenta.
- Un anuncio rechazado sin impresiones en los 28 días no volvía en la consulta con fecha. Hay una lectura aparte, sin métricas, de anuncios activos con `DISAPPROVED`.
- Dos palabras clave de distintos grupos podían compartir `criterion_id` y fundirse en un solo hallazgo. La clave ahora incluye el grupo de anuncios.
- Palabras clave y términos de búsqueda se piden solo si tuvieron gasto. Anuncios con métricas, solo si tuvieron impresiones. Baja la cuota y el ruido.
- Si una cuenta de `listAccessibleCustomers` no se puede leer, las demás se guardan igual. Cuentas muestra la primera omitida.
- La misma cuenta vista por MCC y por invitación directa queda una sola vez, con el acceso MCC, porque ese es el que necesita `login-customer-id`.
- Las cuentas de prueba y las ocultas de una MCC no entran en la lista.
- El mensaje de error de Google Ads usa el detalle de la API, no solo «Request contains an invalid argument».
- Volver a conectar con el mismo correo actualiza el refresh token. No acumula conexiones.
- En Cuentas, **Auditar todas** corre las cuentas conectadas y dice cuántas salieron y cuántas fallaron. El cron ya hacía eso.

## Propuestas

Ninguna de estas cambia campañas. Hacen falta una decisión tuya, o son más grandes que un ajuste de lectura.

### Para que la conexión dure

- Publicar la app OAuth saca el vencimiento de 7 días del refresh token. Puede pedir la verificación del alcance de Google Ads. Mientras siga en Prueba, reconectar cada semana alcanza para una sola persona.
- Antes de dejar la URL en internet: `APP_PASSWORD` y, en Vercel, `SUPABASE_URL` más `SUPABASE_SECRET_KEY`. Sin Supabase el disco del deploy no conserva el token.
- Subir de Explorer a Basic solo si el cron diario se acerca a 2.880 operaciones. Cada cuenta gasta unas pocas consultas. Con decenas de clientes, Explorer sobra.

### Lecturas que el auditor todavía no hace

- Performance Max no entra en `keyword_view` ni en `search_term_view`. Para auditarlo harían falta grupos de recursos y, si aplica, grupos de fichas. Es otro conjunto de reglas, no un filtro más.
- Impresiones de búsqueda perdidas por ranking, nivel de calidad y el historial de cambios explicarían varias caídas de CTR que hoy solo se describen. El historial es lectura, pero hay que decidir qué cambios merecen un hallazgo.
- Un enlace desde el hallazgo a la campaña en Google Ads. La URL estable pide el `ocid` de la interfaz, que esta API no devuelve en la consulta actual. Se puede armar cuando confirmemos un enlace que abra la cuenta correcta.
- Umbral de gasto sin conversiones para monedas que no están en `src/lib/audit/thresholds.ts`. Hoy una moneda desconocida usa 50 unidades. Si aparece una cuenta en esa moneda, el piso hay que fijarlo a propósito.
- Cuentas que desaparecen de la MCC al reconectar siguen en el panel. Borrarlas o marcarlas como «ya no accesibles» es mejor que dejarlas y que la auditoría falle en silencio. No las borro solo porque pueden tener decisiones guardadas.

### Forma de trabajar

- La lectura con IA necesita el AI Gateway de Vercel (`AI_MODEL` y la clave del proyecto). Si no está, el botón de un hallazgo muestra el error y no guarda texto. No hace falta para las reglas.
- El cron de Vercel puede cortarse si hay muchas cuentas. Ahí hay que subir `maxDuration` de la función o partir la corrida. Con pocas cuentas no cambia nada.
- Tokens viejos, de un correo que ya no se usa, siguen en el almacén. El reemplazo nuevo cubre el mismo correo. Limpiar los demás es a mano.
