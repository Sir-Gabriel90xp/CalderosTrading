'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { browserDb } from '@/lib/supabase-browser';

type AuthStatus = 'loading' | 'signed-in' | 'signed-out';
type AvatarUpdate = { avatarUrl: string | null; displayName: string };

export default function SiteNavigation() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInitial, setAvatarInitial] = useState('T');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setAuthStatus('signed-out');
      return;
    }

    const db = browserDb();
    let mounted = true;

    async function loadAvatar(user: User) {
      try {
        const { data } = await db.from('community_profiles')
          .select('display_name,avatar_path')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!mounted) return;
        const displayName = data?.display_name || user.email?.split('@')[0] || 'Trader';
        setAvatarInitial(displayName.trim().slice(0, 1).toUpperCase() || 'T');
        if (!data?.avatar_path) {
          setAvatarUrl(null);
          return;
        }
        const { data: signed } = await db.storage.from('profile-avatars').createSignedUrl(data.avatar_path, 3600);
        if (mounted) setAvatarUrl(signed?.signedUrl || null);
      } catch {
        if (mounted) setAvatarUrl(null);
      }
    }

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setAuthStatus(session ? 'signed-in' : 'signed-out');
      if (session?.user) {
        // Supabase recomienda diferir consultas iniciadas desde este callback,
        // para no competir con el bloqueo interno de Auth.
        queueMicrotask(() => { if (mounted) void loadAvatar(session.user); });
      } else {
        setAvatarUrl(null);
        setAvatarInitial('T');
      }
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') router.refresh();
    });
    void db.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthStatus(data.session ? 'signed-in' : 'signed-out');
      if (data.session?.user) void loadAvatar(data.session.user);
    });

    function handleAvatarUpdate(event: Event) {
      const detail = (event as CustomEvent<AvatarUpdate>).detail;
      if (!detail) return;
      setAvatarUrl(detail.avatarUrl);
      setAvatarInitial(detail.displayName.trim().slice(0, 1).toUpperCase() || 'T');
    }
    window.addEventListener('calderos:avatar-updated', handleAvatarUpdate);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('calderos:avatar-updated', handleAvatarUpdate);
    };
  }, [router]);

  async function signOut() {
    setFeedback('');
    try {
      const { error } = await browserDb().auth.signOut();
      if (error) throw error;
      setAuthStatus('signed-out');
      setAvatarUrl(null);
      router.replace('/');
      router.refresh();
    } catch {
      setFeedback('No se pudo cerrar la sesión. Inténtalo otra vez.');
    }
  }

  return (
    <>
      <Link href="/cursos">Cursos</Link>
      <Link href="/#metodo">Academia</Link>
      {authStatus === 'signed-in' ? (
        <>
          <Link href="/comunidad">Comunidad</Link>
          <Link href="/chat">Chat</Link>
          <Link href="/dashboard">Mi espacio</Link>
          <Link href="/dashboard/pagos">Pagos</Link>
          <Link className="nav-avatar-link" href="/dashboard/perfil" aria-label="Abrir mi perfil" title="Abrir mi perfil">
            <span className="nav-avatar">{avatarUrl ? <Image unoptimized src={avatarUrl} width={40} height={40} alt="" /> : <b>{avatarInitial}</b>}</span>
          </Link>
          <button type="button" className="ghost nav-sign-out" onClick={signOut}>Salir</button>
          {feedback && <span className="nav-feedback" role="alert">{feedback}</span>}
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
