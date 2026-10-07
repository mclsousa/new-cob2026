// Painel: visão geral da carteira a partir do banco de clientes e dos pagamentos.
import React, { useMemo } from 'react';
import { StoredClient, PaymentRecord, ActionLog, AppConfig } from '../types';
import { formatDate } from '../utils/helpers';
import { daysFromToday, dueStatus, formatBRL, startOfDay, forecastRevenue } from '../utils/billing';
import { Card, KpiTile, Badge, Button, EmptyState, PageHeader, Tone } from '../components/ui';
import { BarChart, AreaChart, Donut, Progress } from '../components/charts';
import { CalendarClock, CalendarCheck, AlertTriangle, Wallet, Upload, ArrowRight, LayoutDashboard, Send, TrendingUp, ShieldAlert } from 'lucide-react';
import type { PeriodPreset } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_WINDOW = 30; // vencidos há mais de 30 dias contam como cancelados

const ACTION_LABEL: Record<ActionLog['action'], { label: string; tone: Tone }> = {
  whatsapp: { label: 'WhatsApp', tone: 'ok' },
  copy: { label: 'Copiado', tone: 'info' },
  mark: { label: 'Marcado', tone: 'graphite' },
  receipt: { label: 'Recibo', tone: 'warn' },
};

interface DashboardProps {
  clients: StoredClient[];
  payments: PaymentRecord[];
  history: ActionLog[];
  config: AppConfig;
  links: Record<string, string[]>;
  riskCount: number;
  onOpenRisk: () => void;
  onOpenProfile: (name: string) => void;
  onCharge: (preset: PeriodPreset) => void;
  onImport: () => void;
  onOpenClients: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ clients, payments, history, config, links, riskCount, onOpenRisk, onOpenProfile, onCharge, onImport, onOpenClients }) => {
  const forecast = useMemo(() => ({
    week: forecastRevenue(clients, payments, config, links, 0, 7),
    month: forecastRevenue(clients, payments, config, links, 0, 30),
    recover: forecastRevenue(clients, payments, config, links, -OVERDUE_WINDOW, 0),
  }), [clients, payments, config, links]);

  const stats = useMemo(() => {
    const now = new Date();
    const byDiff = clients.map(c => ({ c, diff: daysFromToday(c.dueDate, now) }));
    const today = byDiff.filter(x => x.diff === 0).length;
    const tomorrow = byDiff.filter(x => x.diff === 1).length;
    const overdue = byDiff.filter(x => x.diff < 0 && x.diff >= -OVERDUE_WINDOW).length;
    const active = byDiff.filter(x => x.diff >= 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const monthPays = payments.filter(p => p.paidAt >= monthStart);
    const prevPays = payments.filter(p => p.paidAt >= prevMonthStart && p.paidAt < monthStart);
    const received = monthPays.reduce((s, p) => s + p.amount, 0);
    const prevReceived = prevPays.reduce((s, p) => s + p.amount, 0);
    const trend = prevReceived ? Math.round(((received - prevReceived) / prevReceived) * 100) : null;

    const next14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(startOfDay(now).getTime() + i * DAY);
      return { label: i === 0 ? 'Hoje' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, value: byDiff.filter(x => x.diff === i).length };
    });

    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(startOfDay(now).getTime() - (29 - i) * DAY);
      const end = d.getTime() + DAY;
      return {
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: payments.filter(p => p.paidAt >= d.getTime() && p.paidAt < end).reduce((s, p) => s + p.amount, 0),
      };
    });

    const upcoming = byDiff
      .filter(x => x.diff >= -3 && x.diff <= 7)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 8)
      .map(x => x.c);

    const sentToday = history.filter(h => h.action === 'whatsapp' && new Date(h.timestamp).toDateString() === now.toDateString()).length;

    return {
      today, tomorrow, overdue, received, trend, next14, last30, upcoming, sentToday,
      monthCount: monthPays.length,
      iptv: active.filter(x => x.c.type === 'iptv').length,
      p2p: active.filter(x => x.c.type === 'p2p').length,
      activeTotal: active.length,
    };
  }, [clients, payments, history]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dueSoon = stats.today + stats.tomorrow;
  const activeShare = stats.activeTotal + stats.overdue ? Math.round((stats.activeTotal / (stats.activeTotal + stats.overdue)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={greeting}
        crumb="Painel"
        actions={
          <>
            <Button icon={Upload} onClick={onImport}>Importar lista</Button>
            <Button variant="primary" icon={Send} onClick={() => onCharge('tomorrow')}>Cobrar próximos</Button>
          </>
        }
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutDashboard}
            title="Seu painel aparece aqui"
            text="Importe a lista exportada do painel IPTV/P2P. Os clientes ficam salvos e o painel passa a mostrar vencimentos, recebimentos e atividade."
            action={<Button variant="primary" icon={Upload} onClick={onImport}>Importar lista</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiTile tone="danger" icon={AlertTriangle} label="Vencidos" value={stats.overdue} pill="30 dias" sub="Recuperar clientes" onClick={() => onCharge('overdue')} />
            <KpiTile tone="warn" icon={CalendarClock} label="Vence hoje" value={stats.today} sub="Cobrar agora" onClick={() => onCharge('today')} />
            <KpiTile tone="brand" icon={CalendarCheck} label="Vence amanhã" value={stats.tomorrow} sub={`${stats.sentToday} enviados hoje`} onClick={() => onCharge('tomorrow')} />
            <KpiTile
              tone="graphite"
              icon={Wallet}
              label="Recebido no mês"
              value={formatBRL(stats.received)}
              pill={stats.trend === null ? undefined : `${stats.trend >= 0 ? '↑' : '↓'} ${Math.abs(stats.trend)}%`}
              sub={`${stats.monthCount} pagamento(s)`}
            />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <ForecastTile label="Previsão — 7 dias" value={formatBRL(forecast.week.amount)} sub={`${forecast.week.count} renovação(ões) esperada(s)`} />
            <ForecastTile label="Previsão — 30 dias" value={formatBRL(forecast.month.amount)} sub={`${forecast.month.count} renovação(ões) esperada(s)`} />
            <ForecastTile label="A recuperar" value={formatBRL(forecast.recover.amount)} sub={`${forecast.recover.count} vencido(s) nos últimos 30 dias`} tone="danger" />
            <button onClick={onOpenRisk} className="text-left bg-card rounded-md border border-line/60 shadow-card px-4 py-3 hover:border-danger/40 transition-colors">
              <p className="text-xs text-muted flex items-center gap-1.5"><ShieldAlert size={13} className="text-danger" /> Clientes em risco</p>
              <p className="text-2xl font-light text-danger mt-0.5">{riskCount}</p>
              <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1">Sem resposta ou pagando atrasado <ArrowRight size={11} /></p>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Vencimentos — próximos 14 dias" subtitle={`${dueSoon} entre hoje e amanhã`} className="lg:col-span-2">
              <BarChart data={stats.next14} color="#5E17EB" valueFormat={n => `${n} cliente(s)`} />
            </Card>
            <Card title="Carteira ativa" subtitle="Clientes em dia por tipo">
              <div className="flex items-center gap-5">
                <div className="relative flex-shrink-0">
                  <Donut size={130} segments={[{ label: 'IPTV', value: stats.iptv, color: '#5E17EB' }, { label: 'P2P', value: stats.p2p, color: '#1FC8B4' }]} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-light text-ink">{stats.activeTotal}</span>
                    <span className="text-[10px] text-muted">ativos</span>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  {[['IPTV', stats.iptv, '#5E17EB'], ['P2P', stats.p2p, '#1FC8B4']].map(([label, n, color]) => (
                    <div key={label as string}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-muted">{label}</span><span className="text-ink font-medium">{n}</span></div>
                      <Progress value={stats.activeTotal ? ((n as number) / stats.activeTotal) * 100 : 0} color={color as string} />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted pt-1">{activeShare}% da base em dia</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Recebimentos — últimos 30 dias" subtitle={payments.length ? `Total no período: ${formatBRL(stats.last30.reduce((s, d) => s + d.value, 0))}` : 'Registre pagamentos com o botão "Pago" nos cards'} className="lg:col-span-2">
              <AreaChart data={stats.last30} color="#1FC8B4" valueFormat={formatBRL} />
            </Card>
            <Card title="Atividade recente" subtitle="Últimas ações" bodyClassName="p-0 pt-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted px-5 pb-5">Nenhuma ação ainda.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {history.slice(0, 6).map((h, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-5 py-2.5">
                      <div className="min-w-0">
                        <button onClick={() => onOpenProfile(h.clientName)} className="block text-sm text-ink hover:text-brand truncate max-w-full text-left">{h.clientName}</button>
                        <p className="text-[11px] text-muted">{new Date(h.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <Badge tone={ACTION_LABEL[h.action].tone}>{ACTION_LABEL[h.action].label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card
            title="Próximos vencimentos"
            subtitle="Últimos 3 dias até a próxima semana"
            actions={<Button size="sm" variant="ghost" onClick={onOpenClients}>Ver todos <ArrowRight size={13} /></Button>}
            bodyClassName="p-0 pt-3"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-y border-line">
                    <th className="font-medium px-5 py-2.5">Cliente</th>
                    <th className="font-medium px-3 py-2.5 hidden sm:table-cell">Tipo</th>
                    <th className="font-medium px-3 py-2.5">Vencimento</th>
                    <th className="font-medium px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stats.upcoming.map(c => {
                    const s = dueStatus(c.dueDate);
                    return (
                      <tr key={c.id} className="hover:bg-subtle/70">
                        <td className="px-5 py-2.5"><button onClick={() => onOpenProfile(c.name)} className="font-medium text-ink hover:text-brand text-left">{c.name}</button></td>
                        <td className="px-3 py-2.5 text-xs text-muted hidden sm:table-cell">{c.type.toUpperCase()}</td>
                        <td className="px-3 py-2.5 text-ink">{formatDate(new Date(c.dueDate))}</td>
                        <td className="px-5 py-2.5"><Badge tone={s.tone} solid>{s.label}</Badge></td>
                      </tr>
                    );
                  })}
                  {stats.upcoming.length === 0 && <tr><td colSpan={4} className="text-center text-sm text-muted py-8">Nada vencendo nos próximos dias.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// Valor previsto (estilo "Revenue" da referência: número grande + legenda)
const ForecastTile = ({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'danger' }) => (
  <div className="bg-card rounded-md border border-line/60 shadow-card px-4 py-3">
    <p className="text-xs text-muted flex items-center gap-1.5"><TrendingUp size={13} className={tone ? 'text-danger' : 'text-ok'} /> {label}</p>
    <p className={tone ? 'text-2xl font-light text-danger mt-0.5' : 'text-2xl font-light text-ink mt-0.5'}>{value}</p>
    <p className="text-[11px] text-muted mt-0.5">{sub}</p>
  </div>
);

export default Dashboard;
