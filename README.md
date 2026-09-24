# CalderosTrading

Academia privada de trading construida con Next.js, TypeScript y Supabase. Incluye catálogo, registro, inicio de sesión, clases y progreso, panel de administración, CRM básico, solicitudes de transferencia, mensajes, comunidad privada y compra de cursos individuales mediante PayPal.

## Puesta en marcha

1. Crear un proyecto **nuevo y exclusivo** para CalderosTrading en Supabase.
2. Ejecutar `supabase/schema.sql` en el SQL Editor. Revisar que el proyecto exponga las tablas de `public` en la Data API. El script concede permisos explícitos y activa RLS en todas las tablas.
3. Copiar `.env.example` a `.env.local`. Rellenar la URL y la clave publicable de Supabase. Mantener `SUPABASE_SECRET_KEY` solo en el servidor; es necesaria para los pagos PayPal. Añadir las credenciales de una aplicación PayPal y dejar `PAYPAL_ENV=sandbox` hasta terminar las pruebas.
4. En Supabase Auth configurar la URL del sitio y las URL de redirección `http://localhost:3000/auth/callback` y la URL equivalente de producción. Confirmación de correo habilitada.
5. `npm install && npm run dev`.
6. Registrar tu cuenta y confirmar el correo. Para asignar el primer administrador, ejecutar **una sola vez** desde el SQL Editor, sustituyendo la dirección por la de tu cuenta verificada:

   ```sql
   update public.profiles set role='super_admin' where email='TU_CORREO@EJEMPLO.COM';
   ```

7. Entrar a `/admin`: configurar banco, titular, cuenta y grupo de WhatsApp; crear curso, módulo y lecciones. El precio PayPal se expresa **por separado en USD**, porque el precio mostrado de transferencia se expresa en RD$; no se calcula ninguna tasa de cambio automáticamente.

## Variables

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave publicable para Supabase Auth y Data API.
- `SUPABASE_SECRET_KEY`: clave secreta de Supabase usada solo por los endpoints de PayPal. No usar el prefijo `NEXT_PUBLIC_`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: credenciales de PayPal Checkout.
- `PAYPAL_ENV`: `sandbox` o `live`.
- `NEXT_PUBLIC_SITE_URL`: origen público de la web, sin barra final. En producción usa HTTPS.

## Flujos implementados

- Registro, confirmación de correo, acceso y recuperación mediante Supabase Auth.
- Roles estudiante, soporte, instructor, admin y superadmin, verificados en base de datos.
- Catálogo público y edición de cursos, módulos y clases desde `/admin`.
- Clases con reproductor embebido de proveedores admitidos, completado de lecciones y acceso que caduca.
- CRM de usuarios recientes, asignación y extensión de acceso (90 días por defecto para compras), con auditoría de acciones.
- Comprobantes en bucket privado; el administrador revisa y aprueba, lo que activa acceso.
- Mensajería estudiante/soporte y enlace de WhatsApp limitado a inscripciones activas.
- PayPal Orders v2: el servidor calcula el importe desde la base de datos, registra la orden, confirma la captura y compara ID, curso, moneda y monto antes de activar el acceso de manera atómica. La página de retorno permite reintentar una orden ya capturada.

## Límites actuales

Esta entrega es una base funcional y compilable, **no la plataforma completa de los 49 apartados del documento**. No incluye gestión visual de cupones, testimonios, FAQ, notificaciones, archivos de recursos, ordenación por arrastre, informes gráficos, sesiones activas, vídeo firmado, planes recurrentes, webhook PayPal, reseñas, ni una suite de pruebas de pagos. El chat actual se actualiza al recargar la página; falta suscripción Realtime. Los formularios presentan errores técnicos si falla alguna operación de servidor. El panel muestra hasta 100 usuarios y transferencias, sin paginación. No hay seed de estudiantes ni vídeos ficticios. La cuenta inicial de administrador requiere el paso SQL anterior.

Los botones de PayPal y transferencia solo operan después de crear y configurar el proyecto correspondiente. La compilación local verifica tipos y rutas; no sustituye pruebas con cuentas, pagos sandbox y datos reales. **No cambiar PayPal a `live` ni publicar como operación comercial sin pruebas de extremo a extremo, revisión de RLS y manejo de webhook/reconciliación.**

## Deploy en Vercel

Importar este proyecto como repositorio Next.js en Vercel. En **Project → Settings → Environment Variables**, añadir al entorno **Production** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores del proyecto Supabase. Añadir `NEXT_PUBLIC_SITE_URL=https://calderostrading.vercel.app`. Las variables del archivo `.env.local` de tu PC no llegan a Vercel: tras guardarlas en Vercel se necesita un nuevo despliegue para que también queden incluidas en el JavaScript del navegador. Para activar PayPal, añadir sus credenciales y `SUPABASE_SECRET_KEY` por separado; nunca poner esta última bajo `NEXT_PUBLIC_`. Hasta que se configure Supabase, la portada se mostrará, pero el registro y los cursos privados seguirán no disponibles. Añadir ese dominio a las URL permitidas de Supabase Auth y verificar el retorno PayPal en sandbox. Ejecutar `npm run build` antes del despliegue. El logo original está en `public/logo.jpeg`.

## Seguridad

La aplicación jamás acepta precio ni rol enviados por el cliente como autoridad. Las tablas públicas tienen RLS, y las funciones RPC comprueban roles desde `profiles`. Las evidencias bancarias se guardan en un bucket privado. La clave secreta de Supabase y PayPal nunca se incluye en el frontend. Las lecciones no se consultan sin una inscripción activa, salvo vista previa configurada explícitamente. Para producción, incorporar protección de abuso, reconciliación por webhook y pruebas de autorización con varios usuarios.
