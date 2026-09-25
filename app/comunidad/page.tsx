import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const medals = ['🥇', '🥈', '🥉'];
const countryFlags: Record<string, string> = {
  'República Dominicana': '🇩🇴', 'Estados Unidos': '🇺🇸', México: '🇲🇽', Colombia: '🇨🇴',
  Argentina: '🇦🇷', Chile: '🇨🇱', Perú: '🇵🇪', Venezuela: '🇻🇪', Ecuador: '🇪🇨',
  'Costa Rica': '🇨🇷', Panamá: '🇵🇦', Guatemala: '🇬🇹', 'El Salvador': '🇸🇻',
  Honduras: '🇭🇳', Nicaragua: '🇳🇮', 'Puerto Rico': '🇵🇷', España: '🇪🇸',
};

type CommunityCertificate = {
  id: string;
  user_id: string;
  title: string;
  issuer: string;
  file_path: string;
  created_at: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function isImage(path: string) {
  return /\.(png|jpe?g|webp)$/i.test(path);
}

export default async function CommunityPage() {
  const { db, user } = await viewer();
  if (!user) redirect('/login?next=/comunidad');

  const { data: profiles } = await db.from('community_profiles')
    .select('user_id,display_name,country,bio,instagram_url,funded_accounts_count,trading_capital_usd,avatar_path')
    .eq('is_public', true)
    .order('trading_capital_usd', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  const visibleProfiles = profiles || [];
  const userIds = visibleProfiles.map((profile) => profile.user_id);
  const { data: certificateRows } = userIds.length ? await db.from('trading_certificates')
    .select('id,user_id,title,issuer,file_path,created_at')
    .in('user_id', userIds).eq('is_public', true)
    .order('created_at', { ascending: false }).limit(120) : { data: [] };
  const certificates = (certificateRows || []) as CommunityCertificate[];

  const [avatarUrls, certificateUrls] = await Promise.all([
    Promise.all(visibleProfiles.map(async (profile) => {
      if (!profile.avatar_path) return [profile.user_id, null] as const;
      const { data } = await db.storage.from('profile-avatars').createSignedUrl(profile.avatar_path, 3600);
      return [profile.user_id, data?.signedUrl || null] as const;
    })),
    Promise.all(certificates.map(async (certificate) => {
      const { data } = await db.storage.from('trading-certificates').createSignedUrl(certificate.file_path, 600);
      return [certificate.id, data?.signedUrl || null] as const;
    })),
  ]);
  const avatars = new Map(avatarUrls);
  const certLinks = new Map(certificateUrls);
  const certsByUser = new Map<string, CommunityCertificate[]>();
  for (const cert of certificates) {
    const own = certsByUser.get(cert.user_id) || [];
    own.push(cert);
    certsByUser.set(cert.user_id, own);
  }
  const topThree = visibleProfiles.slice(0, 3);

  return (
    <main className="shell community-page">
      <section className="community-hero">
        <div>
          <span className="eyebrow">CalderosTrading · Comunidad</span>
          <h1>Crece junto a traders que también van por más.</h1>
          <p>Conoce a tus compañeros, celebra sus logros y encuentra inspiración en cada paso del camino.</p>
          <div className="actions">
            <Link className="button" href="/dashboard/perfil">Crear o editar mi perfil</Link>
            <Link className="button ghost" href="#certificados">Ver certificados</Link>
          </div>
        </div>
        <div className="community-highlight"><span>🏆</span><b>{visibleProfiles.length}</b><small>traders compartiendo su progreso</small><div className="community-bling">✦　✧　✦</div></div>
      </section>

      <section className="community-section">
        <div className="section-head community-section-head">
          <div><span className="eyebrow">La tabla de líderes</span><h2>Ranking de capital</h2><p>Las posiciones se calculan con el capital de fondeo que cada estudiante decide compartir.</p></div>
          <span className="community-ranking-note">💵 Montos en USD</span>
        </div>
        {!visibleProfiles.length ? <div className="card community-empty"><span>🌱</span><h3>El ranking empieza contigo</h3><p>Aún no hay perfiles públicos. Completa el tuyo y activa “Mostrar mi perfil en Comunidad” para aparecer aquí.</p><Link className="button" href="/dashboard/perfil">Publicar mi perfil</Link></div> : <>
          <div className="podium-grid">
            {topThree.map((profile, index) => <article className={`podium-card podium-${index + 1}`} key={profile.user_id}>
              <div className="podium-medal">{medals[index]}</div>
              <div className="podium-avatar">{avatars.get(profile.user_id) ? <Image unoptimized src={avatars.get(profile.user_id)!} width={84} height={84} alt={`Foto de ${profile.display_name}`} /> : <span>{profile.display_name.slice(0, 1).toUpperCase() || 'T'}</span>}</div>
              <div className="podium-place">{index === 0 ? 'NÚMERO UNO' : `PUESTO ${index + 1}`}</div>
              <h3>{profile.display_name || 'Trader'}</h3>
              <div className="podium-country">{countryFlags[profile.country] || '🌎'} {profile.country || 'Comunidad global'}</div>
              <strong className="podium-capital">{money(Number(profile.trading_capital_usd))}</strong>
              <div className="podium-stats"><span>🎯 {profile.funded_accounts_count} {profile.funded_accounts_count === 1 ? 'cuenta' : 'cuentas'}</span><span>📜 {(certsByUser.get(profile.user_id) || []).length} certificados</span></div>
              {profile.bio && <p className="podium-bio">“{profile.bio}”</p>}
              {profile.instagram_url && <a className="instagram-link" href={profile.instagram_url} target="_blank" rel="noreferrer">◎ Instagram</a>}
            </article>)}
          </div>
          {visibleProfiles.length > 3 && <div className="card leaderboard-card"><div className="leaderboard-title"><div><span className="eyebrow">Todos los participantes</span><h3>Tabla de posiciones</h3></div><span className="meta">{visibleProfiles.length} perfiles</span></div><div className="tablewrap"><table className="table leaderboard-table"><thead><tr><th>#</th><th>Trader</th><th>País</th><th>Cuentas</th><th>Capital</th><th>Historia</th></tr></thead><tbody>{visibleProfiles.slice(3).map((profile, index) => <tr key={profile.user_id}><td><b>{index + 4}</b></td><td><div className="leaderboard-person">{avatars.get(profile.user_id) ? <Image unoptimized src={avatars.get(profile.user_id)!} width={40} height={40} alt="" /> : <span className="mini-avatar">{profile.display_name.slice(0, 1).toUpperCase() || 'T'}</span>}<strong>{profile.display_name || 'Trader'}</strong></div></td><td>{countryFlags[profile.country] || '🌎'} {profile.country || 'Global'}</td><td>🎯 {profile.funded_accounts_count}</td><td><strong>{money(Number(profile.trading_capital_usd))}</strong></td><td><div className="leaderboard-bio">{profile.bio || 'Trader de la comunidad'}{profile.instagram_url && <a href={profile.instagram_url} target="_blank" rel="noreferrer">◎ Instagram</a>}</div></td></tr>)}</tbody></table></div></div>}
        </>}
      </section>

      <section id="certificados" className="community-section certificates-community">
        <div className="section-head community-section-head"><div><span className="eyebrow">Logros que inspiran</span><h2>Certificados de trading</h2><p>Reconocemos la disciplina y cada paso que te acerca a tus metas.</p></div><span className="community-ranking-note">✨ Compartidos por sus autores</span></div>
        {!certificates.length ? <div className="certificate-community-empty"><span>🏅</span><p>Cuando un estudiante comparta un certificado, aparecerá aquí.</p></div> : <div className="certificate-community-grid">{certificates.map((certificate) => {
          const profile = visibleProfiles.find((item) => item.user_id === certificate.user_id);
          const href = certLinks.get(certificate.id);
          return <article className="certificate-community-card" key={certificate.id}>
            <div className="certificate-preview">{href && isImage(certificate.file_path) ? <Image unoptimized src={href} width={620} height={400} alt={`Certificado: ${certificate.title}`} /> : <div className="certificate-pdf-mark"><span>🏅</span><b>{certificate.file_path.toLowerCase().endsWith('.pdf') ? 'PDF' : 'CERTIFICADO'}</b><small>Logro verificado por su autor</small></div>}</div>
            <div className="certificate-community-info"><span className="eyebrow">{certificate.issuer || 'Logro de trading'}</span><h3>{certificate.title}</h3><div className="certificate-author">{avatars.get(certificate.user_id) ? <Image unoptimized src={avatars.get(certificate.user_id)!} width={34} height={34} alt="" /> : <span className="mini-avatar">{profile?.display_name.slice(0, 1).toUpperCase() || 'T'}</span>}<span>{profile?.display_name || 'Trader'} <small>{countryFlags[profile?.country || ''] || '🌎'} {profile?.country || 'Global'}</small></span>{href && <a className="button ghost" href={href} target="_blank" rel="noreferrer">Ver logro ↗</a>}</div></div>
          </article>;
        })}</div>}
        <div className="share-certificate-cta"><span>Tu próximo logro puede inspirar a alguien.</span><Link href="/dashboard/perfil">Subir mi certificado →</Link></div>
      </section>
      <div className="community-footer-note">💚 El ranking muestra capital declarado por cada trader; todos los perfiles y certificados se comparten solo con el permiso de su dueño.</div>
    </main>
  );
}
