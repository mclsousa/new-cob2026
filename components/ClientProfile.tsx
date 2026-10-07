// Ficha do cliente: dados, plano, risco e linha do tempo (cobranças + pagamentos).
import React, { useMemo } from 'react';
import { UserRound, Wallet, Bell, Edit, AlertTriangle, Phone, StickyNote, Info, Send, Copy, Receipt, MousePointerClick } from 'lucide-react';
import { StoredClient, PaymentRecord, ActionLog, AppConfig } from '../types';
import { extractPhone, formatDate } from '../utils/helpers';
import { dueStatus, formatBRL, planGroupForAccounts, Risk } from '../utils/billing';
import { Modal, Button, Badge, cx, tagStyle } from './ui';

interface ClientProfileProps {
  name: string | null;
  stored?: StoredClient;
  config: AppConfig;
  payments: PaymentRecord[];
  history: ActionLog[];
  risk?: Risk;
  tagIds: string[];
  note: string;
  phone: string;
  linked: string[];
  onClose: () => void;
  onPay: () => void;
  onRemind: () => void;
  onEdit: () => void;
}

const ACTION_INFO: Record<ActionLog['action'], { label: string; icon: typeof Send }> = {
  whatsapp: { label: 'Cobrança enviada no WhatsApp', icon: Send },
  copy: { label: 'Mensagem copiada', icon: Copy },
  mark: { label: 'Marcado como enviado', icon: MousePointerClick },
  receipt: { label: 'Recibo enviado', icon: Receipt },
  pix: { label: 'Chave PIX enviada', icon: Send },
};

const ClientProfile: React.FC<ClientProfileProps> = props => {
  const { name, stored, config, payments, history, risk, tagIds, note, phone, linked } = props;
  const key = (name || '').toLowerCase();

  const myPayments = useMemo(() => payments.filter(p => p.clientName.toLowerCase() === key).sort((a, b) => b.paidAt - a.paidAt), [payments, key]);
  const timeline = useMemo(() => [
    ...history.filter(h => h.clientName.toLowerCase() === key).map(h => ({ at: h.timestamp, kind: 'action' as const, h })),
    ...myPayments.map(p => ({ at: p.paidAt, kind: 'payment' as const, p })),
  ].sort((a, b) => b.at - a.at).slice(0, 60), [history, myPayments, key]);

  if (!name) return null;

  const status = stored ? dueStatus(stored.dueDate) : null;
  const plan = myPayments[0]?.planLabel || planGroupForAccounts(config, 1 + linked.length)?.plans[0]?.label || '—';
  const total = myPayments.reduce((s, p) => s + p.amount, 0);
  const tags = (config.tags || []).filter(t => tagIds.includes(t.id));
  const panelNotes = stored ? extractPhone(stored.rawNotes).cleanText : '';

  return (
    <Modal
      open
      onClose={props.onClose}
      title={name}
      subtitle={stored ? `${stored.type.toUpperCase()} · na base desde ${new Date(stored.savedAt).toLocaleDateString('pt-BR')}` : 'Fora da base de clientes'}
      icon={UserRound}
      size="lg"
      footer={
        <>
          {/* Celular: ação principal em cima, ocupando a largura; as outras duas lado a lado */}
          <Button variant="primary" icon={Wallet} onClick={props.onPay} className="w-full sm:w-auto sm:order-last">Registrar pagamento</Button>
          <Button icon={Bell} onClick={props.onRemind} className="flex-1 sm:flex-none">Lembrete</Button>
          <Button icon={Edit} onClick={props.onEdit} className="flex-1 sm:flex-none">Editar</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {risk && <Badge tone="danger" solid><AlertTriangle size={10} /> Em risco</Badge>}
          {tags.map(t => <span key={t.id} className="text-[11px] px-1.5 py-px rounded" style={tagStyle(t.color)}>{t.label}</span>)}
          {linked.length > 0 && <span className="text-xs text-info">+ {linked.join(', ')}</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Vencimento', stored ? formatDate(new Date(stored.dueDate)) : '—'],
            ['Plano', plan],
            ['Total pago', formatBRL(total)],
            ['Pagamentos', String(myPayments.length)],
          ].map(([label, value]) => (
            <div key={label} className="border border-line rounded-md px-3 py-2 min-w-0">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="text-sm text-ink font-medium truncate">{value}</p>
            </div>
          ))}
        </div>

        {risk && (
          <div className="border border-danger/30 bg-danger/5 rounded-md px-3 py-2.5 text-sm text-ink flex gap-2">
            <AlertTriangle size={15} className="text-danger flex-shrink-0 mt-0.5" />
            <span><b className="font-medium">Cliente em risco:</b> {risk.reasons.join(' · ')}. Vale um contato pessoal ou uma oferta de renovação.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <p className="flex items-center gap-2 text-ink"><Phone size={14} className="text-muted" /> <span className="font-mono">{phone || 'sem telefone'}</span></p>
          {note && <p className="flex items-start gap-2 text-ink"><StickyNote size={14} className="text-muted mt-0.5" /> {note}</p>}
          {panelNotes && <p className="flex items-start gap-2 text-ink sm:col-span-2"><Info size={14} className="text-muted mt-0.5" /> {panelNotes}</p>}
        </div>

        <div>
          <h4 className="text-sm font-medium text-ink mb-2">Histórico</h4>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma cobrança ou pagamento registrado ainda.</p>
          ) : (
            <ol className="relative border-l border-line ml-2 space-y-3">
              {timeline.map((t, i) => {
                const isPay = t.kind === 'payment';
                const Icon = isPay ? Wallet : ACTION_INFO[t.h.action]?.icon || Send;
                return (
                  <li key={i} className="pl-5 relative">
                    <span className={cx('absolute -left-[11px] top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white', isPay ? 'bg-ok' : 'bg-brand')}>
                      <Icon size={11} />
                    </span>
                    <p className="text-sm text-ink">
                      {isPay
                        ? <>Pagou <b className="font-medium">{formatBRL(t.p.amount)}</b>{t.p.planLabel ? ` · ${t.p.planLabel}` : ''} · novo vencimento {formatDate(new Date(t.p.newDueDate))}</>
                        : ACTION_INFO[t.h.action]?.label || t.h.action}
                    </p>
                    <p className="text-[11px] text-muted">{new Date(t.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ClientProfile;
