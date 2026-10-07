import React, { useState, useEffect } from 'react';
import { ParsedClient } from '../types';
import { Bell, BellRing, AlertCircle } from 'lucide-react';
import { toInputDate } from '../utils/helpers';
import { isNative } from '../utils/native';
import { Modal, Button, inputCls, labelCls } from './ui';

// "AAAA-MM-DD" + "HH:mm" no fuso LOCAL (new Date('AAAA-MM-DD') seria meia-noite UTC = dia anterior no Brasil)
const toLocalDateTime = (date: string, time: string): Date => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
};

interface ReminderModalProps {
  client: ParsedClient | null;
  defaultTime: string;
  onClose: () => void;
  onConfirm: (client: ParsedClient, scheduledFor: number) => void;
}

const ReminderModal: React.FC<ReminderModalProps> = ({ client, defaultTime, onClose, onConfirm }) => {
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState(defaultTime || '20:00');

  useEffect(() => {
    if (client) {
      setSelectedDate(toInputDate(new Date()));
      setSelectedTime(defaultTime || '20:00');
      if ('Notification' in window) setNotifPerm(Notification.permission);
    }
  }, [client, defaultTime]);

  if (!client) return null;

  const requestPermission = async () => setNotifPerm(await Notification.requestPermission());

  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(toInputDate(d));
  };

  const handleConfirm = () => {
    if (!selectedDate || !selectedTime) return;
    onConfirm(client, toLocalDateTime(selectedDate, selectedTime).getTime());
    onClose();
  };

  const scheduledLabel = (() => {
    if (!selectedDate || !selectedTime) return '';
    const dt = toLocalDateTime(selectedDate, selectedTime);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dtDay = new Date(dt); dtDay.setHours(0, 0, 0, 0);
    const prefix = dtDay.getTime() === today.getTime() ? 'Hoje' : dtDay.getTime() === tomorrow.getTime() ? 'Amanhã' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${prefix} às ${selectedTime}`;
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title="Agendar lembrete"
      subtitle={client.name}
      icon={Bell}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!selectedDate || !selectedTime}>Agendar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {['Hoje', 'Amanhã', '+2 dias'].map((label, i) => (
            <Button key={label} size="sm" onClick={() => setQuickDate(i)}>{label}</Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={labelCls}>Data</span>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Hora</span>
            <input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} className={inputCls} />
          </label>
        </div>

        {scheduledLabel && (
          <div className="flex items-center gap-2 bg-brand-soft text-brand px-3 py-2.5 rounded-md text-sm font-medium">
            <BellRing size={14} /> {scheduledLabel}
          </div>
        )}

        {'Notification' in window && !isNative() && notifPerm !== 'granted' && (
          <div className="flex items-start gap-2 border border-warn/40 bg-warn/10 px-3 py-2.5 rounded-md">
            <AlertCircle size={14} className="text-warn flex-shrink-0 mt-0.5" />
            <div className="text-xs text-ink">
              {notifPerm === 'denied'
                ? 'Notificações bloqueadas. Ative nas configurações do navegador.'
                : 'Ative notificações para receber o alerta mesmo com a aba em segundo plano.'}
              {notifPerm === 'default' && (
                <button onClick={requestPermission} className="block mt-1 font-medium text-brand underline underline-offset-2">Ativar notificações</button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReminderModal;
