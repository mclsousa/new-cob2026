import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, CloudDownload, CloudUpload, Loader2 } from 'lucide-react';
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
  const btn = 'flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40';

  return (
    <section className="bg-teal-50 dark:bg-teal-900/10 p-4 rounded-xl border border-teal-100 dark:border-teal-800/50 space-y-3">
      <div className="flex items-start gap-3">
        {enabled ? <Cloud className="text-teal-600 dark:text-teal-400 mt-0.5" size={20} /> : <CloudOff className="text-gray-400 mt-0.5" size={20} />}
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">Sincronização na nuvem</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Mantém clientes, mensagens, chaves PIX e configurações iguais em todos os seus aparelhos.
          </p>
          <p className={`text-xs mt-1 font-medium ${status === 'ok' ? 'text-teal-600 dark:text-teal-400' : status === 'off' ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {status === 'syncing' && <Loader2 size={11} className="inline animate-spin mr-1" />}
            {STATUS_LABEL[status]}
          </p>
        </div>
      </div>

      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void syncNow()} className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`}>
            <Cloud size={13} /> Sincronizar agora
          </button>
          <button onClick={disableSync} className={`${btn} bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400`}>
            <CloudOff size={13} /> Desligar neste aparelho
          </button>
        </div>
      ) : pending ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-700 dark:text-gray-300">
            A nuvem já tem dados (salvos em {new Date(pending.remoteUpdatedAt!).toLocaleString('pt-BR')}). O que fazer?
          </p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => handleChoose('download')} className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`}>
              <CloudDownload size={13} /> Baixar da nuvem
            </button>
            <button disabled={busy} onClick={() => handleChoose('upload')} className={`${btn} bg-amber-500 hover:bg-amber-400 text-white`}>
              <CloudUpload size={13} /> Enviar este aparelho (substitui a nuvem)
            </button>
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
            className="flex-1 min-w-[180px] p-2.5 rounded-xl bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
          <button type="submit" disabled={busy || !password} className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />} Conectar
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
};

export default SyncSection;
