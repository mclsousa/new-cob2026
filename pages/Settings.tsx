// Configurações em página com abas (antigo ConfigModal).
import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, MessageTemplate, ClientTag, PricingPlan, PlanGroup, NotifySettings } from '../types';
import { downloadBlob } from '../utils/helpers';
import { SYNC_KEYS } from '../utils/syncKeys';
import { markDirty } from '../utils/sync';
import { saveFile, isNative } from '../utils/native';
import NativeNotifySection from '../components/NativeNotifySection';
import SyncSection from '../components/SyncSection';
import PushSection from '../components/PushSection';
import { Card, Button, PageHeader, Modal, InfoTip, SwitchRow, inputCls, labelCls, cx, tagStyle } from '../components/ui';
import { notifySettings, dailyMessage } from '../utils/billing';
import { Save, Download, Upload, Clock, Plus, Trash2, Tag, CreditCard, Check, X, KeyRound, Cloud, MessageSquareText, Receipt, Database, AlertTriangle, BellRing, SlidersHorizontal } from 'lucide-react';

type Tab = 'general' | 'templates' | 'plans' | 'notifications' | 'tags' | 'data';
const TABS: { id: Tab; label: string; icon: typeof Tag }[] = [
  { id: 'general', label: 'Geral', icon: SlidersHorizontal },
  { id: 'templates', label: 'Mensagens', icon: MessageSquareText },
  { id: 'plans', label: 'Planos', icon: CreditCard },
  { id: 'notifications', label: 'Notificações', icon: BellRing },
  { id: 'tags', label: 'Etiquetas', icon: Tag },
  { id: 'data', label: 'Backup', icon: Database },
];

const VARS_HELP = '{saudacao} {nome} {vencimento} {titulo_tabela} {tabela_precos} {pix} {pix_copia_cola} {login} {senha}';

interface SettingsProps {
  config: AppConfig;
  onSave: (newConfig: AppConfig) => void;
  onToast: (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  counts: { clients: number; payments: number; history: number };
}

const Settings: React.FC<SettingsProps> = ({ config, onSave, onToast, counts }) => {
  const [local, setLocal] = useState<AppConfig>(config);
  const [tab, setTab] = useState<Tab>('general');
  const [selectedGroup, setSelectedGroup] = useState('default');
  const [newGroupName, setNewGroupName] = useState<string | null>(null);
  const [restoreData, setRestoreData] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(config); }, [config]);
  const dirty = JSON.stringify(local) !== JSON.stringify(config);

  const change = <K extends keyof AppConfig>(field: K, value: AppConfig[K]) => setLocal(prev => ({ ...prev, [field]: value }));
  const setTemplate = (key: 'normal' | 'expired' | 'receipt', value: string) =>
    setLocal(prev => ({ ...prev, templates: { ...prev.templates, [key]: value } }));

  // --- Tabelas de preço ---
  const mapGroups = (fn: (g: PlanGroup) => PlanGroup) => setLocal(prev => ({ ...prev, planGroups: (prev.planGroups || []).map(fn) }));
  const addGroup = () => {
    const name = (newGroupName || '').trim();
    setNewGroupName(null);
    if (!name) return;
    const group: PlanGroup = { id: Date.now().toString(), label: name, plans: [] };
    setLocal(prev => ({ ...prev, planGroups: [...(prev.planGroups || []), group] }));
    setSelectedGroup(group.id);
  };
  const deleteGroup = (id: string) => {
    if (id === 'default') return;
    setLocal(prev => ({ ...prev, planGroups: (prev.planGroups || []).filter(g => g.id !== id) }));
    if (selectedGroup === id) setSelectedGroup('default');
  };
  const addPlan = (groupId: string) => {
    const plan: PricingPlan = { id: Date.now().toString(), label: '', price: 0 };
    mapGroups(g => (g.id === groupId ? { ...g, plans: [...g.plans, plan] } : g));
  };
  const updatePlan = (groupId: string, planId: string, field: keyof PricingPlan, value: string | number) =>
    mapGroups(g => (g.id === groupId ? { ...g, plans: g.plans.map(p => (p.id === planId ? { ...p, [field]: value } : p)) } : g));
  const deletePlan = (groupId: string, planId: string) =>
    mapGroups(g => (g.id === groupId ? { ...g, plans: g.plans.filter(p => p.id !== planId) } : g));

  // --- Modelos adicionais ---
  const setAdditional = (fn: (list: MessageTemplate[]) => MessageTemplate[]) =>
    setLocal(prev => ({ ...prev, templates: { ...prev.templates, additional: fn(prev.templates.additional || []) } }));

  // --- Etiquetas ---
  const setTags = (fn: (list: ClientTag[]) => ClientTag[]) => setLocal(prev => ({ ...prev, tags: fn(prev.tags || []) }));

  // --- Backup ---
  const handleBackup = () => {
    const data: Record<string, string | null> = { _version: '2', timestamp: new Date().toISOString() };
    for (const key of SYNC_KEYS) data[key] = localStorage.getItem(key);
    data.cobrancaConfig = JSON.stringify(local); // inclui alterações ainda não salvas
    const name = `backup_tvbrcob_${new Date().toISOString().split('T')[0]}.json`;
    const text = JSON.stringify(data, null, 2);
    void saveFile(name, text, () => downloadBlob(new Blob([text], { type: 'application/json' }), name));
    onToast('Backup baixado.', 'success');
  };

  const handlePickRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(String(ev.target?.result));
        if (!data || (!data.cobrancaConfig && !data.config)) return onToast('Arquivo de backup inválido.', 'error');
        setRestoreData(data);
      } catch {
        onToast('Não foi possível ler o arquivo de backup.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const applyRestore = () => {
    const data = restoreData;
    if (!data) return;
    if (!data._version) {
      // Formato antigo (v1): só config, notas e etiquetas
      if (data.config) localStorage.setItem('cobrancaConfig', JSON.stringify(data.config));
      if (typeof data.customNotes === 'string') localStorage.setItem('customNotes', data.customNotes);
      if (typeof data.clientTags === 'string') localStorage.setItem('clientTags', data.clientTags);
    } else {
      for (const key of SYNC_KEYS) {
        const v = data[key];
        if (typeof v === 'string') localStorage.setItem(key, v);
      }
    }
    markDirty(); // envia o backup restaurado para a nuvem (se a sincronização estiver ligada)
    window.location.reload();
  };

  const currentGroup = local.planGroups?.find(g => g.id === selectedGroup);
  const notify = notifySettings(local);
  const setNotify = (patch: Partial<NotifySettings>) => change('notifications', { ...notify, ...patch });
  const preview = dailyMessage({ today: 5, tomorrow: 4, overdue: 3, risk: 2 }, notify);

  return (
    <div>
      <PageHeader
        title="Configurações"
        crumb="Configurações"
        actions={
          <>
            {dirty && <span className="text-xs text-warn font-medium">Alterações não salvas</span>}
            {dirty && <Button variant="ghost" onClick={() => setLocal(config)}>Descartar</Button>}
            <Button variant="primary" icon={Save} disabled={!dirty} onClick={() => onSave(local)}>Salvar</Button>
          </>
        }
      />

      {/* Celular: grade 3x2 com todas as opções visíveis. Computador: abas sublinhadas. */}
      <div className="grid grid-cols-3 gap-2 mb-5 sm:flex sm:gap-1 sm:border-b sm:border-line">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap transition-colors',
                'rounded-md border sm:rounded-none sm:border-0 sm:border-b-2 sm:-mb-px',
                active
                  ? 'bg-brand border-brand text-white font-medium sm:bg-transparent sm:text-brand sm:border-brand'
                  : 'bg-card border-line text-muted hover:text-ink sm:bg-transparent sm:border-transparent',
              )}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={<span className="flex items-center gap-2"><KeyRound size={15} className="text-brand" /> Recebimento PIX</span>} subtitle="Usado em {pix} e {pix_copia_cola}">
            <div className="space-y-3">
              <label className="block">
                <span className={labelCls}>Chave PIX</span>
                <input type="text" value={local.pixKey} onChange={e => change('pixKey', e.target.value)} className={inputCls} placeholder="E-mail, CPF ou telefone" />
              </label>
              <p className="text-[11px] text-muted">Telefone como chave: use <code>+55</code> na frente.</p>
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Clock size={15} className="text-brand" /> Horário de vencimento</span>} subtitle="Exibido nos cards e nas mensagens">
            <input type="time" value={local.defaultTime || '20:00'} onChange={e => change('defaultTime', e.target.value)} className={cx(inputCls, 'max-w-[160px]')} />
          </Card>

          <Card title={<span className="flex items-center gap-2"><Cloud size={15} className="text-brand" /> Sincronização na nuvem</span>} className="lg:col-span-2">
            <SyncSection />
          </Card>
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-5">
          <p className="text-xs text-muted">Variáveis: <code className="text-ink">{VARS_HELP}</code>. Use <code className="text-ink">{'{a|b}'}</code> para sortear variações.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title={<span className="flex items-center gap-2"><MessageSquareText size={15} className="text-ok" /> A vencer</span>}>
              <textarea rows={12} value={local.templates.normal} onChange={e => setTemplate('normal', e.target.value)} className={cx(inputCls, 'font-mono text-xs')} />
            </Card>
            <Card title={<span className="flex items-center gap-2"><MessageSquareText size={15} className="text-danger" /> Vencido</span>}>
              <textarea rows={12} value={local.templates.expired} onChange={e => setTemplate('expired', e.target.value)} className={cx(inputCls, 'font-mono text-xs')} />
            </Card>
          </div>
          <Card
            title="Modelos adicionais"
            subtitle="Escolha no card do cliente em vez do automático"
            actions={<Button size="sm" variant="soft" icon={Plus} onClick={() => setAdditional(l => [...l, { id: Date.now().toString(), label: 'Novo modelo', content: 'Olá {nome}...' }])}>Criar modelo</Button>}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(local.templates.additional || []).map(t => (
                <div key={t.id} className="border border-line rounded-md p-3 space-y-2">
                  <div className="flex gap-2">
                    <input type="text" value={t.label} onChange={e => setAdditional(l => l.map(x => (x.id === t.id ? { ...x, label: e.target.value } : x)))} className={cx(inputCls, 'font-medium')} placeholder="Nome do modelo" />
                    <Button size="icon" variant="ghost" onClick={() => setAdditional(l => l.filter(x => x.id !== t.id))} title="Excluir"><Trash2 size={15} /></Button>
                  </div>
                  <textarea rows={5} value={t.content} onChange={e => setAdditional(l => l.map(x => (x.id === t.id ? { ...x, content: e.target.value } : x)))} className={cx(inputCls, 'font-mono text-xs')} />
                </div>
              ))}
              {(local.templates.additional || []).length === 0 && <p className="text-sm text-muted">Nenhum modelo adicional.</p>}
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Receipt size={15} className="text-brand" /> Recibo</span>} subtitle="Enviado ao registrar um pagamento. Variáveis: {nome} {data_vencimento} {valor}">
            <textarea rows={8} value={local.templates.receipt} onChange={e => setTemplate('receipt', e.target.value)} className={cx(inputCls, 'font-mono text-xs')} />
          </Card>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card
            title={<span className="flex items-center gap-2"><BellRing size={15} className="text-brand" /> Este aparelho {isNative()
              ? <InfoTip>No app, lembretes e resumo são alarmes do próprio celular: chegam na hora exata, mesmo sem internet e com o app fechado. Se não chegarem, desative a economia de bateria para o TVBR.Cob.</InfoTip>
              : <InfoTip>No computador, as notificações chegam pelo navegador, mesmo com o app fechado. Requer a sincronização na nuvem ligada (aba Geral): o servidor monta os avisos com os dados da nuvem.</InfoTip>}</span>}
            subtitle={isNative() ? 'Notificações do app neste celular' : 'Receber notificações push neste aparelho'}
          >
            {isNative() ? <NativeNotifySection onToast={onToast} /> : <PushSection onToast={onToast} />}
          </Card>

          <Card title="Resumo diário" subtitle="O que você recebe no começo do dia">
            <div className="divide-y divide-line -my-3">
              <SwitchRow title="Enviar resumo diário" description="Quantos clientes cobrar no dia" checked={notify.dailyEnabled} onChange={v => setNotify({ dailyEnabled: v })} />
              <label className={cx('flex items-center justify-between gap-4 py-3', !notify.dailyEnabled && 'opacity-50')}>
                <span>
                  <span className="block text-sm text-ink">Horário</span>
                  <span className="block text-xs text-muted mt-0.5">Horário de Brasília</span>
                </span>
                <select
                  value={notify.dailyHour}
                  disabled={!notify.dailyEnabled}
                  onChange={e => setNotify({ dailyHour: Number(e.target.value) })}
                  className={cx(inputCls, 'w-28')}
                >
                  {Array.from({ length: 18 }, (_, i) => i + 5).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </label>
              <SwitchRow title="Incluir vencidos (4–5 dias)" checked={notify.includeOverdue} disabled={!notify.dailyEnabled} onChange={v => setNotify({ includeOverdue: v })} />
              <SwitchRow title="Incluir quem vence amanhã" checked={notify.includeTomorrow} disabled={!notify.dailyEnabled} onChange={v => setNotify({ includeTomorrow: v })} />
              <SwitchRow title="Incluir clientes em risco" checked={notify.includeRisk} disabled={!notify.dailyEnabled} onChange={v => setNotify({ includeRisk: v })} />
            </div>
            <div className="mt-4 border border-line rounded-md bg-subtle px-3 py-2.5">
              <p className="text-[11px] text-muted mb-1">Prévia</p>
              <p className="text-sm font-medium text-ink">{preview.title}</p>
              <p className="text-xs text-muted">{preview.body}</p>
            </div>
          </Card>

          <Card title="Outros alertas">
            <div className="divide-y divide-line -my-3">
              <SwitchRow title="Lembretes agendados" description="O lembrete de um cliente também chega como notificação, com o app fechado" checked={notify.reminders} onChange={v => setNotify({ reminders: v })} />
              <SwitchRow title="Resumo ao abrir o app" description="Faixa com o resumo de hoje na 1ª abertura do dia" checked={notify.banner} onChange={v => setNotify({ banner: v })} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'plans' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card title="Título padrão da tabela" subtitle="Usado quando a tabela não tem título próprio">
              <input type="text" value={local.plansTitle || ''} onChange={e => change('plansTitle', e.target.value)} className={inputCls} placeholder="TABELA DE PLANOS" />
            </Card>
            <Card title="Formato da linha de preço" subtitle="{nome} = plano, {valor} = preço">
              <input type="text" value={local.priceLineFormat || '{nome} - R$ {valor}'} onChange={e => change('priceLineFormat', e.target.value)} className={cx(inputCls, 'font-mono')} />
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
            <Card title={<span className="flex items-center gap-2"><CreditCard size={15} className="text-brand" /> Tabelas</span>} bodyClassName="p-0 pt-3">
              <div className="divide-y divide-line border-t border-line">
                {(local.planGroups || []).map(g => (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGroup(g.id)}
                    className={cx('flex items-center justify-between px-5 py-2.5 cursor-pointer text-sm', selectedGroup === g.id ? 'bg-brand-soft text-brand font-medium' : 'text-ink hover:bg-subtle')}
                  >
                    <span className="truncate">{g.label}</span>
                    {g.id !== 'default' && (
                      <button onClick={e => { e.stopPropagation(); deleteGroup(g.id); }} className="p-1 text-muted hover:text-danger" title="Apagar tabela"><Trash2 size={13} /></button>
                    )}
                  </div>
                ))}
                {newGroupName !== null ? (
                  <div className="p-3 flex gap-1.5">
                    <input
                      autoFocus
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setNewGroupName(null); }}
                      placeholder="Ex: 4 Telas"
                      className={inputCls}
                    />
                    <Button size="icon" variant="primary" onClick={addGroup}><Check size={14} /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setNewGroupName(null)}><X size={14} /></Button>
                  </div>
                ) : (
                  <button onClick={() => setNewGroupName('')} className="w-full px-5 py-2.5 text-sm text-brand flex items-center gap-1.5 hover:bg-subtle"><Plus size={14} /> Nova tabela</button>
                )}
              </div>
            </Card>

            <Card
              title={currentGroup?.label || 'Selecione uma tabela'}
              subtitle="Tabelas com 'N Telas' no nome são usadas automaticamente para clientes com N contas vinculadas"
              actions={currentGroup && <Button size="sm" variant="soft" icon={Plus} onClick={() => addPlan(currentGroup.id)}>Adicionar preço</Button>}
            >
              {currentGroup && (
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelCls}>Título desta tabela (opcional)</span>
                    <input
                      type="text"
                      value={currentGroup.title || ''}
                      onChange={e => mapGroups(g => (g.id === currentGroup.id ? { ...g, title: e.target.value } : g))}
                      placeholder={`Padrão: ${local.plansTitle || 'TABELA DE PLANOS'}${currentGroup.id !== 'default' ? ` (${currentGroup.label})` : ''}`}
                      className={inputCls}
                    />
                  </label>
                  <div className="border border-line rounded-md divide-y divide-line">
                    <div className="grid grid-cols-[1fr_120px_40px] gap-2 px-3 py-2 text-xs text-muted bg-subtle"><span>Plano</span><span>Preço</span><span /></div>
                    {currentGroup.plans.map(plan => (
                      <div key={plan.id} className="grid grid-cols-[1fr_120px_40px] gap-2 px-3 py-2 items-center">
                        <input type="text" value={plan.label} onChange={e => updatePlan(currentGroup.id, plan.id, 'label', e.target.value)} placeholder="Ex: 1 Mês" className={inputCls} />
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">R$</span>
                          <input type="number" value={plan.price} onChange={e => updatePlan(currentGroup.id, plan.id, 'price', parseFloat(e.target.value) || 0)} className={cx(inputCls, 'pl-8')} />
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => deletePlan(currentGroup.id, plan.id)} title="Remover"><Trash2 size={14} /></Button>
                      </div>
                    ))}
                    {currentGroup.plans.length === 0 && <p className="text-center text-sm text-muted py-6">Nenhum preço nesta tabela.</p>}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'tags' && (
        <Card
          title={<span className="flex items-center gap-2"><Tag size={15} className="text-brand" /> Etiquetas</span>}
          subtitle="Organize clientes (VIP, Revenda...) e filtre por elas em Cobranças"
          actions={<Button size="sm" variant="soft" icon={Plus} onClick={() => setTags(l => [...l, { id: Date.now().toString(), label: 'Nova etiqueta', color: '#5E17EB' }])}>Nova etiqueta</Button>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(local.tags || []).map(tag => (
              <div key={tag.id} className="flex items-center gap-3 border border-line rounded-md px-3 py-2">
                <label className="relative w-6 h-6 rounded cursor-pointer flex-shrink-0" style={{ backgroundColor: tag.color }} title="Alterar cor">
                  <input type="color" value={tag.color} onChange={e => setTags(l => l.map(t => (t.id === tag.id ? { ...t, color: e.target.value } : t)))} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                <input type="text" value={tag.label} onChange={e => setTags(l => l.map(t => (t.id === tag.id ? { ...t, label: e.target.value } : t)))} className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none" />
                <span className="text-[11px] px-1.5 py-px rounded" style={tagStyle(tag.color)}>{tag.label || 'Etiqueta'}</span>
                <Button size="icon" variant="ghost" onClick={() => setTags(l => l.filter(t => t.id !== tag.id))}><Trash2 size={14} /></Button>
              </div>
            ))}
            {(local.tags || []).length === 0 && <p className="text-sm text-muted">Nenhuma etiqueta criada.</p>}
          </div>
        </Card>
      )}

      {tab === 'data' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={<span className="flex items-center gap-2"><Database size={15} className="text-brand" /> Backup completo</span>} subtitle="Um arquivo JSON com tudo deste aparelho">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[['Clientes', counts.clients], ['Pagamentos', counts.payments], ['Ações (histórico)', counts.history]].map(([label, n]) => (
                <div key={label} className="border border-line rounded-md px-3 py-2">
                  <p className="text-xl font-light text-ink">{n}</p>
                  <p className="text-[11px] text-muted">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mb-4">Inclui configurações, mensagens, planos, etiquetas, notas, vínculos, lembretes e o banco de clientes.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Download} onClick={handleBackup}>Baixar backup</Button>
              <Button icon={Upload} onClick={() => fileInputRef.current?.click()}>Restaurar backup</Button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handlePickRestore} />
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={!!restoreData}
        onClose={() => setRestoreData(null)}
        title="Restaurar backup?"
        subtitle={restoreData?.timestamp ? `Gerado em ${new Date(String(restoreData.timestamp)).toLocaleString('pt-BR')}` : 'Backup no formato antigo'}
        icon={AlertTriangle}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoreData(null)}>Cancelar</Button>
            <Button variant="danger" icon={Upload} onClick={applyRestore}>Restaurar e recarregar</Button>
          </>
        }
      >
        <p className="text-sm text-ink">Os dados deste aparelho serão substituídos pelos do arquivo. Se a sincronização estiver ligada, a nuvem também será atualizada.</p>
      </Modal>
    </div>
  );
};

export default Settings;
