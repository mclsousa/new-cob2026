// Notificações push no navegador/APK: registra o service worker e inscreve o aparelho no servidor.
import { getSyncPassword } from './sync';
import { apiUrl, isNative } from './native';

// No app nativo as notificações são alarmes locais (utils/native.ts), não Web Push
export const pushSupported = (): boolean =>
  !isNative() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const registerServiceWorker = () =>
  pushSupported() ? navigator.serviceWorker.register('/sw.js').catch(() => null) : Promise.resolve(null);

export const getPushSubscription = async (): Promise<PushSubscription | null> => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
};

// Chave VAPID (base64url) -> bytes, formato que o PushManager pede
const keyToBytes = (base64: string) => {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

const authHeaders = (password: string) => ({ authorization: `Bearer ${password}`, 'content-type': 'application/json' });

/** Ativa as notificações neste aparelho. Retorna a mensagem de erro, ou null se deu certo. */
export const enablePush = async (): Promise<string | null> => {
  if (!pushSupported()) return 'Este navegador não suporta notificações push.';
  const password = getSyncPassword();
  if (!password) return 'Ligue a sincronização na nuvem primeiro: o resumo diário é montado com os dados da nuvem.';
  if ((await Notification.requestPermission()) !== 'granted') return 'Permissão de notificação negada. Libere nas configurações do navegador/celular.';
  try {
    const keyRes = await fetch(apiUrl('/api/push'), { cache: 'no-store' });
    const { publicKey, error } = (await keyRes.json()) as { publicKey?: string; error?: string };
    if (!publicKey) return error || 'Servidor sem chave de notificação.';
    const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
    const res = await fetch(apiUrl('/api/push'), { method: 'POST', headers: authHeaders(password), body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error || `Erro ${res.status}`;
    return null;
  } catch {
    return 'Não foi possível ativar agora. Verifique a conexão e tente de novo.';
  }
};

export const disablePush = async (): Promise<void> => {
  const sub = await getPushSubscription();
  if (!sub) return;
  const password = getSyncPassword();
  if (password) {
    await fetch(apiUrl('/api/push'), { method: 'DELETE', headers: authHeaders(password), body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  }
  await sub.unsubscribe();
};
