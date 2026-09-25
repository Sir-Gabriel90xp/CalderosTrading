'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { serverDb, viewer } from '@/lib/supabase';

function val(form:FormData,key:string){return String(form.get(key)||'').trim()}
function safePath(p:string){return p.startsWith('/') && !p.startsWith('//') ? p : '/dashboard'}
function slugify(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function normalizeVideoUrl(value:string){
  if(!value)return '';
  try{
    const url=new URL(value);
    if(url.protocol!=='https:')return null;
    if(url.hostname==='youtu.be'){
      const id=url.pathname.slice(1).split('/')[0];
      return id?`https://www.youtube.com/embed/${id}`:null;
    }
    if(url.hostname==='www.youtube.com'||url.hostname==='youtube.com'||url.hostname==='m.youtube.com'){
      const id=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1];
      return id?`https://www.youtube.com/embed/${id}`:null;
    }
    if(/^player\.vimeo\.com$|^iframe\.mux\.com$|^iframe\.videodelivery\.net$|^video\.bunnycdn\.com$/.test(url.hostname))return value;
  }catch{}
  return null;
}
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
export async function updateProfile(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const userId=z.uuid().parse(val(form,'user_id'));
  const full_name=z.string().min(1).max(120).parse(val(form,'full_name'));
  const phone=val(form,'phone');
  const role=z.enum(['student','support','instructor','admin','super_admin']).parse(val(form,'role'));
  if(role==='super_admin'&&profile.role!=='super_admin') redirect(`/admin?user_id=${userId}&error=sin-permiso`);
  const {error}=await db.rpc('admin_update_profile',{p_user:userId,p_full_name:full_name,p_phone:phone||null,p_role:role});
  if(error) redirect(`/admin?user_id=${userId}&error=${encodeURIComponent(error.message.includes('último superadministrador')?'ultimo-superadmin':error.message.includes('Solo un superadministrador')?'sin-permiso':'perfil-error')}`);
  revalidatePath('/admin');revalidatePath('/dashboard');
  redirect(`/admin?user_id=${userId}&success=perfil-actualizado`);
}
export async function moderateCommunityProfile(form:FormData){
  const {db,profile}=await staff();
  if(!profile||!['super_admin','admin'].includes(profile.role))redirect('/admin/comunidad?error=sin-permiso');
  const userId=z.uuid().safeParse(val(form,'user_id'));
  const displayName=z.string().trim().min(2).max(80).safeParse(val(form,'display_name'));
  const country=z.string().trim().max(80).safeParse(val(form,'country'));
  const bio=z.string().trim().max(600).safeParse(val(form,'bio'));
  const instagram=z.string().trim().max(200).safeParse(val(form,'instagram_url'));
  const fundedAccounts=z.number().int().min(0).max(100).safeParse(Number(val(form,'funded_accounts_count')));
  const capital=z.number().finite().min(0).max(999999999999.99).safeParse(Number(val(form,'trading_capital_usd')));
  const reason=z.string().trim().min(3).max(300).safeParse(val(form,'reason'));
  if(!userId.success||!displayName.success||!country.success||!bio.success||!instagram.success||!fundedAccounts.success||!capital.success||!reason.success)
    redirect('/admin/comunidad?error=datos-perfil');
  let instagramUrl:string|null=null;
  if(instagram.data){
    instagramUrl=instagram.data.startsWith('@')?`https://instagram.com/${instagram.data.slice(1)}`:instagram.data;
    try{const url=new URL(instagramUrl);if(url.protocol!=='https:'||url.hostname!=='instagram.com'&&url.hostname!=='www.instagram.com')throw new Error();}
    catch{redirect(`/admin/comunidad?user_id=${userId.data}&error=instagram-invalido`);}
  }
  const {error}=await db.rpc('admin_moderate_community_profile',{
    p_user:userId.data,p_display_name:displayName.data,p_country:country.data,p_bio:bio.data,
    p_instagram_url:instagramUrl,p_funded_accounts_count:fundedAccounts.data,
    p_trading_capital_usd:capital.data,p_is_public:form.get('is_public')==='on',p_reason:reason.data
  });
  if(error)redirect(`/admin/comunidad?user_id=${userId.data}&error=moderacion-error`);
  revalidatePath('/admin/comunidad');revalidatePath('/comunidad');revalidatePath('/dashboard/perfil');
  redirect(`/admin/comunidad?user_id=${userId.data}&success=perfil-moderado`);
}
export async function hideTradingCertificate(form:FormData){
  const {db,profile}=await staff();
  if(!profile||!['super_admin','admin'].includes(profile.role))redirect('/admin/comunidad?error=sin-permiso');
  const certificateId=z.uuid().safeParse(val(form,'certificate_id'));
  const reason=z.string().trim().min(3).max(300).safeParse(val(form,'reason'));
  if(!certificateId.success||!reason.success)redirect('/admin/comunidad?error=datos-certificado');
  const {error}=await db.rpc('admin_hide_trading_certificate',{p_certificate:certificateId.data,p_reason:reason.data});
  if(error)redirect('/admin/comunidad?error=certificado-error');
  revalidatePath('/admin/comunidad');revalidatePath('/comunidad');revalidatePath('/dashboard/perfil');
  redirect('/admin/comunidad?success=certificado-ocultado');
}
export async function createCourse(form:FormData){
    const {db,profile}=await staff();
    if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const schema=z.object({title:z.string().min(3).max(120),slug:z.string().regex(/^[a-z0-9-]+$/),description:z.string().min(10).max(3000),price:z.number().min(0),level:z.string().max(30),paypal_usd_price:z.number().positive().nullable()});
  const slug=slugify(val(form,'slug'));if(!slug)redirect('/admin?error=slug-invalido');
  const p=schema.parse({title:val(form,'title'),slug,description:val(form,'description'),price:Number(val(form,'price')),level:val(form,'level'),paypal_usd_price:val(form,'paypal_usd_price')?Number(val(form,'paypal_usd_price')):null});
    const {error}=await db.from('courses').insert({...p,published:form.get('published')==='on',instructor_id:profile.id});
    if(error){
      const message=error.code==='23505'?'slug-duplicado':error.code==='42501'?'sin-permiso':'error-curso';
      redirect(`${returnTo}?error=${message}`);
    }
    revalidatePath('/admin');revalidatePath('/cursos');
    redirect(`${returnTo}?success=curso-creado`);
}
export async function updateCourse(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin/cursos?error=sin-permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));
  const schema=z.object({title:z.string().min(3).max(120),slug:z.string().regex(/^[a-z0-9-]+$/),description:z.string().min(10).max(3000),price:z.number().min(0),level:z.string().max(30),paypal_usd_price:z.number().positive().nullable()});
  const slug=slugify(val(form,'slug'));if(!slug)redirect('/admin/cursos?error=slug-invalido');
  const values=schema.parse({title:val(form,'title'),slug,description:val(form,'description'),price:Number(val(form,'price')),level:val(form,'level'),paypal_usd_price:val(form,'paypal_usd_price')?Number(val(form,'paypal_usd_price')):null});
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
  const returnTo=safePath(val(form,'return_to')||'/admin');
  if(error){
    const message=error.code==='23505'?'slug-duplicado':error.code==='42501'?'sin-permiso':'error-curso';
    redirect(`${returnTo}?error=${message}`);
  }
  revalidatePath('/admin');revalidatePath('/');revalidatePath('/cursos');
  redirect(`${returnTo}?success=curso-actualizado`);
}
export async function deleteCourse(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin/cursos?error=sin-permiso');
  const courseId=z.uuid().parse(val(form,'course_id'));
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const {error}=await db.from('courses').delete().eq('id',courseId);
  if(error) redirect(`${returnTo}?error=${error.code==='23503'?'curso-con-datos':'error-borrar-curso'}`);
  revalidatePath('/admin');revalidatePath('/');revalidatePath('/cursos');
  redirect(`${returnTo}?success=curso-eliminado`);
}
export async function createModule(form:FormData){
  const {db,profile}=await staff();if(!profile||!['super_admin','admin','instructor'].includes(profile.role))redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const courseId=z.uuid().parse(val(form,'course_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const {error}=await db.from('modules').insert({course_id:courseId,title,position:Number(val(form,'position'))||0});if(error)redirect(`${returnTo}?error=modulo-error`);revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');redirect(`${returnTo}?success=modulo-creado`);
}
export async function updateModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const moduleId=z.uuid().parse(val(form,'module_id'));const courseId=z.uuid().parse(val(form,'course_id'));const title=z.string().min(2).max(120).parse(val(form,'title'));
  const {error}=await db.from('modules').update({course_id:courseId,title,position:Number(val(form,'position'))||0}).eq('id',moduleId);
  if(error) redirect(`${returnTo}?error=${error.code==='42501'?'sin-permiso':'modulo-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');
  redirect(`${returnTo}?success=modulo-actualizado`);
}
export async function deleteModule(form:FormData){
  const {db,profile}=await staff();if(!['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const moduleId=z.uuid().parse(val(form,'module_id'));
  const {error}=await db.from('modules').delete().eq('id',moduleId);
  if(error) redirect(`${returnTo}?error=${error.code==='23503'?'modulo-con-datos':'modulo-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/curso/[slug]','page');
  redirect(`${returnTo}?success=modulo-eliminado`);
}
export async function createLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const module_id=z.uuid().safeParse(val(form,'module_id'));
  const title=z.string().min(2).max(120).safeParse(val(form,'title'));
  const url=normalizeVideoUrl(val(form,'video_url'));
  if(!module_id.success || !title.success || url===null) redirect(`${returnTo}?error=leccion-datos`);
  const {error}=await db.from('lessons').insert({module_id:module_id.data,title:title.data,video_url:url||null,body:val(form,'body'),position:Number(val(form,'position'))||0,published:form.get('published')==='on'});
  if(error) redirect(`${returnTo}?error=${error.code==='42501'?'sin-permiso':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
  redirect(`${returnTo}?success=leccion-creada`);
}
export async function updateLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const lessonId=z.uuid().parse(val(form,'lesson_id'));
  const moduleId=z.uuid().parse(val(form,'module_id'));
  const title=z.string().min(2).max(120).parse(val(form,'title'));
  const url=normalizeVideoUrl(val(form,'video_url'));
  if(url===null) redirect(`${returnTo}?error=leccion-datos`);
  const {error}=await db.from('lessons').update({module_id:moduleId,title,video_url:url||null,body:val(form,'body'),position:Number(val(form,'position'))||0,published:form.get('published')==='on'}).eq('id',lessonId);
  if(error) redirect(`${returnTo}?error=${error.code==='42501'?'sin-permiso':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
  redirect(`${returnTo}?success=leccion-actualizada`);
}
export async function deleteLesson(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin','instructor'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const returnTo=safePath(val(form,'return_to')||'/admin');
  const lessonId=z.uuid().parse(val(form,'lesson_id'));
  const {error}=await db.from('lessons').delete().eq('id',lessonId);
  if(error) redirect(`${returnTo}?error=${error.code==='23503'?'leccion-con-datos':'leccion-error'}`);
  revalidatePath('/admin');revalidatePath('/admin/cursos');revalidatePath('/dashboard');revalidatePath('/cursos');revalidatePath('/curso/[slug]','page');
  redirect(`${returnTo}?success=leccion-eliminada`);
}
export async function grantAccess(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const userId=z.uuid().safeParse(val(form,'user_id'));
  const courseId=z.uuid().safeParse(val(form,'course_id'));
  const days=z.number().int().min(1).max(3650).safeParse(Number(val(form,'days')));
  if(!userId.success || !courseId.success || !days.success) redirect('/admin?error=acceso-datos');
  const destination=`/admin?user_id=${userId.data}`;
  const {error}=await db.rpc('admin_grant_access',{p_user:userId.data,p_course:courseId.data,p_days:days.data});
  if(error) redirect(`${destination}&error=acceso-error&detail=${encodeURIComponent(error.message.slice(0,180))}`);
  const {data:enrollment,error:readError}=await db.from('enrollments')
    .select('id,access_code,status,expires_at').eq('user_id',userId.data).eq('course_id',courseId.data).single();
  if(readError || !enrollment?.access_code || enrollment.status!=='active' ||
     (enrollment.expires_at && new Date(enrollment.expires_at)<=new Date()))
    redirect(`${destination}&error=acceso-no-sincronizado`);
  revalidatePath('/admin');revalidatePath('/dashboard');revalidatePath('/cursos');
  redirect(`${destination}&success=acceso-actualizado`);
}
export async function setEnrollmentDays(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const enrollmentId=z.uuid().safeParse(val(form,'enrollment_id'));
  const userId=z.uuid().safeParse(val(form,'user_id'));
  const days=z.number().int().min(1).max(3650).safeParse(Number(val(form,'days')));
  if(!enrollmentId.success || !userId.success || !days.success) redirect('/admin?error=acceso-datos');
  const destination=`/admin?user_id=${userId.data}`;
  const {error}=await db.rpc('admin_set_enrollment_days',{p_enrollment:enrollmentId.data,p_days:days.data});
  if(error) redirect(`${destination}&error=acceso-error&detail=${encodeURIComponent(error.message.slice(0,180))}`);
  const {data:enrollment,error:readError}=await db.from('enrollments')
    .select('status,expires_at,access_code').eq('id',enrollmentId.data).eq('user_id',userId.data).single();
  if(readError || !enrollment?.access_code || enrollment.status!=='active' || !enrollment.expires_at || new Date(enrollment.expires_at)<=new Date())
    redirect(`${destination}&error=acceso-no-sincronizado`);
  revalidatePath('/admin');revalidatePath('/dashboard');revalidatePath('/cursos');
  redirect(`${destination}&success=estadía-actualizada`);
}
export async function revokeAccess(form:FormData){
  const {db,profile}=await staff();
  if(!profile || !['super_admin','admin'].includes(profile.role)) redirect('/admin?error=sin-permiso');
  const enrollmentId=z.uuid().safeParse(val(form,'enrollment_id'));
  const userId=z.uuid().safeParse(val(form,'user_id'));
  if(!enrollmentId.success || !userId.success) redirect('/admin?error=acceso-datos');
  const destination=`/admin?user_id=${userId.data}`;
  const {error}=await db.rpc('admin_revoke_access',{p_enrollment:enrollmentId.data});
  if(error) redirect(`${destination}&error=acceso-error&detail=${encodeURIComponent(error.message.slice(0,180))}`);
  const {data:enrollment,error:readError}=await db.from('enrollments')
    .select('status,expires_at').eq('id',enrollmentId.data).eq('user_id',userId.data).single();
  if(readError || enrollment?.status!=='suspended' || !enrollment.expires_at ||
     new Date(enrollment.expires_at)>new Date()) redirect(`${destination}&error=acceso-no-sincronizado`);
  revalidatePath('/admin');revalidatePath('/dashboard');revalidatePath('/cursos');
  redirect(`${destination}&success=acceso-retirado`);
}
export async function reviewTransfer(form:FormData){
  const {db,profile}=await staff();if(!profile||!['super_admin','admin'].includes(profile.role))redirect('/admin?error=sin-permiso');
  const approve=val(form,'decision')==='approve';
  const {error}=await db.rpc('admin_review_transfer',{p_id:z.uuid().parse(val(form,'transfer_id')),p_approve:approve});if(error)redirect('/admin?error=pago-error');revalidatePath('/admin');redirect(`/admin?success=${approve?'pago-aprobado':'pago-rechazado'}`);
}
export async function completeLesson(form:FormData){
  const {db,user}=await viewer();if(!user)redirect('/login');
  const lesson_id=z.uuid().parse(val(form,'lesson_id'));
  const returnTo=safePath(val(form,'return_to')||'/dashboard');
  const {error}=await db.from('lesson_progress').upsert({user_id:user.sub,lesson_id,completed_at:new Date().toISOString()},{onConflict:'user_id,lesson_id'});if(error)redirect(`${returnTo}?error=progreso-error`);revalidatePath('/dashboard');revalidatePath(returnTo);redirect(`${returnTo}?success=leccion-completada`);
}
export async function sendMessage(form:FormData){
  const {db,user}=await viewer();if(!user)redirect('/login');
  const body=z.string().min(1).max(2000).parse(val(form,'body'));
  const recipient=z.uuid().parse(val(form,'recipient'));
  const returnTo=safePath(val(form,'return_to')||'/dashboard');
  const {error}=await db.from('messages').insert({sender_id:user.sub,recipient_id:recipient,body});if(error)redirect(`${returnTo}?error=mensaje-error`);revalidatePath('/dashboard');revalidatePath('/admin');redirect(`${returnTo}?success=mensaje-enviado`);
}
export async function saveSettings(form:FormData){
 const {db,profile}=await staff();if(!['super_admin','admin'].includes(profile.role))throw new Error('Sin permiso');
 const keys=['bank_name','bank_account','bank_holder','whatsapp_group','paypal_payment_link'];
 const rows=keys.map(key=>({key,value:val(form,key)}));const group=rows.find(r=>r.key==='whatsapp_group')?.value;
 if(group && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(group))redirect('/admin?error=config-whatsapp');
 const paypalLink=rows.find(r=>r.key==='paypal_payment_link')?.value;
 if(paypalLink){try{const url=new URL(paypalLink);if(url.protocol!=='https:'||!['paypal.me','www.paypal.com','paypal.com'].includes(url.hostname))throw new Error();}catch{redirect('/admin?error=config-paypal');}}
 const {error}=await db.from('settings').upsert(rows);if(error)redirect('/admin?error=config-error');revalidatePath('/admin');revalidatePath('/dashboard');redirect('/admin?success=config-guardada');
}

export async function updatePassword(form:FormData){
 const db=await serverDb();const password=val(form,'password');if(password.length<10)redirect('/update-password?error=short');
 const {data}=await db.auth.getClaims();if(!data?.claims)redirect('/login');
 const {error}=await db.auth.updateUser({password});if(error)redirect('/update-password?error=failed');redirect('/dashboard');
}
