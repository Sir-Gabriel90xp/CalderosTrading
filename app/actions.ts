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
export async function createModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role))throw new Error('Sin permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const {error}=await db.from('modules').insert({course_id:courseId,title,position:Number(val(form,'position'))||0});if(error)throw new Error(error.message);revalidatePath('/admin');
}
export async function createLesson(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role))throw new Error('Sin permiso');
  const module_id=z.uuid().parse(val(form,'module_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const url=val(form,'video_url');if(url && !/^https:\/\/(player\.vimeo\.com|iframe\.mux\.com|iframe\.videodelivery\.net|video\.bunnycdn\.com)\//.test(url))throw new Error('URL de video no admitida');
  const {error}=await db.from('lessons').insert({module_id,title,video_url:url||null,body:val(form,'body'),position:Number(val(form,'position'))||0,published:form.get('published')==='on'});if(error)throw new Error(error.message);revalidatePath('/admin');
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
