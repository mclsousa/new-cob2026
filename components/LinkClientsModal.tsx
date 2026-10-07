import React, { useState, useEffect } from 'react';
import { ParsedClient } from '../types';
import { Link as LinkIcon, Search, Check } from 'lucide-react';
import { formatDate } from '../utils/helpers';
import { Modal, Button, inputCls, cx } from './ui';

interface LinkClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterClient: ParsedClient | null;
  allClients: ParsedClient[]; // lista plana dos clientes processados
  onSave: (master: ParsedClient, selectedDependents: string[]) => void; // nomes dos dependentes
}

const LinkClientsModal: React.FC<LinkClientsModalProps> = ({ isOpen, onClose, masterClient, allClients, onSave }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && masterClient) {
      setSelectedNames(masterClient.linked?.map(c => c.name) || []);
      setSearchTerm('');
    }
  }, [isOpen, masterClient]);

  if (!isOpen || !masterClient) return null;

  const toggle = (name: string) =>
    setSelectedNames(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));

  const candidates = allClients.filter(c =>
    c.name !== masterClient.name && c.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Vincular contas"
      subtitle={<>Titular: <span className="text-brand font-medium">{masterClient.name}</span></>}
      icon={LinkIcon}
      footer={
        <>
          <span className="text-xs text-muted mr-auto">{selectedNames.length} selecionado(s)</span>
          <Button variant="primary" icon={LinkIcon} onClick={() => { onSave(masterClient, selectedNames); onClose(); }}>Salvar vínculos</Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input type="text" placeholder="Buscar dependente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={cx(inputCls, 'pl-9')} />
      </div>
      <div className="border border-line rounded-md divide-y divide-line max-h-[45vh] overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted">Nenhum cliente encontrado.</p>
        ) : candidates.map(client => {
          const isSelected = selectedNames.includes(client.name);
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => toggle(client.name)}
              className={cx('w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors', isSelected ? 'bg-brand-soft' : 'hover:bg-subtle')}
            >
              <span>
                <span className={cx('block text-sm font-medium', isSelected ? 'text-brand' : 'text-ink')}>{client.name}</span>
                <span className="text-xs text-muted">Vence {formatDate(client.dueDate)}</span>
              </span>
              <span className={cx('w-5 h-5 rounded border flex items-center justify-center', isSelected ? 'bg-brand border-brand text-white' : 'border-line')}>
                {isSelected && <Check size={12} />}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
};

export default LinkClientsModal;
