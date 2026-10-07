// Registrar pagamento: escolhe o plano, renova o vencimento e (opcional) envia o recibo.
// Substitui o antigo "Gerar Recibo".
import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Calendar, Check } from 'lucide-react';
import { ParsedClient, AppConfig, PricingPlan } from '../types';
import { toInputDate, formatDate } from '../utils/helpers';
import { addMonthsClamped, monthsFromLabel, planGroupFor, startOfDay, formatBRL } from '../utils/billing';
import { Modal, Button, inputCls, labelCls, cx } from './ui';

export interface PaymentInput { newDueDate: Date; amount: number; planLabel: string; sendReceipt: boolean }

interface PaymentModalProps {
  client: ParsedClient | null;
  config: AppConfig;
  canSendReceipt: boolean;
  onClose: () => void;
  onConfirm: (client: ParsedClient, input: PaymentInput) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ client, config, canSendReceipt, onClose, onConfirm }) => {
  const plans = useMemo<PricingPlan[]>(() => (client ? planGroupFor(config, client)?.plans || config.plans || [] : []), [client, config]);
  const [planId, setPlanId] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState(0);
  const [sendReceipt, setSendReceipt] = useState(true);

  // Renovação parte do vencimento atual; se já venceu, parte de hoje
  const renewFrom = (plan: PricingPlan) => {
    if (!client) return;
    const today = startOfDay(new Date());
    const due = startOfDay(client.dueDate);
    const base = due < today ? today : due;
    setPlanId(plan.id);
    setAmount(plan.price);
    setDate(toInputDate(addMonthsClamped(base, monthsFromLabel(plan.label))));
  };

  useEffect(() => {
    if (!client) return;
    setSendReceipt(canSendReceipt);
    if (plans[0]) renewFrom(plans[0]);
    else { setPlanId(''); setAmount(0); setDate(toInputDate(client.dueDate)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (!client) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [y, m, d] = date.split('-').map(Number);
    const newDueDate = new Date(y, m - 1, d, 12); // meio-dia evita virar o dia por fuso
    const planLabel = plans.find(p => p.id === planId)?.label || 'Personalizado';
    onConfirm(client, { newDueDate, amount, planLabel, sendReceipt: sendReceipt && canSendReceipt });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pagamento"
      subtitle={`${client.name} · vence ${formatDate(client.dueDate)}`}
      icon={Wallet}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Check} type="submit" form="payment-form" disabled={!date}>Confirmar</Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        {plans.length > 0 && (
          <div>
            <span className={labelCls}>Plano</span>
            <div className="grid grid-cols-2 gap-2">
              {plans.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => renewFrom(p)}
                  className={cx(
                    'text-left px-3 py-2 rounded-md border text-sm transition-colors',
                    planId === p.id ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:bg-subtle text-ink',
                  )}
                >
                  <span className="block font-medium truncate">{p.label}</span>
                  <span className="text-xs opacity-75">{formatBRL(p.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={labelCls}>Novo vencimento</span>
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={cx(inputCls, 'pl-8')} />
            </div>
          </label>
          <label>
            <span className={labelCls}>Valor recebido (R$)</span>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} className={inputCls} />
          </label>
        </div>

        <label className={cx('flex items-center gap-2 text-sm', canSendReceipt ? 'text-ink cursor-pointer' : 'text-muted')}>
          <input type="checkbox" checked={sendReceipt && canSendReceipt} disabled={!canSendReceipt} onChange={e => setSendReceipt(e.target.checked)} className="accent-[#5E17EB] w-4 h-4" />
          {canSendReceipt ? 'Enviar recibo pelo WhatsApp' : 'Sem WhatsApp: recibo não será enviado'}
        </label>
      </form>
    </Modal>
  );
};

export default PaymentModal;
