// Sincronização na nuvem: guarda um snapshot dos dados do app no Upstash Redis.
// GET  -> { data, updatedAt } | 404 se ainda não há nada salvo
// PUT  -> body { data, baseUpdatedAt } ; 409 com o estado atual se a nuvem mudou depois de baseUpdatedAt
// Auth: "Authorization: Bearer <SYNC_PASSWORD>". 10 senhas erradas por IP bloqueiam por 15 min.
// ".js" obrigatório: a função roda como ESM no Node, que não resolve import sem extensão
import { isSyncKey, type SyncData } from '../utils/syncKeys.js';
import { json, redis, authorize, preflight } from './_shared.js';

export const OPTIONS = preflight; // CORS do app Android

export const STATE_KEY = 'tvbrcob:sync:state';
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface SyncState {
  updatedAt: number;
  data: SyncData;
}

export const readState = async (): Promise<SyncState | null> => {
  const raw = await redis<string | null>('GET', STATE_KEY);
  return raw ? (JSON.parse(raw) as SyncState) : null;
};

// Aceita só chaves conhecidas com valor string/null
const sanitize = (data: unknown): SyncData | null => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: SyncData = {};
  for (const [k, v] of Object.entries(data)) {
    if (!isSyncKey(k)) continue;
    if (v !== null && typeof v !== 'string') return null;
    out[k] = v;
  }
  return out;
};

const handle = async (req: Request, fn: () => Promise<Response>) => {
  try {
    return (await authorize(req)) ?? (await fn());
  } catch (err) {
    console.error('[sync]', err);
    return json({ error: 'Erro no servidor de sincronização' }, 500);
  }
};

export function GET(req: Request) {
  return handle(req, async () => {
    const state = await readState();
    return state ? json(state) : json({ error: 'Nada salvo ainda' }, 404);
  });
}

export function PUT(req: Request) {
  return handle(req, async () => {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Dados grandes demais' }, 413);

    let body: { data?: unknown; baseUpdatedAt?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'JSON inválido' }, 400);
    }
    const data = sanitize(body.data);
    if (!data) return json({ error: 'Formato de dados inválido' }, 400);
    const base = typeof body.baseUpdatedAt === 'number' ? body.baseUpdatedAt : 0;

    // ponytail: GET+SET sem lock; basta para um único usuário. Para vários, usar WATCH/MULTI ou script Lua.
    const current = await readState();
    if (current && current.updatedAt > base) return json(current, 409);

    const next: SyncState = { updatedAt: Date.now(), data };
    await redis('SET', STATE_KEY, JSON.stringify(next));
    return json({ updatedAt: next.updatedAt });
  });
}
