// Liga/desliga o resumo diário por notificação push neste aparelho (navegador ou APK).
import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2, Send } from 'lucide-react';
import { pushSupported, getPushSubscription, enablePush, disablePush } from '../utils/push';
import { Button, cx } from './ui';

const PushSection: React.FC<{ onToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void }> = ({ onToast }) => {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => { void getPushSubscription().then(s => setActive(!!s)); }, []);

  const turnOn = async () => {
    setBusy(true);
    const error = await enablePush();
    setBusy(false);
    if (error) return onToast(error, 'error');
    setActive(true);
    onToast('Notificações ativadas. Você deve receber uma de confirmação agora.', 'success');
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setActive(false);
    onToast('Notificações desligadas neste aparelho.', 'info');
  };

  return !supported ? (
    <p className="text-xs text-warn">Este navegador não suporta notificações push.</p>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0', active ? 'bg-ok/15 text-ok' : 'bg-subtle text-muted')} title={active ? 'Ativas neste aparelho' : 'Desligadas neste aparelho'}>
        {active ? <BellRing size={18} /> : <BellOff size={18} />}
      </span>
      {active ? (
        <>
          <Button size="sm" icon={busy ? Loader2 : Send} disabled={busy} onClick={turnOn}>Enviar teste</Button>
          <Button size="sm" variant="ghost" icon={BellOff} disabled={busy} onClick={turnOff}>Desligar</Button>
        </>
      ) : (
        <Button size="sm" variant="primary" icon={busy ? Loader2 : BellRing} disabled={busy} onClick={turnOn}>Ativar neste aparelho</Button>
      )}
    </div>
  );
};

export default PushSection;
