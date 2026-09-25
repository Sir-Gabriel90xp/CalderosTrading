import {notFound, redirect} from 'next/navigation';
import Link from 'next/link';
import {serverDb, viewer} from '@/lib/supabase';
import {completeLesson} from '@/app/actions';

export const dynamic='force-dynamic';

type Props={params:Promise<{slug:string;lessonId:string}>;searchParams:Promise<{success?:string;error?:string}>};
function embedUrl(value:string|null){
  if(!value)return null;
  try{
    const url=new URL(value);
    if(url.hostname==='youtu.be')return `https://www.youtube.com/embed/${url.pathname.slice(1).split('/')[0]}`;
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)){
      const id=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1];
      return id?`https://www.youtube.com/embed/${id}`:value;
    }
  }catch{}
  return value;
}

export default async function LessonPage({params,searchParams}:Props){
  const {slug,lessonId}=await params;
  const query=await searchParams;
  const {db,user}=await viewer();
  if(!user)redirect(`/login?next=/curso/${slug}/leccion/${lessonId}`);
  const {data:course}=await db.from('courses').select('id,title,slug').eq('slug',slug).eq('published',true).single();
  if(!course)notFound();
  const {data:lesson}=await db.from('lessons').select('id,title,body,video_url,module_id,position').eq('id',lessonId).eq('published',true).single();
  if(!lesson)notFound();
  const {data:module}=await db.from('modules').select('id,title,course_id').eq('id',lesson.module_id).eq('course_id',course.id).single();
  if(!module)notFound();
  const {data:enrollment}=await db.from('enrollments').select('status,expires_at').eq('user_id',user.sub).eq('course_id',course.id).eq('status','active').limit(1).maybeSingle();
  const hasAccess=!!enrollment&&(!enrollment.expires_at||new Date(enrollment.expires_at)>new Date());
  if(!hasAccess)redirect(`/curso/${slug}`);
  return <main className="shell lesson-page"><div className="page-head lesson-head"><Link href={`/curso/${slug}`} className="meta">← Volver al curso</Link><span className="eyebrow">{course.title} / {module.title}</span><h1>{lesson.title}</h1><p className="lead">Reproduce la lección y revisa el material de apoyo.</p></div>{query.error&&<div className="notice notice-error" role="alert">No se pudo guardar el progreso. Inténtalo otra vez.</div>}{query.success==='leccion-completada'&&<div className="notice" role="status">Lección marcada como completada.</div>}<section className="lesson-content"><div className="lesson-player">{lesson.video_url?<iframe src={embedUrl(lesson.video_url)||undefined} title={lesson.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>:<div className="notice">Esta lección todavía no tiene un video publicado.</div>}</div><article className="card lesson-reading"><span className="eyebrow">Material de lectura</span><h2>Notas de la lección</h2>{lesson.body?<div className="lesson-body">{lesson.body}</div>:<p className="muted">No hay notas adicionales para esta lección.</p>}<form action={completeLesson}><input type="hidden" name="lesson_id" value={lesson.id}/><input type="hidden" name="return_to" value={`/curso/${slug}/leccion/${lesson.id}`}/><button>Marcar como completada</button></form></article></section></main>;
}
