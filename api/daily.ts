// Verificação de notificações, chamada de hora em hora (GitHub Actions: .github/workflows/notify.yml).
// - Resumo diário: enviado na 1ª verificação a partir do horário escolhido na aba Notificações (1x por dia).
// - Lembretes agendados: cada lembrete vencido nas últimas 3h vira um push (1x por lembrete).
// Usa os dados sincronizados na nuvem. ?force=1 envia o resumo agora (teste).
// Auth: "Authorization: Bearer <CRON_SECRET>".
import { json, redis } from './_shared.js';
import { readState } from './sync.js';
import { sendToAll } from './_push.js';
import { dailySummary, dailyMessage, notifySettings, riskByName } from '../utils/billing.js';
import type { StoredClient, AppConfig, Reminder, PaymentRecord, ActionLog } from '../types.js';

// "Hoje" e a hora no horário de Brasília (o servidor roda em UTC)
process.env.TZ = 'America/Sao_Paulo';

const REMINDER_WINDOW_MS = 3 * 60 * 60 * 1000; // tolera atraso do agendador do GitHub
const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};

// SET NX: true só na 1ª vez que a chave é marcada (evita push duplicado)
const firstTime = async (key: string, ttlSeconds: number) =>
  (await redis<string | null>('SET', key, '1', 'NX', 'EX', ttlSeconds)) === 'OK';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Não autorizado' }, 401);
  try {
    const force = new URL(req.url).searchParams.get('force') === '1';
    const data = (await readState())?.data || {};
    const config = parse<Partial<AppConfig>>(data.cobrancaConfig, {});
    const opts = notifySettings(config);
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const result: Record<string, unknown> = { hour: now.getHours() };

    // Resumo diário
    const due = opts.dailyEnabled && now.getHours() >= opts.dailyHour;
    if (force || (due && (await firstTime(`tvbrcob:push:daily:${dateKey}`, 2 * 86400)))) {
      const clients = parse<StoredClient[]>(data.clientDatabase, []);
      let risk: number | undefined;
      if (opts.includeRisk) {
        const risks = riskByName(parse<PaymentRecord[]>(data.payments, []), parse<ActionLog[]>(data.actionHistory, []));
        risk = clients.filter(c => risks.has(c.name.toLowerCase())).length;
      }
      const summary = dailySummary(clients, now);
      result.daily = { ...summary, sent: await sendToAll({ ...dailyMessage({ ...summary, risk }, opts), url: '/?p=billing', tag: 'daily-summary' }) };
    }

    // Lembretes agendados
    if (opts.reminders) {
      const reminders = parse<Reminder[]>(data.reminders, []);
      let sent = 0;
      for (const r of reminders) {
        const age = now.getTime() - r.scheduledFor;
        if (age < 0 || age > REMINDER_WINDOW_MS) continue;
        if (!(await firstTime(`tvbrcob:push:rem:${r.id}`, 2 * 86400))) continue;
        sent += await sendToAll({ title: 'Lembrete de cobrança', body: `Hora de cobrar ${r.clientName}`, url: '/?p=billing', tag: `rem-${r.id}` });
      }
      result.reminders = sent;
    }

    return json(result);
  } catch (err) {
    console.error('[daily]', err);
    return json({ error: 'Falha ao enviar as notificações' }, 500);
  }
}
