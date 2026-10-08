
export interface ParsedClient {
  id: string; // Unique ID for React keys (generated)
  name: string;
  dueDate: Date;
  rawNotes: string;
  originalLine: string;
  customNotes?: string;
  customMessage?: string; // Nova funcionalidade: Mensagem personalizada
  customPix?: string; // Chave PIX própria do cliente (sobrepõe a das Configurações)
  tags?: string[]; // Array of Tag IDs
  linked?: ParsedClient[]; // New: Linked/Dependent clients
  type: 'iptv' | 'p2p';
}

export interface MessageTemplate {
  id: string;
  label: string;
  content: string;
}

export interface ClientTag {
  id: string;
  label: string;
  color: string; // Hex code
}

export interface PricingPlan {
  id: string;
  label: string;
  price: number;
}

export interface PlanGroup {
  id: string;
  label: string; // e.g., "Padrão (1 Tela)", "2 Telas", "Revenda"
  title?: string; // Custom title for this group specific table
  plans: PricingPlan[];
}

export interface AppConfig {
  pixKey: string;
  defaultTime: string; // New: Configurable time (e.g., "20:00")
  plansTitle?: string; // New: Customizable title for the pricing table
  plans: PricingPlan[]; // Legacy support (Main default plans)
  planGroups: PlanGroup[]; // New: Multiple Pricing Tables
  priceLineFormat?: string; // New: Format for the price line (e.g. "{nome} - R$ {valor}")
  templates: {
    normal: string;
    expired: string;
    receipt: string; // New: Receipt Template
    additional: MessageTemplate[]; // Multiple templates support
  };
  tags: ClientTag[]; // New: Available tags
  notifications?: Partial<NotifySettings>; // aba Notificações (sincronizada: o servidor lê para o push)
}

export interface NotifySettings {
  dailyEnabled: boolean;   // resumo diário por push
  dailyHour: number;       // hora (Brasília) do resumo, 0–23
  includeOverdue: boolean; // resumo inclui vencidos 4–5 dias
  includeTomorrow: boolean;
  includeRisk: boolean;    // resumo inclui clientes em risco
  reminders: boolean;      // lembretes agendados também por push
  banner: boolean;         // faixa "Resumo de hoje" ao abrir o app
}

export type ResultViewMode = 'grid' | 'list' | 'focus';

export type Page = 'dashboard' | 'billing' | 'clients' | 'history' | 'settings';

// Filtros da página Cobranças
export type PeriodPreset = 'today' | 'tomorrow' | 'overdue' | 'week' | 'custom';
export type StatusFilter = 'all' | 'pending' | 'sent' | 'paid';
export type TypeFilter = 'all' | 'iptv' | 'p2p';

export interface DateRange {
  start: string;
  end: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export interface ActionLog {
  clientId: string;
  clientName: string;
  timestamp: number;
  action: 'whatsapp' | 'copy' | 'mark' | 'receipt' | 'pix'; // 'pix': legado (envio do PIX separado, removido)
}

export interface PaymentRecord {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  paidAt: number; // timestamp do registro
  planLabel?: string;
  newDueDate: string; // ISO: vencimento após a renovação
  prevDueDate?: string; // ISO: vencimento antes do pagamento (para saber se pagou atrasado)
}

export interface StoredClient {
  id: string;
  name: string;
  dueDate: string;
  rawNotes: string;
  originalLine: string;
  type: 'iptv' | 'p2p';
  savedAt: number; // timestamp
}

export interface Reminder {
  id: string;
  clientId: string;
  clientName: string;
  scheduledFor: number; // timestamp
  fired: boolean;
  note?: string; // texto do lembrete (o que fazer)
}
