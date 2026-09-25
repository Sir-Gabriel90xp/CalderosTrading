import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hideTradingCertificate, moderateCommunityProfile } from '@/app/actions';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string; success?: string }>;

const errors: Record<string, string> = {
  'sin-permiso': 'No tienes permiso para moderar la comunidad.',
  'datos-perfil': 'Revisa el nombre, país, descripción, cuentas, capital y motivo de la revisión.',
  'instagram-invalido': 'El enlace debe apuntar a un perfil de Instagram válido.',
  'moderacion-error': 'No se pudo guardar la revisión. Actualiza los datos e inténtalo de nuevo.',
  'datos-certificado': 'Escribe un motivo válido para ocultar el certificado.',
  'certificado-error': 'No se pudo ocultar el certificado. Puede que ya haya sido moderado.',
};

export default async function CommunityModerationPage({ searchParams }: { searchParams: SearchParams }) {
  const { db, user, profile } = await viewer();
  if (!user) redirect('/login?next=/admin/comunidad');
  if (!['super_admin', 'admin'].includes(profile?.role || '')) redirect('/dashboard');

  const params = await searchParams;
  const [{ data: profiles }, { data: certificates }] = await Promise.all([
    db.from('community_profiles')
      .select('user_id,display_name,country,bio,instagram_url,funded_accounts_count,trading_capital_usd,avatar_path,is_public,updated_at')
      .order('updated_at', { ascending: false }).limit(250),
    db.from('trading_certificates')
      .select('id,user_id,title,issuer,file_path,created_at')
      .eq('is_public', true).order('created_at', { ascending: false }).limit(200),
  ]);
  const userIds = [...new Set([...(profiles || []).map((item) => item.user_id), ...(certificates || []).map((item) => item.user_id)])];
  const { data: accounts } = userIds.length
    ? await db.from('profiles').select('id,email').in('id', userIds)
    : { data: [] };
  const accountById = new Map((accounts || []).map((account) => [account.id, account]));
  const [avatarResults, certificateResults] = await Promise.all([
    Promise.all((profiles || []).map(async (item) => {
      if (!item.avatar_path || !item.is_public) return [item.user_id, null] as const;
      const { data } = await db.storage.from('profile-avatars').createSignedUrl(item.avatar_path, 1800);
      return [item.user_id, data?.signedUrl || null] as const;
    })),
    Promise.all((certificates || []).map(async (item) => {
      const { data } = await db.storage.from('trading-certificates').createSignedUrl(item.file_path, 600);
      return [item.id, data?.signedUrl || null] as const;
    })),
  ]);
  const avatars = new Map(avatarResults);
  const certificateLinks = new Map(certificateResults);
  const error = params.error ? errors[params.error] || 'La operación no pudo completarse.' : null;
  const success = params.success === 'perfil-moderado'
    ? 'La revisión del perfil se guardó y quedó registrada.'
    : params.success === 'certificado-ocultado'
      ? 'El certificado dejó de aparecer en Comunidad; el archivo original sigue en la cuenta del estudiante.'
      : null;

  return (
    <main className="shell layout admin-layout moderation-layout">
      <aside className="sidebar admin-sidebar" aria-label="Navegación de administración">
        <div className="sidebar-group">
          <span className="sidebar-label">Administración</span>
          <Link href="/admin">← Volver al panel</Link>
          <a href="#perfiles">Perfiles</a>
          <a href="#certificados">Certificados</a>
        </div>
      </aside>
      <div className="dashboard stack">
        <header className="moderation-heading">
          <span className="eyebrow">CalderosTrading · Control de comunidad</span>
          <h1>Moderación</h1>
          <p>Revisa el contenido público, corrige datos que no correspondan y deja constancia del motivo.</p>
        </header>
        {error && <div className="notice warning" role="alert">{error}</div>}
        {success && <div className="notice" role="status">{success}</div>}

        <section id="perfiles" className="card moderation-section">
          <div className="section-head">
            <div><span className="eyebrow">Perfiles de estudiantes</span><h2>Revisar perfiles comunitarios</h2><p className="tiny">Puedes corregir nombre, biografía, datos declarados o volver privado un perfil. Cada cambio registra quién lo hizo y por qué.</p></div>
            <span className="badge">{profiles?.length || 0} perfiles</span>
          </div>
          {!profiles?.length ? <div className="crm-empty-state"><span>👥</span><div><h3>No hay perfiles que revisar</h3><p className="tiny">Los perfiles creados aparecerán aquí.</p></div></div> : (
            <div className="moderation-profile-list">
              {profiles.map((item) => {
                const account = accountById.get(item.user_id);
                const avatarUrl = avatars.get(item.user_id);
                return (
                  <details className="moderation-profile-card" key={item.user_id}>
                    <summary>
                      <span className="moderation-avatar">{avatarUrl ? <Image unoptimized src={avatarUrl} width={50} height={50} alt="" /> : <b>{item.display_name.slice(0, 1).toUpperCase() || 'T'}</b>}</span>
                      <span className="moderation-profile-summary"><strong>{item.display_name || 'Sin nombre público'}</strong><small>{account?.email || 'Cuenta de estudiante'} · {item.country || 'Sin país'}</small></span>
                      <span className={item.is_public ? 'badge' : 'badge dim'}>{item.is_public ? 'Público' : 'Privado'}</span>
                    </summary>
                    <form action={moderateCommunityProfile} className="moderation-profile-form">
                      <input type="hidden" name="user_id" value={item.user_id} />
                      <label>Nombre público<input name="display_name" defaultValue={item.display_name} minLength={2} maxLength={80} required /></label>
                      <label>País<input name="country" defaultValue={item.country} maxLength={80} /></label>
                      <label>Cuentas de fondeo<input name="funded_accounts_count" type="number" min={0} max={100} step={1} defaultValue={item.funded_accounts_count} required /></label>
                      <label>Capital declarado (USD)<input name="trading_capital_usd" type="number" min={0} max={999999999999.99} step="0.01" defaultValue={Number(item.trading_capital_usd)} required /></label>
                      <label className="moderation-full-row">Biografía<textarea name="bio" defaultValue={item.bio} maxLength={600} rows={4} /></label>
                      <label className="moderation-full-row">Instagram<input name="instagram_url" defaultValue={item.instagram_url || ''} placeholder="https://instagram.com/usuario" maxLength={200} /></label>
                      <label className="profile-visibility moderation-full-row"><input type="checkbox" name="is_public" defaultChecked={item.is_public} /><span><strong>Visible en Comunidad</strong><small>Desmárcalo para ocultar de inmediato el perfil y sus certificados compartidos.</small></span></label>
                      <label className="moderation-full-row">Motivo de revisión<input name="reason" minLength={3} maxLength={300} placeholder="Ej. Nombre no corresponde o capital por verificar" required /></label>
                      <div className="moderation-form-footer"><small>Última actualización: {new Date(item.updated_at).toLocaleDateString('es-DO')}</small><button>Guardar revisión</button></div>
                    </form>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <section id="certificados" className="card moderation-section">
          <div className="section-head">
            <div><span className="eyebrow">Contenido compartido</span><h2>Certificados públicos</h2><p className="tiny">Oculta certificados con información falsa, inapropiada o que no debería ser pública.</p></div>
            <span className="badge">{certificates?.length || 0} publicados</span>
          </div>
          {!certificates?.length ? <p className="muted">No hay certificados públicos pendientes de revisión.</p> : (
            <div className="moderation-certificate-list">
              {certificates.map((certificate) => {
                const account = accountById.get(certificate.user_id);
                const url = certificateLinks.get(certificate.id);
                return (
                  <article className="moderation-certificate-card" key={certificate.id}>
                    <div className="moderation-certificate-info"><span className="certificate-file-icon">{certificate.file_path.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}</span><div><strong>{certificate.title}</strong><small>{certificate.issuer || 'Trading'} · {account?.email || 'Estudiante'} · {new Date(certificate.created_at).toLocaleDateString('es-DO')}</small></div>{url && <a className="button ghost" href={url} target="_blank" rel="noreferrer">Revisar archivo ↗</a>}</div>
                    <form action={hideTradingCertificate} className="moderation-hide-form"><input type="hidden" name="certificate_id" value={certificate.id} /><label>Motivo<input name="reason" minLength={3} maxLength={300} placeholder="Explica por qué se oculta" required /></label><button className="ghost danger-button">Ocultar certificado</button></form>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
