// Sincronização na nuvem: guarda um snapshot dos dados do app no Upstash Redis.
// GET  -> { data, updatedAt } | 404 se ainda não há nada salvo
// PUT  -> body { data, baseUpdatedAt } ; 409 com o estado atual se a nuvem mudou depois de baseUpdatedAt
// Auth: "Authorization: Bearer <SYNC_PASSWORD>". 10 senhas erradas por IP bloqueiam por 15 min.
import { createHash, timingSafeEqual } from 'node:crypto';
import { isSyncKey, type SyncData } from '../utils/syncKeys';

const STATE_KEY = 'tvbrcob:sync:state';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_FAILS = 10;
const FAIL_WINDOW_S = 15 * 60;

interface SyncState {
  updatedAt: number;
  data: SyncData;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Upstash REST: POST com o comando como array JSON
const redis = async <T = unknown>(...command: (string | number)[]): Promise<T> => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis não configurado (KV_REST_API_URL/KV_REST_API_TOKEN)');
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  const out = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || out.error) throw new Error(`Redis: ${out.error || res.status}`);
  return out.result as T;
};

const sha256 = (s: string) => createHash('sha256').update(s).digest();

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';

// null = autorizado; senão a Response de erro
const authorize = async (req: Request): Promise<Response | null> => {
  const password = process.env.SYNC_PASSWORD;
  if (!password) return json({ error: 'SYNC_PASSWORD não configurada no servidor' }, 500);

  const failKey = `tvbrcob:sync:fail:${clientIp(req)}`;
  const fails = Number((await redis<string | null>('GET', failKey)) || 0);
  if (fails >= MAX_FAILS) return json({ error: 'Muitas tentativas. Tente de novo em 15 minutos.' }, 429);

  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (given && timingSafeEqual(sha256(given), sha256(password))) return null;

  await redis('INCR', failKey);
  await redis('EXPIRE', failKey, FAIL_WINDOW_S);
  return json({ error: 'Senha incorreta' }, 401);
};

const readState = async (): Promise<SyncState | null> => {
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
