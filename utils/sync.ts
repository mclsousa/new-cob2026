// Sincronização na nuvem (cliente). O localStorage continua sendo a fonte da verdade
// local; este módulo envia o snapshot para /api/sync e baixa quando outro aparelho
// salvou algo mais novo. Baixar = gravar no localStorage e recarregar a página.
import { SYNC_KEYS, type SyncData } from './syncKeys';
import { apiUrl } from './native';

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'auth' | 'error';

interface RemoteState {
  updatedAt: number;
  data: SyncData;
}

const PASS_KEY = 'syncPassword';
const AT_KEY = 'syncUpdatedAt'; // updatedAt da última versão da nuvem que este aparelho conhece
const DIRTY_KEY = 'syncDirty'; // '1' = há alterações locais ainda não enviadas
const PULLED_FLAG = 'syncJustPulled'; // sessionStorage: avisar após recarregar
const PUSH_DEBOUNCE_MS = 2000;

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* cota cheia */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let status: SyncStatus = ls.get(PASS_KEY) ? 'ok' : 'off';
const listeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach(fn => fn(s)); };

/** Inscreve e já entrega o status atual; retorna a função de cancelar (serve de cleanup do useEffect). */
export const onSyncStatus = (fn: (s: SyncStatus) => void) => {
  listeners.add(fn);
  fn(status);
  return () => { listeners.delete(fn); };
};
export const isSyncEnabled = () => !!ls.get(PASS_KEY);
export const getSyncPassword = () => ls.get(PASS_KEY);

const api = (password: string, method: 'GET' | 'PUT', body?: unknown) =>
  fetch(apiUrl('/api/sync'), {
    method,
    headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

const snapshot = (): SyncData =>
  Object.fromEntries(SYNC_KEYS.map(k => [k, ls.get(k)])) as SyncData;

const applyRemoteAndReload = (state: RemoteState) => {
  for (const k of SYNC_KEYS) {
    const v = state.data[k];
    if (v == null) ls.del(k); else ls.set(k, v);
  }
  ls.set(AT_KEY, String(state.updatedAt));
  ls.del(DIRTY_KEY);
  try { sessionStorage.setItem(PULLED_FLAG, '1'); } catch { /* ignore */ }
  window.location.reload();
};

// true uma única vez logo após recarregar por causa de um download da nuvem
export const consumeJustPulled = (): boolean => {
  try {
    const v = sessionStorage.getItem(PULLED_FLAG) === '1';
    sessionStorage.removeItem(PULLED_FLAG);
    return v;
  } catch { return false; }
};

const failStatus = (res: Response): SyncStatus =>
  res.status === 401 || res.status === 429 ? 'auth' : 'error';

const push = async (password: string): Promise<void> => {
  const res = await api(password, 'PUT', { data: snapshot(), baseUpdatedAt: Number(ls.get(AT_KEY)) || 0 });
  if (res.ok) {
    const { updatedAt } = (await res.json()) as { updatedAt: number };
    ls.set(AT_KEY, String(updatedAt));
    ls.del(DIRTY_KEY);
    setStatus('ok');
  } else if (res.status === 409) {
    // ponytail: outro aparelho salvou depois; vence a nuvem (última alteração local se perde).
    // Merge por chave se isso incomodar na prática.
    applyRemoteAndReload((await res.json()) as RemoteState);
  } else {
    setStatus(failStatus(res));
  }
};

const pull = async (password: string): Promise<void> => {
  const res = await api(password, 'GET');
  if (res.status === 404) return push(password); // nuvem vazia: este aparelho inaugura
  if (!res.ok) return setStatus(failStatus(res));
  const state = (await res.json()) as RemoteState;
  if (state.updatedAt > (Number(ls.get(AT_KEY)) || 0)) applyRemoteAndReload(state);
  else setStatus('ok');
};

let inFlight: Promise<void> | null = null;

/** Envia se há alterações locais; senão baixa se a nuvem tem algo mais novo. */
export const syncNow = (): Promise<void> => {
  const password = ls.get(PASS_KEY);
  if (!password) { setStatus('off'); return Promise.resolve(); }
  if (inFlight) return inFlight;
  setStatus('syncing');
  inFlight = (ls.get(DIRTY_KEY) ? push(password) : pull(password))
    .catch(() => setStatus('offline'))
    .finally(() => { inFlight = null; });
  return inFlight;
};

let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** Chamado a cada alteração de dado sincronizável (via saveItem). */
export const markDirty = () => {
  ls.set(DIRTY_KEY, '1');
  if (!isSyncEnabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void syncNow(); }, PUSH_DEBOUNCE_MS);
};

export type ConnectResult =
  | { ok: true; remoteUpdatedAt: number | null }
  | { ok: false; error: string };

/** Testa a senha e diz se já existe algo salvo na nuvem (sem alterar nada). */
export const testConnection = async (password: string): Promise<ConnectResult> => {
  try {
    const res = await api(password, 'GET');
    if (res.status === 404) return { ok: true, remoteUpdatedAt: null };
    if (res.ok) return { ok: true, remoteUpdatedAt: ((await res.json()) as RemoteState).updatedAt };
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: error || `Erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Sem conexão com o servidor' };
  }
};

/**
 * Liga a sincronização neste aparelho.
 * 'download': substitui os dados locais pelos da nuvem (recarrega a página).
 * 'upload':   substitui a nuvem pelos dados deste aparelho.
 */
export const enableSync = async (password: string, mode: 'download' | 'upload', remoteUpdatedAt: number | null) => {
  ls.set(PASS_KEY, password);
  if (mode === 'download') {
    ls.set(AT_KEY, '0');
    ls.del(DIRTY_KEY);
  } else {
    ls.set(AT_KEY, String(remoteUpdatedAt ?? 0)); // base = versão atual da nuvem, para não dar 409
    ls.set(DIRTY_KEY, '1');
  }
  await syncNow();
};

export const disableSync = () => {
  clearTimeout(pushTimer);
  ls.del(PASS_KEY);
  ls.del(AT_KEY);
  setStatus('off');
};
