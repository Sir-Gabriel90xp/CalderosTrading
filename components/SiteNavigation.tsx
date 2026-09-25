'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export default function SiteNavigation() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setAuthStatus('signed-out');
      return;
    }

    const db = browserDb();
    let mounted = true;
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (mounted) setAuthStatus(session ? 'signed-in' : 'signed-out');
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') router.refresh();
    });
    void db.auth.getSession().then(({ data }) => {
      if (mounted) setAuthStatus(data.session ? 'signed-in' : 'signed-out');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function signOut() {
    const { error } = await browserDb().auth.signOut();
    if (error) return;
    setAuthStatus('signed-out');
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <Link href="/cursos">Cursos</Link>
      <Link href="/#metodo">Academia</Link>
      {authStatus === 'signed-in' ? (
        <>
          <Link href="/comunidad">Comunidad</Link>
          <Link href="/dashboard">Mi espacio</Link>
          <Link href="/dashboard/perfil">Mi perfil</Link>
          <Link href="/dashboard/pagos">Pagos</Link>
          <button type="button" className="ghost nav-sign-out" onClick={signOut}>Salir</button>
        </>
      ) : authStatus === 'signed-out' ? (
        <>
          <Link href="/login">Entrar</Link>
          <Link href="/register">Crear cuenta</Link>
        </>
      ) : (
        <Link href="/dashboard" aria-label="Comprobando tu sesión">Mi espacio</Link>
      )}
    </>
  );
}
