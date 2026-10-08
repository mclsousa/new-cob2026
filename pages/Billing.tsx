// Cobranças: barra de filtros unificada + cards dos clientes processados.
import React, { useEffect, useState } from 'react';
import { ParsedClient, PeriodPreset, StatusFilter, TypeFilter, ResultViewMode, ClientTag, DateRange } from '../types';
import { Card, Button, PageHeader, EmptyState, StatCard, Segmented, ChipGroup, inputCls, cx } from '../components/ui';
import { Progress } from '../components/charts';
import { Upload, LayoutGrid, LayoutList, Send, Filter, RotateCcw } from 'lucide-react';

interface BillingProps {
  hasInput: boolean;
  processed: boolean;
  title: string;
  clients: ParsedClient[]; // já filtrados
  totalCount: number;
  counts: { pending: number; sent: number; paid: number };
  period: PeriodPreset | null;
  isFriday: boolean;
  customDates: DateRange;
  typeFilter: TypeFilter;
  statusFilter: StatusFilter;
  tagFilter: string;
  tags: ClientTag[];
  viewMode: ResultViewMode;
  onPeriod: (p: PeriodPreset) => void;
  onCustomDates: (d: DateRange) => void;
  onApplyCustom: () => void;
  onTypeFilter: (t: TypeFilter) => void;
  onStatusFilter: (s: StatusFilter) => void;
  onTagFilter: (id: string) => void;
  onResetFilters: () => void;
  onToggleView: () => void;
  onFocus: (queue: boolean) => void;
  onImport: () => void;
  renderCard: (c: ParsedClient) => React.ReactNode;
}

// Duas colunas independentes (masonry): abrir um card só empurra a própria coluna,
// sem deixar buraco ao lado. Ordem de leitura: esquerda, direita, esquerda...
const useWide = () => {
  const query = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
};

const Billing: React.FC<BillingProps> = props => {
  const wide = useWide();
  const {
    hasInput, processed, title, clients, totalCount, counts, period, isFriday, customDates,
    typeFilter, statusFilter, tagFilter, tags, viewMode,
  } = props;

  const presets: { id: PeriodPreset; label: string }[] = [
    { id: 'today', label: 'Hoje' },
    { id: 'tomorrow', label: isFriday ? 'Fim de semana' : 'Amanhã' },
    { id: 'overdue', label: 'Vencidos 4–5d' },
    { id: 'week', label: 'Próx. 7 dias' },
    { id: 'custom', label: 'Personalizado' },
  ];
  const doneShare = totalCount ? Math.round(((counts.sent + counts.paid) / totalCount) * 100) : 0;
  const hasExtraFilters = typeFilter !== 'all' || statusFilter !== 'all' || !!tagFilter;

  return (
    <div>
      <PageHeader
        title="Cobranças"
        crumb={title || 'Cobranças'}
      />

      {/* Barra de filtros */}
      <Card className="mb-5" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-ink font-medium"><Filter size={15} className="text-muted" /> Período</span>
          <ChipGroup<PeriodPreset>
            value={period}
            options={presets}
            onChange={props.onPeriod}
            activeClass={id => (id === 'overdue' ? 'bg-danger border-danger text-white' : undefined)}
          />
          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:w-auto">
              <input type="date" value={customDates.start} onChange={e => props.onCustomDates({ ...customDates, start: e.target.value })} className={cx(inputCls, 'sm:w-auto py-1.5 text-xs')} aria-label="Início" />
              <input type="date" value={customDates.end} onChange={e => props.onCustomDates({ ...customDates, end: e.target.value })} className={cx(inputCls, 'sm:w-auto py-1.5 text-xs')} aria-label="Fim" />
              <Button size="sm" variant="primary" onClick={props.onApplyCustom} className="col-span-2">Aplicar</Button>
            </div>
          )}
        </div>

        {processed && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-3 border-t border-line">
            <Segmented<TypeFilter> full value={typeFilter} onChange={props.onTypeFilter} options={[{ id: 'all', label: 'Todos os tipos' }, { id: 'iptv', label: 'IPTV' }, { id: 'p2p', label: 'P2P' }]} />
            <Segmented<StatusFilter> full value={statusFilter} onChange={props.onStatusFilter} options={[{ id: 'all', label: 'Todos' }, { id: 'pending', label: 'Pendentes' }, { id: 'sent', label: 'Enviados' }, { id: 'paid', label: 'Pagos' }]} />
            {tags.length > 0 && (
              <select value={tagFilter} onChange={e => props.onTagFilter(e.target.value)} className={cx(inputCls, 'flex-1 sm:flex-none sm:w-auto py-1.5 text-xs')}>
                <option value="">Todas as etiquetas</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            )}
            {hasExtraFilters && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={props.onResetFilters}>Limpar filtros</Button>}
            <div className="hidden sm:block flex-1" />
            <Button size="icon" variant="outline" onClick={props.onToggleView} title={viewMode === 'grid' ? 'Ver em lista' : 'Ver em cards'}>
              {viewMode === 'grid' ? <LayoutList size={16} /> : <LayoutGrid size={16} />}
            </Button>
          </div>
        )}
      </Card>

      {!processed ? (
        <Card>
          <EmptyState
            icon={Send}
            title={hasInput ? 'Escolha um período' : 'Pronto para cobrar'}
            text={hasInput ? 'Selecione Hoje, Amanhã, Vencidos ou um intervalo para gerar as mensagens.' : 'Importe a lista do painel e escolha o período para gerar as mensagens de cobrança.'}
            action={!hasInput && <Button variant="primary" icon={Upload} onClick={props.onImport}>Importar lista</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Na lista" value={totalCount} sub={title} />
            <StatCard label="Pendentes" value={counts.pending} tone="warn" />
            <StatCard label="Enviados" value={counts.sent} tone="ok" />
            <div className="bg-card rounded-md border border-line/60 shadow-card px-4 py-3">
              <p className="text-xs text-muted">Progresso</p>
              <p className="text-2xl font-light text-brand mt-0.5">{doneShare}%</p>
              <div className="mt-1.5"><Progress value={doneShare} /></div>
              <p className="text-[11px] text-muted mt-1">{counts.paid} pago(s)</p>
            </div>
          </div>

          {clients.length === 0 ? (
            <Card><p className="text-center text-sm text-muted py-8">Nenhum cliente com esses filtros.</p></Card>
          ) : viewMode === 'list' ? (
            <div className="bg-card rounded-md border border-line/60 shadow-card divide-y divide-line overflow-hidden">
              {clients.map(c => <React.Fragment key={c.id}>{props.renderCard(c)}</React.Fragment>)}
            </div>
          ) : (
            <div className="flex gap-3 items-start">
              {(wide ? [0, 1] : [0]).map(col => (
                <div key={col} className="flex-1 min-w-0 flex flex-col gap-3">
                  {clients.filter((_, i) => !wide || i % 2 === col).map(c => <React.Fragment key={c.id}>{props.renderCard(c)}</React.Fragment>)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Billing;
