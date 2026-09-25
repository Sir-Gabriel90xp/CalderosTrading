import {notFound} from 'next/navigation';
import {serverDb, viewer} from '@/lib/supabase';
import Link from 'next/link';

export const dynamic='force-dynamic';

export default async function Course({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const db=await serverDb();
  const {data:course}=await db.from('courses').select('*').eq('slug',slug).eq('published',true).single();
  if(!course)notFound();
  const {data:modules}=await db.from('modules').select('id,title,position').eq('course_id',course.id).order('position');
  const moduleIds=modules?.map(module=>module.id)||[];
  const {data:lessons}=moduleIds.length?await db.from('lessons').select('id,title,module_id,position').in('module_id',moduleIds).eq('published',true).order('position'):{data:[]};
  const {user}=await viewer();
  const {data:enrollments}=user?await db.from('enrollments').select('course_id,status,expires_at').eq('user_id',user.sub).eq('course_id',course.id).limit(1):{data:[]};
  const hasAccess=!!enrollments?.some(enrollment=>enrollment.status==='active'&&(!enrollment.expires_at||new Date(enrollment.expires_at)>new Date()));
  return <main className="shell"><div className="page-head"><span className="eyebrow">{course.level} / Curso</span><h1>{course.title}</h1><p className="lead">{course.description}</p><div className="actions"><Link className="button" href={'/dashboard?course='+course.id}>Entrar o solicitar acceso</Link><b className="price">RD$ {Number(course.price).toLocaleString('es-DO')}</b></div></div><section className="section"><h2>Programa</h2><div className="stack">{modules?.length?modules.map((module,index)=><details className="card course-module" key={module.id}><summary><span><span className="eyebrow">Módulo {index+1}</span><br/><strong>{module.title}</strong></span><span className="meta">{hasAccess?'Ver lecciones':'Acceso restringido'}</span></summary>{hasAccess?<div className="lesson-list">{(lessons||[]).filter(lesson=>lesson.module_id===module.id).length?(lessons||[]).filter(lesson=>lesson.module_id===module.id).map(lesson=><Link className="lesson-link" href={`/curso/${course.slug}/leccion/${lesson.id}`} target="_blank" rel="noreferrer" key={lesson.id}><span><strong>{lesson.title}</strong><br/><small className="meta">Abrir lección · video y material de lectura</small></span><span aria-hidden="true">↗</span></Link>):<p>Este módulo aún no tiene lecciones publicadas.</p>}</div>:<p>Cuando tu acceso sea aprobado podrás ver las lecciones de este módulo.</p>}</details>):<p>No hay módulos publicados todavía.</p>}</div></section></main>;
}
