import { redirect } from 'next/navigation';
import Link from 'next/link';
import { viewer } from '@/lib/supabase';
import { createCourse } from '@/app/actions';
import CourseManager from '@/components/CourseManager';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function AdminCourses({ searchParams }: { searchParams: SearchParams }) {
  const { db, user, profile } = await viewer();
  if (!user) redirect('/login?next=/admin/cursos');
  if (!['super_admin', 'admin'].includes(profile?.role || '')) redirect('/dashboard');

  const { data: courses } = await db
    .from('courses')
    .select('id,title,slug,description,cover_url,level,price,paypal_usd_price,published')
    .order('created_at', { ascending: false });
  const error = (await searchParams).error;
  const message = error === 'slug-duplicado'
    ? 'Ese slug ya existe. Usa uno diferente.'
    : error === 'portada-invalida'
      ? 'La portada debe ser JPG, PNG o WebP y pesar máximo 5 MB.'
      : error === 'portada-subida'
        ? 'No se pudo subir la portada. Revisa el bucket course-covers y sus políticas.'
        : error === 'curso-con-datos'
          ? 'No se puede borrar porque el curso tiene transferencias o pagos relacionados.'
          : error === 'error-borrar-curso'
            ? 'No se pudo borrar el curso. Revisa sus datos relacionados.'
            : error === 'error-curso'
              ? 'Supabase no pudo guardar el curso.'
              : null;

  return (
    <main className="shell">
      <div className="page-head">
        <Link href="/admin">← Volver al panel</Link>
        <span className="eyebrow">Administración</span>
        <h1>Gestionar cursos</h1>
        <p>Edita la información, sube portadas o elimina cursos.</p>
      </div>
      {message && <div className="notice warning" role="alert">{message}</div>}
      <section className="card" style={{ marginBottom: 18 }}>
        <h2>Nuevo curso</h2>
        <form action={createCourse} className="cols">
          <label>Título<input name="title" required minLength={3} maxLength={120} /></label>
          <label>Slug<input name="slug" pattern="[a-z0-9-]+" required /></label>
          <label>Descripción<textarea name="description" minLength={10} maxLength={3000} required /></label>
          <label>Precio RD$<input name="price" type="number" min="0" step="0.01" required /></label>
          <label>Nivel<input name="level" defaultValue="Inicial" maxLength={30} required /></label>
          <label>Precio PayPal USD (opcional)<input name="paypal_usd_price" type="number" min="0.01" step="0.01" /></label>
          <label className="inline"><input type="checkbox" name="published" style={{ width: 'auto' }} /> Publicar curso</label>
          <button type="submit">Crear curso</button>
        </form>
      </section>
      <CourseManager courses={(courses || []) as never[]} canManage />
    </main>
  );
}
