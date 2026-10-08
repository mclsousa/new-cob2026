import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ParsedClient, AppConfig, ResultViewMode } from '../types';
import { buildPixPayload } from '../utils/pix';
import { extractPhone, formatDate, processSpinSyntax, extractCredentials, toWhatsappNumber } from '../utils/helpers';
import { dueStatus, Risk } from '../utils/billing';
import { openExternal } from '../utils/native';
import { Copy, Phone, Edit, User, CheckCircle, ChevronDown, ChevronUp, PenTool, ListChecks, Link as LinkIcon, Lock, Key, Bell, Wallet, StickyNote, Info, UserRound, AlertTriangle, CircleDollarSign, CalendarDays } from 'lucide-react';
import { Button, Menu, MenuItem, cx, tagStyle } from './ui';

interface ClientCardProps {
  client: ParsedClient;
  config: AppConfig;
  isExpiredMode: boolean;
  viewMode: ResultViewMode;
  searchQuery: string;
  isSent: boolean;
  isPaid?: boolean;
  hasReminder?: boolean;
  phoneOverride?: string;
  onEdit: (client: ParsedClient) => void;
  onCopy: (text: string) => void;
  onMarkAsSent: (id: string, action: 'whatsapp' | 'copy' | 'receipt') => void;
  onPay: (client: ParsedClient) => void;
  onLinkClient: (client: ParsedClient) => void;
  onAddReminder: (client: ParsedClient) => void;
  onOpenProfile: (client: ParsedClient) => void;
  risk?: Risk;
}

export const WhatsappIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

// Sigla do tipo da conta (visão em lista): IPTV (roxo) ou P2P (verde-água)
const TypeTag = ({ type }: { type: ParsedClient['type'] }) => (
  <span className="text-[10px] font-medium tracking-wider text-muted flex-shrink-0">{type === 'p2p' ? 'P2P' : 'IPTV'}</span>
);

// Pílula padrão das etiquetas (mesma altura e respiro em todas)
const Chip = ({ children, className, style, title }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; title?: string; key?: string }) => (
  <span title={title} style={style} className={cx('inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium leading-none whitespace-nowrap', className)}>
    {children}
  </span>
);

// Cor do texto do status (âmbar mais escuro que o da barra para ler bem no fundo branco)
const STATUS_TEXT: Record<string, string> = {
  overdue: 'text-danger', today: 'text-[#C27C0E]', tomorrow: 'text-brand', soon: 'text-info', active: 'text-ok',
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-warn/30 text-ink rounded px-0.5">{part}</mark>
          : part,
      )}
    </>
  );
};

const ClientCard: React.FC<ClientCardProps> = ({
  client, config, isExpiredMode, viewMode, searchQuery, isSent, isPaid, hasReminder, phoneOverride,
  onEdit, onCopy, onMarkAsSent, onPay, onLinkClient, onAddReminder, onOpenProfile, risk,
}) => {
  const isFocusMode = viewMode === 'focus';
  const [isCollapsed, setIsCollapsed] = useState(!isFocusMode);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ao recolher, o card encolhe: traz ele de volta para a tela em vez de deixar a lista "pular"
  const collapse = () => {
    setIsCollapsed(true);
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('auto');
  const [selectedPlanGroupId, setSelectedPlanGroupId] = useState<string>('default');

  const { cleanText, whatsapp: extractedWhatsapp, original: originalPhone } = useMemo(() => extractPhone(client.rawNotes), [client.rawNotes]);
  const { whatsapp: overrideWhatsapp, original: overrideOriginal } = useMemo(() => phoneOverride ? extractPhone(phoneOverride) : { whatsapp: null, original: null }, [phoneOverride]);
  const whatsapp = toWhatsappNumber(overrideWhatsapp || extractedWhatsapp || '');
  const displayPhone = overrideOriginal || originalPhone;
  const hasLinkedClients = !!client.linked && client.linked.length > 0;
  const credentials = useMemo(() => extractCredentials(cleanText), [cleanText]);

  useEffect(() => {
    if (!config.planGroups) return;
    const totalAccounts = 1 + (client.linked?.length || 0);
    if (totalAccounts > 1) {
      const matchingGroup = config.planGroups.find(g => g.label.includes(`${totalAccounts}`));
      if (matchingGroup) setSelectedPlanGroupId(matchingGroup.id);
    } else {
      setSelectedPlanGroupId('default');
    }
  }, [client.linked, config.planGroups]);

  const activeTags = useMemo(() => {
    if (!client.tags || !config.tags) return [];
    return config.tags.filter(t => client.tags?.includes(t.id));
  }, [client.tags, config.tags]);

  const calculateCardData = () => {
    const diasSemanaPt = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const currentHour = new Date().getHours();
    let saudacao = 'Olá';
    if (currentHour < 12) saudacao = 'Bom dia';
    else if (currentHour < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';

    const venc = new Date(client.dueDate);
    const vencDateOnly = new Date(venc);
    vencDateOnly.setHours(0, 0, 0, 0);

    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    let prefixStr = 'vence em';
    if (isExpiredMode || vencDateOnly.getTime() < hoje.getTime()) prefixStr = 'venceu';
    else if (vencDateOnly.getTime() === hoje.getTime()) prefixStr = 'vence hoje';
    else if (vencDateOnly.getTime() === amanha.getTime()) prefixStr = 'vence amanhã';

    const diaSemana = diasSemanaPt[venc.getDay()];

    let timeStr = config.defaultTime || '20:00';
    if (timeStr.includes(':')) {
        const [h, m] = timeStr.split(':');
        timeStr = m === '00' ? `${h}h` : `${h}h${m}`;
    }

    const dateFormatted = isExpiredMode
      ? `${formatDate(venc)} (expirou às ${timeStr})`
      : `${formatDate(venc)} às ${timeStr}`;

    const vencimentoFinal = isExpiredMode
      ? `venceu em *[${diaSemana} - ${dateFormatted}]*`
      : `${prefixStr}, *[${diaSemana} - ${dateFormatted}]*`;

    let templateToUse = '';
    let isCustom = false;

    if (client.customMessage && client.customMessage.trim().length > 0) {
        templateToUse = client.customMessage;
        isCustom = true;
    } else if (selectedTemplateId !== 'auto') {
        const found = config.templates.additional?.find(t => t.id === selectedTemplateId);
        if (found) templateToUse = found.content;
        else templateToUse = isExpiredMode ? config.templates.expired : config.templates.normal;
    } else {
        templateToUse = isExpiredMode ? config.templates.expired : config.templates.normal;
    }

    const activeGroup = config.planGroups?.find(g => g.id === selectedPlanGroupId) || config.planGroups?.[0];
    const plansToUse = activeGroup?.plans || config.plans || [];

    const baseTitle = config.plansTitle || 'TABELA DE PLANOS';
    let tableTitle = activeGroup?.title;
    if (!tableTitle) {
        if (activeGroup && activeGroup.id !== 'default') tableTitle = `${baseTitle} (${activeGroup.label})`;
        else tableTitle = baseTitle;
    }

    const formatStr = config.priceLineFormat || '{nome} - R$ {valor}';
    const priceTableString = plansToUse.map(p => {
        return formatStr.replace(/{nome}/g, p.label).replace(/{valor}/g, String(p.price));
    }).join('\n');

    let clientNameDisplay = client.name;
    if (hasLinkedClients) {
        const linkedNames = client.linked!.map(l => l.name).join(', ');
        clientNameDisplay = `${client.name}, ${linkedNames}`;
    }

    const pixKey = client.customPix?.trim() || config.pixKey;
    // PIX copia e cola com o valor do 1º plano da tabela ativa (ex.: 1 mês)
    const pixCopiaCola = () => buildPixPayload({
        key: pixKey,
        name: '',
        city: '',
        amount: plansToUse[0]?.price,
        txid: client.name,
    });

    let msg = templateToUse
        .replace(/{saudacao}/g, saudacao)
        .replace(/{nome}/g, clientNameDisplay)
        .replace(/{vencimento}/g, vencimentoFinal)
        .replace(/{pix_copia_cola}/g, () => (pixKey ? pixCopiaCola() : ''))
        .replace(/{pix}/g, pixKey)
        .replace(/{tabela_precos}/g, priceTableString)
        .replace(/{titulo_tabela}/g, tableTitle)
        .replace(/{login}/g, credentials.login || '???')
        .replace(/{senha}/g, credentials.pass || '???');

    if (!msg.includes(tableTitle)) {
        msg = msg.replace(/\*TABELA DE PLANOS(:\*)?/g, `*${tableTitle}$1`);
    }

    if (plansToUse.length > 0) msg = msg.replace(/{plano1}/g, String(plansToUse[0].price));
    if (plansToUse.length > 1) msg = msg.replace(/{plano2}/g, String(plansToUse[1].price));

    return { message: msg, isCustomMessage: isCustom };
  };

  const { message, isCustomMessage } = calculateCardData();
  const status = isExpiredMode ? dueStatus(new Date(0)) : dueStatus(client.dueDate);
  const templates = config.templates.additional || [];

  const renderMessagePreview = () =>
    message.split(/(\*[^*]+\*)/g).map((part, idx) =>
      part.startsWith('*') && part.endsWith('*')
        ? <strong key={idx} className="font-medium text-ink">{part.slice(1, -1)}</strong>
        : part,
    );

  const handleAction = (action: 'copy' | 'whatsapp') => {
    onMarkAsSent(client.id, action);
    const processedMsg = processSpinSyntax(message);
    if (action === 'copy') return onCopy(processedMsg);
    if (!whatsapp) return;
    openExternal(`https://wa.me/${whatsapp}?text=${encodeURIComponent(processedMsg)}`);
  };


  const payItem: MenuItem = { label: 'Registrar pagamento', icon: CircleDollarSign, onClick: () => onPay(client) };
  const menuItems: MenuItem[] = [
    { label: 'Ver ficha do cliente', icon: UserRound, onClick: () => onOpenProfile(client) },
    { label: 'Editar cliente', icon: Edit, onClick: () => onEdit(client) },
    { label: 'Vincular contas', icon: LinkIcon, onClick: () => onLinkClient(client) },
    { label: hasReminder ? 'Alterar lembrete' : 'Agendar lembrete', icon: Bell, onClick: () => onAddReminder(client) },
    { label: 'Copiar nome', icon: User, onClick: () => onCopy(client.name) },
    { label: 'Copiar telefone', icon: Phone, onClick: () => onCopy(displayPhone || ''), disabled: !displayPhone },
  ];

  // Etiquetas no mesmo formato (pílula de mesma altura): situação do envio + etiquetas do cliente
  const chips = [
    isPaid && <Chip key="paid" className="bg-ok text-white"><Wallet size={11} /> Pago</Chip>,
    hasReminder && <Chip key="rem" className="bg-brand-soft text-brand"><Bell size={11} /> Lembrete</Chip>,
    risk && <Chip key="risk" className="bg-danger text-white" title={risk.reasons.join(' · ')}><AlertTriangle size={11} /> Em risco</Chip>,
    ...activeTags.map(tag => <Chip key={tag.id} style={tagStyle(tag.color)}>{tag.label}</Chip>),
  ].filter(Boolean);
  const sentMark = isSent && !isPaid && (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok whitespace-nowrap">
      <CheckCircle size={12} /> Enviado
    </span>
  );
  const chipsRow = (center?: boolean) => chips.length > 0 && (
    <div className={cx('flex flex-wrap gap-1.5', center && 'justify-center')}>{chips}</div>
  );

  // Linha de informação em texto: IPTV · Amanhã · 09/10/2026 (sem caixinhas)
  const due = new Date(client.dueDate);
  const weekday = due.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  const dueDay = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}${due.getFullYear() !== new Date().getFullYear() ? `/${due.getFullYear()}` : ''}`;
  const metaLine = (center?: boolean) => (
    <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', center && 'justify-center')}>
      <span className={cx('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap', STATUS_TEXT[status.level])}>
        <CalendarDays size={13} className="flex-shrink-0" />
        {status.label}
        <span className="opacity-40">·</span>
        <span className="capitalize">{weekday}</span>, {dueDay}
      </span>
      {hasLinkedClients && <span className="text-info font-medium">+{client.linked!.length} vinculada(s)</span>}
      {isCustomMessage && <span className="text-brand inline-flex items-center gap-0.5"><PenTool size={10} /> Personalizada</span>}
    </div>
  );

  const templatePicker = templates.length > 0 && (
    <label className="relative inline-flex items-center gap-1.5 text-xs text-muted border border-line rounded-md px-2 py-1.5 bg-card hover:bg-subtle cursor-pointer" title="Modelo da mensagem">
      <ListChecks size={13} className={selectedTemplateId !== 'auto' ? 'text-brand' : ''} />
      <span className="max-w-[90px] truncate">{templates.find(t => t.id === selectedTemplateId)?.label || 'Automático'}</span>
      <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer">
        <option value="auto">Automático</option>
        {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  );

  const whatsappIconButton = (size: number) => (
    <button onClick={() => handleAction('whatsapp')} disabled={!whatsapp} title="Enviar WhatsApp" className="p-2 rounded-md text-whatsapp hover:bg-whatsapp/10 disabled:opacity-30 disabled:cursor-not-allowed">
      <WhatsappIcon size={size} />
    </button>
  );

  // --- LISTA (linha de tabela) ---
  if (viewMode === 'list') {
    return (
      <div className={cx('flex items-center gap-3 px-4 py-2.5 bg-card hover:bg-subtle transition-colors', (isSent || isPaid) && 'opacity-60')}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} title={status.label} />
        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-[2fr_1fr_1.3fr_2fr] gap-x-3 items-center">
          <div className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
            <TypeTag type={client.type} />
            <span className="truncate"><HighlightedText text={client.name} query={searchQuery} /></span>
            {hasLinkedClients && <span className="text-[10px] text-info">+{client.linked!.length}</span>}
          </div>
          <div className="text-xs text-muted">{formatDate(client.dueDate)}</div>
          <div className="text-xs text-muted font-mono truncate hidden md:block">{displayPhone || '—'}</div>
          <div className="hidden md:flex items-center gap-1.5 min-w-0 overflow-hidden">{chips}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sentMark}
          {whatsappIconButton(15)}
          <Menu items={[payItem, ...menuItems]} />
        </div>
      </div>
    );
  }

  // --- RECOLHIDO ---
  if (isCollapsed && !isFocusMode) {
    return (
      <div ref={rootRef} className={cx('bg-card rounded-md border border-line/60 shadow-card transition-colors hover:border-brand/30 scroll-mt-4', (isSent || isPaid) && 'opacity-70')}>
        <div className="flex items-stretch gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setIsCollapsed(false)}>
          <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[15px] font-medium text-ink leading-snug break-words"><HighlightedText text={client.name} query={searchQuery} /> <TypeTag type={client.type} /></p>
            {metaLine()}
            {chipsRow()}
            {client.customNotes && (
              <p className="inline-flex max-w-full items-start gap-1.5 text-xs font-medium text-ink bg-warn/25 rounded px-2 py-1">
                <StickyNote size={12} className="text-ink/70 flex-shrink-0 mt-px" />
                <span className="min-w-0 break-words"><HighlightedText text={client.customNotes} query={searchQuery} /></span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end justify-between gap-1 flex-shrink-0">
            <div className="min-h-[16px]">{sentMark}</div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              {whatsappIconButton(18)}
              <Menu items={[payItem, ...menuItems]} />
              <ChevronDown size={15} className="text-muted ml-1 hidden sm:block" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- EXPANDIDO / FOCO ---
  return (
    <div ref={rootRef} className={cx('bg-card border border-line/60 rounded-md flex flex-col overflow-hidden scroll-mt-4', isFocusMode ? 'shadow-pop max-h-full' : 'shadow-card')}>
      {!isFocusMode && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line cursor-pointer select-none" onClick={collapse}>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[15px] font-medium text-ink leading-snug break-words">{client.name} <TypeTag type={client.type} /></p>
            {metaLine()}
            {chipsRow()}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            {sentMark}
            <ChevronUp size={16} className="text-muted" />
          </div>
        </div>
      )}

      <div className={cx('flex-1 flex flex-col min-h-0 overflow-y-auto', isFocusMode ? 'p-4 sm:p-8' : 'p-4')}>
        {isFocusMode && sentMark && <div className="flex justify-end -mt-1 mb-1">{sentMark}</div>}
        {isFocusMode && (
          <div className="mb-5 text-center">
            <h2 className="text-xl sm:text-2xl font-medium text-ink break-words">{client.name} <TypeTag type={client.type} /></h2>
            <div className="mt-2 space-y-2">
              {metaLine(true)}
              {chipsRow(true)}
            </div>
            <p className="font-mono text-sm text-muted mt-2">{displayPhone || <span className="italic">sem telefone</span>}</p>
            {hasLinkedClients && (
              <p className="text-xs text-info mt-1 flex items-center justify-center gap-1"><LinkIcon size={11} /> {client.linked!.map(l => l.name).join(', ')}</p>
            )}
          </div>
        )}

        {!isFocusMode && hasLinkedClients && (
          <div className="mb-3 space-y-2">
            {hasLinkedClients && (
              <div className="border border-info/30 bg-info/5 rounded-md px-3 py-2 text-xs text-ink">
                <p className="font-medium text-info flex items-center gap-1 mb-1"><LinkIcon size={11} /> Contas vinculadas ({client.linked!.length})</p>
                {client.linked!.map(l => <p key={l.id} className="text-muted">{l.name} · vence {formatDate(l.dueDate)}</p>)}
              </div>
            )}
          </div>
        )}

        {(config.planGroups || []).length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1 justify-center sm:justify-start">
            {config.planGroups!.map(group => (
              <button
                key={group.id}
                onClick={() => setSelectedPlanGroupId(group.id)}
                className={cx('px-2 py-0.5 text-[11px] rounded border transition-colors', selectedPlanGroupId === group.id ? 'bg-brand border-brand text-white' : 'border-line text-muted hover:text-ink')}
              >
                {group.label}
              </button>
            ))}
          </div>
        )}

        <div className={cx(
          'rounded-md border px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap select-text overflow-y-auto',
          isFocusMode && 'text-sm sm:text-base max-h-[34vh] sm:max-h-[42vh]',
          isCustomMessage ? 'bg-brand-soft/60 border-brand/20 text-ink' : 'bg-subtle border-line text-ink/80',
        )}>
          {isCustomMessage && <p className="text-[10px] font-medium uppercase tracking-wider text-brand mb-1 flex items-center gap-1"><PenTool size={10} /> Mensagem personalizada</p>}
          {renderMessagePreview()}
        </div>

        <div className="space-y-2 mt-3">
          {(credentials.login || credentials.pass) && (
            <div className="flex flex-wrap gap-4 items-center text-xs font-mono border border-line rounded-md px-3 py-2 text-ink">
              <span className="flex items-center gap-1"><Lock size={11} className="text-muted" /> <span className="text-muted">User:</span> <b className="select-all font-medium">{credentials.login || '-'}</b></span>
              <span className="flex items-center gap-1"><Key size={11} className="text-muted" /> <span className="text-muted">Pass:</span> <b className="select-all font-medium">{credentials.pass || '-'}</b></span>
            </div>
          )}
          {cleanText && (
            <div className="text-xs border-l-2 border-danger pl-2.5 py-0.5 text-ink">
              <span className="text-muted flex items-center gap-1 mb-0.5"><Info size={11} /> Notas do painel</span>
              <HighlightedText text={cleanText} query={searchQuery} />
            </div>
          )}
          {client.customNotes && (
            <div className="text-sm font-medium text-ink bg-warn/15 border-l-2 border-warn rounded-r px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-warn flex items-center gap-1 mb-0.5"><StickyNote size={12} /> Observação privada</span>
              <HighlightedText text={client.customNotes} query={searchQuery} />
            </div>
          )}
        </div>
      </div>

      <div className={cx('flex items-center gap-2 px-4 py-3 border-t border-line bg-subtle/60 flex-wrap', isFocusMode && 'justify-center')}>
        {templatePicker}
        <Menu items={menuItems} align="left" />
        {!isFocusMode && <div className="flex-1 hidden sm:block" />}
        {/* no celular as ações ocupam uma linha inteira, com botões do mesmo tamanho */}
        <div className="flex gap-2 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button size="sm" icon={Copy} onClick={() => handleAction('copy')} title="Copiar mensagem">Copiar</Button>
          <Button size="sm" variant="soft" icon={CircleDollarSign} onClick={() => onPay(client)}>Pago</Button>
          <Button size="sm" variant="whatsapp" onClick={() => handleAction('whatsapp')} disabled={!whatsapp} title="Enviar WhatsApp">
            <WhatsappIcon size={13} /> Enviar
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ClientCard);
