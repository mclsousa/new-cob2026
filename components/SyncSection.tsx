import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, CloudDownload, CloudUpload, Loader2 } from 'lucide-react';
import { Button, inputCls, cx } from './ui';
import { disableSync, enableSync, isSyncEnabled, onSyncStatus, syncNow, testConnection, type SyncStatus } from '../utils/sync';

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'Desligada',
  syncing: 'Sincronizando...',
  ok: 'Sincronizado',
  offline: 'Sem conexão — tenta de novo ao voltar para a aba',
  auth: 'Senha recusada — conecte de novo',
  error: 'Erro no servidor de sincronização',
};

// Liga/desliga a sincronização na nuvem deste aparelho
const SyncSection: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>('off');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Após testar a senha: a nuvem já tem dados? (null = vazia)
  const [pending, setPending] = useState<{ remoteUpdatedAt: number | null } | null>(null);

  useEffect(() => onSyncStatus(setStatus), []);

  const handleTest = async () => {
    setBusy(true);
    setError('');
    const res = await testConnection(password);
    setBusy(false);
    if ('error' in res) return setError(res.error);
    // Nuvem vazia: não há o que escolher, envia este aparelho
    if (res.remoteUpdatedAt === null) return void enableSync(password, 'upload', null).then(() => setPassword(''));
    setPending({ remoteUpdatedAt: res.remoteUpdatedAt });
  };

  const handleChoose = async (mode: 'download' | 'upload') => {
    if (!pending) return;
    setBusy(true);
    await enableSync(password, mode, pending.remoteUpdatedAt); // 'download' recarrega a página
    setBusy(false);
    setPending(null);
    setPassword('');
  };

  const enabled = isSyncEnabled() && status !== 'off';

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={cx('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0', enabled ? 'bg-ok/15 text-ok' : 'bg-subtle text-muted')}>
          {enabled ? <Cloud size={18} /> : <CloudOff size={18} />}
        </span>
        <div className="flex-1">
          <p className="text-sm text-muted">Mantém clientes, mensagens, pagamentos e configurações iguais em todos os seus aparelhos.</p>
          <p className={cx('text-xs mt-1 font-medium', status === 'ok' ? 'text-ok' : status === 'off' ? 'text-muted' : 'text-warn')}>
            {status === 'syncing' && <Loader2 size={11} className="inline animate-spin mr-1" />}
            {STATUS_LABEL[status]}
          </p>
        </div>
      </div>

      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={Cloud} onClick={() => void syncNow()}>Sincronizar agora</Button>
          <Button size="sm" icon={CloudOff} onClick={disableSync}>Desligar neste aparelho</Button>
        </div>
      ) : pending ? (
        <div className="space-y-2">
          <p className="text-xs text-ink">
            A nuvem já tem dados (salvos em {new Date(pending.remoteUpdatedAt!).toLocaleString('pt-BR')}). O que fazer?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={CloudDownload} disabled={busy} onClick={() => handleChoose('download')}>Baixar da nuvem</Button>
            <Button size="sm" icon={CloudUpload} disabled={busy} onClick={() => handleChoose('upload')}>Enviar este aparelho (substitui a nuvem)</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void handleTest(); }} className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Senha de sincronização"
            className={cx(inputCls, 'flex-1 min-w-[180px] w-auto')}
          />
          <Button type="submit" variant="primary" disabled={busy || !password} icon={busy ? Loader2 : Cloud}>Conectar</Button>
        </form>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
};

export default SyncSection;
