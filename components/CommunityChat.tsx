'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { browserDb } from '@/lib/supabase-browser';

type Room = 'general' | 'vip';
type MessageType = 'text' | 'sticker' | 'audio';
type ChatMessage = {
  id: string; room: Room; user_id: string; message_type: MessageType; body: string | null;
  media_path: string | null; media_duration_seconds: number | null; author_name: string;
  author_avatar_path: string | null; author_role: string; author_is_vip: boolean;
  is_hidden: boolean; created_at: string;
};
type ChatMute = { user_id: string; display_name: string; room_scope: string; muted_until: string; reason: string };
type Props = {
  userId: string; displayName: string; avatarPath: string | null;
  isModerator: boolean; canAccessVip: boolean; vipAccessUntil: string | null;
  initialMessages: ChatMessage[]; initialMutes: ChatMute[];
};
type AudioDraft = { blob: Blob; url: string; seconds: number; mime: string };

const STICKERS = ['📈', '🚀', '💎', '🐂', '🐻', '🔥', '🎯', '💰', '🏆', '🧠', '⚡', '🤝', '✅', '🫡', '😂', '👏', '🌙', '🧘'];
const MESSAGE_FIELDS = 'id,room,user_id,message_type,body,media_path,media_duration_seconds,author_name,author_avatar_path,author_role,author_is_vip,is_hidden,created_at';

function extractPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const item = value as Record<string, unknown>;
  if (item.payload && typeof item.payload === 'object') return item.payload as Record<string, unknown>;
  return item;
}

function roleLabel(message: ChatMessage) {
  if (message.author_role === 'super_admin') return { label: '👑 Admin maestro', className: 'chat-badge-master' };
  if (message.author_role === 'admin') return { label: '🛡 Admin', className: 'chat-badge-admin' };
  if (message.author_role === 'instructor') return { label: '🎓 Instructor', className: 'chat-badge-staff' };
  if (message.author_role === 'support') return { label: '💬 Soporte', className: 'chat-badge-staff' };
  if (message.author_is_vip) return { label: '💎 VIP', className: 'chat-badge-vip' };
  return null;
}

export default function CommunityChat({ userId, displayName, avatarPath, isModerator, canAccessVip: initialVipAccess, vipAccessUntil, initialMessages, initialMutes }: Props) {
  const [room, setRoom] = useState<Room>('general');
  const [canAccessVip, setCanAccessVip] = useState(initialVipAccess);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mutes, setMutes] = useState(initialMutes);
  const [draft, setDraft] = useState('');
  const [audioDraft, setAudioDraft] = useState<AudioDraft | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingName, setTypingName] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [mutedPanelOpen, setMutedPanelOpen] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingStartRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const page = shell?.closest<HTMLElement>('.chat-page');
    if (!page) return;

    const viewport = window.visualViewport;
    const updateAvailableHeight = () => {
      const headerHeight = document.querySelector<HTMLElement>('.header')?.getBoundingClientRect().height ?? 0;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      page.style.setProperty('--chat-available-height', `${Math.max(0, visibleHeight - headerHeight)}px`);
    };

    updateAvailableHeight();
    viewport?.addEventListener('resize', updateAvailableHeight);
    viewport?.addEventListener('scroll', updateAvailableHeight);
    window.addEventListener('resize', updateAvailableHeight);
    return () => {
      viewport?.removeEventListener('resize', updateAvailableHeight);
      viewport?.removeEventListener('scroll', updateAvailableHeight);
      window.removeEventListener('resize', updateAvailableHeight);
      page.style.removeProperty('--chat-available-height');
    };
  }, []);

  const roomMessages = useMemo(() => messages.filter((message) => message.room === room), [messages, room]);
  const roomMutes = useMemo(() => mutes.filter((mute) => mute.room_scope === room || mute.room_scope === 'all'), [mutes, room]);

  const setFeedback = useCallback((message: string, error = false) => {
    setNotice(message);
    setNoticeIsError(error);
    if (message) window.setTimeout(() => setNotice((current) => current === message ? '' : current), 5500);
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      const grouped = new Map<Room, ChatMessage[]>();
      for (const message of byId.values()) {
        const list = grouped.get(message.room) || [];
        list.push(message);
        grouped.set(message.room, list);
      }
      return (['general', 'vip'] as const).flatMap((key) =>
        (grouped.get(key) || []).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-80)
      );
    });
  }, []);

  useEffect(() => {
    if (initialVipAccess || isModerator || !vipAccessUntil) return;
    const remaining = new Date(vipAccessUntil).getTime() - Date.now();
    if (remaining <= 0) { setCanAccessVip(false); setRoom((current) => current === 'vip' ? 'general' : current); return; }
    const timer = window.setTimeout(() => {
      setCanAccessVip(false);
      setRoom((current) => current === 'vip' ? 'general' : current);
      setFeedback('Tu acceso VIP venció. El chat general sigue disponible.');
    }, remaining + 250);
    return () => window.clearTimeout(timer);
  }, [initialVipAccess, isModerator, vipAccessUntil, setFeedback]);

  useEffect(() => {
    let active = true;
    const db = browserDb();
    setRoomLoading(true);
    void db.from('chat_messages').select(MESSAGE_FIELDS).eq('room', room).order('created_at', { ascending: false }).limit(60)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setFeedback('No se pudo cargar el historial de esta sala.', true);
        else mergeMessages(((data || []).reverse()) as ChatMessage[]);
        setRoomLoading(false);
      });
    return () => { active = false; };
  }, [room, mergeMessages, setFeedback]);

  useEffect(() => {
    let active = true;
    const db = browserDb();
    const channel = db.channel(`chat:${room}`, { config: { private: true, presence: { key: userId } } });
    channelRef.current = channel;
    setConnection('connecting');

    channel.on('broadcast', { event: 'INSERT' }, (event) => {
      const payload = extractPayload(event);
      const message = ('new' in payload ? payload.new : payload) as ChatMessage;
      if (message?.id && message.room === room) mergeMessages([message]);
    });
    channel.on('broadcast', { event: 'UPDATE' }, (event) => {
      const payload = extractPayload(event);
      if (typeof payload.id !== 'string' || payload.is_hidden !== true) return;
      setMessages((current) => current.map((item) => item.id === payload.id ? { ...item, body: null, media_path: null, is_hidden: true } : item));
    });
    channel.on('broadcast', { event: 'mute' }, (event) => {
      const payload = extractPayload(event);
      if (payload.user_id !== userId) return;
      setFeedback('Un administrador te silenció temporalmente en esta sala.', true);
      setConnection('offline');
      void db.removeChannel(channel);
    });
    channel.on('broadcast', { event: 'vip_access_changed' }, async (event) => {
      const payload = extractPayload(event);
      if (payload.user_id !== userId) return;
      const { data } = await db.from('enrollments').select('expires_at').eq('user_id', userId).eq('status', 'active').limit(50);
      const now = Date.now();
      const allowed = isModerator || (data || []).some((enrollment) => !enrollment.expires_at || new Date(enrollment.expires_at).getTime() > now);
      setCanAccessVip(allowed);
      if (!allowed && room === 'vip') setRoom('general');
    });
    channel.on('broadcast', { event: 'typing' }, (event) => {
      const payload = extractPayload(event);
      if (payload.user_id === userId || typeof payload.name !== 'string') return;
      setTypingName(payload.name);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setTypingName(''), 1800);
    });
    channel.on('presence', { event: 'sync' }, () => setOnlineCount(Object.keys(channel.presenceState()).length));

    void db.realtime.setAuth().then(() => {
      if (!active) return;
      channel.subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setConnection('online');
          void channel.track({ user_id: userId, name: displayName });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline');
        }
      });
    }).catch(() => { if (active) setConnection('offline'); });

    return () => {
      active = false;
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (channelRef.current === channel) channelRef.current = null;
      void db.removeChannel(channel);
    };
  }, [room, userId, displayName, isModerator, mergeMessages, setFeedback]);

  useEffect(() => {
    let active = true;
    const paths = [...new Set(roomMessages.flatMap((message) => [message.media_path, message.author_avatar_path]).filter((path): path is string => typeof path === 'string' && !mediaUrls[path]))];
    if (avatarPath && !mediaUrls[avatarPath]) paths.push(avatarPath);
    if (!paths.length) return;
    const db = browserDb();
    const chatMediaPaths = paths.filter((path) => path.includes('/general/') || path.includes('/vip/'));
    if (chatMediaPaths.length) {
      void db.storage.from('chat-media').createSignedUrls(chatMediaPaths, 3600).then(({ data }) => {
        if (!active) return;
        const values: Record<string, string> = {};
        for (const item of data || []) if (item.path && item.signedUrl) values[item.path] = item.signedUrl;
        setMediaUrls((current) => ({ ...current, ...values }));
      });
    }
    const avatarPaths = paths.filter((path) => path === avatarPath || roomMessages.some((message) => message.author_avatar_path === path));
    if (avatarPaths.length) {
      void db.storage.from('profile-avatars').createSignedUrls(avatarPaths, 3600).then(({ data }) => {
        if (!active) return;
        const values: Record<string, string> = {};
        for (const item of data || []) if (item.path && item.signedUrl) values[item.path] = item.signedUrl;
        setMediaUrls((current) => ({ ...current, ...values }));
      });
    }
    return () => { active = false; };
  }, [roomMessages, avatarPath, mediaUrls]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [roomMessages.length, room]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioDraft) URL.revokeObjectURL(audioDraft.url);
  }, [audioDraft]);

  function sendTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 900) return;
    lastTypingSentRef.current = now;
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, name: displayName } });
  }

  async function postMessage(type: MessageType, body: string | null, file?: Blob, mime?: string, duration?: number) {
    if (sending || (room === 'vip' && !canAccessVip)) return;
    if (type === 'text' && !body?.trim()) return;
    if (type === 'text' && body!.trim().length > 2000) { setFeedback('El mensaje puede tener hasta 2,000 caracteres.', true); return; }
    setSending(true);
    setStickersOpen(false);
    const db = browserDb();
    let mediaPath: string | null = null;
    if (file) {
      if (file.size > 2 * 1024 * 1024) { setFeedback('El archivo supera el límite seguro de 2 MB.', true); setSending(false); return; }
      const contentType = mime?.split(';')[0] || file.type.split(';')[0];
      const extension = contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/gif' ? 'gif' : contentType === 'audio/ogg' ? 'ogg' : contentType === 'audio/mp4' ? 'm4a' : contentType === 'audio/mpeg' ? 'mp3' : 'webm';
      mediaPath = `${userId}/${room}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from('chat-media').upload(mediaPath, file, { upsert: false, contentType });
      if (uploadError) {
        setFeedback('No se pudo subir el archivo. Revisa tu conexión e inténtalo otra vez.', true);
        setSending(false);
        return;
      }
    }
    const { data, error } = await db.from('chat_messages').insert({
      room, user_id: userId, message_type: type, body: type === 'text' ? body?.trim() : body,
      media_path: mediaPath, media_duration_seconds: type === 'audio' ? duration : null,
    }).select(MESSAGE_FIELDS).single();
    if (error || !data) {
      if (mediaPath) await db.storage.from('chat-media').remove([mediaPath]);
      const detail = error?.message.includes('espera un momento') ? 'Espera un momento antes de enviar otro mensaje.' : 'No se pudo enviar. Comprueba tu acceso y vuelve a intentarlo.';
      setFeedback(detail, true);
      setSending(false);
      return;
    }
    mergeMessages([data as ChatMessage]);
    setDraft('');
    if (type === 'audio') cancelAudioDraft();
    setFeedback('');
    setSending(false);
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void postMessage('text', draft);
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function importSticker(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowed = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'];
    if (!allowed.includes(file.type) || file.size > 600 * 1024) {
      setFeedback('Importa un sticker WebP, PNG, JPG o GIF de máximo 600 KB.', true);
      return;
    }
    await postMessage('sticker', null, file, file.type);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFeedback('Este navegador no permite grabar notas de voz. Prueba con Safari o Chrome actualizado.', true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      chunksRef.current = [];
      const supported = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
      recorderRef.current = recorder;
      discardRecordingRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const seconds = Math.min(60, Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000)));
        if (discardRecordingRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || supported || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 2 * 1024 * 1024) { setFeedback('La nota de voz superó el límite de 2 MB. Grábala más corta.', true); return; }
        const url = URL.createObjectURL(blob);
        setAudioDraft((previous) => { if (previous) URL.revokeObjectURL(previous.url); return { blob, url, seconds, mime: blob.type }; });
      };
      recorder.start(500);
      recordingStartRef.current = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const seconds = Math.min(60, Math.floor((Date.now() - recordingStartRef.current) / 1000));
        setRecordSeconds(seconds);
        if (seconds >= 60) stopRecording();
      }, 250);
      setFeedback('');
    } catch {
      setFeedback('No se pudo acceder al micrófono. Permite el uso del micrófono e inténtalo de nuevo.', true);
    }
  }

  function stopRecording(discard = false) {
    discardRecordingRef.current = discard;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }

  function cancelAudioDraft() {
    setAudioDraft((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
  }

  function sendAudioDraft() {
    if (!audioDraft) return;
    void postMessage('audio', null, audioDraft.blob, audioDraft.mime, audioDraft.seconds);
  }

  async function hideMessage(message: ChatMessage) {
    const reason = window.prompt('Motivo para ocultar este mensaje:');
    if (!reason?.trim()) return;
    const { error } = await browserDb().rpc('chat_admin_hide_message', { p_message: message.id, p_reason: reason.trim() });
    if (error) setFeedback('No se pudo moderar el mensaje. Actualiza el chat e inténtalo otra vez.', true);
    else {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, body: null, media_path: null, is_hidden: true } : item));
      setFeedback('Mensaje ocultado y acción guardada en el registro de moderación.');
    }
  }

  async function muteUser(user: { id: string; name: string }, scope: Room | 'all' = room) {
    const minutesText = window.prompt('Duración en minutos (5 a 10,080; 1,440 = 24 horas):', '1440');
    if (!minutesText) return;
    const minutes = Number(minutesText);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10080) { setFeedback('La duración debe ser de 5 minutos a 7 días.', true); return; }
    const reason = window.prompt(`Motivo para silenciar a ${user.name}:`);
    if (!reason?.trim()) return;
    const { error } = await browserDb().rpc('chat_admin_mute_user', { p_user: user.id, p_room: scope, p_minutes: minutes, p_reason: reason.trim() });
    if (error) setFeedback('No se pudo silenciar al usuario. Revisa permisos e inténtalo otra vez.', true);
    else {
      setMutes((current) => [{ user_id: user.id, display_name: user.name, room_scope: scope, muted_until: new Date(Date.now() + minutes * 60000).toISOString(), reason: reason.trim() }, ...current.filter((mute) => !(mute.user_id === user.id && mute.room_scope === scope))]);
      setFeedback(`${user.name} quedó silenciado por ${minutes} minutos.`);
    }
  }

  async function unmuteUser(mute: ChatMute) {
    const { error } = await browserDb().rpc('chat_admin_unmute_user', { p_user: mute.user_id, p_room: mute.room_scope });
    if (error) setFeedback('No se pudo retirar el silencio.', true);
    else {
      setMutes((current) => current.filter((item) => !(item.user_id === mute.user_id && item.room_scope === mute.room_scope)));
      setFeedback(`${mute.display_name} ya puede participar en ${mute.room_scope === 'all' ? 'los chats' : `el chat ${mute.room_scope}`}.`);
    }
  }

  const channelStatus = connection === 'online' ? 'Conectado en tiempo real' : connection === 'connecting' ? 'Conectando…' : 'Reconectando…';

  return (
    <section ref={shellRef} className="community-chat-shell" aria-label="Chats de CalderosTrading">
      <header className="chat-page-heading">
        <div><span className="eyebrow">Comunidad privada</span><h1>El punto de encuentro</h1><p>Ideas, avances y conversaciones de trading, en vivo.</p></div>
        <Link className="chat-profile-chip" href="/dashboard/perfil" aria-label="Abrir mi perfil">
          <span className="chat-avatar chat-avatar-self">{mediaUrls[avatarPath || ''] ? <Image unoptimized src={mediaUrls[avatarPath || '']} alt="" width={42} height={42}/> : <b>{displayName.slice(0,1).toUpperCase()}</b>}</span><span><strong>{displayName}</strong><small>Tu perfil</small></span><span aria-hidden="true">↗</span>
        </Link>
      </header>

      <div className="community-chat-layout">
        <aside className="chat-room-sidebar" aria-label="Salas">
          <div className="chat-sidebar-kicker">TUS SALAS</div>
          <button type="button" className={`chat-room-choice ${room === 'general' ? 'is-active' : ''}`} onClick={() => setRoom('general')}>
            <span className="chat-room-icon general-room-icon">🌐</span><span><strong>General</strong><small>Abierto a miembros</small></span><span className="chat-room-live" aria-label="En vivo" />
          </button>
          <button type="button" className={`chat-room-choice ${room === 'vip' ? 'is-active' : ''} ${!canAccessVip ? 'is-locked' : ''}`} onClick={() => canAccessVip ? setRoom('vip') : setFeedback('El chat VIP requiere una matrícula activa.', true)}>
            <span className="chat-room-icon vip-room-icon">💎</span><span><strong>Trading VIP</strong><small>{canAccessVip ? 'Sala de miembros VIP' : 'Requiere curso activo'}</small></span><span className="chat-lock-icon">{canAccessVip ? '✦' : '🔒'}</span>
          </button>
          <div className="chat-sidebar-note"><span>🧭</span><p>Comparte ideas con respeto. No publiques información financiera privada.</p></div>
          <div className="chat-online-card"><span className="chat-online-dot"/><strong>{onlineCount} {onlineCount === 1 ? 'miembro' : 'miembros'}</strong><small>conectados a esta sala</small></div>
          {isModerator && <button type="button" className="chat-moderation-toggle" onClick={() => setMutedPanelOpen((value) => !value)}>🛡️ Moderación <span>{mutes.filter((mute) => new Date(mute.muted_until) > new Date()).length}</span></button>}
        </aside>

        <div className="chat-main-panel">
          <header className="chat-room-header">
            <span className={`chat-room-icon ${room === 'vip' ? 'vip-room-icon' : 'general-room-icon'}`}>{room === 'vip' ? '💎' : '🌐'}</span>
            <div className="chat-room-title"><h2>{room === 'vip' ? 'Trading VIP' : 'Chat general'}</h2><p><span className={connection === 'online' ? 'chat-online-dot' : 'chat-offline-dot'}/>{channelStatus} <span className="chat-header-divider">·</span> {onlineCount} en sala</p></div>
            {room === 'vip' && <span className="chat-room-label-vip">SOLO MIEMBROS VIP</span>}
            {room === 'general' && <span className="chat-room-label-general">COMUNIDAD</span>}
          </header>

          {isModerator && mutedPanelOpen && <div className="chat-moderation-panel">
            <div className="chat-mod-panel-head"><div><strong>Silencios activos</strong><small>Solo visibles para administración · guardados en auditoría</small></div><button type="button" className="ghost" onClick={() => setMutedPanelOpen(false)}>Cerrar</button></div>
            {mutes.length ? mutes.map((mute) => <div className="chat-muted-user" key={`${mute.user_id}-${mute.room_scope}`}><span><strong>{mute.display_name}</strong><small>{mute.room_scope} · vence {new Date(mute.muted_until).toLocaleString('es-DO')} · {mute.reason}</small></span><button type="button" className="ghost" onClick={() => void unmuteUser(mute)}>Retirar silencio</button></div>) : <p className="tiny">No hay usuarios silenciados actualmente.</p>}
          </div>}

          <div className="chat-message-scroll" aria-live="polite" aria-relevant="additions text">
            {roomLoading && roomMessages.length === 0 && <div className="chat-empty-state"><span className="chat-loading-dot"/><p>Cargando conversaciones…</p></div>}
            {!roomLoading && roomMessages.length === 0 && <div className="chat-empty-state"><span>👋</span><h3>Empieza la conversación</h3><p>Comparte una idea, una pregunta o celebra un avance.</p></div>}
            {roomMessages.map((message, index) => {
              const own = message.user_id === userId;
              const badge = roleLabel(message);
              const previous = roomMessages[index - 1];
              const grouped = previous?.user_id === message.user_id && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000;
              return <article className={`chat-message-row ${own ? 'is-own' : ''} ${grouped ? 'is-grouped' : ''}`} key={message.id}>
                {!grouped ? <span className="chat-avatar chat-message-avatar">{message.author_avatar_path && mediaUrls[message.author_avatar_path] ? <Image unoptimized src={mediaUrls[message.author_avatar_path]} alt="" width={38} height={38}/> : <b>{message.author_name.slice(0,1).toUpperCase()}</b>}</span> : <span className="chat-avatar-spacer"/>}
                <div className="chat-message-content">
                  {!grouped && <div className="chat-message-author"><strong>{message.author_name}</strong>{badge && <span className={`chat-role-badge ${badge.className}`}>{badge.label}</span>}<time suppressHydrationWarning dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}</time></div>}
                  <div className={`chat-bubble ${own ? 'chat-bubble-own' : ''} ${message.message_type === 'sticker' ? 'chat-bubble-sticker' : ''}`}>
                    {message.is_hidden ? <p className="chat-hidden-message">Este mensaje fue retirado por moderación.</p> : message.message_type === 'text' ? <p>{message.body}</p> : message.message_type === 'sticker' ? message.media_path && mediaUrls[message.media_path] ? <Image unoptimized className="chat-imported-sticker" src={mediaUrls[message.media_path]} alt="Sticker compartido" width={180} height={180}/> : <span className="chat-emoji-sticker" role="img" aria-label="Sticker">{message.body}</span> : message.media_path && mediaUrls[message.media_path] ? <div className="chat-voice-note"><span className="chat-voice-icon">▶</span><audio controls preload="none" src={mediaUrls[message.media_path]}/><span className="chat-voice-duration">{message.media_duration_seconds || 0}s</span></div> : <span className="chat-media-loading">Cargando nota de voz…</span>}
                    {message.message_type !== 'text' && !message.is_hidden && <time suppressHydrationWarning className="chat-media-time" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}</time>}
                  </div>
                  {isModerator && !own && !message.is_hidden && <div className="chat-message-moderation"><button type="button" onClick={() => void hideMessage(message)}>Ocultar</button><button type="button" onClick={() => void muteUser({ id: message.user_id, name: message.author_name })}>Silenciar</button><button type="button" onClick={() => void muteUser({ id: message.user_id, name: message.author_name }, 'all')}>Todas las salas</button></div>}
                </div>
              </article>;
            })}
            <div ref={bottomRef}/>
          </div>

          <div className="chat-compose-area">
            {typingName && <div className="chat-typing"><span className="chat-typing-dots"><i/><i/><i/></span>{typingName} está escribiendo</div>}
            {notice && <div className={`chat-notice ${noticeIsError ? 'chat-notice-error' : ''}`} role={noticeIsError ? 'alert' : 'status'}>{notice}</div>}
            {audioDraft && <div className="chat-audio-draft"><span className="chat-audio-draft-icon">🎙️</span><div><strong>Nota de voz lista</strong><small>Duración {audioDraft.seconds}s</small></div><audio controls preload="metadata" src={audioDraft.url}/><button type="button" className="ghost" onClick={cancelAudioDraft}>Descartar</button><button type="button" onClick={sendAudioDraft} disabled={sending}>Enviar nota</button></div>}
            {recording && <div className="chat-recording-banner"><span className="chat-record-dot"/><strong>Grabando nota de voz</strong><time>{String(Math.floor(recordSeconds / 60)).padStart(2,'0')}:{String(recordSeconds % 60).padStart(2,'0')}</time><span className="chat-record-limit">máximo 01:00</span><button type="button" className="ghost" onClick={() => stopRecording(true)}>Cancelar</button><button type="button" onClick={() => stopRecording()}>Listo ✓</button></div>}
            {!canAccessVip && room === 'vip' ? <div className="chat-vip-locked"><span>🔒</span><div><strong>Tu sala VIP no está activa</strong><small>Activa un curso para entrar al chat exclusivo de estudiantes.</small></div><Link className="button" href="/cursos">Ver cursos</Link></div> : <form className="chat-composer" onSubmit={submitText}>
              <button type="button" className={`chat-tool-button ${stickersOpen ? 'is-selected' : ''}`} aria-label="Abrir stickers" aria-expanded={stickersOpen} onClick={() => setStickersOpen((value) => !value)}>☺</button>
              <textarea aria-label="Escribe un mensaje" placeholder={`Escribe en ${room === 'vip' ? 'Trading VIP' : 'Chat general'}…`} rows={1} maxLength={2000} value={draft} onChange={(event) => { setDraft(event.target.value); sendTyping(); }} onKeyDown={submitOnEnter} disabled={sending || recording || Boolean(audioDraft)} />
              <button type="button" className={`chat-tool-button ${recording ? 'is-recording' : ''}`} aria-label="Grabar nota de voz de hasta un minuto" title="Nota de voz · máximo 1 minuto" onClick={() => recording ? stopRecording() : void startRecording()} disabled={sending || Boolean(audioDraft)}>{recording ? '■' : '🎙️'}</button>
              <input ref={stickerInputRef} type="file" accept=".webp,.png,.jpg,.jpeg,.gif,image/webp,image/png,image/jpeg,image/gif" hidden onChange={(event) => void importSticker(event)}/>
              <button type="submit" className="chat-send-button" aria-label="Enviar mensaje" disabled={sending || !draft.trim() || recording}>{sending ? '…' : '➤'}</button>
              {stickersOpen && <div className="chat-sticker-picker"><div className="chat-sticker-picker-head"><span><strong>Stickers</strong><small>Reacciones rápidas para la comunidad</small></span><button type="button" className="ghost" onClick={() => stickerInputRef.current?.click()}>＋ Importar</button></div><div className="chat-sticker-grid">{STICKERS.map((sticker) => <button type="button" key={sticker} onClick={() => void postMessage('sticker', sticker)} aria-label={`Enviar sticker ${sticker}`}>{sticker}</button>)}</div><p>También puedes elegir una imagen WebP, PNG, JPG o GIF guardada en tu dispositivo. WhatsApp no permite importar paquetes completos desde la web.</p></div>}
            </form>}
            <div className="chat-compose-foot"><span>Enter para enviar <i>·</i> Shift + Enter para nueva línea</span><span>Conversación moderada por el equipo CalderosTrading</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
