// Histórico do dia: envios, cópias, recibos e pagamentos.
import React, { useMemo, useState } from 'react';
import { ActionLog, PaymentRecord } from '../types';
import { toInputDate, formatDate } from '../utils/helpers';
import { formatBRL } from '../utils/billing';
import { Card, Badge, PageHeader, EmptyState, StatCard, Tone, inputCls, cx } from '../components/ui';
import { History as HistoryIcon } from 'lucide-react';

const ACTION: Record<ActionLog['action'] | 'payment', { label: string; tone: Tone }> = {
  whatsapp: { label: 'WhatsApp enviado', tone: 'ok' },
  copy: { label: 'Mensagem copiada', tone: 'info' },
  mark: { label: 'Marcado', tone: 'graphite' },
  receipt: { label: 'Recibo enviado', tone: 'warn' },
  payment: { label: 'Pagamento', tone: 'brand' },
};

interface Row { key: string; at: number; name: string; action: keyof typeof ACTION; amount?: number; detail?: string }

const History: React.FC<{ history: ActionLog[]; payments: PaymentRecord[]; onOpenProfile: (name: string) => void }> = ({ history, payments, onOpenProfile }) => {
  const [day, setDay] = useState(() => toInputDate(new Date()));

  const rows = useMemo<Row[]>(() => {
    const sameDay = (ts: number) => toInputDate(new Date(ts)) === day;
    return [
      ...history.filter(h => sameDay(h.timestamp)).map((h, i) => ({ key: `a${i}`, at: h.timestamp, name: h.clientName, action: h.action })),
      ...payments.filter(p => sameDay(p.paidAt)).map(p => ({
        key: p.id, at: p.paidAt, name: p.clientName, action: 'payment' as const, amount: p.amount,
        detail: `${p.planLabel || ''} · novo venc. ${formatDate(new Date(p.newDueDate))}`,
      })),
    ].sort((a, b) => b.at - a.at);
  }, [history, payments, day]);

  const sent = rows.filter(r => r.action === 'whatsapp').length;
  const received = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="Histórico"
        crumb="Histórico"
        actions={<input type="date" value={day} onChange={e => setDay(e.target.value)} className={cx(inputCls, 'w-auto')} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Ações no dia" value={rows.length} />
        <StatCard label="WhatsApp enviados" value={sent} tone="ok" />
        <StatCard label="Pagamentos" value={rows.filter(r => r.action === 'payment').length} tone="brand" />
        <StatCard label="Recebido" value={formatBRL(received)} tone="brand" />
      </div>

      <Card title="Atividade" subtitle={formatDate(new Date(`${day}T12:00:00`))} bodyClassName="p-0 pt-3">
        {rows.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Nada registrado neste dia" text="Envios, cópias, recibos e pagamentos aparecem aqui. O histórico guarda os últimos 90 dias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-y border-line">
                  <th className="font-medium px-5 py-2.5 w-20">Hora</th>
                  <th className="font-medium px-3 py-2.5">Cliente</th>
                  <th className="font-medium px-3 py-2.5">Ação</th>
                  <th className="font-medium px-3 py-2.5 hidden md:table-cell">Detalhe</th>
                  <th className="font-medium px-5 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(r => (
                  <tr key={r.key} className="hover:bg-subtle/70">
                    <td className="px-5 py-2.5 text-muted text-xs">{new Date(r.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2.5"><button onClick={() => onOpenProfile(r.name)} className="font-medium text-ink hover:text-brand text-left">{r.name}</button></td>
                    <td className="px-3 py-2.5"><Badge tone={ACTION[r.action].tone} solid={r.action === 'payment'}>{ACTION[r.action].label}</Badge></td>
                    <td className="px-3 py-2.5 text-xs text-muted hidden md:table-cell">{r.detail || '—'}</td>
                    <td className="px-5 py-2.5 text-right text-ink">{r.amount !== undefined ? formatBRL(r.amount) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default History;
