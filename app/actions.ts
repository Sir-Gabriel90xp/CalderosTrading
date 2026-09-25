'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { serverDb, viewer } from '@/lib/supabase';

function val(form:FormData,key:string){return String(form.get(key)||'').trim()}
function safePath(p:string){return p.startsWith('/') && !p.startsWith('//') ? p : '/dashboard'}
async function staff(){const v=await viewer();if(!v.user||!['super_admin','admin','instructor','support'].includes(v.profile?.role))throw new Error('Sin autorización');return v}
export async function signIn(form:FormData){
  const db=await serverDb();const email=val(form,'email'),password=val(form,'password');
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error)redirect('/login?error=credenciales');
  redirect(safePath(val(form,'next')));
}
export async function signUp(form:FormData){
  const db=await serverDb();const email=val(form,'email'),password=val(form,'password');
  if(!z.email().safeParse(email).success || password.length<10)redirect('/register?error=datos');
  const {error}=await db.auth.signUp({email,password,options:{emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`}});
  if(error)redirect('/register?error=registro');redirect('/login?registered=1');
}
export async function resetPassword(form:FormData){
  const db=await serverDb();await db.auth.resetPasswordForEmail(val(form,'email'),{redirectTo:`${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`});redirect('/login?reset=1');
}
export async function signOut(){const db=await serverDb();await db.auth.signOut();redirect('/')}
export async function createCourse(form:FormData){
    const {db,profile}=await staff();
    if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const schema=z.object({title:z.string().min(3).max(120),slug:z.string().regex(/^[a-z0-9-]+$/),description:z.string().min(10).max(3000),price:z.number().min(0),level:z.string().max(30),paypal_usd_price:z.number().positive().nullable()});
  const p=schema.parse({title:val(form,'title'),slug:val(form,'slug'),description:val(form,'description'),price:Number(val(form,'price')),level:val(form,'level'),paypal_usd_price:val(form,'paypal_usd_price')?Number(val(form,'paypal_usd_price')):null});
    const {error}=await db.from('courses').insert({...p,published:form.get('published')==='on',instructor_id:profile.id});
    if(error){
      const message=error.code==='23505'?'slug-duplicado':error.code==='42501'?'sin-permiso':'error-curso';
      redirect(`/admin?error=${message}`);
    }
    revalidatePath('/admin');revalidatePath('/cursos');
}
export async function updateCourse(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin/cursos?error=sin-permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));
  const schema=z.object({title:z.string().min(3).max(120),slug:z.string().regex(/^[a-z0-9-]+$/),description:z.string().min(10).max(3000),price:z.number().min(0),level:z.string().max(30),paypal_usd_price:z.number().positive().nullable()});
  const values=schema.parse({title:val(form,'title'),slug:val(form,'slug'),description:val(form,'description'),price:Number(val(form,'price')),level:val(form,'level'),paypal_usd_price:val(form,'paypal_usd_price')?Number(val(form,'paypal_usd_price')):null});
  const cover=form.get('cover');
  let cover_url:string|undefined;
  if(cover instanceof File && cover.size){
    if(cover.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(cover.type)) redirect('/admin/cursos?error=portada-invalida');
    const path=`${courseId}/${crypto.randomUUID()}-${cover.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const {error:uploadError}=await db.storage.from('course-covers').upload(path,cover,{upsert:false,contentType:cover.type,cacheControl:'3600'});
    if(uploadError) redirect('/admin/cursos?error=portada-subida');
    cover_url=db.storage.from('course-covers').getPublicUrl(path).data.publicUrl;
  }
  const {error}=await db.from('courses').update({...values,published:form.get('published')==='on',...(cover_url?{cover_url}: {})}).eq('id',courseId);
  if(error){
    const message=error.code==='23505'?'slug-duplicado':error.code==='42501'?'sin-permiso':'error-curso';
    redirect(`/admin/cursos?error=${message}`);
  }
  revalidatePath('/admin');revalidatePath('/');revalidatePath('/cursos');
}
export async function deleteCourse(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin/cursos?error=sin-permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));
  const {error}=await db.from('courses').delete().eq('id',courseId);
  if(error) redirect(`/admin/cursos?error=${error.code==='23503'?'curso-con-datos':'error-borrar-curso'}`);
  revalidatePath('/admin');revalidatePath('/');revalidatePath('/cursos');
}
export async function createModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role))throw new Error('Sin permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const {error}=await db.from('modules').insert({course_id:courseId,title,position:Number(val(form,'position'))||0});if(error)throw new Error(error.message);revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');
}
export async function updateModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const moduleId=z.uuid().parse(val(form,'module_id'));const courseId=z.uuid().parse(val(form,'course_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const {error}=await db.from('modules').update({course_id:courseId,title,position:Number(val(form,'position'))||0}).eq('id',moduleId);
  if(error) redirect(`/admin?error=${error.code==='42501'?'sin-permiso':'modulo-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');
}
export async function deleteModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const moduleId=z.uuid().parse(val(form,'module_id'));
  const {error}=await db.from('modules').delete().eq('id',moduleId);
  if(error) redirect(`/admin?error=${error.code==='23503'?'modulo-con-datos':'modulo-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');
}
export async function createLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const module_id=z.uuid().safeParse(val(form,'module_id'));
  const title=z.string().min(2).max(120).safeParse(val(form,'title'));
  const url=val(form,'video_url');
  if(!module_id.success || !title.success || (url && !/^https:\/\/(player\.vimeo\.com|iframe\.mux\.com|iframe\.videodelivery\.net|video\.bunnycdn\.com)\//.test(url))) redirect('/admin?error=leccion-datos');
  const {error}=await db.from('lessons').insert({module_id:module_id.data,title:title.data,video_url:url||null,body:val(form,'body'),position:Number(val(form,'position'))||0,published:form.get('published')==='on'});
  if(error) redirect(`/admin?error=${error.code==='42501'?'sin-permiso':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
}
export async function updateLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const lessonId=z.uuid().parse(val(form,'lesson_id'));
  const moduleId=z.uuid().parse(val(form,'module_id'));
  const title=z.string().min(2).max(120).parse(val(form,'title'));
  const url=val(form,'video_url');
  if(url && !/^https:\/\/(player\.vimeo\.com|iframe\.mux\.com|iframe\.videodelivery\.net|video\.bunnycdn\.com)\//.test(url)) redirect('/admin?error=leccion-datos');
  const {error}=await db.from('lessons').update({module_id:moduleId,title,video_url:url||null,body:val(form,'body'),position:Number(val(form,'position'))||0,published:form.get('published')==='on'}).eq('id',lessonId);
  if(error) redirect(`/admin?error=${error.code==='42501'?'sin-permiso':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
}
export async function deleteLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const lessonId=z.uuid().parse(val(form,'lesson_id'));
  const {error}=await db.from('lessons').delete().eq('id',lessonId);
  if(error) redirect(`/admin?error=${error.code==='23503'?'leccion-con-datos':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
}
export async function grantAccess(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin'].includes(profile.role))throw new Error('Sin permiso');
  const {error}=await db.rpc('admin_grant_access',{p_user:z.uuid().parse(val(form,'user_id')),p_course:z.uuid().parse(val(form,'course_id')),p_days:z.number().int().min(1).max(3650).parse(Number(val(form,'days')))});if(error)throw new Error(error.message);revalidatePath('/admin');
}
export async function reviewTransfer(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin'].includes(profile.role))throw new Error('Sin permiso');
  const {error}=await db.rpc('admin_review_transfer',{p_id:z.uuid().parse(val(form,'transfer_id')),p_approve:val(form,'decision')==='approve'});if(error)throw new Error(error.message);revalidatePath('/admin');
}
export async function completeLesson(form:FormData){
  const {db,user}=await viewer();if(!user)redirect('/login');
  const lesson_id=z.uuid().parse(val(form,'lesson_id'));
  const {error}=await db.from('lesson_progress').upsert({user_id:user.sub,lesson_id,completed_at:new Date().toISOString()},{onConflict:'user_id,lesson_id'});if(error)throw new Error(error.message);revalidatePath('/dashboard');
}
export async function sendMessage(form:FormData){
  const {db,user}=await viewer();if(!user)redirect('/login');
  const body=z.string().min(1).max(2000).parse(val(form,'body'));
  const recipient=z.uuid().parse(val(form,'recipient'));
  const {error}=await db.from('messages').insert({sender_id:user.sub,recipient_id:recipient,body});if(error)throw new Error(error.message);revalidatePath('/dashboard');revalidatePath('/admin');
}
export async function saveSettings(form:FormData){
 const {db,profile}=await staff();if(!['super_admin','admin'].includes(profile.role))throw new Error('Sin permiso');
 const keys=['bank_name','bank_account','bank_holder','whatsapp_group'];
 const rows=keys.map(key=>({key,value:val(form,key)}));const group=rows.find(r=>r.key==='whatsapp_group')?.value;
 if(group && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(group))throw new Error('Enlace de grupo no válido');
 const {error}=await db.from('settings').upsert(rows);if(error)throw new Error(error.message);revalidatePath('/admin');revalidatePath('/dashboard');
}

export async function updatePassword(form:FormData){
 const db=await serverDb();const password=val(form,'password');if(password.length<10)redirect('/update-password?error=short');
 const {data}=await db.auth.getClaims();if(!data?.claims)redirect('/login');
 const {error}=await db.auth.updateUser({password});if(error)redirect('/update-password?error=failed');redirect('/dashboard');
}
