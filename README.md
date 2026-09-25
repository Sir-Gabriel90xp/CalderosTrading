# CalderosTrading

Academia de trading construida con Next.js, TypeScript y Supabase. Incluye catálogo, registro, inicio de sesión, cursos y progreso, panel de administración, CRM básico, solicitudes de transferencia, mensajes, comunidad de estudiantes con ranking y certificados, y comprobantes de pago por transferencia o PayPal.

## Puesta en marcha

1. Crear un proyecto **nuevo y exclusivo** para CalderosTrading en Supabase.
2. Ejecutar `supabase/schema.sql` en el SQL Editor. Revisar que el proyecto exponga las tablas de `public` en la Data API. El script concede permisos explícitos y activa RLS en todas las tablas.
3. Copiar `.env.example` a `.env.local`. Rellenar la URL y la clave publicable de Supabase. El administrador configura el enlace de PayPal en `/admin`; no se necesitan credenciales de API de PayPal.
4. En Supabase Auth configurar la URL del sitio y las URL de redirección `http://localhost:3000/auth/callback` y la URL equivalente de producción. Confirmación de correo habilitada.
5. `npm install && npm run dev`.
6. Registrar tu cuenta y confirmar el correo. Para asignar el primer administrador, ejecutar **una sola vez** desde el SQL Editor, sustituyendo la dirección por la de tu cuenta verificada:

   ```sql
   update public.profiles set role='super_admin' where email='TU_CORREO@EJEMPLO.COM';
   ```

7. Entrar a `/admin`: configurar banco, titular, cuenta, grupo de WhatsApp y enlace de pago de PayPal; crear curso, módulo y lecciones. Cada curso tiene un precio de transferencia en RD$ y un precio PayPal separado en USD. La plataforma no calcula ninguna tasa de cambio automáticamente.

Para una base Supabase ya creada, ejecutar las migraciones pendientes de `supabase/migrations` en orden antes de desplegar los cambios. En particular, `20260925120000_community_profiles_and_certificates.sql` añade las fichas, permisos y buckets privados para perfiles y certificados. No vuelvas a ejecutar `schema.sql` sobre una base existente.

## Variables

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave publicable para Supabase Auth y Data API.
- `NEXT_PUBLIC_SITE_URL`: URL base del sitio; en producción usa el dominio HTTPS.

## Flujos implementados

- Registro, confirmación de correo, acceso y recuperación mediante Supabase Auth.
- Perfil comunitario editable con foto, país, descripción, Instagram, cuentas de fondeo y capital declarado en USD. Los perfiles empiezan privados y cada estudiante elige cuándo publicarlos.
- Ranking de capital y certificados de trading. Los certificados se guardan privados y cada estudiante elige cuáles comparte con la comunidad.
- Roles estudiante, soporte, instructor, admin y superadmin, verificados en base de datos.
- Catálogo público y edición de cursos, módulos y clases desde `/admin`.
- Clases con reproductor embebido de proveedores admitidos, completado de lecciones y acceso que caduca.
- CRM de usuarios recientes, asignación y extensión de acceso (90 días por defecto para compras), con auditoría de acciones.
- Comprobantes en bucket privado; el administrador revisa y aprueba, lo que activa acceso.
- Mensajería estudiante/soporte y enlace de WhatsApp limitado a inscripciones activas.
- PayPal manual: el estudiante abre el enlace configurado por el administrador, paga el precio en USD del curso y envía el ID de transacción y comprobante. El admin revisa el recibo y aprueba el acceso desde el CRM, igual que una transferencia.

## Límites actuales

Esta entrega es una base funcional y compilable, **no la plataforma completa de los 49 apartados del documento**. No incluye gestión visual de cupones, testimonios, FAQ, notificaciones, archivos de recursos, ordenación por arrastre, informes gráficos, sesiones activas, vídeo firmado, planes recurrentes, reseñas, ni una suite de pruebas de pagos. El chat actual se actualiza al recargar la página; falta suscripción Realtime. Los formularios presentan errores técnicos si falla alguna operación de servidor. El panel muestra hasta 100 usuarios y transferencias, sin paginación. No hay seed de estudiantes ni vídeos ficticios. La cuenta inicial de administrador requiere el paso SQL anterior.

El admin confirma manualmente cada comprobante antes de conceder acceso. Verifica el monto recibido y el ID de transacción directamente en PayPal antes de aprobarlo.

## Deploy en Vercel

Importar este proyecto como repositorio Next.js en Vercel, establecer las variables públicas de Supabase y configurar el enlace PayPal desde `/admin`. Añadir ese dominio a las URL permitidas de Supabase Auth. Ejecutar `npm run build` antes del despliegue. El logo original está en `public/logo.jpeg`.

## Seguridad

La aplicación jamás acepta precio ni rol enviados por el cliente como autoridad. Las tablas públicas tienen RLS, y las funciones RPC comprueban roles desde `profiles`. Las evidencias bancarias se guardan en un bucket privado. Las lecciones no se consultan sin una inscripción activa, salvo vista previa configurada explícitamente. Para producción, incorporar protección de abuso y pruebas de autorización con varios usuarios.
