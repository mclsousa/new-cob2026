// "Nova versão disponível": novidades da versão e atualização com download dentro do app.
import React, { useState } from 'react';
import { Download, Sparkles, Wrench, CheckCircle2 } from 'lucide-react';
import { AppUpdate, downloadAndInstall } from '../utils/updates';
import { openExternal } from '../utils/native';
import { Modal, Button, cx } from './ui';
import { Progress } from './charts';

interface UpdateModalProps {
  update: AppUpdate | null;
  currentVersion?: string;
  onClose: () => void;
}

// "Novo: x" / "Correção: y" / "Melhoria: z" -> ícone e texto
const noteKind = (note: string) => {
  const m = note.match(/^(Novo|Correção|Melhoria):\s*(.*)$/i);
  const kind = m?.[1].toLowerCase();
  return {
    text: m ? m[2] : note,
    icon: kind === 'correção' ? Wrench : kind === 'melhoria' ? CheckCircle2 : Sparkles,
    tone: kind === 'correção' ? 'text-warn' : kind === 'melhoria' ? 'text-ok' : 'text-brand',
  };
};

const UpdateModal: React.FC<UpdateModalProps> = ({ update, currentVersion, onClose }) => {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (!update) return null;
  const busy = progress !== null && !error;

  const install = async () => {
    setError('');
    setProgress(0);
    try {
      await downloadAndInstall(update, setProgress);
      setProgress(100);
    } catch {
      setError('Não foi possível baixar dentro do app. Tente de novo ou baixe pelo navegador.');
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Nova versão ${update.version} disponível`}
      subtitle={`${currentVersion ? `Você está na ${currentVersion} · ` : ''}publicada em ${new Date(update.date).toLocaleDateString('pt-BR')} · ${update.sizeMb} MB`}
      icon={Download}
      footer={
        error ? (
          <>
            <Button variant="ghost" onClick={() => openExternal(update.apkUrl)} className="flex-1 sm:flex-none">Baixar pelo navegador</Button>
            <Button variant="primary" icon={Download} onClick={install} className="flex-1 sm:flex-none">Tentar de novo</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy} className="flex-1 sm:flex-none">Agora não</Button>
            <Button variant="primary" icon={Download} onClick={install} disabled={busy} className="flex-1 sm:flex-none">
              {progress === 100 ? 'Abrir instalador de novo' : busy ? 'Baixando…' : 'Atualizar agora'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-ink mb-2">O que mudou</p>
          {update.notes.length ? (
            <ul className="space-y-2">
              {update.notes.map((n, i) => {
                const k = noteKind(n);
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <k.icon size={15} className={cx('flex-shrink-0 mt-0.5', k.tone)} />
                    <span>{k.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Melhorias e correções gerais.</p>
          )}
        </div>

        {progress !== null && !error && (
          <div>
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>{progress < 100 ? 'Baixando atualização…' : 'Pronto: confirme a instalação na tela do Android'}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <p className="text-[11px] text-muted">Na primeira atualização o Android pode pedir para permitir "instalar apps desconhecidos" do TVBR.Cob. Seus dados continuam no aparelho.</p>
      </div>
    </Modal>
  );
};

export default UpdateModal;
