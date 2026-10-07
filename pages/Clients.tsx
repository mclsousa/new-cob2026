// Banco de clientes em tabela (substitui o antigo DatabaseModal).
import React, { useMemo, useState, useEffect } from 'react';
import { StoredClient, PaymentRecord } from '../types';
import { extractPhone, formatDate } from '../utils/helpers';
import { dueStatus, lastPaymentByName, formatBRL, Risk } from '../utils/billing';
import { Card, Button, Badge, PageHeader, EmptyState, ChipGroup, Menu, cx } from '../components/ui';
import { Users, Upload, Trash2, Wallet, Bell, FolderInput, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock3, AlertTriangle, UserRound } from 'lucide-react';

const PAGE_SIZE = 15;
export type ClientsFilter = 'all' | 'overdue' | 'upcoming' | 'active' | 'risk';
type Filter = ClientsFilter;

interface ClientsProps {
  clients: StoredClient[];
  payments: PaymentRecord[];
  searchQuery: string;
  onLoad: (clients: StoredClient[]) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onPay: (client: StoredClient) => void;
  onRemind: (client: StoredClient) => void;
  onImport: () => void;
  risks: Map<string, Risk>;
  filter: Filter;
  onFilter: (f: Filter) => void;
  onOpenProfile: (name: string) => void;
}

const StatusIcon = ({ level }: { level: string }) =>
  level === 'overdue' ? <XCircle size={18} className="text-danger" />
    : level === 'active' ? <CheckCircle2 size={18} className="text-ok" />
      : <Clock3 size={18} className="text-warn" />;

const Clients: React.FC<ClientsProps> = ({ clients, payments, searchQuery, onLoad, onRemove, onClearAll, onPay, onRemind, onImport, risks, filter, onFilter, onOpenProfile }) => {
  const [page, setPage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const lastPaid = useMemo(() => lastPaymentByName(payments), [payments]);

  const rows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return clients
      .map(c => ({ c, status: dueStatus(c.dueDate) }))
      .filter(({ c, status }) => {
        if (q && !c.name.toLowerCase().includes(q) && !c.rawNotes.toLowerCase().includes(q)) return false;
        if (filter === 'overdue') return status.level === 'overdue';
        if (filter === 'upcoming') return ['today', 'tomorrow', 'soon'].includes(status.level);
        if (filter === 'active') return status.level === 'active';
        if (filter === 'risk') return risks.has(c.name.toLowerCase());
        return true;
      })
      .sort((a, b) => new Date(a.c.dueDate).getTime() - new Date(b.c.dueDate).getTime());
  }, [clients, searchQuery, filter, risks]);

  useEffect(() => setPage(0), [searchQuery, filter]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Clientes"
        crumb="Clientes"
        actions={
          <>
            <Button icon={FolderInput} onClick={() => onLoad(rows.map(r => r.c))} disabled={rows.length === 0}>
              Carregar {rows.length === clients.length ? 'todos' : rows.length} na cobrança
            </Button>
            {confirmClear ? (
              <>
                <Button variant="danger" onClick={() => { onClearAll(); setConfirmClear(false); }}>Confirmar limpeza</Button>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancelar</Button>
              </>
            ) : (
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)} disabled={clients.length === 0}>Limpar banco</Button>
            )}
          </>
        }
      />

      <Card
        title="Base de clientes"
        subtitle={`${clients.length} salvos · atualizada a cada lista processada`}
        bodyClassName="p-0 pt-3"
      >
        {clients.length > 0 && (
          <div className="px-5 pb-3">
            <ChipGroup<Filter>
              value={filter}
              onChange={onFilter}
              options={[{ id: 'all', label: 'Todos' }, { id: 'upcoming', label: 'A vencer' }, { id: 'overdue', label: 'Vencidos' }, { id: 'active', label: 'Ativos' }, { id: 'risk', label: `Em risco (${clients.filter(c => risks.has(c.name.toLowerCase())).length})` }]}
              activeClass={id => (id === 'risk' || id === 'overdue' ? 'bg-danger border-danger text-white' : undefined)}
            />
          </div>
        )}
        {clients.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente salvo" text="Importe a lista do painel: cada processamento salva os clientes aqui." action={<Button variant="primary" icon={Upload} onClick={onImport}>Importar lista</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-y border-line">
                    <th className="font-medium px-5 py-2.5">Cliente</th>
                    <th className="font-medium px-3 py-2.5 hidden sm:table-cell">Tipo</th>
                    <th className="font-medium px-3 py-2.5 hidden sm:table-cell">Vencimento</th>
                    <th className="font-medium px-3 py-2.5">Status</th>
                    <th className="font-medium px-3 py-2.5 hidden md:table-cell">Telefone</th>
                    <th className="font-medium px-3 py-2.5 hidden lg:table-cell">Último pagamento</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map(({ c, status }) => {
                    const paid = lastPaid.get(c.name.toLowerCase());
                    return (
                      <tr key={c.id} className="hover:bg-subtle/70">
                        <td className="pl-4 sm:pl-5 pr-2 py-2.5">
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <StatusIcon level={status.level} />
                            <div className="min-w-0">
                              <button onClick={() => onOpenProfile(c.name)} className="font-medium text-ink hover:text-brand truncate max-w-[150px] sm:max-w-[200px] text-left flex items-center gap-1.5">
                                {c.name}
                                {risks.has(c.name.toLowerCase()) && <span title={risks.get(c.name.toLowerCase())!.reasons.join(' · ')}><AlertTriangle size={13} className="text-danger" /></span>}
                              </button>
                              <p className="text-[11px] text-muted hidden sm:block">Salvo em {new Date(c.savedAt).toLocaleDateString('pt-BR')}</p>
                              <p className="text-[11px] text-muted sm:hidden">{c.type.toUpperCase()} · vence {formatDate(new Date(c.dueDate))}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell"><span className={cx('text-xs font-medium', c.type === 'iptv' ? 'text-brand' : 'text-ok')}>{c.type.toUpperCase()}</span></td>
                        <td className="px-3 py-2.5 text-ink whitespace-nowrap hidden sm:table-cell">{formatDate(new Date(c.dueDate))}</td>
                        <td className="px-3 py-2.5"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td className="px-3 py-2.5 text-muted font-mono text-xs hidden md:table-cell whitespace-nowrap">{extractPhone(c.rawNotes).original || '—'}</td>
                        <td className="px-3 py-2.5 text-muted text-xs hidden lg:table-cell whitespace-nowrap">
                          {paid ? <>{formatBRL(paid.amount)} · {new Date(paid.paidAt).toLocaleDateString('pt-BR')}</> : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Registrar pagamento" onClick={() => onPay(c)}><Wallet size={15} /></Button>
                            <Menu items={[
                              { label: 'Ver ficha do cliente', icon: UserRound, onClick: () => onOpenProfile(c.name) },
                              { label: 'Carregar na cobrança', icon: FolderInput, onClick: () => onLoad([c]) },
                              { label: 'Agendar lembrete', icon: Bell, onClick: () => onRemind(c) },
                              { label: 'Remover do banco', icon: Trash2, onClick: () => onRemove(c.id), danger: true },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-sm text-muted py-10">Nenhum cliente neste filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-line text-xs text-muted">
              <div className="flex items-center gap-1">
                <Button size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <span className="px-2">{page + 1} / {pages}</span>
                <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Próxima <ChevronRight size={14} /></Button>
              </div>
              <span>Mostrando {visible.length} de {rows.length}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default Clients;
