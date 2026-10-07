// Importar lista do painel: colar, arquivo CSV/TXT ou digitar.
import React, { useRef } from 'react';
import { Upload, Clipboard, Trash2, FileUp, Play } from 'lucide-react';
import { normalizeCsvIfNeeded } from '../utils/parser';
import { Modal, Button, inputCls, cx } from './ui';

interface ImportModalProps {
  open: boolean;
  value: string;
  onChange: (text: string) => void;
  onImport: (text: string) => void; // substitui a lista anterior do mesmo tipo
  onClear: () => void;
  onProcess: () => void;
  onClose: () => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ open, value, onChange, onImport, onClear, onProcess, onClose, onToast }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePaste = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw) return onToast('Área de transferência vazia.', 'warning');
      onImport(normalizeCsvIfNeeded(raw)); // CSV do painel é normalizado na hora
      onToast('Lista atualizada com o conteúdo colado.', 'success');
    } catch {
      textareaRef.current?.focus();
      onToast('Use Ctrl+V para colar (permissão do navegador necessária).', 'info');
    }
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
      const text = normalizeCsvIfNeeded(raw);
      if (!text.trim()) return onToast(`"${file.name}" está vazio.`, 'warning');
      onImport(text);
      onToast(`"${file.name}" carregado (substituiu a lista anterior).`, 'success');
    } catch {
      onToast('Falha ao ler o arquivo.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''; // permite recarregar o mesmo arquivo
    }
  };

  const lines = value.trim() ? value.trim().split('\n').length : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar lista"
      subtitle="Relatório do painel (IPTV ou P2P), CSV ou texto colado"
      icon={FileUp}
      size="lg"
      footer={
        <>
          <span className="text-xs text-muted mr-auto">{lines} linha(s)</span>
          <Button variant="ghost" icon={Trash2} onClick={onClear} disabled={!value}>Limpar</Button>
          <Button variant="primary" icon={Play} onClick={onProcess} disabled={!value.trim()}>Processar</Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {/* sem "accept": no Android o filtro por extensão vira tipo MIME e deixa CSVs
            de Downloads/WhatsApp/Drive cinza (não selecionáveis). O conteúdo é validado ao ler. */}
        <input type="file" ref={fileInputRef} onChange={handleFile} className="hidden" />
        <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Escolher arquivo</Button>
        <Button icon={Clipboard} onClick={handlePaste}>Colar da área de transferência</Button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Cole aqui a lista exportada do painel..."
        className={cx(inputCls, 'h-72 font-mono text-xs leading-relaxed resize-y')}
      />
      <p className="text-[11px] text-muted mt-2">Um arquivo novo substitui o anterior do mesmo tipo (IPTV ou P2P); dá para manter os dois relatórios juntos. Cada processamento atualiza a base de Clientes.</p>
    </Modal>
  );
};

export default ImportModal;
