
import React, { useState, useEffect } from 'react';
import { ParsedClient, AppConfig } from '../types';
import { Save, Sparkles, RefreshCcw, UserPen } from 'lucide-react';
import { extractPhone } from '../utils/helpers';
import { Modal, Button, inputCls, labelCls, cx, tagStyle } from './ui';

interface EditClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ParsedClient | null;
  config: AppConfig;
  onSave: (updatedClient: ParsedClient) => void;
}

const EditClientModal: React.FC<EditClientModalProps> = ({ isOpen, onClose, client, config, onSave }) => {
  const [formData, setFormData] = useState<{
    name: string;
    dueDate: string;
    phone: string;
    notesWithoutPhone: string;
    customNotes: string;
    customMessage: string;
    customPix: string;
    tags: string[];
  }>({ name: '', dueDate: '', phone: '', notesWithoutPhone: '', customNotes: '', customMessage: '', customPix: '', tags: [] });

  useEffect(() => {
    if (client) {
      const { cleanText, original: originalPhone } = extractPhone(client.rawNotes);
      // Format date for input type="date" (YYYY-MM-DD)
      const yyyy = client.dueDate.getFullYear();
      const mm = String(client.dueDate.getMonth() + 1).padStart(2, '0');
      const dd = String(client.dueDate.getDate()).padStart(2, '0');

      setFormData({
        name: client.name,
        dueDate: `${yyyy}-${mm}-${dd}`,
        phone: originalPhone,
        notesWithoutPhone: cleanText,
        customNotes: client.customNotes || '',
        customMessage: client.customMessage || '',
        customPix: client.customPix || '',
        tags: client.tags || []
      });
    }
  }, [client, isOpen]);

  const generateDefaultMessage = () => {
    if (!client) return;
    
    // Determine which template to use based on current form date
    const [y, m, d] = formData.dueDate.split('-').map(Number);
    const venc = new Date(y, m - 1, d);
    
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const vencCheck = new Date(venc);
    vencCheck.setHours(0,0,0,0);
    
    const isExpired = vencCheck < hoje;
    const template = isExpired ? config.templates.expired : config.templates.normal;

    // Mantém as variáveis ({nome}, {vencimento}, {pix}...) para continuarem dinâmicas;
    // só as antigas {planoN} viram valor fixo
    let preFilled = template;
    const plans = config.plans || [];
    (['{plano1}', '{plano2}', '{plano3}', '{plano6}'] as const).forEach((v, i) => {
      if (plans[i]) preFilled = preFilled.split(v).join(String(plans[i].price));
    });
    setFormData(prev => ({ ...prev, customMessage: preFilled }));
  };

  const toggleTag = (tagId: string) => {
    setFormData(prev => {
        const exists = prev.tags.includes(tagId);
        return {
            ...prev,
            tags: exists ? prev.tags.filter(t => t !== tagId) : [...prev.tags, tagId]
        };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    // Reconstruct date
    const [y, m, d] = formData.dueDate.split('-').map(Number);
    const newDate = new Date(client.dueDate);
    newDate.setFullYear(y);
    newDate.setMonth(m - 1);
    newDate.setDate(d);

    // Reconstruct raw notes
    let newRawNotes = formData.notesWithoutPhone;
    if (formData.phone) {
      newRawNotes = `${formData.phone} ${newRawNotes}`.trim();
    }

    onSave({
      ...client,
      name: formData.name,
      dueDate: newDate,
      rawNotes: newRawNotes,
      customNotes: formData.customNotes,
      customMessage: formData.customMessage,
      customPix: formData.customPix.trim(),
      tags: formData.tags
    });
  };

  if (!isOpen || !client) return null;

  const set = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar cliente"
      subtitle={client.name}
      icon={UserPen}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Save} type="submit" form="edit-form">Salvar alterações</Button>
        </>
      }
    >
      <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className={labelCls}>Nome</span>
            <input type="text" required value={formData.name} onChange={set('name')} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Vencimento</span>
            <input type="date" required value={formData.dueDate} onChange={set('dueDate')} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Telefone / WhatsApp</span>
            <input type="text" placeholder="+55..." value={formData.phone} onChange={set('phone')} className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>Chave PIX própria</span>
            <input type="text" placeholder={`Padrão: ${config.pixKey}`} value={formData.customPix} onChange={set('customPix')} className={inputCls} />
          </label>
        </div>

        {config.tags && config.tags.length > 0 && (
          <div>
            <span className={labelCls}>Etiquetas</span>
            <div className="flex flex-wrap gap-2">
              {config.tags.map(tag => {
                const isActive = formData.tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cx('px-2.5 py-1 rounded text-xs font-medium border transition-all', !isActive && 'opacity-60')}
                    style={isActive ? { ...tagStyle(tag.color), borderColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className={labelCls}>Notas do painel (sem telefone)</span>
          <input type="text" value={formData.notesWithoutPhone} onChange={set('notesWithoutPhone')} className={inputCls} />
        </label>

        <label className="block">
          <span className={labelCls}>Observação privada</span>
          <textarea rows={2} value={formData.customNotes} onChange={set('customNotes')} className={inputCls} />
        </label>

        <div className="pt-3 border-t border-line">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-brand flex items-center gap-1.5"><Sparkles size={13} /> Mensagem personalizada</span>
            <Button size="sm" variant="ghost" icon={RefreshCcw} onClick={generateDefaultMessage}>Carregar padrão</Button>
          </div>
          <textarea
            rows={6}
            value={formData.customMessage}
            onChange={set('customMessage')}
            placeholder="Use {nome} e {vencimento} para preencher automaticamente."
            className={cx(inputCls, 'font-mono text-xs')}
          />
          <p className="text-[11px] text-muted mt-1">Mantenha <b>{'{nome}'}</b> e <b>{'{vencimento}'}</b> para o cálculo automático da data.</p>
        </div>
      </form>
    </Modal>
  );
};

export default EditClientModal;
