// Importar listas do painel: um bloco para IPTV e outro para P2P.
// Importar num tipo substitui só a lista daquele tipo; a outra continua carregada.
import React, { useRef, useState } from 'react';
import { Upload, Clipboard, Trash2, FileUp, Play, PencilLine, ChevronDown } from 'lucide-react';
import { normalizeCsvIfNeeded, asTypedList, listStats, ListType } from '../utils/parser';
import { Modal, Button, Badge, inputCls, cx } from './ui';

interface ImportModalProps {
  open: boolean;
  value: string;
  onChange: (text: string) => void;
  onImport: (text: string) => void; // já com o cabeçalho do tipo; o App substitui só a lista desse tipo
  onRemoveType: (type: ListType) => void;
  onClear: () => void;
  onProcess: () => void;
  onClose: () => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const LABEL: Record<ListType, string> = { iptv: 'IPTV', p2p: 'P2P' };

const ImportModal: React.FC<ImportModalProps> = ({ open, value, onChange, onImport, onRemoveType, onClear, onProcess, onClose, onToast }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileType, setFileType] = useState<ListType>('iptv');
  const [showText, setShowText] = useState(false);
  const stats = listStats(value);

  // Texto lido (arquivo ou área de transferência) -> lista do tipo escolhido
  const importAs = (raw: string, chosen: ListType, source: string) => {
    const normalized = normalizeCsvIfNeeded(raw);
    if (!normalized.trim()) return onToast(`${source} está vazio.`, 'warning');
    const { text, type } = asTypedList(normalized, chosen);
    onImport(text);
    if (type !== chosen) onToast(`${source} é um relatório ${LABEL[type]}: importado como ${LABEL[type]}.`, 'warning');
    else onToast(`Lista ${LABEL[type]} atualizada (${source}).`, 'success');
  };

  const pickFile = (type: ListType) => {
    setFileType(type);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // .xlsx é um ZIP (começa com "PK"): não é texto
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) return onToast('Planilha do Excel (.xlsx) não é suportada. Salve como CSV.', 'error');
      let raw = new TextDecoder('utf-8').decode(bytes);
      // CSV salvo pelo Excel no Windows vem em Latin-1: UTF-8 inválido vira U+FFFD
      if (raw.includes(String.fromCharCode(0xfffd))) raw = new TextDecoder('windows-1252').decode(bytes);
      if (raw.includes('\u0000')) return onToast('Arquivo não parece ser texto/CSV.', 'error');
      importAs(raw, fileType, `"${file.name}"`);
    } catch {
      onToast('Falha ao ler o arquivo.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''; // permite recarregar o mesmo arquivo
    }
  };

  const handlePaste = async (type: ListType) => {
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw) return onToast('Área de transferência vazia.', 'warning');
      importAs(raw, type, 'O texto colado');
    } catch {
      setShowText(true);
      onToast('Cole com Ctrl+V (ou segurando o dedo) no campo de texto abaixo.', 'info');
    }
  };

  const total = stats.iptv + stats.p2p + stats.other;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar listas"
      subtitle="Relatórios do painel (CSV) ou texto copiado"
      icon={FileUp}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={onClear} disabled={!value} className="flex-1 sm:flex-none">Limpar tudo</Button>
          <Button variant="primary" icon={Play} onClick={onProcess} disabled={!value.trim()} className="flex-1 sm:flex-none">Processar</Button>
        </>
      }
    >
      {/* sem "accept": no Android o filtro por extensão vira tipo MIME e deixa CSVs
          de Downloads/WhatsApp/Drive cinza (não selecionáveis). O conteúdo é validado ao ler. */}
      <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['iptv', 'p2p'] as ListType[]).map(type => (
          <div key={type} className="border border-line rounded-md p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <Badge tone={type === 'iptv' ? 'brand' : 'ok'} solid>{LABEL[type]}</Badge>
              {stats[type] > 0 && (
                <button onClick={() => onRemoveType(type)} className="text-xs text-muted hover:text-danger flex items-center gap-1">
                  <Trash2 size={12} /> Limpar
                </button>
              )}
            </div>
            <p className={cx('text-sm mb-3', stats[type] ? 'text-ink' : 'text-muted')}>
              {stats[type] ? `${stats[type]} cliente(s) carregado(s)` : 'Nenhuma lista carregada'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" icon={Upload} onClick={() => pickFile(type)}>Arquivo</Button>
              <Button size="sm" icon={Clipboard} onClick={() => handlePaste(type)}>Colar</Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted mt-3">
        Importar num tipo substitui só a lista daquele tipo. {total > 0 && `Total: ${total} linha(s).`}
      </p>

      <button onClick={() => setShowText(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <PencilLine size={13} /> Ver ou editar o texto das listas
        <ChevronDown size={13} className={cx('transition-transform', showText && 'rotate-180')} />
      </button>
      {showText && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Cole aqui a lista exportada do painel..."
          className={cx(inputCls, 'mt-2 h-56 font-mono text-xs leading-relaxed resize-y')}
        />
      )}
    </Modal>
  );
};

export default ImportModal;
