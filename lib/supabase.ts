import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function serverDb() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(items) { try { items.forEach(({name,value,options}) => jar.set(name,value,options)); } catch { /* Server Components no pueden escribir cookies. El proxy las actualiza. */ } }
    }
  });
}
export function adminDb() {
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)throw new Error('Falta SUPABASE_SECRET_KEY en el servidor');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function viewer() {
  const db = await serverDb();
  const {data} = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return {db, user:null, profile:null};
  const {data:profile} = await db.from('profiles').select('*').eq('id',claims.sub).single();
  return {db, user:claims, profile};
}
