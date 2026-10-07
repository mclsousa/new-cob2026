// Utilitários das funções /api (arquivo com "_" não vira rota na Vercel).
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_FAILS = 10;
const FAIL_WINDOW_S = 15 * 60;
const MAX_GLOBAL_FAILS = 300;
const GLOBAL_FAIL_KEY = 'tvbrcob:sync:fail:global';

// O app Android (Capacitor) roda em https://localhost e chama a API pelo endereço completo
export const CORS_HEADERS = {
  'access-control-allow-origin': 'https://localhost',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
  vary: 'origin',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS_HEADERS },
  });

// Pré-verificação do navegador (CORS) antes de requisições com Authorization
export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

// Upstash REST: POST com o comando como array JSON
export const redis = async <T = unknown>(...command: (string | number)[]): Promise<T> => {
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

// IP definido pela borda da Vercel. O 1º item do X-Forwarded-For vem do cliente e pode ser forjado
// para escapar do bloqueio; como último recurso usa o item mais à direita (o que o proxy anexou).
const clientIp = (req: Request) =>
  req.headers.get('x-real-ip') ||
  req.headers.get('x-vercel-forwarded-for') ||
  (req.headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean).pop() ||
  'unknown';

// null = autorizado; senão a Response de erro
export const authorize = async (req: Request): Promise<Response | null> => {
  const password = process.env.SYNC_PASSWORD;
  if (!password) return json({ error: 'SYNC_PASSWORD não configurada no servidor' }, 500);

  const failKey = `tvbrcob:sync:fail:${clientIp(req)}`;
  const fails = Number((await redis<string | null>('GET', failKey)) || 0);
  // Freio global contra ataque distribuído (muitos IPs). ponytail: um atacante pode travar o dono
  // por 15 min gastando 300 tentativas; aceitável com senha aleatória longa.
  const globalFails = Number((await redis<string | null>('GET', GLOBAL_FAIL_KEY)) || 0);
  if (fails >= MAX_FAILS || globalFails >= MAX_GLOBAL_FAILS) {
    return json({ error: 'Muitas tentativas. Tente de novo em 15 minutos.' }, 429);
  }

  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (given && timingSafeEqual(sha256(given), sha256(password))) return null;

  for (const key of [failKey, GLOBAL_FAIL_KEY]) {
    await redis('INCR', key);
    await redis('EXPIRE', key, FAIL_WINDOW_S);
  }
  return json({ error: 'Senha incorreta' }, 401);
};

