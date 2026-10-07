// App Android: permissão das notificações locais (alarmes do próprio celular).
import React, { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { nativeNotifyPermission, requestNativeNotify, NativePermission } from '../utils/native';
import { Button, cx } from './ui';

// Pede ao App para recriar os alarmes (ele tem clientes/lembretes em memória)
export const RESCHEDULE_EVENT = 'tvbr:reschedule';

const NativeNotifySection: React.FC<{ onToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void }> = ({ onToast }) => {
  const [perm, setPerm] = useState<NativePermission>('prompt');
  useEffect(() => { void nativeNotifyPermission().then(setPerm); }, []);

  const allow = async () => {
    const p = await requestNativeNotify();
    setPerm(p);
    if (p === 'granted') {
      window.dispatchEvent(new Event(RESCHEDULE_EVENT));
      onToast('Notificações permitidas. Lembretes e resumo chegam na hora exata.', 'success');
    } else {
      onToast('Permissão negada. Libere em Configurações do Android › Apps › TVBR.Cob › Notificações.', 'error');
    }
  };

  const on = perm === 'granted';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0', on ? 'bg-ok/15 text-ok' : 'bg-subtle text-muted')}>
        {on ? <BellRing size={18} /> : <BellOff size={18} />}
      </span>
      <span className={cx('text-sm', on ? 'text-ok font-medium' : 'text-muted')}>{on ? 'Permitidas neste celular' : 'Desligadas neste celular'}</span>
      {!on && <Button size="sm" variant="primary" icon={BellRing} onClick={allow} className="ml-auto">Permitir</Button>}
    </div>
  );
};

export default NativeNotifySection;
