import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Sun, Moon, Search, ArrowLeft, ChevronLeft, ChevronRight, Copy, X, Rocket, Upload, AlertOctagon, Menu as MenuIcon,
  Bell, Cloud, CloudOff, RefreshCw, LayoutDashboard, Send, Users, History as HistoryIcon, Settings as SettingsIcon,
  CheckCircle2, AlertTriangle, Info, XCircle, Sunrise, Download,
} from 'lucide-react';
import { onSyncStatus, syncNow, consumeJustPulled, type SyncStatus } from './utils/sync';
import {
  ParsedClient, AppConfig, ResultViewMode, ToastMessage, DateRange, ActionLog, StoredClient, Reminder,
  PaymentRecord, Page, PeriodPreset, StatusFilter, TypeFilter,
} from './types';
import { DEFAULT_CONFIG } from './constants';
import { parseClientData, detectInputType, normalizeCsvIfNeeded, mergeImport } from './utils/parser';
import { extractPhone, extractPhoneValidated, generateCSV, formatDateShort, toInputDate, formatDate, downloadBlob, toWhatsappNumber, loadJSON, saveItem } from './utils/helpers';
import { getWeekdayContext, getUpcomingRange } from './utils/calendar';
import { lastPaymentByName, isRecentlyPaid, storedToParsed, formatBRL, riskByName, dailySummary, DailySummary, notifySettings } from './utils/billing';
import ClientCard from './components/ClientCard';
import EditClientModal from './components/EditClientModal';
import PaymentModal, { PaymentInput } from './components/PaymentModal';
import LinkClientsModal from './components/LinkClientsModal';
import ReminderModal from './components/ReminderModal';
import ClientProfile from './components/ClientProfile';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateModal from './components/UpdateModal';
import { checkForUpdate, installedVersion, AppUpdate, InstalledVersion } from './utils/updates';
import ImportModal from './components/ImportModal';
import { Button, Modal, Menu, cx } from './components/ui';
import { Progress } from './components/charts';
import { registerServiceWorker } from './utils/push';
import { openExternal, saveFile, isNative, rescheduleNative, onNativeNotificationTap } from './utils/native';
import { RESCHEDULE_EVENT } from './components/NativeNotifySection';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Clients from './pages/Clients';
import History from './pages/History';
import Settings from './pages/Settings';

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90; // histórico de ações (alimenta ficha do cliente e risco)
const SENT_TTL = 12 * 60 * 60 * 1000; // selo "Enviado" dura 12h

const NAV: { id: Page; label: string; icon: typeof Send }[] = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'billing', label: 'Cobranças', icon: Send },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'history', label: 'Histórico', icon: HistoryIcon },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
];

const TOAST_STYLE: Record<ToastMessage['type'], { bar: string; icon: typeof Info }> = {
  success: { bar: 'bg-ok', icon: CheckCircle2 },
  error: { bar: 'bg-danger', icon: XCircle },
  warning: { bar: 'bg-warn', icon: AlertTriangle },
  info: { bar: 'bg-brand', icon: Info },
};

// Config salva em versões antigas -> formato atual
const loadConfig = (): AppConfig => {
  const parsed = loadJSON<any>('cobrancaConfig', null);
  if (!parsed || !parsed.templates) return DEFAULT_CONFIG;

  // Converte o antigo objeto "prices" para a lista "plans"
  if (parsed.prices && (!parsed.plans || parsed.plans.length === 0)) {
    parsed.plans = [
      { id: 'm1', label: '1 Mês', price: parsed.prices.month1 || 35 },
      { id: 'm2', label: '2 Meses', price: parsed.prices.month2 || 70 },
      { id: 'm3', label: '3 Meses', price: parsed.prices.month3 || 105 },
      { id: 'm6', label: '6 Meses', price: parsed.prices.month6 || 210 },
    ];
    if (parsed.templates.normal.includes('{plano1}')) parsed.templates.normal = DEFAULT_CONFIG.templates.normal;
    if (parsed.templates.expired.includes('{plano1}')) parsed.templates.expired = DEFAULT_CONFIG.templates.expired;
    delete parsed.prices;
  }

  // Planos de 4 e 5 meses para quem já usava o app
  if (parsed.plans) {
    if (!parsed.plans.some((p: any) => p.label.includes('4 Meses'))) parsed.plans.push({ id: 'p4', label: '4 Meses', price: 140 });
    if (!parsed.plans.some((p: any) => p.label.includes('5 Meses'))) parsed.plans.push({ id: 'p5', label: '5 Meses', price: 175 });
    parsed.plans.sort((a: any, b: any) => a.price - b.price);
  }

  if (!parsed.planGroups || parsed.planGroups.length === 0) {
    parsed.planGroups = [
      { id: 'default', label: '1 Tela (Padrão)', plans: parsed.plans || DEFAULT_CONFIG.plans },
      ...DEFAULT_CONFIG.planGroups.slice(1),
    ];
  }

  if (!parsed.tags) parsed.tags = DEFAULT_CONFIG.tags;
  if (!parsed.templates.receipt) parsed.templates.receipt = DEFAULT_CONFIG.templates.receipt;
  if (!parsed.priceLineFormat) parsed.priceLineFormat = DEFAULT_CONFIG.priceLineFormat;
  if (!parsed.plansTitle) parsed.plansTitle = DEFAULT_CONFIG.plansTitle;

  // Recursos removidos
  delete parsed.quickMessages;
  delete parsed.quickLinks;
  delete parsed.antiBanMode;
  delete parsed.pixName;
  delete parsed.pixCity;
  delete parsed.pixSeparate;
  return parsed;
};

const BrandMark = ({ size = 32 }: { size?: number }) => (
  <span className="rounded-md bg-brand text-white flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
    <Send size={size * 0.5} />
  </span>
);

function App() {
  // --- Tema e navegação ---
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('themeElite') === 'dark');
  // ?p=billing vem do toque na notificação diária
  const [page, setPage] = useState<Page>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('p') as Page | null;
    if (fromUrl && NAV.some(n => n.id === fromUrl)) {
      window.history.replaceState(null, '', '/');
      return fromUrl;
    }
    return (localStorage.getItem('uiPage') as Page) || 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [config, setConfig] = useState<AppConfig>(loadConfig);

  // --- Dados ---
  const [inputData, setInputData] = useState(() => localStorage.getItem('lastInputData') || '');
  const [customNotes, setCustomNotes] = useState<Record<string, string>>(() => loadJSON('customNotes', {}));
  const [customMessages, setCustomMessages] = useState<Record<string, string>>(() => loadJSON('customMessages', {}));
  const [phoneOverrides, setPhoneOverrides] = useState<Record<string, string>>(() => loadJSON('phoneOverrides', {}));
  const [pixOverrides, setPixOverrides] = useState<Record<string, string>>(() => loadJSON('pixOverrides', {}));
  const [clientTags, setClientTags] = useState<Record<string, string[]>>(() => loadJSON('clientTags', {}));
  // Titular -> nomes dos dependentes
  const [clientLinks, setClientLinks] = useState<Record<string, string[]>>(() => loadJSON('clientLinks', {}));
  const [clientDatabase, setClientDatabase] = useState<StoredClient[]>(() => loadJSON('clientDatabase', []));
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadJSON('payments', []));

  // Enviados nas últimas 12h (o selo "Enviado" sobrevive a recarregar a página)
  const [sentClients, setSentClients] = useState<Record<string, number>>(() => {
    const parsed = loadJSON<Record<string, unknown>>('sentClientsHistory', {});
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, ts]) => typeof ts === 'number' && now - ts < SENT_TTL)) as Record<string, number>;
  });

  const [actionHistory, setActionHistory] = useState<ActionLog[]>(() =>
    loadJSON<ActionLog[]>('actionHistory', []).filter(log => Date.now() - log.timestamp < HISTORY_DAYS * DAY),
  );

  const [reminders, setReminders] = useState<Reminder[]>(() =>
    loadJSON<Reminder[]>('reminders', []).filter(r => !r.fired || Date.now() - r.scheduledFor < DAY),
  );

  // --- Resultados e filtros da página Cobranças ---
  const [results, setResults] = useState<ParsedClient[]>([]); // agrupados (titular + vinculados)
  const [flatResults, setFlatResults] = useState<ParsedClient[]>([]); // todos, sem agrupar
  const [resultTitle, setResultTitle] = useState('');
  const [isExpiredMode, setIsExpiredMode] = useState(false);
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>('grid');
  const [period, setPeriod] = useState<PeriodPreset | null>(null);
  const [lastRange, setLastRange] = useState<DateRange>({ start: '', end: '' });
  const [customDates, setCustomDates] = useState<DateRange>(() => ({
    start: localStorage.getItem('unifiedStart') || '',
    end: localStorage.getItem('unifiedEnd') || '',
  }));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // --- UI ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ParsedClient | null>(null);
  const [payingClient, setPayingClient] = useState<ParsedClient | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [clientsFilter, setClientsFilter] = useState<'all' | 'overdue' | 'upcoming' | 'active' | 'risk'>('all');
  const [linkingClient, setLinkingClient] = useState<ParsedClient | null>(null);
  const [reminderClient, setReminderClient] = useState<ParsedClient | null>(null);

  // --- Modo Foco / Fila ---
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [isQueueMode, setIsQueueMode] = useState(false);
  const [invalidClients, setInvalidClients] = useState<{ name: string; phone: string; reason: string }[]>([]);
  const [showInvalidReport, setShowInvalidReport] = useState(false);

  // Recalcula a regra de sexta uma vez por minuto (aba aberta passando da meia-noite)
  const [weekday, setWeekday] = useState(() => getWeekdayContext());
  useEffect(() => {
    const interval = setInterval(() => setWeekday(getWeekdayContext()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // --- Persistência ---
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    saveItem('themeElite', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  useEffect(() => { saveItem('uiPage', page); }, [page]);
  useEffect(() => { saveItem('cobrancaConfig', JSON.stringify(config)); }, [config]);
  useEffect(() => { saveItem('lastInputData', inputData); }, [inputData]);
  useEffect(() => { saveItem('customNotes', JSON.stringify(customNotes)); }, [customNotes]);
  useEffect(() => { saveItem('customMessages', JSON.stringify(customMessages)); }, [customMessages]);
  useEffect(() => { saveItem('phoneOverrides', JSON.stringify(phoneOverrides)); }, [phoneOverrides]);
  useEffect(() => { saveItem('pixOverrides', JSON.stringify(pixOverrides)); }, [pixOverrides]);
  useEffect(() => { saveItem('clientTags', JSON.stringify(clientTags)); }, [clientTags]);
  useEffect(() => { saveItem('clientLinks', JSON.stringify(clientLinks)); }, [clientLinks]);
  useEffect(() => { saveItem('unifiedStart', customDates.start); saveItem('unifiedEnd', customDates.end); }, [customDates]);
  useEffect(() => { saveItem('sentClientsHistory', JSON.stringify(sentClients)); }, [sentClients]);
  useEffect(() => { saveItem('actionHistory', JSON.stringify(actionHistory)); }, [actionHistory]);
  useEffect(() => { saveItem('clientDatabase', JSON.stringify(clientDatabase)); }, [clientDatabase]);
  useEffect(() => { saveItem('reminders', JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { saveItem('payments', JSON.stringify(payments)); }, [payments]);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now() + Math.random(); // dois toasts no mesmo ms não colidem
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // --- Lembretes: dispara os vencidos ao abrir e agenda os das próximas 24h ---
  const scheduleReminder = useCallback((r: Reminder) => {
    const fire = () => {
      addToast(`Lembrete: cobrar ${r.clientName}`, 'warning');
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('TVBR.Cob', { body: `Hora de cobrar: ${r.clientName}`, icon: '/icons/icon-192.png' });
      }
      setReminders(prev => prev.map(x => (x.id === r.id ? { ...x, fired: true } : x)));
    };
    const delay = r.scheduledFor - Date.now();
    if (delay <= 0) fire();
    else if (delay < DAY) setTimeout(fire, delay);
  }, [addToast]);

  useEffect(() => {
    reminders.filter(r => !r.fired).forEach(scheduleReminder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Atualizações do app Android: verifica ao abrir e ao voltar (no máximo a cada 3h) ---
  const [appVersion, setAppVersion] = useState<InstalledVersion | null>(null);
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const lastUpdateCheck = useRef(0);
  useEffect(() => {
    if (!isNative()) return;
    void installedVersion().then(setAppVersion);
    const check = () => {
      if (Date.now() - lastUpdateCheck.current < 3 * 60 * 60 * 1000) return;
      lastUpdateCheck.current = Date.now();
      checkForUpdate().then(u => {
        setUpdate(u);
        // "Agora não" adia o aviso automático até o dia seguinte (o atalho no menu continua)
        if (u && localStorage.getItem('updateSnooze') !== `${u.build}|${toInputDate(new Date())}`) setShowUpdate(true);
      }).catch(() => undefined); // sem internet: tenta na próxima abertura
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const closeUpdate = () => {
    if (update) saveItem('updateSnooze', `${update.build}|${toInputDate(new Date())}`);
    setShowUpdate(false);
  };
  const checkUpdateNow = async () => {
    try {
      const u = await checkForUpdate();
      lastUpdateCheck.current = Date.now();
      setUpdate(u);
      if (u) setShowUpdate(true);
      else addToast('Você já está na versão mais recente.', 'success');
    } catch {
      addToast('Não foi possível verificar agora. Confira a conexão.', 'error');
    }
  };

  // --- Resumo do dia: aparece na 1ª abertura de cada dia (o push das 8h cobre o app fechado) ---
  const [dailyBanner, setDailyBanner] = useState<DailySummary | null>(null);
  useEffect(() => {
    void registerServiceWorker();
    const check = () => {
      const today = toInputDate(new Date());
      if (localStorage.getItem('dailyNoticeDate') === today) return;
      if (!notifySettings(loadJSON<AppConfig | undefined>('cobrancaConfig', undefined)).banner) return;
      const db = loadJSON<StoredClient[]>('clientDatabase', []);
      if (db.length) setDailyBanner(dailySummary(db));
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); }; // app aberto virando o dia
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const dismissDaily = () => {
    saveItem('dailyNoticeDate', toInputDate(new Date()));
    setDailyBanner(null);
  };

  // --- Sincronização: ao abrir e ao voltar para a aba ---
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off');
  useEffect(() => {
    const unsubscribe = onSyncStatus(setSyncStatus);
    if (consumeJustPulled()) addToast('Dados atualizados da nuvem.', 'info');
    void syncNow();
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', onVisible); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => addToast('Copiado!', 'success')).catch(() => addToast('Erro ao copiar.', 'error'));
  }, [addToast]);

  // Anexa ao final do campo; a linha em branco separa blocos (zera a seção IPTV/P2P)
  const appendInput = (text: string) => setInputData(prev => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));

  const goto = (p: Page) => { setPage(p); setIsSidebarOpen(false); };

  // --- Banco de clientes: novos entram, existentes são atualizados ---
  // Mantém o vencimento mais novo: um pagamento registrado aqui não é desfeito por uma lista antiga.
  const saveToDatabase = (parsed: ParsedClient[]) => {
    setClientDatabase(prev => {
      const byName = new Map(parsed.map(c => [c.name.toLowerCase(), c]));
      const existing = new Set(prev.map(c => c.name.toLowerCase()));
      const updated = prev.map(stored => {
        const match = byName.get(stored.name.toLowerCase());
        if (!match) return stored;
        const due = match.dueDate.getTime() > new Date(stored.dueDate).getTime() ? match.dueDate.toISOString() : stored.dueDate;
        return { ...stored, dueDate: due, rawNotes: match.rawNotes, originalLine: match.originalLine || stored.originalLine || '', type: match.type, savedAt: Date.now() };
      });
      const added: StoredClient[] = parsed
        .filter(c => !existing.has(c.name.toLowerCase()))
        .map(c => ({ id: crypto.randomUUID(), name: c.name, dueDate: c.dueDate.toISOString(), rawNotes: c.rawNotes, originalLine: c.originalLine || '', type: c.type, savedAt: Date.now() }));
      return [...updated, ...added];
    });
  };

  // --- Processamento da lista para um intervalo de datas ---
  const processData = useCallback((range: DateRange, isVencidoFilter: boolean, forceLinks?: Record<string, string[]>): boolean => {
    if (!inputData.trim()) {
      addToast('Importe a lista do painel primeiro.', 'warning');
      setIsImportOpen(true);
      return false;
    }
    if (!range.start || !range.end) {
      addToast('Selecione as datas de início e fim.', 'warning');
      return false;
    }
    const start = new Date(range.start + 'T00:00:00');
    const end = new Date(range.end + 'T23:59:59');
    if (start > end) {
      addToast('Data de início maior que data fim.', 'error');
      return false;
    }

    // Ctrl+V direto no campo não passa pelo botão Colar: normaliza aqui também
    const normalizedInput = normalizeCsvIfNeeded(inputData);
    const { parsedEntries } = parseClientData(normalizedInput, detectInputType(normalizedInput));
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);

    const prepared: ParsedClient[] = parsedEntries
      .filter(entry => {
        const d = new Date(entry.dueDate); d.setHours(0, 0, 0, 0);
        return d >= s && d <= e;
      })
      .map(entry => {
        let rawNotes = entry.rawNotes;
        if (phoneOverrides[entry.name]) rawNotes = `${phoneOverrides[entry.name]} ${extractPhone(entry.rawNotes).cleanText}`.trim();
        return {
          ...entry,
          rawNotes,
          customNotes: customNotes[entry.name] || '',
          customMessage: customMessages[entry.name] || '',
          customPix: pixOverrides[entry.name] || '',
          tags: clientTags[entry.name] || [],
          linked: [] as ParsedClient[],
        };
      });

    // Salva tudo que foi lido no banco, mesmo fora do período
    saveToDatabase(parsedEntries);

    if (prepared.length === 0) {
      addToast(`Nenhum cliente no período. (Lidos: ${parsedEntries.length})`, 'info');
    }

    // Agrupa dependentes dentro do titular
    const byName = new Map(prepared.map(c => [c.name, c]));
    const dependents = new Set<string>();
    Object.entries(forceLinks || clientLinks).forEach(([master, deps]) => {
      const m = byName.get(master);
      if (!m) return;
      (deps as string[]).forEach(depName => {
        const dep = byName.get(depName);
        if (dep) { m.linked = [...(m.linked || []), dep]; dependents.add(depName); }
      });
    });

    setFlatResults(prepared);
    setResults(prepared.filter(c => !dependents.has(c.name)));
    setIsExpiredMode(isVencidoFilter);
    setLastRange(range);
    const types = new Set(prepared.map(c => c.type));
    const typeLabel = types.size > 1 ? 'IPTV + P2P' : types.has('p2p') ? 'P2P' : 'IPTV';
    setResultTitle(`${isVencidoFilter ? 'Vencidos' : typeLabel} · ${formatDateShort(start)} – ${formatDateShort(end)}`);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputData, phoneOverrides, pixOverrides, customNotes, customMessages, clientTags, clientLinks, addToast]);

  // Intervalo de cada atalho de período
  const rangeFor = (p: PeriodPreset): { range: DateRange; expired: boolean } => {
    const today = new Date();
    const plus = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return toInputDate(d); };
    switch (p) {
      case 'today': return { range: { start: plus(0), end: plus(0) }, expired: false };
      case 'tomorrow': {
        const r = getUpcomingRange(); // sexta: amanhã + depois de amanhã
        return { range: { start: toInputDate(r.start), end: toInputDate(r.end) }, expired: false };
      }
      case 'overdue': return { range: { start: plus(-5), end: plus(-4) }, expired: true };
      case 'week': return { range: { start: plus(0), end: plus(6) }, expired: false };
      case 'custom': return { range: customDates, expired: !!customDates.end && customDates.end < plus(0) };
    }
  };

  const runPeriod = (p: PeriodPreset, opts: { navigate?: boolean } = {}) => {
    setPeriod(p);
    if (opts.navigate) goto('billing');
    if (p === 'custom' && (!customDates.start || !customDates.end)) return; // espera o usuário escolher as datas
    const { range, expired } = rangeFor(p);
    processData(range, expired);
  };

  const handleProcessFromImport = () => {
    setIsImportOpen(false);
    runPeriod(period || 'tomorrow', { navigate: true });
  };

  // Selo "Enviado" expira em 12h mesmo com o app aberto
  const isSent = useCallback((id: string) => !!sentClients[id] && Date.now() - sentClients[id] < SENT_TTL, [sentClients]);

  // --- Filtros em memória (busca, tipo, etiqueta, status) ---
  const lastPaid = useMemo(() => lastPaymentByName(payments), [payments]);
  const isPaid = useCallback((c: ParsedClient) => isRecentlyPaid(lastPaid.get(c.name.toLowerCase())), [lastPaid]);

  const filteredResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return results.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (tagFilter && !(r.tags || []).includes(tagFilter)) return false;
      if (statusFilter !== 'all') {
        const paid = isPaid(r);
        const sent = isSent(r.id);
        if (statusFilter === 'paid' && !paid) return false;
        if (statusFilter === 'sent' && (!sent || paid)) return false;
        if (statusFilter === 'pending' && (sent || paid)) return false;
      }
      if (!q) return true;
      const tagLabels = (r.tags || []).map(id => config.tags?.find(t => t.id === id)?.label.toLowerCase() || '');
      return r.name.toLowerCase().includes(q)
        || r.rawNotes.toLowerCase().includes(q)
        || (r.customNotes || '').toLowerCase().includes(q)
        || !!r.linked?.some(l => l.name.toLowerCase().includes(q))
        || tagLabels.some(l => l.includes(q));
    });
  }, [results, searchQuery, typeFilter, tagFilter, statusFilter, isSent, isPaid, config.tags]);

  const billingCounts = useMemo(() => {
    let sent = 0, paid = 0;
    results.forEach(r => { if (isPaid(r)) paid++; else if (isSent(r.id)) sent++; });
    return { pending: results.length - sent - paid, sent, paid };
  }, [results, isSent, isPaid]);

  // --- Foco / Fila: lista congelada ao iniciar (enviar não tira o cliente da fila) ---
  const resultsById = useMemo(() => new Map(results.map(r => [r.id, r])), [results]);
  const focusClients = useMemo(() => focusIds.map(id => resultsById.get(id)).filter(Boolean) as ParsedClient[], [focusIds, resultsById]);
  const safeFocusIndex = Math.min(focusIndex, Math.max(focusClients.length - 1, 0));
  const focusClient = resultViewMode === 'focus' ? focusClients[safeFocusIndex] : undefined;
  const isQueueModeRef = useRef(isQueueMode);
  isQueueModeRef.current = isQueueMode;
  const focusCountRef = useRef(focusClients.length);
  focusCountRef.current = focusClients.length;

  const handleMarkAsSent = useCallback((id: string, action: ActionLog['action']) => {
    const timestamp = Date.now();
    setSentClients(prev => ({ ...prev, [id]: timestamp }));
    const client = resultsById.get(id);
    if (client) {
      setActionHistory(prev => {
        // mesma ação no mesmo cliente em 10 min conta uma vez só
        if (prev.some(p => p.clientId === id && p.action === action && timestamp - p.timestamp < 600_000)) return prev;
        return [{ clientId: id, clientName: client.name, timestamp, action }, ...prev];
      });
    }
    // Fila: avança sozinho depois de abrir o WhatsApp
    if (action === 'whatsapp' && isQueueModeRef.current) {
      setTimeout(() => {
        if (!isQueueModeRef.current) return;
        setFocusIndex(i => (i < focusCountRef.current - 1 ? i + 1 : i));
      }, 1000);
    }
  }, [resultsById]);

  const startFocusMode = (enableQueue: boolean) => {
    if (filteredResults.length === 0) return;
    const invalids = filteredResults.flatMap(c => {
      const v = extractPhoneValidated(c.rawNotes);
      return v.isValid ? [] : [{ name: c.name, phone: v.original || '(sem número)', reason: v.invalidReason || 'inválido' }];
    });
    setInvalidClients(invalids);
    setFocusIds(filteredResults.map(c => c.id));
    setFocusIndex(0);
    setResultViewMode('focus');
    setIsQueueMode(enableQueue);
    if (invalids.length > 0) addToast(`${invalids.length} cliente(s) com número inválido: veja o relatório ao final.`, 'warning');
    if (enableQueue) addToast('Fila ativa: o próximo cliente abre sozinho após enviar.', 'success');
  };

  const stopFocusMode = () => {
    setResultViewMode('grid');
    setIsQueueMode(false);
    if (invalidClients.length > 0) setShowInvalidReport(true);
  };

  const handleFocusNext = () => {
    if (safeFocusIndex < focusClients.length - 1) setFocusIndex(safeFocusIndex + 1);
    else if (isQueueMode) {
      if (invalidClients.length > 0) setShowInvalidReport(true);
      setIsQueueMode(false);
      addToast('Fila concluída.', 'success');
    }
  };
  const handleFocusPrev = () => { if (safeFocusIndex > 0) setFocusIndex(safeFocusIndex - 1); };

  // --- Edição de cliente ---
  const setOrDelete = <T,>(setter: React.Dispatch<React.SetStateAction<Record<string, T>>>, key: string, value: T | undefined | null) =>
    setter(prev => {
      const copy = { ...prev };
      if (value && (!Array.isArray(value) || value.length > 0)) copy[key] = value; else delete copy[key];
      return copy;
    });

  const handleEditSave = (updated: ParsedClient) => {
    setResults(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setFlatResults(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setOrDelete(setCustomNotes, updated.name, updated.customNotes);
    setOrDelete(setCustomMessages, updated.name, updated.customMessage);
    setOrDelete(setPixOverrides, updated.name, updated.customPix?.trim()); // vazio = volta à chave das Configurações
    setOrDelete(setClientTags, updated.name, updated.tags);
    const { original } = extractPhone(updated.rawNotes);
    if (original) setPhoneOverrides(prev => ({ ...prev, [updated.name]: original }));
    // Mantém o banco de clientes em dia (vencimento/notas editados à mão)
    const oldName = (editingClient?.name || updated.name).toLowerCase();
    setClientDatabase(prev => prev.map(c => (c.name.toLowerCase() === oldName
      ? { ...c, name: updated.name, dueDate: updated.dueDate.toISOString(), rawNotes: updated.rawNotes }
      : c)));
    setEditingClient(null);
    addToast('Cliente atualizado.', 'success');
  };

  const handleSaveLinks = (master: ParsedClient, selected: string[]) => {
    const newLinks = { ...clientLinks };
    if (selected.length === 0) delete newLinks[master.name]; else newLinks[master.name] = selected;
    setClientLinks(newLinks);
    processData(lastRange, isExpiredMode, newLinks);
    addToast('Vínculos salvos!', 'success');
  };

  // Ao trocar a chave PIX, atualiza também onde a chave antiga ficou escrita
  // literalmente (modelos e mensagens personalizadas salvas antes de usar {pix}).
  const handleSaveConfig = (newConf: AppConfig) => {
    const oldKey = config.pixKey?.trim();
    const newKey = newConf.pixKey?.trim();
    const swap = (text: string) => (oldKey && newKey && oldKey !== newKey ? text.split(oldKey).join(newKey) : text);
    const t = newConf.templates;
    setConfig({
      ...newConf,
      templates: { ...t, normal: swap(t.normal), expired: swap(t.expired), receipt: swap(t.receipt), additional: (t.additional || []).map(a => ({ ...a, content: swap(a.content) })) },
    });
    setCustomMessages(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, swap(v as string)])));
    addToast('Configurações salvas.', 'success');
  };

  // --- Pagamentos ---
  const whatsappOf = (c: ParsedClient) => toWhatsappNumber(extractPhone(phoneOverrides[c.name] || c.rawNotes).whatsapp);

  const handleConfirmPayment = (client: ParsedClient, input: PaymentInput) => {
    const record: PaymentRecord = {
      id: crypto.randomUUID(),
      clientId: client.id,
      clientName: client.name,
      amount: input.amount,
      paidAt: Date.now(),
      planLabel: input.planLabel,
      newDueDate: input.newDueDate.toISOString(),
      prevDueDate: client.dueDate.toISOString(),
    };
    setPayments(prev => [record, ...prev]);
    setClientDatabase(prev => prev.map(c => (c.name.toLowerCase() === client.name.toLowerCase() ? { ...c, dueDate: record.newDueDate, savedAt: Date.now() } : c)));
    const renew = (list: ParsedClient[]) => list.map(c => (c.id === client.id ? { ...c, dueDate: input.newDueDate } : c));
    setResults(renew);
    setFlatResults(renew);

    if (input.sendReceipt) {
      const msg = (config.templates.receipt || '')
        .replace(/{nome}/g, client.name)
        .replace(/{data_vencimento}/g, formatDate(input.newDueDate))
        .replace(/{valor}/g, formatBRL(input.amount));
      const number = whatsappOf(client);
      if (number) openExternal(`https://wa.me/${number}?text=${encodeURIComponent(msg)}`);
      else copyToClipboard(msg);
      if (resultsById.has(client.id)) handleMarkAsSent(client.id, 'receipt');
    }
    addToast(`Pagamento de ${formatBRL(input.amount)} registrado · vence ${formatDate(input.newDueDate)}`, 'success');
  };

  // --- Lembretes ---
  const handleAddReminder = (client: ParsedClient, scheduledFor: number) => {
    const reminder: Reminder = { id: crypto.randomUUID(), clientId: client.id, clientName: client.name, scheduledFor, fired: false };
    setReminders(prev => [...prev.filter(r => r.clientName.toLowerCase() !== client.name.toLowerCase()), reminder]);
    scheduleReminder(reminder);
    addToast(`Lembrete agendado: ${new Date(scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 'info');
  };
  const pendingReminders = reminders.filter(r => !r.fired).sort((a, b) => a.scheduledFor - b.scheduledFor);
  const reminderNames = useMemo(() => new Set(pendingReminders.map(r => r.clientName.toLowerCase())), [pendingReminders]);

  // --- Banco ---
  const handleLoadFromDatabase = (clients: StoredClient[]) => {
    // Cabeçalho de seção por tipo, senão o parser chuta o tipo pela quantidade de datas
    const block = (type: 'iptv' | 'p2p') => {
      const lines = clients.filter(c => c.type === type).map(c => c.originalLine || c.name);
      return lines.length ? [type === 'p2p' ? 'Clientes P2P' : 'Clientes IPTV', ...lines].join('\n') : '';
    };
    appendInput([block('iptv'), block('p2p')].filter(Boolean).join('\n\n'));
    addToast(`${clients.length} cliente(s) adicionados à lista de cobrança.`, 'success');
    setIsImportOpen(true);
  };

  const handleExport = () => {
    if (filteredResults.length === 0) return;
    const rows = filteredResults.map(r => ({ name: r.name, date: r.dueDate, notes: extractPhone(r.rawNotes).cleanText, phone: extractPhone(r.rawNotes).original, customNotes: r.customNotes || '' }));
    const csv = generateCSV(rows, config.defaultTime || '20:00');
    const name = `clientes_export_${Date.now()}.csv`;
    void saveFile(name, String.fromCharCode(0xfeff) + csv, () => downloadBlob(new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8;' }), name));
    addToast('Arquivo exportado.', 'success');
  };

  // --- Risco e ficha do cliente ---
  const risks = useMemo(() => riskByName(payments, actionHistory), [payments, actionHistory]);
  const storedByName = useMemo(() => new Map(clientDatabase.map(c => [c.name.toLowerCase(), c])), [clientDatabase]);
  // Cliente para os modais (pagamento, edição, lembrete): o da lista processada, senão o do banco
  const parsedByName = (name: string): ParsedClient | null => {
    const key = name.toLowerCase();
    const inList = results.find(r => r.name.toLowerCase() === key) || flatResults.find(r => r.name.toLowerCase() === key);
    const stored = storedByName.get(key);
    return inList || (stored ? storedToParsed(stored) : null);
  };
  const fromProfile = (open: (c: ParsedClient) => void) => {
    const c = profileName && parsedByName(profileName);
    setProfileName(null);
    if (c) open(c);
  };
  const profileStored = profileName ? storedByName.get(profileName.toLowerCase()) : undefined;

  // App Android: recria os alarmes locais quando clientes, lembretes ou configurações mudam
  const riskCount = useMemo(() => clientDatabase.filter(c => risks.has(c.name.toLowerCase())).length, [clientDatabase, risks]);
  useEffect(() => {
    if (!isNative()) return;
    const run = () => void rescheduleNative(clientDatabase, reminders, notifySettings(config), riskCount).catch(() => undefined);
    const timer = setTimeout(run, 800);
    window.addEventListener(RESCHEDULE_EVENT, run);
    return () => { clearTimeout(timer); window.removeEventListener(RESCHEDULE_EVENT, run); };
  }, [clientDatabase, reminders, config, riskCount]);
  useEffect(() => onNativeNotificationTap(p => { if (NAV.some(n => n.id === p)) setPage(p as Page); }), []);


  const renderCard = (client: ParsedClient, viewMode: ResultViewMode = resultViewMode) => (
    <ClientCard
      key={`${client.id}-${viewMode}`}
      client={client}
      config={config}
      isExpiredMode={isExpiredMode}
      viewMode={viewMode}
      searchQuery={searchQuery}
      isSent={isSent(client.id)}
      isPaid={isPaid(client)}
      hasReminder={reminderNames.has(client.name.toLowerCase())}
      phoneOverride={phoneOverrides[client.name] || ''}
      onEdit={setEditingClient}
      onCopy={copyToClipboard}
      onMarkAsSent={handleMarkAsSent}
      onPay={setPayingClient}
      onLinkClient={setLinkingClient}
      onAddReminder={setReminderClient}
      onOpenProfile={c => setProfileName(c.name)}
      risk={risks.get(client.name.toLowerCase())}
    />
  );

  const syncTitle = syncStatus === 'ok' ? 'Sincronizado' : syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronização com problema';
  const pageTitle = NAV.find(n => n.id === page)?.label;
  const showSearch = page === 'billing' || page === 'clients';

  return (
    <div className="h-screen flex bg-canvas text-ink overflow-hidden">
      {/* ── SIDEBAR ── */}
      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-graphite/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={cx(
        'fixed md:static inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-subtle border-r border-line flex flex-col transition-transform duration-300',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className="h-14 flex items-center gap-2.5 px-5 bg-card border-b border-line">
          <BrandMark size={28} />
          <span className="font-medium text-ink">TVBR<span className="text-brand">.Cob</span></span>
          <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-1.5 text-muted md:hidden" aria-label="Fechar menu"><X size={18} /></button>
        </div>

        {/* Bloco de perfil (roxo, como na referência) */}
        <div className="bg-brand text-white px-5 py-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-medium">
            TV
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">Minha conta</p>
            <p className="text-xs text-white/75">Gestor de cobranças</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map(item => {
            const badge = item.id === 'billing' ? results.length : item.id === 'clients' ? clientDatabase.length : 0;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goto(item.id)}
                className={cx(
                  'w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-[3px]',
                  active ? 'border-brand text-brand bg-card font-medium' : 'border-transparent text-ink/80 hover:text-ink hover:bg-card/60',
                )}
              >
                <item.icon size={17} className={active ? 'text-brand' : 'text-muted'} />
                {item.label}
                {badge > 0 && <span className={cx('ml-auto text-[10px] px-1.5 py-0.5 rounded-full', active ? 'bg-brand text-white' : 'bg-line text-muted')}>{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-line space-y-2">
          {update && (
            <button
              onClick={() => { setShowUpdate(true); setIsSidebarOpen(false); }}
              className="w-full flex items-center gap-2.5 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-left text-brand hover:border-brand transition-colors"
            >
              <Download size={16} className="flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Atualização disponível</span>
                <span className="block text-xs opacity-80">Versão {update.version}</span>
              </span>
            </button>
          )}
          <Button variant="primary" icon={Upload} className="w-full" onClick={() => { setIsImportOpen(true); setIsSidebarOpen(false); }}>Importar lista</Button>
        </div>
      </aside>

      {/* ── COLUNA PRINCIPAL ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex-shrink-0 bg-card border-b border-line flex items-center gap-2 px-3 sm:px-5">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-md text-muted hover:text-ink hover:bg-subtle md:hidden" aria-label="Menu"><MenuIcon size={20} /></button>
          <span className="text-sm font-medium text-ink md:hidden">{pageTitle}</span>

          {showSearch && (
            <div className="relative ml-auto md:ml-0 w-40 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={page === 'clients' ? 'Buscar cliente...' : 'Buscar na lista...'}
                className="w-full pl-9 pr-8 py-1.5 rounded-md border border-line bg-subtle text-sm text-ink placeholder:text-muted outline-none focus:border-brand focus:bg-card"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={14} /></button>}
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {syncStatus !== 'off' && (
              <button onClick={() => goto('settings')} title={syncTitle} className={cx('p-2 rounded-md hover:bg-subtle', syncStatus === 'ok' ? 'text-ok' : syncStatus === 'syncing' ? 'text-muted' : 'text-warn')}>
                {syncStatus === 'syncing' ? <RefreshCw size={17} className="animate-spin" /> : syncStatus === 'ok' ? <Cloud size={17} /> : <CloudOff size={17} />}
              </button>
            )}
            <Menu
              trigger={
                <span className="relative block">
                  <Bell size={17} />
                  {pendingReminders.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger" />}
                </span>
              }
              items={pendingReminders.length
                ? pendingReminders.slice(0, 8).map(r => ({
                  label: `${r.clientName} · ${new Date(r.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
                  icon: Bell,
                  onClick: () => setReminders(prev => prev.filter(x => x.id !== r.id)),
                }))
                : [{ label: 'Nenhum lembrete agendado', icon: Bell, onClick: () => undefined, disabled: true }]}
            />
            <button onClick={() => setIsDarkMode(v => !v)} title={isDarkMode ? 'Modo claro' : 'Modo escuro'} className="p-2 rounded-md text-muted hover:text-ink hover:bg-subtle">
              {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-4 sm:p-6 animate-fade-in-up" key={page}>
            {dailyBanner && (
              <div className="mb-5 bg-card border border-line/60 border-l-4 border-l-brand rounded-md shadow-card px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="w-9 h-9 rounded-md bg-brand-soft text-brand flex items-center justify-center flex-shrink-0"><Sunrise size={18} /></span>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-ink">Resumo de hoje</p>
                  <p className="text-xs text-muted">
                    <b className="text-warn">{dailyBanner.today}</b> vencem hoje · <b className="text-danger">{dailyBanner.overdue}</b> vencidos (4–5 dias) · <b className="text-brand">{dailyBanner.tomorrow}</b> vencem amanhã
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" disabled={!dailyBanner.today} onClick={() => { dismissDaily(); runPeriod('today', { navigate: true }); }}>Cobrar hoje</Button>
                  <Button size="sm" disabled={!dailyBanner.overdue} onClick={() => { dismissDaily(); runPeriod('overdue', { navigate: true }); }}>Cobrar vencidos</Button>
                  <Button size="icon" variant="ghost" onClick={dismissDaily} title="Dispensar até amanhã"><X size={15} /></Button>
                </div>
              </div>
            )}
            <ErrorBoundary key={page} onReset={() => goto('dashboard')}>
            {page === 'dashboard' && (
              <Dashboard
                clients={clientDatabase}
                payments={payments}
                history={actionHistory}
                config={config}
                links={clientLinks}
                riskCount={clientDatabase.filter(c => risks.has(c.name.toLowerCase())).length}
                onCharge={p => runPeriod(p, { navigate: true })}
                onImport={() => setIsImportOpen(true)}
                onOpenClients={() => goto('clients')}
                onOpenRisk={() => { setClientsFilter('risk'); goto('clients'); }}
                onOpenProfile={setProfileName}
              />
            )}
            {page === 'billing' && (
              <Billing
                hasInput={!!inputData.trim()}
                processed={!!resultTitle}
                title={resultTitle}
                clients={filteredResults}
                totalCount={results.length}
                counts={billingCounts}
                period={period}
                isFriday={weekday.mode === 'friday_double'}
                customDates={customDates}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                tagFilter={tagFilter}
                tags={config.tags || []}
                viewMode={resultViewMode === 'list' ? 'list' : 'grid'}
                onPeriod={p => runPeriod(p)}
                onCustomDates={setCustomDates}
                onApplyCustom={() => runPeriod('custom')}
                onTypeFilter={setTypeFilter}
                onStatusFilter={setStatusFilter}
                onTagFilter={setTagFilter}
                onResetFilters={() => { setTypeFilter('all'); setStatusFilter('all'); setTagFilter(''); }}
                onToggleView={() => setResultViewMode(v => (v === 'list' ? 'grid' : 'list'))}
                onFocus={startFocusMode}
                onExport={handleExport}
                onImport={() => setIsImportOpen(true)}
                renderCard={c => renderCard(c)}
              />
            )}
            {page === 'clients' && (
              <Clients
                clients={clientDatabase}
                payments={payments}
                searchQuery={searchQuery}
                onLoad={handleLoadFromDatabase}
                onRemove={id => setClientDatabase(prev => prev.filter(c => c.id !== id))}
                onClearAll={() => { setClientDatabase([]); addToast('Banco limpo.', 'info'); }}
                onPay={c => setPayingClient(storedToParsed(c))}
                onRemind={c => setReminderClient(storedToParsed(c))}
                onImport={() => setIsImportOpen(true)}
                risks={risks}
                filter={clientsFilter}
                onFilter={setClientsFilter}
                onOpenProfile={setProfileName}
              />
            )}
            {page === 'history' && <History history={actionHistory} payments={payments} onOpenProfile={setProfileName} />}
            {page === 'settings' && (
              <Settings
                config={config}
                onSave={handleSaveConfig}
                onToast={addToast}
                counts={{ clients: clientDatabase.length, payments: payments.length, history: actionHistory.length }}
                appVersion={appVersion}
                update={update}
                onCheckUpdate={checkUpdateNow}
                onOpenUpdate={() => setShowUpdate(true)}
              />
            )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* ── MODO FOCO ── */}
      {focusClient && (
        <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
          <div className="h-14 flex items-center gap-4 px-4 sm:px-6 bg-card border-b border-line">
            <Button size="sm" icon={ArrowLeft} onClick={stopFocusMode}>Sair</Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{isQueueMode ? 'Fila de envio' : 'Modo foco'}</span>
                {isQueueMode && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand text-white flex items-center gap-1 animate-pulse"><Rocket size={9} /> ATIVA</span>}
              </div>
              <span className="text-sm font-medium text-ink">{safeFocusIndex + 1} de {focusClients.length}</span>
            </div>
            <div className="ml-auto w-32 sm:w-56"><Progress value={((safeFocusIndex + 1) / focusClients.length) * 100} /></div>
          </div>
          <div className="flex-1 flex items-center justify-center p-3 sm:p-8 overflow-hidden">
            <div className="w-full max-w-2xl h-full flex flex-col justify-center">{renderCard(focusClient, 'focus')}</div>
          </div>
          <div className="h-16 bg-card border-t border-line flex items-center justify-center gap-4">
            <Button icon={ChevronLeft} onClick={handleFocusPrev} disabled={safeFocusIndex === 0}>Anterior</Button>
            <Button variant="primary" onClick={handleFocusNext} disabled={!isQueueMode && safeFocusIndex === focusClients.length - 1}>
              {isQueueMode && safeFocusIndex === focusClients.length - 1 ? 'Concluir' : 'Próximo'} <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── MODAIS ── */}
      <ImportModal
        open={isImportOpen}
        value={inputData}
        onChange={setInputData}
        onImport={text => setInputData(prev => mergeImport(prev, text))}
        onClear={() => { setInputData(''); setResults([]); setFlatResults([]); setResultTitle(''); setPeriod(null); }}
        onProcess={handleProcessFromImport}
        onClose={() => setIsImportOpen(false)}
        onToast={addToast}
      />
      <EditClientModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} client={editingClient} config={config} onSave={handleEditSave} />
      <PaymentModal
        client={payingClient}
        config={config}
        canSendReceipt={!!payingClient && !!whatsappOf(payingClient)}
        onClose={() => setPayingClient(null)}
        onConfirm={handleConfirmPayment}
      />
      <LinkClientsModal isOpen={!!linkingClient} onClose={() => setLinkingClient(null)} masterClient={linkingClient} allClients={flatResults} onSave={handleSaveLinks} />
      <UpdateModal update={showUpdate ? update : null} currentVersion={appVersion?.version} onClose={closeUpdate} />
      <ClientProfile
        name={profileName}
        stored={profileStored}
        config={config}
        payments={payments}
        history={actionHistory}
        risk={profileName ? risks.get(profileName.toLowerCase()) : undefined}
        tagIds={(profileName && clientTags[profileName]) || []}
        note={(profileName && customNotes[profileName]) || ''}
        phone={(profileName && phoneOverrides[profileName]) || (profileStored ? extractPhone(profileStored.rawNotes).original : '')}
        linked={(profileName && clientLinks[profileName]) || []}
        onClose={() => setProfileName(null)}
        onPay={() => fromProfile(setPayingClient)}
        onRemind={() => fromProfile(setReminderClient)}
        onEdit={() => fromProfile(setEditingClient)}
      />
      <ReminderModal client={reminderClient} defaultTime={config.defaultTime || '20:00'} onClose={() => setReminderClient(null)} onConfirm={handleAddReminder} />

      <Modal
        open={showInvalidReport && invalidClients.length > 0}
        onClose={() => setShowInvalidReport(false)}
        title="Envio manual necessário"
        subtitle={`${invalidClients.length} cliente(s) com número inválido`}
        icon={AlertOctagon}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowInvalidReport(false)}>Fechar</Button>
            <Button variant="primary" icon={Copy} onClick={() => copyToClipboard(`ENVIO MANUAL NECESSÁRIO:\n${invalidClients.map(c => `- ${c.name} | ${c.phone} (${c.reason})`).join('\n')}`)}>Copiar lista</Button>
          </>
        }
      >
        <div className="border border-line rounded-md divide-y divide-line">
          {invalidClients.map((c, i) => (
            <div key={`${c.name}-${i}`} className="px-3 py-2.5">
              <p className="text-sm font-medium text-ink truncate">{c.name}</p>
              <p className="text-xs text-muted font-mono">{c.phone} <span className="text-danger">({c.reason})</span></p>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── TOASTS ── */}
      <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-[70] flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map(t => {
          const st = TOAST_STYLE[t.type];
          return (
            <div key={t.id} className="pointer-events-auto flex items-stretch bg-card border border-line rounded-md shadow-pop overflow-hidden animate-bounce-in max-w-sm w-full sm:w-auto">
              <span className={cx('w-1 flex-shrink-0', st.bar)} />
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink">
                <st.icon size={16} className={cx('flex-shrink-0', st.bar.replace('bg-', 'text-'))} />
                {t.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
