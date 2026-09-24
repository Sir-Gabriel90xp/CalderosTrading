'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { deleteCourse, updateCourse } from '@/app/actions';

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  cover_url: string | null;
  level: string;
  price: number;
  paypal_usd_price: number | null;
  published: boolean;
};

export default function CourseManager({ courses, canManage }: { courses: Course[]; canManage: boolean }) {
  const [message, setMessage] = useState('');

  function handleDelete(event: FormEvent<HTMLFormElement>, title: string) {
    if (!window.confirm(`¿Borrar el curso "${title}"? También se borrarán sus módulos y lecciones.`)) {
      event.preventDefault();
    }
  }

  return (
    <section id="gestion-cursos" className="card">
      <h2>Gestión de cursos</h2>
      <p>Actualiza los datos, cambia la portada o elimina cursos existentes.</p>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="stack">
        {courses.map((course) => (
          <article className="card" key={course.id}>
            <div className="row">
              <div>
                <h3>{course.title}</h3>
                <span className="meta">/{course.slug}</span>
              </div>
              <span className={'badge ' + (course.published ? '' : 'dim')}>
                {course.published ? 'Publicado' : 'Borrador'}
              </span>
            </div>
            <div className="course-manager-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, .7fr) 1.3fr', gap: 20, alignItems: 'start' }}>
              <div className="cover course-manager-cover" style={{ height: 180, marginBottom: 0 }}>
                {course.cover_url ? <img src={course.cover_url} alt={`Portada de ${course.title}`} /> : <span className="monogram">CT</span>}
              </div>
              {canManage && (
                <div className="stack">
                  <form action={updateCourse}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <label>Título<input name="title" defaultValue={course.title} required minLength={3} maxLength={120} /></label>
                    <label>Slug<input name="slug" defaultValue={course.slug} pattern="[a-z0-9-]+" required /></label>
                    <label>Descripción<textarea name="description" defaultValue={course.description} minLength={10} maxLength={3000} required /></label>
                    <div className="cols">
                      <label>Precio RD$<input name="price" type="number" defaultValue={course.price} min="0" step="0.01" required /></label>
                      <label>Nivel<input name="level" defaultValue={course.level} maxLength={30} required /></label>
                    </div>
                    <label>Precio PayPal USD (opcional)<input name="paypal_usd_price" type="number" defaultValue={course.paypal_usd_price ?? ''} min="0.01" step="0.01" /></label>
                    <label>Portada<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></label>
                    <label className="inline"><input type="checkbox" name="published" defaultChecked={course.published} style={{ width: 'auto' }} /> Publicar curso</label>
                    <button type="submit">Guardar cambios</button>
                  </form>
                  <form action={deleteCourse} onSubmit={(event) => handleDelete(event, course.title)}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <button type="submit" className="ghost">Borrar curso</button>
                  </form>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
