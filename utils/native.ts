// Recursos do app Android nativo (Capacitor). No navegador tudo aqui vira no-op/fallback.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { StoredClient, Reminder, NotifySettings } from '../types';
import { dailySummary, dailyMessage, reminderBody } from './billing';

export const isNative = (): boolean => Capacitor.isNativePlatform();

// Servidor (sincronização). No app nativo a página roda em https://localhost, então usa o endereço completo.
const API_ORIGIN = 'https://new-cob2026.vercel.app';
export const apiUrl = (path: string): string => (isNative() ? API_ORIGIN + path : path);

// Links externos (wa.me). No app, window.open não abre janela: navegar para o link faz o
// Capacitor entregar ao Android, que abre o WhatsApp.
export const openExternal = (url: string): void => {
  if (isNative()) window.location.href = url;
  else window.open(url, '_blank');
};

// Arquivo para o usuário (CSV, backup). No app não existe "download": salva e abre o compartilhar do Android.
export const saveFile = async (filename: string, content: string, fallback: () => void): Promise<void> => {
  if (!isNative()) return fallback();
  const { uri } = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, files: [uri] });
};

// --- Notificações locais (alarmes exatos do Android) ---
export type NativePermission = 'granted' | 'denied' | 'prompt';

export const nativeNotifyPermission = async (): Promise<NativePermission> => {
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
};

export const requestNativeNotify = async (): Promise<NativePermission> => {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
};

// Canais próprios com prioridade alta: tocam o som padrão do celular, vibram e aparecem no topo.
// O canal "Default" do plugin é de prioridade média e fica mudo em vários Androids (Xiaomi, Samsung).
// O Android não deixa mudar um canal depois de criado: para alterar, use ids novos.
const CHANNEL_REMINDERS = 'lembretes';
const CHANNEL_DAILY = 'resumo-diario';
let channelsReady: Promise<boolean> | null = null;
const ensureChannels = () => (channelsReady ??= Promise.all([
  LocalNotifications.createChannel({
    id: CHANNEL_REMINDERS, name: 'Lembretes de cobrança', description: 'Lembretes agendados nos clientes',
    importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#5E17EB',
  }),
  LocalNotifications.createChannel({
    id: CHANNEL_DAILY, name: 'Resumo diário', description: 'Quantos clientes cobrar no dia',
    importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#5E17EB',
  }),
]).then(() => true, () => { channelsReady = null; return false; })); // falhou: usa o canal padrão

const DAILY_DAYS = 14; // resumos já calculados para as próximas 2 semanas (os vencimentos são conhecidos)
const DAILY_ID_BASE = 900_000;
const REMINDER_ID_BASE = 100_000;

// id numérico estável a partir do id do lembrete (o Android exige inteiro)
const reminderNotifId = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return REMINDER_ID_BASE + (Math.abs(h) % 700_000);
};

/**
 * Recria todos os alarmes: lembretes futuros + resumo diário dos próximos 14 dias no horário escolhido.
 * Chamado ao abrir o app e sempre que clientes, lembretes ou configurações mudam.
 * ponytail: o resumo usa os vencimentos conhecidos agora; pagamentos/listas novas atualizam ao reagendar.
 */
export const rescheduleNative = async (clients: StoredClient[], reminders: Reminder[], opts: NotifySettings, riskCount = 0): Promise<void> => {
  if (!isNative() || (await nativeNotifyPermission()) !== 'granted') return;
  const ownChannels = await ensureChannels();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });

  const now = Date.now();
  const notifications = [];

  if (opts.reminders) {
    for (const r of reminders) {
      if (r.fired || r.scheduledFor <= now) continue;
      notifications.push({
        id: reminderNotifId(r.id),
        title: 'Lembrete de cobrança',
        body: reminderBody(r),
        schedule: { at: new Date(r.scheduledFor), allowWhileIdle: true },
        channelId: ownChannels ? CHANNEL_REMINDERS : undefined,
        extra: { page: 'billing' },
      });
    }
  }

  if (opts.dailyEnabled) {
    for (let i = 0; i < DAILY_DAYS; i++) {
      const at = new Date();
      at.setDate(at.getDate() + i);
      at.setHours(opts.dailyHour, 0, 0, 0);
      if (at.getTime() <= now) continue;
      const msg = dailyMessage({ ...dailySummary(clients, at), risk: riskCount }, opts);
      notifications.push({
        id: DAILY_ID_BASE + i,
        title: msg.title,
        body: msg.body,
        schedule: { at, allowWhileIdle: true },
        channelId: ownChannels ? CHANNEL_DAILY : undefined,
        extra: { page: 'billing' },
      });
    }
  }

  if (notifications.length) await LocalNotifications.schedule({ notifications });
};

// Toque na notificação -> página indicada
export const onNativeNotificationTap = (go: (page: string) => void): (() => void) => {
  if (!isNative()) return () => undefined;
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', a => {
    const page = (a.notification.extra as { page?: string } | undefined)?.page;
    if (page) go(page);
  });
  return () => { void handle.then(h => h.remove()); };
};
