import { redirect } from 'next/navigation';
import CommunityChat from '@/components/CommunityChat';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const { db, user, profile } = await viewer();
  if (!user) redirect('/login?next=/chat');
  if (!profile) redirect('/login?error=perfil');

  const isModerator = ['super_admin', 'admin'].includes(profile.role);
  const [{ data: communityProfile }, { data: activeEnrollments }, { data: initialMessages }, { data: muteRows }] = await Promise.all([
    db.from('community_profiles').select('display_name,avatar_path,is_public').eq('user_id', user.sub).maybeSingle(),
    db.from('enrollments').select('id,expires_at,starts_at').eq('user_id', user.sub).eq('status', 'active').lte('starts_at', new Date().toISOString()).limit(50),
    db.from('chat_messages').select('id,room,user_id,message_type,body,media_path,media_duration_seconds,author_name,author_avatar_path,author_role,author_is_vip,is_hidden,created_at').eq('room', 'general').order('created_at', { ascending: false }).limit(60),
    isModerator ? db.from('chat_mutes').select('user_id,room_scope,muted_until,reason').gt('muted_until', new Date().toISOString()).order('muted_until', { ascending: true }).limit(100) : Promise.resolve({ data: [] }),
  ]);
  const now = Date.now();
  const vipEnrollments = (activeEnrollments || []).filter((item) => !item.expires_at || new Date(item.expires_at).getTime() > now);
  const hasPerpetualAccess = vipEnrollments.some((item) => !item.expires_at);
  const vipAccessUntil = hasPerpetualAccess ? null : vipEnrollments.reduce<string | null>((latest, item) => !latest || new Date(item.expires_at!).getTime() > new Date(latest).getTime() ? item.expires_at : latest, null);
  const muteIds = [...new Set((muteRows || []).map((item) => item.user_id))];
  const messageIds = (initialMessages || []).map((item) => item.id);
  const { data: initialReactions } = messageIds.length
    ? await db.from('chat_message_reactions').select('message_id,user_id,emoji').in('message_id', messageIds)
    : { data: [] };
  const { data: mutedProfiles } = isModerator && muteIds.length
    ? await db.from('community_profiles').select('user_id,display_name').in('user_id', muteIds)
    : { data: [] };
  const mutedNameById = new Map((mutedProfiles || []).map((item) => [item.user_id, item.display_name]));
  const initialMutes = (muteRows || []).map((item) => ({ ...item, display_name: mutedNameById.get(item.user_id) || 'Miembro' }));

  return (
    <main className="shell chat-page">
      <CommunityChat
        userId={user.sub}
        displayName={communityProfile?.display_name || profile.full_name || 'Trader'}
        avatarPath={communityProfile?.avatar_path || null}
        isModerator={isModerator}
        canAccessVip={isModerator || vipEnrollments.length > 0}
        vipAccessUntil={isModerator ? null : vipAccessUntil}
        initialMessages={(initialMessages || []).reverse()}
        initialMutes={initialMutes}
        initialReactions={initialReactions || []}
      />
    </main>
  );
}
