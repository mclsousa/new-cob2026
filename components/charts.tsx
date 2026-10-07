// Gráficos em SVG puro (barras, área e donut) no estilo Dataviz.
// ponytail: sem lib de gráficos; se precisar de zoom/tooltips ricos, trocar por recharts.
import React, { useState } from 'react';

export interface Point { label: string; value: number }

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// --- Barras verticais ---
export const BarChart = ({ data, color = '#5E17EB', height = 160, valueFormat = fmt }: { data: Point[]; color?: string; height?: number; valueFormat?: (n: number) => string }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && (
              <span className="absolute -top-1 -translate-y-full text-[10px] bg-graphite text-white px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {d.label}: {valueFormat(d.value)}
              </span>
            )}
            <div
              className="w-full max-w-[22px] rounded-t-sm transition-all"
              style={{ height: `${Math.max((d.value / max) * 100, d.value ? 4 : 1.5)}%`, backgroundColor: color, opacity: d.value ? (hover === null || hover === i ? 1 : 0.55) : 0.18 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-muted truncate">{i % Math.ceil(data.length / 7) === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
};

// --- Área suave (curva) ---
export const AreaChart = ({ data, color = '#1FC8B4', height = 170, valueFormat = fmt }: { data: Point[]; color?: string; height?: number; valueFormat?: (n: number) => string }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 200, PAD = 8;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => [PAD + (i / n) * (W - PAD * 2), H - PAD - (d.value / max) * (H - PAD * 2)] as const);
  // Curva Catmull-Rom -> Bézier para o visual "ondulado" da referência
  const path = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [x0, y0] = pts[i - 2] || pts[i - 1];
    const [x1, y1] = pts[i - 1];
    const [x3, y3] = pts[i + 1] || [x, y];
    // limita os pontos de controle ao gráfico: sem isso a curva "afunda" abaixo do zero antes de um pico
    const clampY = (v: number) => Math.min(Math.max(v, PAD), H - PAD);
    const c1 = [x1 + (x - x0) / 6, clampY(y1 + (y - y0) / 6)];
    const c2 = [x - (x3 - x1) / 6, clampY(y - (y3 - y1) / 6)];
    return `${acc} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x},${y}`;
  }, '');
  const id = `g${color.replace('#', '')}`;
  return (
    <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-line" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
        {pts.length > 1 && <path d={`${path} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${id})`} />}
        {pts.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
        {hover !== null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={H} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="absolute inset-0 flex">
        {data.map((_, i) => <div key={i} className="flex-1" onMouseEnter={() => setHover(i)} />)}
      </div>
      {hover !== null && (
        <span
          className="absolute top-0 text-[10px] bg-graphite text-white px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none -translate-x-1/2"
          style={{ left: `${(pts[hover][0] / W) * 100}%` }}
        >
          {data[hover].label}: {valueFormat(data[hover].value)}
        </span>
      )}
    </div>
  );
};

// --- Donut ---
export interface Segment { label: string; value: number; color: string }
export const Donut = ({ segments, size = 150 }: { segments: Segment[]; size?: number }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
      <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" className="text-subtle" strokeWidth="16" />
      {total > 0 && segments.map(s => {
        const len = (s.value / total) * C;
        const el = <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
        offset += len;
        return el;
      })}
    </svg>
  );
};

// Barra de progresso fina (estilo "400 Sales / 159 Orders")
export const Progress = ({ value, color = '#5E17EB' }: { value: number; color?: string }) => (
  <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: color }} />
  </div>
);
