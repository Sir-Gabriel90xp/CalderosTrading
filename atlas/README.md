# Calderos Trading · ATLAS PRO

Aplicación React para gestión de riesgo, lotaje CFD, futuros, diario y consistencia. Incluye PWA sin conexión, autenticación Supabase y sincronización por usuario.

## Arquitectura

- React 19 + Vite; módulos cargados bajo demanda, CSS con temas y animaciones respetuosas de movimiento reducido.
- Cálculos puros separados en `src/lib/trading.mjs`; sin APIs de precios ni recomendaciones de inversión.
- `IndexedDB` conserva un espacio independiente para invitado y cada usuario.
- Supabase Auth administra identidad; Postgres almacena preferencias e historial diario normalizado.
- Las políticas RLS filtran por `auth.uid()`. La clave pública es la única que llega al cliente.
- `atlas_sync` sincroniza preferencias y diario en una transacción con revisión optimista. Los conflictos requieren elegir una versión; no se sobrescriben silenciosamente.
- El service worker generado durante build precarga todos los módulos y recursos locales. Nunca almacena solicitudes de autenticación ni respuestas de Supabase.

## Desarrollo

```sh
npm ci
cp .env.example .env.local
# Completar las dos variables públicas del proyecto Supabase.
npm run dev -- --host 127.0.0.1
```

Variables requeridas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No usar `service_role` ni claves secretas en variables `VITE_*`.

## Base de datos

`supabase/schema.sql` documenta la migración aplicada al proyecto exclusivo de ATLAS PRO. En una instalación nueva, aplicar el esquema con las herramientas de migración Supabase. No volver a ejecutarlo sobre una base ya instalada sin revisar la migración.

En Auth configurar la URL de producción en **URL Configuration → Site URL** y las URLs permitidas de redirección (raíz y `/?recovery=1`). Configurar SMTP propio antes de abrir registros masivos: el envío predeterminado de Supabase está limitado.

## Verificación

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador sirven el build e incluyen 320/390/768/1440 px, herramientas, formato numérico, diario, persistencia, temas, notificaciones y recarga offline. `CHROMIUM_EXECUTABLE_PATH` permite usar un navegador instalado; `BASE_URL` verifica un despliegue existente.

## Vercel y GitHub

El código está en la carpeta `atlas/` de la rama `atlas-pro` del repositorio `Sir-Gabriel90xp/CalderosTrading`. El proyecto Vercel `calderos-atlas-pro` utiliza esa carpeta como raíz. La rama `main` y el sitio anterior se conservan.

Framework: Vite. Build: `npm run build`. Output: `dist`. Node: 24. Las variables públicas están definidas en Vercel para producción, previews y desarrollo. `vercel.json` configura cabeceras de seguridad y caché del service worker.

## Uso offline y datos anteriores

Abre la app con internet hasta ver **Lista para usar sin conexión**. Después las calculadoras, el diario y los ajustes funcionan sin conexión; los cambios de usuarios conectados esperan sincronización. YouTube y el acceso inicial a una cuenta requieren internet.

Las actualizaciones se aplican desde el aviso de nueva versión. Los datos permanecen en IndexedDB. Un navegador puede limpiar su almacenamiento: mantener respaldos sigue siendo recomendable.

Para trasladar datos del HTML anterior: exportar su JSON e importarlo desde Ajustes. Los historiales antiguos sin fecha reciben fechas de referencia que el usuario puede corregir. Invitado y usuarios conectados son espacios distintos: el traslado entre ellos es explícito con respaldos.

## Alcance actual

Una cuenta de trading por espacio; hasta 1,000 resultados diarios. Los parámetros de CFD y futuros son editables y deben verificarse contra el bróker. Las sesiones son ventanas orientativas y no incorporan feriados. La conversión Oro/Nasdaq es una relación numérica configurable, no una equivalencia de mercado.

La estructura permite añadir múltiples cuentas y sincronización incremental en futuras versiones. Antes de comercializar: configurar correo transaccional, documentos de privacidad y condiciones, monitoreo y políticas de respaldo acordes al uso real.
