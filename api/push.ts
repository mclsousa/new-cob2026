// Inscrição de notificações push.
// GET            -> { publicKey } (chave VAPID pública para o navegador se inscrever)
// POST   { subscription } -> salva o aparelho e envia uma notificação de confirmação
// DELETE { endpoint }     -> remove o aparelho
// Auth (POST/DELETE): mesma senha da sincronização ("Authorization: Bearer <SYNC_PASSWORD>").
import { json, redis, authorize, preflight } from './_shared.js';
import { SUBS_KEY, isSubscription, sendPush } from './_push.js';

export const OPTIONS = preflight; // CORS do app Android

const handle = async (req: Request, fn: (body: Record<string, unknown>) => Promise<Response>) => {
  try {
    const denied = await authorize(req);
    if (denied) return denied;
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    return await fn(body);
  } catch (err) {
    console.error('[push]', err);
    return json({ error: 'Erro no servidor de notificações' }, 500);
  }
};

export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  return publicKey ? json({ publicKey }) : json({ error: 'Notificações ainda não configuradas no servidor (VAPID).' }, 503);
}

export function POST(req: Request) {
  return handle(req, async ({ subscription }) => {
    if (!isSubscription(subscription)) return json({ error: 'Inscrição inválida' }, 400);
    await redis('HSET', SUBS_KEY, subscription.endpoint, JSON.stringify(subscription));
    await sendPush(subscription, { title: 'Notificações ativadas', body: 'Você vai receber o resumo de cobranças todo dia de manhã.', tag: 'push-test' });
    return json({ ok: true });
  });
}

export function DELETE(req: Request) {
  return handle(req, async ({ endpoint }) => {
    if (typeof endpoint !== 'string') return json({ error: 'endpoint ausente' }, 400);
    await redis('HDEL', SUBS_KEY, endpoint);
    return json({ ok: true });
  });
}
