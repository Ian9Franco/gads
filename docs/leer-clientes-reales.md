# Leer clientes reales, solo consulta

Checklist de lo que tenés que hacer vos para que el auditor deje la muestra Da Milán y te muestre cuentas de Google Ads de verdad. El servidor ya está limitado a dos lecturas: listar cuentas accesibles y `googleAds:search`. No crea campañas, no cambia pujas y no invita usuarios.

Hasta que completes esto, la app sigue mostrando la cuenta de muestra.

## Qué vas a ver cuando funcione

Después de conectar y apretar **Auditar** en una cuenta, el inicio lista hallazgos de los últimos 28 días (14 recientes contra los 14 anteriores):

- gasto de campaña, palabra clave o término de búsqueda sin conversiones, solo si hay seguimiento activo
- caída de CTR
- campaña con CPA mejor que la cuenta e impresiones perdidas por presupuesto
- presupuesto concentrado en una campaña que rinde peor
- anuncios rechazados y anuncios con CTR muy por debajo de su campaña
- recomendaciones de Google, marcadas para revisar

Si no hay acciones de conversión activas, el hallazgo es de seguimiento.

## 1. Proyecto de Google Cloud y nivel Explorer

Las cuentas que sirven anuncios reales solo se pueden leer si el proyecto de Cloud está en **Explorer**, **Basic** o **Standard**. Con el nivel **Test** la API responde `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` y no hay datos de clientes.

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) con el correo que va a ser dueño de la app.
2. Creá un proyecto, o elegí uno que ya uses para esto.
3. Habilitá **Google Ads API**: [biblioteca de APIs](https://console.cloud.google.com/apis/library/googleads.googleapis.com).
4. Abrí la página **Google Ads API** del proyecto (Overview / visión general).
5. Si el nivel figura como **Test**, expandí **Upgrade access level**, confirmá que el siguiente nivel es **Explorer** y apretá **Apply for access**.
6. En la mayoría de los casos Google lo aprueba solo. Volvé a esa página y confirmá que el nivel ya no es Test.

Explorer alcanza para este auditor: hasta 2.880 operaciones por día contra cuentas de producción. Una auditoría de una cuenta hace unas pocas búsquedas. No hace falta Basic ni Standard para empezar. El developer token ya no se usa (se dejó de exigir el 9 de septiembre de 2026). Dejalo vacío.

## 2. Pantalla de consentimiento

En el mismo proyecto: **APIs y servicios → Pantalla de consentimiento de OAuth**.

1. Tipo de usuarios: **Externo**, salvo que tengas Google Workspace y quieras limitarlo a tu organización (**Interno**).
2. Nombre de la app, correo de asistencia y correo del desarrollador: los tuyos.
3. Alcances: agregá `https://www.googleapis.com/auth/adwords`. El botón **Conectar** también pide `openid` y `email` para guardar qué cuenta autorizó. Google no ofrece un alcance que sea solo lectura: el permiso de solo lectura se da en Google Ads (paso 4).
4. Si la app queda en estado **Prueba**, sumá como usuario de prueba el mismo correo con el que vas a apretar Conectar. Sin eso Google rechaza el login.
5. Mientras la app esté en Prueba, el refresh token vence a los 7 días. Cuando pase, la auditoría falla y hay que volver a **Conectar**. Si la publicás (estado En producción), el token no vence por esa regla. Publicar el alcance de Google Ads puede pedir una verificación de Google; para una sola persona, dejarla en Prueba y reconectar cada semana también sirve.

## 3. Cliente OAuth de tipo aplicación web

**APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.**

URIs de redirección autorizadas, una por cada lugar donde corre el auditor:

- Local: `http://localhost:3000/api/google/callback`
- Producción: `https://TU-DOMINIO/api/google/callback`

Tiene que coincidir carácter por carácter con la URL a la que Google vuelve. `localhost` y `127.0.0.1` no son intercambiables.

Copiá el **ID de cliente** y el **secreto**. No los subas a git ni los pegues en el chat.

## 4. Solo lectura dentro de Google Ads

Entrá a Google Ads con un usuario administrador y andá a **Administrador → Acceso y seguridad**.

El correo que va a autorizar la app tiene que existir ahí con nivel **Solo lectura** (`READ_ONLY`). Ese usuario ve campañas y cambios, y Google Ads le impide editar. No uses **Estándar** ni **Administrador** para el correo que conectás: el alcance OAuth podría escribir, y la protección de la cuenta es este rol.

Elegí uno de estos dos caminos. No hace falta configurar los dos. Al autorizar, el auditor detecta cuál es.

**MCC (cuenta administradora).** Invitá ese correo a la MCC con Solo lectura. El auditor lista los clientes activos que no son administradores (`ENABLED`, nivel 1 o más) y consulta cada uno con el id de la MCC. Cuentas en pausa, canceladas o que son otra MCC no aparecen.

**Invitación directa.** En cada cliente, **Administrador → Acceso y seguridad**, invitación al mismo correo con Solo lectura. Esas cuentas aparecen como acceso directo, sin MCC.

El correo de Cloud (dueño del proyecto) y el correo de Google Ads pueden ser distintos. El que importa al apretar **Conectar** es el que tiene el acceso en Google Ads.

## 5. Variables en el servidor

Copiá `.env.example` a `.env.local` en la raíz del repo. Completá:

```bash
GOOGLE_CLIENT_ID=el id de cliente
GOOGLE_CLIENT_SECRET=el secreto
```

`GOOGLE_REDIRECT_URI` dejalo vacío si entrás por la misma URL que registraste (por ejemplo `http://localhost:3000`). Completalo solo si el origen de la request no coincide con la URI de Google, con el valor exacto registrado, incluida la ruta `/api/google/callback`.

`GOOGLE_ADS_DEVELOPER_TOKEN` dejalo vacío.

Opcional:

- `APP_PASSWORD`: si tiene valor, el panel pide esa clave en `/acceso`. Si está vacía, cualquiera que abra la URL entra.
- `SUPABASE_URL` y `SUPABASE_SECRET_KEY`: sin ellas, la conexión y los hallazgos quedan en `.data/store.json` (no se commitea). En Vercel el disco no persiste: ahí hacén falta las dos variables y la migración `supabase/migrations/20261022183000_auditor_schema.sql`. La clave es la secreta del servidor, no la anónima.
- `CRON_SECRET`: solo si querés el cron de las 08:00, hora de Argentina (`GET /api/cron/audit`).

En Vercel cargá las mismas variables en el proyecto y volvé a desplegar. El secreto de OAuth tiene que ser el de producción, y la URI de redirección de ese dominio tiene que estar en el cliente OAuth.

## 6. Conectar y pedir la auditoría

```bash
npm install
npm run dev
```

1. Abrí `http://localhost:3000/conectar`.
2. Si definiste `APP_PASSWORD`, entrá antes por `/acceso`.
3. Apretá **Conectar con Google** e iniciá sesión con el correo que tiene Solo lectura.
4. Aceptá el permiso. Si Google avisa que la app no está verificada, es el estado Prueba del paso 2: podés continuar con tu usuario de prueba.
5. Si todo cierra, caes en **Cuentas** con el aviso de conexión guardada. Cada fila muestra el nombre, el id de 10 dígitos y si el acceso es MCC o directo.
6. Apretá **Auditar** en la cuenta que quieras. Al terminar, los hallazgos están en el inicio y en **Hallazgos**.

La muestra Da Milán sigue en la lista. Las cuentas nuevas no llevan la marca «Muestra».

El cron diario repite la auditoría de las cuentas ya conectadas. La primera vez hay que apretar **Auditar** a mano.

## Si algo falla

| Mensaje en la app o en Google | Qué revisar |
| --- | --- |
| Faltan `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` | `.env.local` o las variables del deploy, y reiniciá `npm run dev`. |
| La vuelta de Google no coincidió | Volvé a conectar. No abras el link de Google en otro navegador. |
| Google no entregó un refresh token | En la pantalla de consentimiento, el usuario tiene que poder ver la app. Volvé a conectar y aceptá de nuevo. |
| La identidad no tiene cuentas accesibles | Ese correo no está en ninguna cuenta de Google Ads, o solo ve MCCs sin clientes activos. |
| `redirect_uri_mismatch` | La URI del paso 3 no es exactamente la que usa el servidor. |
| `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` o `ACTION_NOT_PERMITTED` | El proyecto sigue en Test. Completá el paso 1. |
| `USER_PERMISSION_DENIED` | El correo no tiene acceso a esa cuenta, o el rol no alcanza para leerla. |
| La auditoría anduvo y a la semana falla el token | La app OAuth sigue en Prueba: el refresh token duró 7 días. Conectá de nuevo. |

## Qué no hace falta

- Un developer token.
- Darle a la app permiso de escritura en Google Ads.
- Elegir MCC o invitación antes de conectar: se descubren las dos.
- Basic o Standard access para las primeras cuentas. Subí de nivel solo si te quedás corto con 2.880 operaciones por día.
