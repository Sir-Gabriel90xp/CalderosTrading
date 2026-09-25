'use client';

import Image from 'next/image';
import { ChangeEvent, FormEvent, useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type CommunityProfile = {
  display_name: string;
  country: string;
  bio: string;
  instagram_url: string | null;
  funded_accounts_count: number;
  trading_capital_usd: number;
  avatar_path: string | null;
  is_public: boolean;
};

type Certificate = {
  id: string;
  title: string;
  issuer: string;
  file_path: string;
  is_public: boolean;
  created_at: string;
  signed_url: string | null;
};

const countries = [
  ['DO', '🇩🇴 República Dominicana'], ['US', '🇺🇸 Estados Unidos'], ['MX', '🇲🇽 México'],
  ['CO', '🇨🇴 Colombia'], ['AR', '🇦🇷 Argentina'], ['CL', '🇨🇱 Chile'],
  ['PE', '🇵🇪 Perú'], ['VE', '🇻🇪 Venezuela'], ['EC', '🇪🇨 Ecuador'],
  ['CR', '🇨🇷 Costa Rica'], ['PA', '🇵🇦 Panamá'], ['GT', '🇬🇹 Guatemala'],
  ['SV', '🇸🇻 El Salvador'], ['HN', '🇭🇳 Honduras'], ['NI', '🇳🇮 Nicaragua'],
  ['PR', '🇵🇷 Puerto Rico'], ['ES', '🇪🇸 España'], ['OTHER', '🌎 Otro país'],
];

function instagramHref(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const handle = value.replace(/^@/, '');
  const candidate = /^[a-z0-9._]+$/i.test(handle) ? `https://instagram.com/${handle}` : value;
  try {
    const url = new URL(candidate);
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return false;
    if (!/^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)) return false;
    return `https://www.instagram.com${url.pathname.replace(/\/$/, '')}/`;
  } catch {
    return false;
  }
}

function extensionFor(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'application/pdf' && ext === 'pdf') return 'pdf';
  if (file.type === 'image/jpeg' && ['jpg', 'jpeg'].includes(ext || '')) return ext!;
  if (file.type === 'image/png' && ext === 'png') return 'png';
  if (file.type === 'image/webp' && ext === 'webp') return 'webp';
  return null;
}

export default function CommunityProfileEditor({
  userId,
  initialProfile,
  initialAvatarUrl,
  initialCertificates,
}: {
  userId: string;
  initialProfile: CommunityProfile;
  initialAvatarUrl: string | null;
  initialCertificates: Certificate[];
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [certificates, setCertificates] = useState(initialCertificates);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setNotice('Elige una imagen JPG, PNG o WebP de máximo 5 MB.');
      event.target.value = '';
      return;
    }
    setBusy(true);
    setNotice('');
    const db = browserDb();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await db.storage.from('profile-avatars').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setNotice(`No se pudo subir la foto: ${uploadError.message}`);
      setBusy(false);
      return;
    }
    const { error } = await db.from('community_profiles').upsert({ user_id: userId, avatar_path: path }, { onConflict: 'user_id' });
    if (error) {
      await db.storage.from('profile-avatars').remove([path]);
      setNotice(`No se pudo guardar la foto: ${error.message}`);
      setBusy(false);
      return;
    }
    if (profile.avatar_path && profile.avatar_path !== path) {
      await db.storage.from('profile-avatars').remove([profile.avatar_path]);
    }
    const { data } = await db.storage.from('profile-avatars').createSignedUrl(path, 3600);
    setAvatarUrl(data?.signedUrl || null);
    setProfile((current) => ({ ...current, avatar_path: path }));
    setNotice('Foto de perfil actualizada.');
    setBusy(false);
    event.target.value = '';
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('display_name') || '').trim();
    const country = String(form.get('country') || '').trim();
    const bio = String(form.get('bio') || '').trim();
    const instagram = instagramHref(String(form.get('instagram') || ''));
    const accounts = Number(form.get('funded_accounts_count'));
    const capital = Number(form.get('trading_capital_usd'));
    const isPublic = form.get('is_public') === 'on';
    if (name.length < 2 || name.length > 80) {
      setNotice('Escribe un nombre de entre 2 y 80 caracteres.');
      setSaving(false);
      return;
    }
    if (bio.length > 600 || !Number.isInteger(accounts) || accounts < 0 || accounts > 100 || !Number.isFinite(capital) || capital < 0 || capital > 999999999999) {
      setNotice('Revisa la descripción, las cuentas de fondeo y el capital.');
      setSaving(false);
      return;
    }
    if (instagram === false) {
      setNotice('Escribe tu usuario de Instagram o un enlace instagram.com válido.');
      setSaving(false);
      return;
    }
    const next = {
      user_id: userId,
      display_name: name,
      country,
      bio,
      instagram_url: instagram,
      funded_accounts_count: accounts,
      trading_capital_usd: capital,
      avatar_path: profile.avatar_path,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    };
    const { error } = await browserDb().from('community_profiles').upsert(next, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      setNotice(`No se pudo guardar el perfil: ${error.message}`);
      return;
    }
    setProfile(next);
    setNotice(isPublic ? 'Perfil guardado y visible para la comunidad.' : 'Perfil guardado y privado.');
  }

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const issuer = String(data.get('issuer') || '').trim();
    const file = data.get('certificate');
    if (!(file instanceof File) || !file.size) {
      setNotice('Selecciona el certificado que quieres subir.');
      return;
    }
    const ext = extensionFor(file);
    if (!ext || file.size > 10 * 1024 * 1024 || title.length < 2 || title.length > 100 || issuer.length > 100) {
      setNotice('Usa PDF, JPG, PNG o WebP (máximo 10 MB) e indica un título válido.');
      return;
    }
    setBusy(true);
    setNotice('');
    const db = browserDb();
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await db.storage.from('trading-certificates').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setNotice(`No se pudo subir el certificado: ${uploadError.message}`);
      setBusy(false);
      return;
    }
    const { data: row, error } = await db.from('trading_certificates')
      .insert({ user_id: userId, title, issuer, file_path: path, is_public: false })
      .select('id,title,issuer,file_path,is_public,created_at').single();
    if (error || !row) {
      await db.storage.from('trading-certificates').remove([path]);
      setNotice(`No se pudo guardar el certificado: ${error?.message || 'intenta otra vez'}`);
      setBusy(false);
      return;
    }
    const { data: signed } = await db.storage.from('trading-certificates').createSignedUrl(path, 3600);
    setCertificates((items) => [{ ...row, signed_url: signed?.signedUrl || null }, ...items]);
    form.reset();
    setNotice('Certificado subido. Solo tú puedes verlo hasta que decidas compartirlo.');
    setBusy(false);
  }

  async function toggleCertificate(certificate: Certificate) {
    setBusy(true);
    const { error } = await browserDb().from('trading_certificates')
      .update({ is_public: !certificate.is_public })
      .eq('id', certificate.id)
      .eq('user_id', userId);
    if (error) setNotice(`No se pudo cambiar la privacidad: ${error.message}`);
    else {
      setCertificates((items) => items.map((item) => item.id === certificate.id ? { ...item, is_public: !item.is_public } : item));
      setNotice(certificate.is_public ? 'El certificado volvió a ser privado.' : profile.is_public ? 'El certificado ya aparece en tu perfil comunitario.' : 'Certificado marcado para compartir. Activa tu perfil público para que aparezca en Comunidad.');
    }
    setBusy(false);
  }

  async function deleteCertificate(certificate: Certificate) {
    if (!window.confirm(`¿Eliminar “${certificate.title}” y su archivo?`)) return;
    setBusy(true);
    const db = browserDb();
    const { error } = await db.from('trading_certificates').delete().eq('id', certificate.id).eq('user_id', userId);
    if (error) setNotice(`No se pudo eliminar: ${error.message}`);
    else {
      await db.storage.from('trading-certificates').remove([certificate.file_path]);
      setCertificates((items) => items.filter((item) => item.id !== certificate.id));
      setNotice('Certificado eliminado.');
    }
    setBusy(false);
  }

  return (
    <div className="stack">
      <section className="card profile-editor-card">
        <div className="profile-editor-heading">
          <div>
            <span className="eyebrow">Tu espacio en la comunidad</span>
            <h2>Crea un perfil que te represente</h2>
            <p>Comparte tu camino en el trading y celebra tus avances con otros estudiantes.</p>
          </div>
          <div className="profile-avatar-upload">
            {avatarUrl ? <Image unoptimized src={avatarUrl} width={112} height={112} alt={`Foto de ${profile.display_name || 'tu perfil'}`} className="profile-avatar" /> : <div className="profile-avatar profile-avatar-placeholder">{profile.display_name.slice(0, 1).toUpperCase() || '✦'}</div>}
            <label className="button ghost avatar-pick">{busy ? 'Procesando…' : 'Cambiar foto'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} disabled={busy} /></label>
          </div>
        </div>

        <form onSubmit={saveProfile} className="profile-form">
          <label>Nombre público<input name="display_name" defaultValue={profile.display_name} placeholder="Cómo quieres que te conozcan" maxLength={80} required /></label>
          <label>País<select name="country" defaultValue={profile.country}><option value="">Elige tu país</option>{countries.map(([code, label]) => <option key={code} value={label.replace(/^\S+\s/, '')}>{label}</option>)}</select></label>
          <label>Cuentas de fondeo<input name="funded_accounts_count" type="number" min="0" max="100" step="1" defaultValue={profile.funded_accounts_count} /></label>
          <label>Capital fondeado en USD<input name="trading_capital_usd" type="number" min="0" max="999999999999" step="0.01" defaultValue={profile.trading_capital_usd} /><small>Usamos USD para que el ranking compare el capital en una sola moneda.</small></label>
          <label className="profile-full-row">Descripción<textarea name="bio" defaultValue={profile.bio} maxLength={600} rows={5} placeholder="Cuéntales a los demás qué operas, qué estás aprendiendo o cuál es tu meta." /></label>
          <label className="profile-full-row">Instagram<input name="instagram" defaultValue={profile.instagram_url || ''} placeholder="@tuusuario o https://instagram.com/tuusuario" maxLength={200} /></label>
          <label className="profile-visibility profile-full-row"><input type="checkbox" name="is_public" defaultChecked={profile.is_public} /><span><strong>Mostrar mi perfil en Comunidad</strong><small>Si lo activas, los demás verán tu nombre, país, descripción, cuentas de fondeo, capital, foto, Instagram y certificados que marques como compartidos.</small></span></label>
          <div className="profile-full-row profile-form-footer"><span className="meta">El capital y las cuentas solo se muestran si publicas tu perfil.</span><button disabled={saving || busy}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
        </form>
      </section>

      <section className="card certificate-manager">
        <div className="section-head"><div><span className="eyebrow">Prueba tu progreso</span><h2>Certificados de trading</h2><p>Sube un certificado de fondeo o de una evaluación. Se mantiene privado hasta que lo compartas.</p></div><span className="certificate-count">{certificates.length} {certificates.length === 1 ? 'certificado' : 'certificados'}</span></div>
        <form onSubmit={uploadCertificate} className="certificate-upload-form">
          <label>Nombre del certificado<input name="title" maxLength={100} required placeholder="Ej. Cuenta fondeada de 50K" /></label>
          <label>Firma o programa<input name="issuer" maxLength={100} placeholder="Ej. Firma de fondeo" /></label>
          <label className="certificate-file">Archivo (PDF o imagen, máximo 10 MB)<input name="certificate" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
          <button disabled={busy}>{busy ? 'Subiendo…' : 'Subir certificado'}</button>
        </form>
        {!certificates.length ? <div className="certificate-empty"><span>🏅</span><p>Tus certificados aparecerán aquí. Tú decides cuándo compartirlos.</p></div> : <div className="certificate-own-list">{certificates.map((certificate) => <article className="certificate-own-item" key={certificate.id}>
          <div className="certificate-file-icon">{certificate.file_path.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}</div>
          <div className="certificate-own-info"><strong>{certificate.title}</strong><small>{certificate.issuer || 'Trading'} · {new Date(certificate.created_at).toLocaleDateString('es-DO')}</small><span className={certificate.is_public && profile.is_public ? 'badge' : 'badge dim'}>{certificate.is_public ? profile.is_public ? 'Compartido' : 'Listo para compartir' : 'Privado'}</span></div>
          <div className="certificate-own-actions">{certificate.signed_url && <a className="button ghost" href={certificate.signed_url} target="_blank" rel="noreferrer">Ver archivo</a>}<button type="button" className="ghost" disabled={busy} onClick={() => toggleCertificate(certificate)}>{certificate.is_public ? 'Hacer privado' : 'Compartir'}</button><button type="button" className="ghost danger-button" disabled={busy} onClick={() => deleteCertificate(certificate)}>Eliminar</button></div>
        </article>)}</div>}
      </section>
      <p className="notice" role="status" aria-live="polite">{notice || 'Tu perfil comunitario es privado hasta que actives “Mostrar mi perfil en Comunidad”.'}</p>
    </div>
  );
}
