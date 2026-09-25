import { redirect } from 'next/navigation';
import Link from 'next/link';
import CommunityProfileEditor from '@/components/CommunityProfileEditor';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { db, user } = await viewer();
  if (!user) redirect('/login?next=/dashboard/perfil');

  const [{ data: profile }, { data: rows }] = await Promise.all([
    db.from('community_profiles')
      .select('display_name,country,bio,instagram_url,funded_accounts_count,trading_capital_usd,avatar_path,is_public')
      .eq('user_id', user.sub).maybeSingle(),
    db.from('trading_certificates')
      .select('id,title,issuer,file_path,is_public,created_at')
      .eq('user_id', user.sub).order('created_at', { ascending: false }),
  ]);

  const initialProfile = {
    display_name: profile?.display_name || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    instagram_url: profile?.instagram_url || null,
    funded_accounts_count: profile?.funded_accounts_count || 0,
    trading_capital_usd: Number(profile?.trading_capital_usd || 0),
    avatar_path: profile?.avatar_path || null,
    is_public: profile?.is_public || false,
  };
  const [{ data: avatar }, certificates] = await Promise.all([
    initialProfile.avatar_path ? db.storage.from('profile-avatars').createSignedUrl(initialProfile.avatar_path, 3600) : Promise.resolve({ data: null }),
    Promise.all((rows || []).map(async (row) => {
      const { data } = await db.storage.from('trading-certificates').createSignedUrl(row.file_path, 3600);
      return { ...row, signed_url: data?.signedUrl || null };
    })),
  ]);

  return (
    <main className="shell layout">
      <aside className="sidebar">
        <Link href="/dashboard">← Volver a Mi espacio</Link>
        <Link href="/comunidad">Comunidad</Link>
        <Link href="/dashboard/pagos">Pagos</Link>
      </aside>
      <div className="dashboard stack">
        <div className="page-head profile-page-head">
          <span className="eyebrow">Perfil de estudiante</span>
          <h1>Tu historia, tu progreso.</h1>
          <p>Personaliza cómo te ve la comunidad y celebra cada avance en tu camino como trader.</p>
        </div>
        <CommunityProfileEditor
          userId={user.sub}
          initialProfile={initialProfile}
          initialAvatarUrl={avatar?.signedUrl || null}
          initialCertificates={certificates}
        />
      </div>
    </main>
  );
}
