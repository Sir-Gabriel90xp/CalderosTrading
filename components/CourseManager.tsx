'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { createLesson, createModule, deleteCourse, deleteLesson, deleteModule, updateCourse, updateLesson, updateModule } from '@/app/actions';

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

type Module = {
  id: string;
  course_id: string;
  title: string;
  position: number;
};

type Lesson = {
  id: string;
  module_id: string;
  title: string;
  body: string;
  video_url: string | null;
  position: number;
  published: boolean;
};

export default function CourseManager({ courses, canManage, modules = [], lessons = [] }: { courses: Course[]; canManage: boolean; modules?: Module[]; lessons?: Lesson[] }) {
  const [message, setMessage] = useState('');

  function handleDelete(event: FormEvent<HTMLFormElement>, title: string) {
    if (!window.confirm(`¿Borrar el curso "${title}"? También se borrarán sus módulos y lecciones.`)) {
      event.preventDefault();
    }
  }

  return (
    <section id="gestion-cursos" className="card">
      <h2>Gestión de cursos</h2>
      <p>Actualiza los datos, cambia la portada, organiza módulos y edita cada lección del curso.</p>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="stack">
        {courses.map((course) => {
          const courseModules = modules.filter((module) => module.course_id === course.id);

          return (
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
                      <label>Slug<input name="slug" defaultValue={course.slug} placeholder="ejemplo-mi-curso" required /></label>
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

                    <div className="stack" style={{ marginTop: 18 }}>
                      <h4>Módulos del curso</h4>
                      {courseModules.length ? courseModules.map((module) => {
                        const moduleLessons = lessons.filter((lesson) => lesson.module_id === module.id);
                        return (
                          <div className="card" key={module.id} style={{ padding: 12 }}>
                            <form action={updateModule}>
                              <input type="hidden" name="module_id" value={module.id} />
                              <input type="hidden" name="course_id" value={course.id} />
                              <div className="cols">
                                <label>Título<input name="title" defaultValue={module.title} required /></label>
                                <label>Orden<input name="position" type="number" defaultValue={module.position} /></label>
                              </div>
                              <button type="submit">Guardar módulo</button>
                            </form>
                            <form action={deleteModule} style={{ marginTop: 8 }}>
                              <input type="hidden" name="module_id" value={module.id} />
                              <button type="submit" className="ghost">Eliminar módulo</button>
                            </form>

                            <div className="stack" style={{ marginTop: 14 }}>
                              <h5>Lecciones</h5>
                              {moduleLessons.length ? moduleLessons.map((lesson) => (
                                <div className="card" key={lesson.id} style={{ padding: 12 }}>
                                  <form action={updateLesson}>
                                    <input type="hidden" name="lesson_id" value={lesson.id} />
                                    <input type="hidden" name="module_id" value={module.id} />
                                    <label>Título<input name="title" defaultValue={lesson.title} required /></label>
                                    <label>URL del video<input name="video_url" type="url" defaultValue={lesson.video_url ?? ''} placeholder="https://player.vimeo.com/video/..." /></label>
                                    <label>Contenido<textarea name="body" rows={4} defaultValue={lesson.body} /></label>
                                    <div className="cols">
                                      <label>Orden<input name="position" type="number" defaultValue={lesson.position} /></label>
                                      <label className="inline"><input type="checkbox" name="published" defaultChecked={lesson.published} style={{ width: 'auto' }} /> Publicada</label>
                                    </div>
                                    <button type="submit">Guardar lección</button>
                                  </form>
                                  <form action={deleteLesson} style={{ marginTop: 8 }}>
                                    <input type="hidden" name="lesson_id" value={lesson.id} />
                                    <button type="submit" className="ghost">Eliminar lección</button>
                                  </form>
                                </div>
                              )) : <p>No hay lecciones en este módulo todavía.</p>}

                              <form action={createLesson}>
                                <input type="hidden" name="module_id" value={module.id} />
                                <label>Título<input name="title" required /></label>
                                <label>URL del video<input name="video_url" type="url" placeholder="https://player.vimeo.com/video/..." /></label>
                                <label>Contenido<textarea name="body" rows={4} /></label>
                                <div className="cols">
                                  <label>Orden<input name="position" type="number" defaultValue={0} /></label>
                                  <label className="inline"><input type="checkbox" name="published" style={{ width: 'auto' }} /> Publicar</label>
                                </div>
                                <button type="submit">Añadir lección</button>
                              </form>
                            </div>
                          </div>
                        );
                      }) : <p>No hay módulos creados aún para este curso.</p>}

                      <form action={createModule} style={{ marginTop: 14 }}>
                        <input type="hidden" name="course_id" value={course.id} />
                        <label>Título del módulo<input name="title" required /></label>
                        <label>Orden<input name="position" type="number" defaultValue={0} /></label>
                        <button type="submit">Agregar módulo</button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
