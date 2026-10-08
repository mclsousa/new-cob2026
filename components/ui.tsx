// Componentes base do design system (referência Dataviz).
// Cores de superfície/texto: canvas, card, subtle, line, ink, muted (trocam no modo escuro).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MoreHorizontal, Info, LucideIcon } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Cor de fundo da etiqueta + texto legível (escuro em cores claras como amarelo, branco nas escuras)
export const tagStyle = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return { backgroundColor: hex, color: luminance > 0.62 ? '#3A3F4B' : '#FFFFFF' };
};

export const inputCls =
  'w-full px-3 py-2 rounded-md border border-line bg-card text-ink text-sm placeholder:text-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-colors';
export const labelCls = 'block text-xs font-medium text-muted mb-1.5';

// --- Card ---
interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}
export const Card = ({ title, subtitle, actions, className, bodyClassName, children }: CardProps) => (
  <section className={cx('bg-card rounded-md shadow-card border border-line/60', className)}>
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-[160px] flex-1">
          {title && <h3 className="text-sm font-medium text-ink">{title}</h3>}
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
      </header>
    )}
    <div className={cx('p-5', title && 'pt-3', bodyClassName)}>{children}</div>
  </section>
);

// --- KPI colorido (bloco sólido + pílula de tendência) ---
export type Tone = 'brand' | 'ok' | 'info' | 'graphite' | 'danger' | 'warn';
const TONE_BG: Record<Tone, string> = {
  brand: 'bg-brand', ok: 'bg-ok', info: 'bg-info', graphite: 'bg-graphite', danger: 'bg-danger', warn: 'bg-warn',
};
const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand', ok: 'text-ok', info: 'text-info', graphite: 'text-ink', danger: 'text-danger', warn: 'text-warn',
};

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  pill?: string;
  icon: LucideIcon;
  tone: Tone;
  onClick?: () => void;
}
export const KpiTile = ({ label, value, sub, pill, icon: Icon, tone, onClick }: KpiTileProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cx(
      'text-left rounded-md p-4 text-white shadow-card transition-transform disabled:cursor-default',
      onClick && 'hover:-translate-y-0.5',
      TONE_BG[tone],
    )}
  >
    <div className="flex items-center gap-2 text-sm font-medium">
      <span className="w-6 h-6 rounded bg-white/20 flex items-center justify-center"><Icon size={14} /></span>
      {label}
    </div>
    <div className="flex items-center gap-2 mt-3">
      <span className="text-3xl font-light tracking-tight">{value}</span>
      {pill && <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/60 whitespace-nowrap">{pill}</span>}
    </div>
    {sub && <p className="text-xs text-white/80 mt-1">{sub}</p>}
  </button>
);

// --- Número grande em card branco (estilo "Customers / Conversion") ---
export const StatCard = ({ label, value, sub, tone = 'graphite' }: { label: string; value: React.ReactNode; sub?: string; tone?: Tone }) => (
  <div className="bg-card rounded-md border border-line/60 shadow-card px-4 py-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={cx('text-2xl font-light mt-0.5', TONE_TEXT[tone])}>{value}</p>
    {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
  </div>
);

// --- Badge ---
export const Badge = ({ tone, solid, children, className }: { tone: Tone; solid?: boolean; children: React.ReactNode; className?: string }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap',
      solid ? cx(TONE_BG[tone], 'text-white') : cx('border', TONE_TEXT[tone]),
      className,
    )}
    style={solid ? undefined : { borderColor: 'currentColor' }}
  >
    {children}
  </span>
);

// --- Button ---
type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'whatsapp' | 'soft';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand hover:bg-brand-hover text-white shadow-sm',
  outline: 'border border-line bg-card hover:bg-subtle text-ink',
  ghost: 'text-muted hover:text-ink hover:bg-subtle',
  danger: 'bg-danger hover:brightness-95 text-white',
  whatsapp: 'bg-whatsapp hover:bg-whatsapp-hover text-white shadow-sm',
  soft: 'bg-brand-soft text-brand hover:brightness-95',
};
// Props listadas à mão: o projeto não instala @types/react
interface ButtonProps {
  variant?: Variant;
  size?: 'sm' | 'md' | 'icon';
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  form?: string;
  title?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  key?: string | number; // sem @types/react o JSX não reconhece key sozinho
}
export const Button = ({ variant = 'outline', size = 'md', icon: Icon, className, children, type = 'button', ...rest }: ButtonProps) => (
  <button
    type={type}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
      size === 'sm' && 'text-xs px-2.5 py-1.5',
      size === 'md' && 'text-sm px-3.5 py-2',
      size === 'icon' && 'p-2',
      VARIANT[variant],
      className,
    )}
    {...rest}
  >
    {Icon && <Icon size={size === 'md' ? 15 : 14} />}
    {children}
  </button>
);

// --- Cabeçalho de página (título + breadcrumb + ações) ---
export const PageHeader = ({ title, crumb, actions }: { title: string; crumb?: string; actions?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div className="flex items-baseline gap-3 min-w-0">
      <h1 className="text-lg font-medium text-ink">{title}</h1>
      {crumb && <span className="text-xs text-muted hidden sm:inline">App › {crumb}</span>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

// --- Estado vazio ---
export const EmptyState = ({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) => (
  <div className="text-center py-14 px-6">
    <div className="w-14 h-14 rounded-full bg-brand-soft text-brand flex items-center justify-center mx-auto mb-4">
      <Icon size={24} />
    </div>
    <p className="font-medium text-ink">{title}</p>
    {text && <p className="text-sm text-muted mt-1 max-w-sm mx-auto">{text}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

// --- Modal ---
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
}
export const Modal = ({ open, onClose, title, subtitle, icon: Icon, size = 'md', footer, children }: ModalProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-graphite/50 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className={cx(
          'bg-card rounded-md shadow-pop w-full max-h-[90vh] flex flex-col border border-line animate-bounce-in',
          size === 'sm' && 'max-w-sm', size === 'md' && 'max-w-lg', size === 'lg' && 'max-w-3xl',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && <span className="w-8 h-8 rounded-md bg-brand-soft text-brand flex items-center justify-center flex-shrink-0"><Icon size={16} /></span>}
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-ink">{title}</h2>
              {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-subtle" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

// --- Menu "⋯" ---
export interface MenuItem { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean }
// Abre em position:fixed (calculado pelo botão) para não ser cortado por cards com overflow-hidden;
// abre para cima quando não cabe embaixo.
const MENU_WIDTH = 220;
export const Menu = ({ items, align = 'right', trigger }: { items: MenuItem[]; align?: 'left' | 'right'; trigger?: React.ReactNode }) => {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current!.getBoundingClientRect();
    const estHeight = items.length * 36 + 8;
    const left = Math.min(Math.max(8, align === 'right' ? r.right - MENU_WIDTH : r.left), window.innerWidth - MENU_WIDTH - 8);
    setPos(r.bottom + estHeight + 8 > window.innerHeight && r.top > estHeight
      ? { bottom: window.innerHeight - r.top + 4, left }
      : { top: r.bottom + 4, left });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setPos(null);
    };
    const closeNow = () => setPos(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeNow);
    window.addEventListener('scroll', closeNow, true); // rolar a lista fecha (o menu é fixo na tela)
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeNow);
      window.removeEventListener('scroll', closeNow, true);
    };
  }, [pos]);

  const open = !!pos;
  return (
    <div className="relative" ref={ref}>
      <button ref={btnRef} type="button" onClick={toggle} className={cx('p-1.5 rounded-md hover:text-ink hover:bg-subtle', open ? 'text-ink bg-subtle' : 'text-muted')} aria-label="Mais ações">
        {trigger || <MoreHorizontal size={16} />}
      </button>
      {/* Portal no <body>: o menu não herda transparência/recorte do card (ex.: card "Enviado" fica opaco) */}
      {open && createPortal(
        <div ref={menuRef} style={{ ...pos, width: MENU_WIDTH }} className="fixed z-[80] bg-card border border-line rounded-md shadow-pop py-1 animate-fade-in">
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              onClick={() => { setPos(null); it.onClick(); }}
              className={cx('w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed', it.danger ? 'text-danger' : 'text-ink')}
            >
              <it.icon size={14} className={it.danger ? '' : 'text-muted'} /> {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

// --- Interruptor com título e descrição (linha de configuração) ---
export const SwitchRow = ({ checked, onChange, title, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; description?: string; disabled?: boolean;
}) => (
  <label className={cx('flex items-start justify-between gap-4 py-3', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
    <span className="min-w-0">
      <span className="block text-sm text-ink">{title}</span>
      {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
    </span>
    <span className="relative flex-shrink-0 mt-0.5">
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="block w-10 h-6 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30" />
      <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  </label>
);

// --- "i" com explicação: aparece ao passar o mouse (desktop) ou ao tocar (celular) ---
export const InfoTip = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex group" onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(v => !v)} className="text-muted hover:text-brand" aria-label="Mais informações">
        <Info size={14} />
      </button>
      <span className={cx(
        'absolute left-0 top-full mt-1.5 z-30 w-64 bg-graphite text-white text-xs font-normal leading-relaxed rounded-md px-3 py-2 shadow-pop',
        open ? 'block' : 'hidden group-hover:block',
      )}>
        {children}
      </span>
    </span>
  );
};

// --- Segmentado (chips) ---
// --- Grupo de botões-filtro separados: grade alinhada no celular (linhas de 3), linha única no computador ---
const chipSpan = (i: number, n: number) => {
  const rest = n % 3;
  if (i < n - rest || rest === 0) return 'col-span-2';
  return rest === 2 ? 'col-span-3' : 'col-span-6';
};
export const ChipGroup = <T extends string>({ value, options, onChange, activeClass }: {
  value: T | null;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  activeClass?: (id: T) => string | undefined; // cor própria do botão ativo (ex.: vermelho em "Vencidos")
}) => (
  <div className="grid grid-cols-6 gap-1.5 w-full sm:flex sm:flex-wrap sm:w-auto">
    {options.map((o, i) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={cx(
          'px-1 sm:px-3 py-2 sm:py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap',
          chipSpan(i, options.length),
          value === o.id ? activeClass?.(o.id) || 'bg-brand border-brand text-white' : 'border-line bg-card text-ink hover:bg-subtle',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// full: no celular ocupa a largura toda, com opções do mesmo tamanho
export const Segmented = <T extends string>({ value, options, onChange, full }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) => (
  <div className={cx('rounded-md border border-line bg-card p-0.5', full ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex')}>
    {options.map(o => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={cx('px-2.5 py-1.5 sm:py-1 text-xs rounded font-medium transition-colors whitespace-nowrap', full && 'flex-1 sm:flex-none', value === o.id ? 'bg-brand text-white' : 'text-muted hover:text-ink')}
      >
        {o.label}
      </button>
    ))}
  </div>
);
