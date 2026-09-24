/** Evita que las páginas públicas lancen un error 500 si falta la configuración. */
export function supabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  try {
    return new URL(url).protocol === 'https:' && key.trim().length > 0;
  } catch {
    return false;
  }
}
