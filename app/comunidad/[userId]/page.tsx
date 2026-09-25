import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import CommunityPublicProfile from '@/components/CommunityPublicProfile';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicCommunityProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();
  const { db, user, profile: viewerProfile } = await viewer();
  if (!user) redirect(`/login?next=/comunidad/${userId}`);
  const isOwner = user.sub === userId;
  const isModerator = ['super_admin','admin'].includes(viewerProfile?.role || '');
  const { data: row } = await db.from('community_profiles')
    .select('display_name,country,bio,instagram_url,funded_accounts_count,trading_capital_usd,avatar_path,banner_path,is_public')
    .eq('user_id', userId).maybeSingle();

  if (!row) {
    if (!isOwner) return <main className="shell profile-setup-empty"><span>🔒</span><h1>Perfil no disponible</h1><p>Este miembro todavía no ha compartido su perfil con la comunidad.</p><Link className="button ghost" href="/chat">Volver al chat</Link></main>;
    return <main className="shell profile-setup-empty"><span>✦</span><h1>Tu perfil te espera</h1><p>Crea tu nombre público, añade una foto y comparte tu historia con la comunidad.</p><Link className="button" href="/dashboard/perfil">Configurar mi perfil</Link></main>;
  }
  if (!row.is_public && !isOwner && !isModerator) notFound();

  const [{ data: posts }, { data: vip }] = await Promise.all([
    db.from('community_posts').select('id,user_id,media_path,caption,is_hidden,created_at').eq('user_id', userId).order('created_at',{ascending:false}).limit(24),
    db.rpc('community_profile_vip_status',{p_user:userId}),
  ]);
  const postIds = (posts || []).map((post) => post.id);
  const [{ data: reactions }, { data: commentRows }] = postIds.length ? await Promise.all([
    db.from('community_post_reactions').select('post_id,user_id,emoji').in('post_id',postIds),
    db.from('community_post_comments').select('post_id').in('post_id',postIds).eq('is_hidden',false),
  ]) : [{ data: [] }, { data: [] }];
  const commentCounts: Record<string,number> = {};
  for (const comment of commentRows || []) commentCounts[comment.post_id] = (commentCounts[comment.post_id] || 0) + 1;

  const paths = [row.banner_path,...(posts || []).map((post) => post.media_path)].filter((path): path is string => Boolean(path));
  const [{ data: media },{ data: avatar }] = await Promise.all([
    paths.length ? db.storage.from('community-media').createSignedUrls(paths,3600) : Promise.resolve({data:[]}),
    row.avatar_path ? db.storage.from('profile-avatars').createSignedUrl(row.avatar_path,3600) : Promise.resolve({data:null}),
  ]);
  const mediaUrls = new Map((media || []).flatMap((item) => item.path && item.signedUrl ? [[item.path,item.signedUrl] as const] : []));
  const profile = {
    display_name: row.display_name || 'Trader',
    country: row.country || '',
    bio: row.bio || '',
    instagram_url: row.instagram_url,
    funded_accounts_count: row.funded_accounts_count,
    trading_capital_usd: Number(row.trading_capital_usd),
    avatar_path: row.avatar_path,
    banner_path: row.banner_path,
    avatar_url: avatar?.signedUrl || null,
    banner_url: row.banner_path ? mediaUrls.get(row.banner_path) || null : null,
  };
  const initialPosts = (posts || []).map((post) => ({...post,image_url:mediaUrls.get(post.media_path) || null}));

  return <CommunityPublicProfile
    userId={userId}
    viewerId={user.sub}
    isOwner={isOwner}
    isModerator={isModerator}
    isPublic={row.is_public}
    isVip={Boolean(vip)}
    profile={profile}
    initialPosts={initialPosts}
    initialReactions={reactions || []}
    initialCommentCounts={commentCounts}
  />;
}
