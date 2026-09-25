'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type Profile = {
  display_name: string; country: string; bio: string; instagram_url: string | null;
  funded_accounts_count: number; trading_capital_usd: number; avatar_path: string | null;
  banner_path: string | null; avatar_url: string | null; banner_url: string | null;
};
type Post = { id: string; user_id: string; media_path: string; caption: string; is_hidden: boolean; created_at: string; image_url: string | null };
type Reaction = { post_id: string; user_id: string; emoji: string };
type Comment = { id: string; post_id: string; user_id: string; body: string; is_hidden: boolean; created_at: string; author_name: string };
const REACTIONS = ['❤️','🔥','👏','💎','🚀','😂'];

export default function CommunityPublicProfile({
  userId, viewerId, isOwner, isModerator, isPublic, isVip, profile, initialPosts, initialReactions, initialCommentCounts,
}: {
  userId: string; viewerId: string; isOwner: boolean; isModerator: boolean; isPublic: boolean; isVip: boolean;
  profile: Profile; initialPosts: Post[]; initialReactions: Reaction[]; initialCommentCounts: Record<string, number>;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [reactions, setReactions] = useState(initialReactions);
  const [commentCounts, setCommentCounts] = useState(initialCommentCounts);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const db = browserDb();
    const channel = db.channel(`community:profile:${userId}`, { config: { private: true } });
    channel.on('broadcast', { event: 'reaction' }, (event) => {
      const payload = (event as { payload?: Record<string, unknown> }).payload || event as unknown as Record<string, unknown>;
      if (typeof payload.post_id !== 'string' || typeof payload.user_id !== 'string' || typeof payload.emoji !== 'string') return;
      setReactions((current) => {
        const exists = current.some((item) => item.post_id === payload.post_id && item.user_id === payload.user_id && item.emoji === payload.emoji);
        if (payload.added === true && !exists) return [...current, { post_id: payload.post_id as string, user_id: payload.user_id as string, emoji: payload.emoji as string }];
        if (payload.added === false && exists) return current.filter((item) => !(item.post_id === payload.post_id && item.user_id === payload.user_id && item.emoji === payload.emoji));
        return current;
      });
    });
    void db.realtime.setAuth().then(() => channel.subscribe());
    return () => { void db.removeChannel(channel); };
  }, [userId]);

  async function toggleReaction(postId: string, emoji: string) {
    const exists = reactions.some((item) => item.post_id === postId && item.user_id === viewerId && item.emoji === emoji);
    const db = browserDb();
    const result = exists
      ? await db.from('community_post_reactions').delete().eq('post_id', postId).eq('user_id', viewerId).eq('emoji', emoji)
      : await db.from('community_post_reactions').insert({ post_id: postId, user_id: viewerId, emoji });
    if (result.error) { setNotice('No se pudo guardar la reacción. Inténtalo de nuevo.'); return; }
    setReactions((current) => exists
      ? current.filter((item) => !(item.post_id === postId && item.user_id === viewerId && item.emoji === emoji))
      : current.some((item) => item.post_id === postId && item.user_id === viewerId && item.emoji === emoji) ? current : [...current, { post_id: postId, user_id: viewerId, emoji }]);
  }

  async function loadComments(postId: string) {
    if (openPost === postId) { setOpenPost(null); return; }
    setOpenPost(postId);
    if (comments[postId]) return;
    const db = browserDb();
    const { data, error } = await db.from('community_post_comments').select('id,post_id,user_id,body,is_hidden,created_at').eq('post_id', postId).order('created_at', { ascending: true }).limit(100);
    if (error || !data) { setNotice('No se pudieron cargar los comentarios.'); return; }
    const authorIds = [...new Set(data.map((item) => item.user_id))];
    const { data: authors } = authorIds.length ? await db.from('community_profiles').select('user_id,display_name').in('user_id', authorIds) : { data: [] };
    const names = new Map((authors || []).map((item) => [item.user_id, item.display_name]));
    setComments((current) => ({ ...current, [postId]: data.map((item) => ({ ...item, author_name: names.get(item.user_id) || 'Trader' })) }));
  }

  async function addComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const body = (drafts[postId] || '').trim();
    if (!body || body.length > 500) return;
    setCommenting(true);
    const { data, error } = await browserDb().from('community_post_comments').insert({ post_id: postId, user_id: viewerId, body }).select('id,post_id,user_id,body,is_hidden,created_at').single();
    if (error || !data) { setNotice('No se pudo publicar el comentario.'); setCommenting(false); return; }
    const ownComment: Comment = { ...data, author_name: isOwner ? profile.display_name : 'Tú' };
    setComments((current) => ({ ...current, [postId]: [...(current[postId] || []), ownComment] }));
    setCommentCounts((current) => ({ ...current, [postId]: (current[postId] || 0) + 1 }));
    setDrafts((current) => ({ ...current, [postId]: '' }));
    setCommenting(false);
  }

  async function publishPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!photo) { setNotice('Elige una foto para publicar.'); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) { setNotice('Usa JPG, PNG o WebP de máximo 5 MB.'); return; }
    setUploading(true);
    const ext = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1];
    const path = `${userId}/posts/${crypto.randomUUID()}.${ext}`;
    const db = browserDb();
    const { error: uploadError } = await db.storage.from('community-media').upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploadError) { setNotice('No se pudo subir la foto. Revisa tu conexión.'); setUploading(false); return; }
    const { data, error } = await db.from('community_posts').insert({ user_id: userId, media_path: path, caption: caption.trim() }).select('id,user_id,media_path,caption,is_hidden,created_at').single();
    if (error || !data) {
      await db.storage.from('community-media').remove([path]);
      setNotice('No se pudo publicar la foto. Confirma que tu perfil esté público.');
      setUploading(false);
      return;
    }
    const { data: signed } = await db.storage.from('community-media').createSignedUrl(path, 3600);
    setPosts((current) => [{ ...data, image_url: signed?.signedUrl || null }, ...current]);
    setPhoto(null); setCaption(''); setNotice('Foto publicada en tu perfil.'); setUploading(false);
    form.reset();
  }

  async function deletePost(post: Post) {
    if (!window.confirm('¿Eliminar esta foto y sus comentarios?')) return;
    const { error } = await browserDb().from('community_posts').delete().eq('id', post.id).eq('user_id', viewerId);
    if (error) { setNotice('No se pudo eliminar la publicación.'); return; }
    await browserDb().storage.from('community-media').remove([post.media_path]);
    setPosts((current) => current.filter((item) => item.id !== post.id));
  }

  async function moderatePost(post: Post) {
    const reason = window.prompt('Motivo para ocultar esta publicación:');
    if (!reason?.trim()) return;
    const { error } = await browserDb().rpc('community_admin_hide_post', { p_post: post.id, p_hidden: !post.is_hidden, p_reason: reason.trim() });
    if (error) setNotice('No se pudo actualizar la moderación.');
    else setPosts((current) => current.map((item) => item.id === post.id ? { ...item, is_hidden: !item.is_hidden } : item));
  }

  async function moderateComment(comment: Comment) {
    const reason = window.prompt('Motivo para retirar este comentario:');
    if (!reason?.trim()) return;
    const { error } = await browserDb().rpc('community_admin_hide_comment', { p_comment: comment.id, p_hidden: !comment.is_hidden, p_reason: reason.trim() });
    if (error) setNotice('No se pudo actualizar la moderación.');
    else setComments((current) => ({ ...current, [comment.post_id]: (current[comment.post_id] || []).map((item) => item.id === comment.id ? { ...item, is_hidden: !item.is_hidden } : item) }));
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    setPhoto(event.target.files?.[0] || null);
  }

  return (
    <main className="community-profile-page shell">
      <Link className="community-back-link" href="/comunidad">← Volver a la comunidad</Link>
      <section className="public-profile-card">
        <div className="public-profile-banner" style={profile.banner_url ? { backgroundImage: `linear-gradient(90deg,#07100bbf,#07100b15),url("${profile.banner_url}")` } : undefined}>
          {!profile.banner_url && <div className="public-profile-banner-art" aria-hidden="true"><span>✦</span><span>↗</span></div>}
          {isOwner && <Link className="public-profile-edit-link" href="/dashboard/perfil">Editar perfil</Link>}
        </div>
        <div className="public-profile-identity">
          <div className="public-profile-avatar">{profile.avatar_url ? <Image unoptimized src={profile.avatar_url} width={104} height={104} alt={`Foto de ${profile.display_name}`} /> : <span>{profile.display_name.slice(0,1).toUpperCase() || 'T'}</span>}</div>
          <div className="public-profile-name-block"><h1>{profile.display_name || 'Trader'}</h1><div className="public-profile-badges"><span className={isVip ? 'profile-membership-badge is-vip' : 'profile-membership-badge'}>{isVip ? '💎 Miembro VIP' : '🌱 Miembro'}</span>{profile.country && <span className="profile-country">{profile.country}</span>}</div></div>
          {profile.instagram_url && <a className="profile-instagram-link" href={profile.instagram_url} target="_blank" rel="noreferrer">Instagram ↗</a>}
        </div>
        <div className="public-profile-stats"><div><strong>{initialPosts.length}</strong><span>Fotos</span></div><div><strong>{profile.funded_accounts_count}</strong><span>Cuentas</span></div><div><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(profile.trading_capital_usd)}</strong><span>Capital de fondeo</span></div></div>
        {profile.bio && <section className="public-profile-story"><span className="eyebrow">MI HISTORIA</span><p>{profile.bio}</p></section>}
      </section>

      {isOwner && !isPublic && <section className="profile-private-callout"><span>🔒</span><div><strong>Tu perfil aún es privado</strong><p>Activa “Mostrar mi perfil en Comunidad” para compartir tu historia y publicar fotos.</p></div><Link className="button" href="/dashboard/perfil">Configurar perfil</Link></section>}
      {isOwner && isPublic && <form className="profile-new-post" onSubmit={publishPhoto}><div><span className="eyebrow">TU GALERÍA</span><strong>Comparte un avance</strong><small>Publica una foto de trading, un logro o una idea para la comunidad.</small></div><label className="profile-photo-picker">{photo ? `📷 ${photo.name}` : '＋ Elegir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={600} placeholder="Añade una descripción…" aria-label="Descripción de la foto" /><button disabled={uploading || !photo}>{uploading ? 'Publicando…' : 'Publicar'}</button></form>}

      <section className="profile-gallery-section"><div className="profile-gallery-heading"><div><span className="eyebrow">MOMENTOS Y LOGROS</span><h2>Galería</h2></div><span>{posts.length} {posts.length === 1 ? 'foto' : 'fotos'}</span></div>
        {!posts.length ? <div className="profile-gallery-empty"><span>📷</span><strong>{isOwner ? 'Tu galería comienza aquí' : 'Todavía no hay fotos'}</strong><p>{isOwner ? 'Comparte la primera imagen de tu recorrido como trader.' : 'Cuando publique fotos, aparecerán aquí.'}</p></div> : <div className="profile-post-grid">{posts.map((post) => {
          const postReactions = reactions.filter((item) => item.post_id === post.id);
          return <article className={`profile-post-card ${post.is_hidden ? 'is-hidden' : ''}`} key={post.id}>
            {post.image_url && <a href={post.image_url} target="_blank" rel="noreferrer" className="profile-post-image-link"><Image unoptimized src={post.image_url} alt={post.caption || `Foto de ${profile.display_name}`} width={800} height={800} className="profile-post-image" /></a>}
            {post.is_hidden && <div className="profile-post-hidden">Publicación retirada por moderación.</div>}
            {post.caption && <p className="profile-post-caption">{post.caption}</p>}
            <div className="profile-post-actions">{REACTIONS.map((emoji) => {
              const matches = postReactions.filter((item) => item.emoji === emoji);
              if (!matches.length && emoji !== '❤️') return null;
              return <button type="button" key={emoji} className={`profile-post-reaction ${matches.some((item) => item.user_id === viewerId) ? 'is-reacted' : ''}`} onClick={() => void toggleReaction(post.id, emoji)} aria-label={`Reaccionar ${emoji}: ${matches.length}`}>{emoji}<span>{matches.length}</span></button>;
            })}<button type="button" className="profile-comment-toggle" onClick={() => void loadComments(post.id)}>💬 <span>{commentCounts[post.id] || 0}</span></button>{isOwner && <button type="button" className="profile-post-delete" onClick={() => void deletePost(post)} aria-label="Eliminar foto">Eliminar</button>}{isModerator && !isOwner && <button type="button" className="profile-post-delete" onClick={() => void moderatePost(post)}>{post.is_hidden ? 'Restaurar' : 'Ocultar'}</button>}</div>
            <time suppressHydrationWarning dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString('es-DO',{day:'numeric',month:'short',year:'numeric'})}</time>
            {openPost === post.id && <div className="profile-comments"><h3>Comentarios</h3>{(comments[post.id] || []).map((comment) => <div className={`profile-comment ${comment.is_hidden ? 'is-hidden' : ''}`} key={comment.id}><span><Link href={`/comunidad/${comment.user_id}`}>{comment.author_name}</Link><small>{comment.is_hidden ? 'Comentario retirado' : comment.body}</small></span>{isModerator && <button type="button" onClick={() => void moderateComment(comment)}>{comment.is_hidden ? 'Restaurar' : 'Ocultar'}</button>}</div>)}{(comments[post.id] || []).length === 0 && <p className="profile-no-comments">Aún no hay comentarios. Inicia la conversación.</p>}<form onSubmit={(event) => void addComment(event, post.id)}><input value={drafts[post.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={500} placeholder="Escribe un comentario…" aria-label="Escribe un comentario" /><button disabled={commenting || !(drafts[post.id] || '').trim()}>Enviar</button></form></div>}
          </article>;
        })}</div>}
      </section>
      {notice && <p className="profile-action-notice" role="status">{notice}</p>}
    </main>
  );
}
