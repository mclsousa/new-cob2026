// Envio de Web Push (notificação do sistema, inclusive no APK/TWA) para os aparelhos inscritos.
// Inscrições ficam num hash do Redis: endpoint -> JSON da inscrição.
import webpush from 'web-push';
import { redis } from './_shared.js';

export const SUBS_KEY = 'tvbrcob:push:subs';

export interface PushPayload { title: string; body: string; url?: string; tag?: string }
interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }

export const isSubscription = (s: unknown): s is Subscription => {
  const sub = s as Subscription;
  return !!sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://')
    && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
};

const configure = () => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://new-cob2026.vercel.app', pub, priv);
};

// true = entregue; false = inscrição morta (removida)
export const sendPush = async (sub: Subscription, payload: PushPayload): Promise<boolean> => {
  configure();
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 12 * 60 * 60 });
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await redis('HDEL', SUBS_KEY, sub.endpoint); // aparelho desinstalou/revogou
      return false;
    }
    throw err;
  }
};

export const sendToAll = async (payload: PushPayload): Promise<number> => {
  const raw = (await redis<string[] | null>('HVALS', SUBS_KEY)) || [];
  let sent = 0;
  for (const item of raw) {
    try {
      if (await sendPush(JSON.parse(item), payload)) sent++;
    } catch (err) {
      console.error('[push]', err); // um aparelho com erro não impede os outros
    }
  }
  return sent;
};
