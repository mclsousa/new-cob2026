// Regras de cobrança compartilhadas por Painel, Cobranças, Clientes e Pagamentos.
import type { AppConfig, ParsedClient, PlanGroup, PaymentRecord, StoredClient, ActionLog, NotifySettings } from '../types';
import type { Tone } from '../components/ui';

const DAY = 24 * 60 * 60 * 1000;

// Pagamento registrado nos últimos N dias conta como "Pago" no filtro de status
export const PAID_WINDOW_DAYS = 15;

export const startOfDay = (d: Date | number | string): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Diferença em dias de calendário (positivo = futuro)
export const daysFromToday = (d: Date | string, now = new Date()): number =>
  Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);

export type DueLevel = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'active';
export interface DueStatus { level: DueLevel; label: string; tone: Tone; color: string }

export const dueStatus = (d: Date | string, now = new Date()): DueStatus => {
  const diff = daysFromToday(d, now);
  if (diff < 0) return { level: 'overdue', label: 'Vencido', tone: 'danger', color: '#E5536B' };
  if (diff === 0) return { level: 'today', label: 'Vence hoje', tone: 'warn', color: '#F5A623' };
  if (diff === 1) return { level: 'tomorrow', label: 'Amanhã', tone: 'brand', color: '#5E17EB' };
  if (diff <= 3) return { level: 'soon', label: `Em ${diff} dias`, tone: 'info', color: '#2F54EB' };
  return { level: 'active', label: 'Ativo', tone: 'ok', color: '#1FC8B4' };
};

// Soma meses sem estourar o fim do mês (31/01 + 1 mês = 28/02, não 03/03)
export const addMonthsClamped = (base: Date, months: number): Date => {
  const out = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(base.getDate(), lastDay));
  return out;
};

export const monthsFromLabel = (label: string): number => {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[0], 10) : 1;
};

// Tabela de preços por nº de contas: "N Telas" quando tem N contas, senão a padrão
export const planGroupForAccounts = (config: AppConfig, accounts: number): PlanGroup | undefined => {
  const groups = config.planGroups || [];
  return (accounts > 1 && groups.find(g => g.label.includes(String(accounts)))) || groups[0];
};

export const planGroupFor = (config: AppConfig, client: Pick<ParsedClient, 'linked'>): PlanGroup | undefined =>
  planGroupForAccounts(config, 1 + (client.linked?.length || 0));

export const formatBRL = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: n % 1 ? 2 : 0 });

// Nome -> pagamento mais recente
export const lastPaymentByName = (payments: PaymentRecord[]): Map<string, PaymentRecord> => {
  const map = new Map<string, PaymentRecord>();
  for (const p of payments) {
    const key = p.clientName.toLowerCase();
    const cur = map.get(key);
    if (!cur || p.paidAt > cur.paidAt) map.set(key, p);
  }
  return map;
};

export const isRecentlyPaid = (p: PaymentRecord | undefined, now = Date.now()): boolean =>
  !!p && now - p.paidAt < PAID_WINDOW_DAYS * DAY;

// Cliente do banco -> formato usado pelos modais (pagamento, lembrete)
export const storedToParsed = (c: StoredClient): ParsedClient => ({
  id: `${c.type}:${c.name}`,
  name: c.name,
  dueDate: new Date(c.dueDate),
  rawNotes: c.rawNotes,
  originalLine: c.originalLine,
  type: c.type,
});

// --- Previsão de receita ---
// Valor esperado de cada titular com vencimento em [fromDay, toDay) dias a partir de hoje:
// o último pagamento dele (o plano que costuma pagar) ou, sem histórico, o 1º plano da tabela.
// Dependentes vinculados não contam: o titular paga a tabela de "N Telas".
export interface Forecast { amount: number; count: number }
export const forecastRevenue = (
  clients: StoredClient[], payments: PaymentRecord[], config: AppConfig, links: Record<string, string[]>,
  fromDay: number, toDay: number, now = new Date(),
): Forecast => {
  const dependents = new Set(Object.values(links).flat().map(n => n.toLowerCase()));
  const lastPaid = lastPaymentByName(payments);
  let amount = 0, count = 0;
  for (const c of clients) {
    const key = c.name.toLowerCase();
    const diff = daysFromToday(c.dueDate, now);
    if (dependents.has(key) || diff < fromDay || diff >= toDay) continue;
    const accounts = 1 + (links[c.name]?.length || 0);
    amount += lastPaid.get(key)?.amount ?? planGroupForAccounts(config, accounts)?.plans[0]?.price ?? config.plans?.[0]?.price ?? 0;
    count++;
  }
  return { amount, count };
};

// --- Clientes em risco ---
export const RISK_UNANSWERED = 2; // cobranças enviadas (em dias diferentes) sem pagamento depois
export const RISK_LATE = 2;       // pagamentos feitos depois do vencimento, entre os 6 últimos
export interface Risk { unanswered: number; late: number; reasons: string[] }

// Nome (minúsculo) -> risco, só para quem está em risco
export const riskByName = (payments: PaymentRecord[], history: ActionLog[]): Map<string, Risk> => {
  const lastPaid = lastPaymentByName(payments);
  const sendDays = new Map<string, Set<string>>();
  for (const h of history) {
    if (h.action !== 'whatsapp') continue;
    const key = h.clientName.toLowerCase();
    if (h.timestamp <= (lastPaid.get(key)?.paidAt ?? 0)) continue;
    if (!sendDays.has(key)) sendDays.set(key, new Set());
    sendDays.get(key)!.add(new Date(h.timestamp).toDateString());
  }
  const lateCount = new Map<string, number>();
  const byName = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const key = p.clientName.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }
  byName.forEach((list, key) => {
    const recent = list.sort((a, b) => b.paidAt - a.paidAt).slice(0, 6);
    lateCount.set(key, recent.filter(p => p.prevDueDate && startOfDay(p.paidAt) > startOfDay(p.prevDueDate)).length);
  });

  const out = new Map<string, Risk>();
  new Set([...sendDays.keys(), ...lateCount.keys()]).forEach(key => {
    const unanswered = sendDays.get(key)?.size || 0;
    const late = lateCount.get(key) || 0;
    const reasons = [
      unanswered >= RISK_UNANSWERED && `${unanswered} cobranças sem resposta`,
      late >= RISK_LATE && `pagou atrasado ${late}x`,
    ].filter(Boolean) as string[];
    if (reasons.length) out.set(key, { unanswered, late, reasons });
  });
  return out;
};

// Texto da notificação de um lembrete (mesmo no app, no celular e no push do servidor)
export const reminderBody = (r: { clientName: string; note?: string }): string =>
  r.note?.trim() ? `${r.clientName}: ${r.note.trim()}` : `Hora de cobrar ${r.clientName}`;

// --- Resumo do dia (notificação da manhã) ---
export interface DailySummary { today: number; tomorrow: number; overdue: number }
export const dailySummary = (clients: StoredClient[], now = new Date()): DailySummary => {
  const s = { today: 0, tomorrow: 0, overdue: 0 };
  for (const c of clients) {
    const diff = daysFromToday(c.dueDate, now);
    if (diff === 0) s.today++;
    else if (diff === 1) s.tomorrow++;
    else if (diff === -4 || diff === -5) s.overdue++; // mesmo critério do atalho "Vencidos 4–5d"
  }
  return s;
};

export const DEFAULT_NOTIFY: NotifySettings = {
  dailyEnabled: true, dailyHour: 8, includeOverdue: true, includeTomorrow: true, includeRisk: false, reminders: true, banner: true,
};
export const notifySettings = (config?: Pick<AppConfig, 'notifications'>): NotifySettings => ({ ...DEFAULT_NOTIFY, ...config?.notifications });

export const dailyMessage = (s: DailySummary & { risk?: number }, o: NotifySettings = DEFAULT_NOTIFY): { title: string; body: string } => {
  const toCharge = s.today + (o.includeOverdue ? s.overdue : 0);
  const parts = [
    `${s.today} vencem hoje`,
    o.includeOverdue && `${s.overdue} vencidos (4–5 dias)`,
    o.includeTomorrow && `${s.tomorrow} vencem amanhã`,
    o.includeRisk && s.risk !== undefined && `${s.risk} em risco`,
  ].filter(Boolean);
  return {
    title: toCharge ? `Bom dia! ${toCharge} cobrança(s) para hoje` : 'Bom dia! Nada para cobrar hoje',
    body: parts.join(' · '),
  };
};
