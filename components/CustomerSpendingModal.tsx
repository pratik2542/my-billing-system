import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Customer, Invoice, BusinessSettings } from '../types';
import { DEFAULT_BUSINESS_SETTINGS } from '../constants';
import {
  X,
  ShoppingBag,
  TrendingUp,
  IndianRupee,
  Package,
  Award,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronUp,
  Layers,
  PieChart,
  Activity,
  BarChart2,
  CircleDot,
  Globe,
  Eye,
  Printer
} from 'lucide-react';
import { InvoiceTemplate } from './InvoiceTemplate';

interface CustomerSpendingModalProps {
  customer: Customer;
  invoices: Invoice[];
  settings?: BusinessSettings;
  onClose: () => void;
}

interface ProductSummary {
  name: string;
  quantity: number;
  amount: number;
  unit: string;
  packing?: string;
}

interface MonthlySummary {
  key: string;
  label: string;
  totalSpent: number;
  totalQty: number;
  unitsMap: Record<string, number>;
  invoiceCount: number;
  products: Record<string, ProductSummary>;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'histogram' | 'scatter' | 'bubble' | 'area';

const COLORS = ['#10b981', '#6366f1', '#ec4899', '#f97316', '#8b5cf6', '#06b6d4', '#eab308', '#3b82f6'];

const formatINRFull = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

const formatUnitBreakdown = (unitsMap: Record<string, number>): string => {
  const entries = Object.entries(unitsMap).filter(([_, qty]) => qty > 0);
  if (entries.length === 0) return '0 Units';

  entries.sort((a, b) => b[1] - a[1]);

  return entries
    .map(([unit, qty]) => `${qty % 1 === 0 ? qty : qty.toFixed(1)} ${unit}`)
    .join(' + ');
};

const getMonthKeyAndLabel = (dateStr: string): { key: string; label: string } => {
  if (!dateStr) return { key: '9999-99', label: 'Unknown Date' };
  try {
    let d: Date;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts[0].length === 4) {
        d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
        d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    } else if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts[2]?.length === 4) {
        d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else {
        d = new Date(dateStr);
      }
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) {
      return { key: dateStr, label: dateStr };
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    return { key: `${year}-${month}`, label: monthLabel };
  } catch {
    return { key: dateStr, label: dateStr };
  }
};

const getArcPath = (cx: number, cy: number, r: number, innerR: number, startAngle: number, endAngle: number): string => {
  const rad = (angle: number) => (angle - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));

  const ix1 = cx + innerR * Math.cos(rad(endAngle));
  const iy1 = cy + innerR * Math.sin(rad(endAngle));
  const ix2 = cx + innerR * Math.cos(rad(startAngle));
  const iy2 = cy + innerR * Math.sin(rad(startAngle));

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    'Z'
  ].join(' ');
};

// ---- Multi-Line Product-Wise Volume Trend Chart ----
interface ProductWiseTrendChartProps {
  monthlyList: MonthlySummary[];
  products: ProductSummary[];
  activeMonthKey: string | null;
  onHoverMonth: (key: string | null) => void;
  onClickMonth: (key: string) => void;
  chartStyle: ChartType;
}

const ProductWiseTrendChart: React.FC<ProductWiseTrendChartProps> = ({
  monthlyList,
  products,
  activeMonthKey,
  onHoverMonth,
  onClickMonth,
  chartStyle
}) => {
  // Zoom + Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; panX: number; panY: number }>({
    dragging: false, startX: 0, startY: 0, panX: 0, panY: 0
  });
  const svgWrapRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setZoom(z => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan with middle-button or ctrl+left-click or plain left drag
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture((e.nativeEvent as PointerEvent).pointerId || 0);
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Product line focus: clicking a legend item isolates that product's line
  const [selectedProd, setSelectedProd] = useState<string | null>(null);
  const toggleProd = useCallback((name: string) => {
    setSelectedProd(prev => prev === name ? null : name);
  }, []);
  const topProds = useMemo(() => products.slice(0, 6), [products]);

  const getProductQty = useCallback((m: MonthlySummary, prodName: string): number => {
    if (!m || !m.products) return 0;
    if (m.products[prodName]) return m.products[prodName].quantity || 0;
    const trimmed = prodName.trim();
    if (m.products[trimmed]) return m.products[trimmed].quantity || 0;
    const matchKey = Object.keys(m.products).find(k => k.trim().toLowerCase() === trimmed.toLowerCase());
    return matchKey ? m.products[matchKey].quantity || 0 : 0;
  }, []);

  // When a product is focused, rescale Y-axis to just that product's max
  // so small-quantity items fill the full chart height instead of being flat.
  const maxQty = useMemo(() => {
    let mx = 1;
    const prodsToCheck = selectedProd
      ? topProds.filter(p => p.name.trim() === selectedProd.trim())
      : topProds;
    prodsToCheck.forEach(p => {
      monthlyList.forEach(m => {
        const q = getProductQty(m, p.name);
        if (q > mx) mx = q;
      });
    });
    return mx;
  }, [selectedProd, topProds, monthlyList, getProductQty]);

  const width = 500;
  const height = 200;
  const padX = 40;
  const padY = 42;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Per-product label offsets: alternate above/below and at different distances
  // to avoid label collisions when products are at similar y positions
  const LABEL_OFFSETS = [-14, 14, -26, 26, -38, 38]; // negative = above node, positive = below

  // 1. Multi-Bar Mode (Side-by-Side Product Bars)
  if (chartStyle === 'bar') {
    return (
      <div className="h-48 flex flex-col justify-between bg-white rounded-xl border border-slate-200 shadow-inner p-2">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold px-2 pb-1 border-b border-slate-100 overflow-x-auto shrink-0">
          {topProds.map((p, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
              <span className="text-slate-700">{p.name} ({p.unit})</span>
            </div>
          ))}
        </div>

        <div className="flex-1 flex items-end justify-between gap-2 pt-3 pb-1 overflow-x-auto">
          {monthlyList.map((m) => {
            const isSelected = activeMonthKey === m.key;
            return (
              <div
                key={m.key}
                onMouseEnter={() => onHoverMonth(m.key)}
                onMouseLeave={() => onHoverMonth(null)}
                onClick={() => onClickMonth(m.key)}
                className={`flex-1 flex flex-col items-center justify-end h-full min-w-[55px] cursor-pointer p-1 rounded-lg transition-colors ${
                  isSelected ? 'bg-indigo-50/70 border border-indigo-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-end justify-center gap-1 w-full h-full">
                  {topProds.map((p, pIdx) => {
                    const q = getProductQty(m, p.name);
                    const hPct = maxQty > 0 ? (q / maxQty) * 100 : 0;
                    return (
                      <div
                        key={pIdx}
                        className="flex-1 rounded-t transition-all duration-300 pointer-events-none"
                        style={{
                          height: `${Math.max(hPct, 4)}%`,
                          backgroundColor: COLORS[pIdx % COLORS.length],
                          opacity: q > 0 ? 1 : 0.15
                        }}
                        title={`${p.name}: ${q} ${p.unit}`}
                      ></div>
                    );
                  })}
                </div>
                <div className="text-[9px] font-bold text-slate-600 truncate w-full text-center mt-1">
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. Multi-Line Mode (Each product has its own line) — with zoom + pan
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col relative flex-1 h-full" style={{ minHeight: '240px' }}>
      {/* Legend + Controls row */}
      <div className="flex items-start justify-between gap-2 pb-1 border-b border-slate-100 shrink-0">
        <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-bold overflow-x-auto">
          {topProds.map((p, idx) => {
            const color = COLORS[idx % COLORS.length];
            const isSelected = selectedProd === p.name;
            const isDimmed = selectedProd !== null && !isSelected;
            return (
              <div
                key={idx}
                onClick={() => toggleProd(p.name)}
                className="flex items-center gap-1 shrink-0 cursor-pointer select-none rounded-md px-1.5 py-0.5 transition-all duration-150"
                style={{
                  opacity: isDimmed ? 0.35 : 1,
                  backgroundColor: isSelected ? `${color}12` : 'transparent',
                  boxShadow: isSelected ? `inset 0 0 0 1.5px ${color}` : 'none',
                }}
                title={isSelected ? 'Click to show all' : 'Click to focus this line'}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full transition-all"
                  style={{ backgroundColor: color, boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 3.5px ${color}` : 'none' }}
                />
                <span className={`transition-colors ${isSelected ? 'font-extrabold' : 'font-bold'}`} style={{ color: isSelected ? color : '#1e293b' }}>{p.name}</span>
                <span className="text-slate-400 font-normal">({p.unit})</span>
              </div>
            );
          })}
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] text-slate-400 mr-1 hidden sm:inline">Scroll to zoom · Drag to pan</span>
          <button
            onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
            className="w-5 h-5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 font-bold text-sm leading-none flex items-center justify-center transition-colors"
            title="Zoom in"
          >+</button>
          <button
            onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="w-5 h-5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 font-bold text-sm leading-none flex items-center justify-center transition-colors"
            title="Zoom out"
          >−</button>
          <button
            onClick={resetView}
            className="px-1.5 h-5 rounded bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 text-[9px] font-bold transition-colors"
            title="Reset zoom & pan"
          >↺</button>
          <span className="text-[9px] text-indigo-500 font-bold w-7 text-right">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Zoomable / pannable SVG viewport */}
      <div
        ref={svgWrapRef}
        className="flex-1 relative overflow-hidden my-1 rounded-lg"
        style={{ minHeight: '150px', cursor: dragRef.current.dragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: 'visible' }}
        >
          {/* Apply zoom + pan transform to entire chart content */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: `${width / 2}px ${height / 2}px` }}>
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padX} y1={padY + chartH / 2} x2={width - padX} y2={padY + chartH / 2} stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="4 4" />

            {topProds.map((p, pIdx) => {
              const pColor = COLORS[pIdx % COLORS.length];
              const isThisSelected = selectedProd !== null && selectedProd.trim() === p.name.trim();
              // Highlight / dim logic based on selected product
              const isActiveProd = selectedProd === null || isThisSelected;
              const lineOpacity = isActiveProd ? 1 : 0.1;
              const strokeW = isThisSelected ? 4 / zoom : 2.5 / zoom;
              const points = monthlyList.map((m, mIdx) => {
                const q = getProductQty(m, p.name);
                const x = padX + (monthlyList.length > 1 ? (mIdx / (monthlyList.length - 1)) * chartW : chartW / 2);
                const y = padY + chartH - (maxQty > 0 ? (q / maxQty) * chartH : 0);
                return { x, y, q, unit: p.unit, monthKey: m.key, label: m.label };
              });
              // Connect only months where this product was ordered (q > 0).
              // Skipping zero months means we never dip to the baseline,
              // and all non-zero months are connected with a continuous line
              // regardless of how many months were skipped in between.
              const nonZeroPts = points.filter(pt => pt.q > 0);
              const lineD = nonZeroPts.map((pt, i) =>
                `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
              ).join(' ');

              return (
                <g key={pIdx} style={{ opacity: lineOpacity, transition: 'opacity 0.2s' }}>
                  <path
                    d={lineD}
                    fill="none"
                    stroke={pColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                  {points.map((pt, ptIdx) => {
                    if (pt.q === 0) return null;
                    const isSelected = activeMonthKey === pt.monthKey;
                    const labelOffset = LABEL_OFFSETS[pIdx % LABEL_OFFSETS.length];
                    const labelY = pt.y + labelOffset;
                    const labelAbove = labelOffset < 0;
                    const label = `${pt.q} ${pt.unit}`;
                    const textW = Math.max(label.length * 5.2 + 6, 28);
                    // Bigger dots for sparse products so they're easier to spot
                    const sparseFactor = nonZeroPts.length <= 1 ? 2.2 : nonZeroPts.length <= 2 ? 1.6 : 1;
                    const baseR = (isSelected ? 5.5 : 4) * sparseFactor;
                    const nodeR = baseR / zoom;
                    const scaledFontSize = 8 / zoom;
                    const scaledStroke = (isThisSelected ? 3 : 2.5) / zoom;
                    return (
                      <g key={ptIdx}>
                        <rect
                          x={pt.x - textW / 2}
                          y={labelAbove ? labelY - 8 : labelY - 1}
                          width={textW}
                          height={11}
                          rx="3"
                          fill="white"
                          fillOpacity="0.92"
                          stroke={pColor}
                          strokeWidth={0.8 / zoom}
                          className="pointer-events-none"
                        />
                        <text
                          x={pt.x}
                          y={labelAbove ? labelY + 1 : labelY + 8}
                          textAnchor="middle"
                          fontSize={scaledFontSize}
                          fontWeight="bold"
                          fill={pColor}
                          className="pointer-events-none"
                        >
                          {label}
                        </text>
                        {/* Halo ring for sparse products (1-2 months) to make them pop */}
                        {nonZeroPts.length <= 2 && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={nodeR * 1.8}
                            fill={pColor}
                            fillOpacity="0.12"
                            stroke={pColor}
                            strokeWidth={1 / zoom}
                            strokeOpacity="0.3"
                            className="pointer-events-none"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={nodeR}
                          fill="#ffffff"
                          stroke={pColor}
                          strokeWidth={scaledStroke}
                          className="pointer-events-none"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}


            {/* Invisible hit rects for hover/click — outside transformed scale so they stay stable */}
          </g>

          {/* Hit areas rendered outside the zoom group in SVG space so they always match screen positions */}
          {monthlyList.map((m, mIdx) => {
            const xBase = padX + (monthlyList.length > 1 ? (mIdx / (monthlyList.length - 1)) * chartW : chartW / 2);
            // Adjust for pan + zoom transform applied to the chart
            // We place the hit targets in unscaled SVG coords to cover the full column
            return (
              <rect
                key={mIdx}
                x={xBase - 20}
                y={0}
                width={40}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => !dragRef.current.dragging && onHoverMonth(m.key)}
                onMouseLeave={() => onHoverMonth(null)}
                onClick={() => !dragRef.current.dragging && onClickMonth(m.key)}
              />
            );
          })}
        </svg>
      </div>

      {/* Month labels strip below */}
      <div className="flex justify-between px-3 pt-1 border-t border-slate-100 text-[10px] font-bold text-slate-600 select-none shrink-0">
        {monthlyList.map((m) => (
          <span
            key={m.key}
            className={`cursor-pointer transition-colors ${activeMonthKey === m.key ? 'text-indigo-600 font-extrabold' : 'hover:text-slate-900'}`}
            onMouseEnter={() => onHoverMonth(m.key)}
            onMouseLeave={() => onHoverMonth(null)}
            onClick={() => onClickMonth(m.key)}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---- Standard Single-Series Trend Chart ----
interface TrendChartProps {
  data: Array<{ key: string; label: string; value: number; displayValue: string }>;
  maxValue: number;
  colorHex: string;
  chartStyle: ChartType;
  activeKey: string | null;
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
  scatterPoints?: Array<{ id: string; qty: number; spend: number }>;
  histogramBuckets?: Array<{ label: string; count: number; total: number }>;
}

const TrendChart: React.FC<TrendChartProps> = ({
  data,
  maxValue,
  colorHex,
  chartStyle,
  activeKey,
  onHover,
  onClick,
  scatterPoints = [],
  histogramBuckets = []
}) => {
  if (data.length === 0) {
    return <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">No data available</div>;
  }

  // 1. BAR CHART RENDER
  if (chartStyle === 'bar') {
    return (
      <div className="flex-1 h-full min-h-[240px] flex items-end justify-between gap-2 pt-6 pb-2 px-2 bg-white rounded-xl border border-slate-200 shadow-inner overflow-x-auto">
        {data.map((item) => {
          const heightPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          const isSelected = activeKey === item.key;

          return (
            <div
              key={item.key}
              onMouseEnter={() => onHover(item.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(item.key)}
              className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end min-w-[50px] cursor-pointer select-none"
            >
              <div className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1 rounded border border-slate-200 whitespace-nowrap shadow-xs pointer-events-none max-w-[90px] truncate text-center">
                {item.displayValue}
              </div>
              <div
                className="w-full rounded-t transition-all duration-300 shadow-sm pointer-events-none"
                style={{
                  height: `${Math.max(heightPercent, 8)}%`,
                  backgroundColor: colorHex,
                  opacity: isSelected ? 1 : 0.85,
                  boxShadow: isSelected ? `0 0 10px ${colorHex}` : undefined
                }}
              ></div>
              <div className="text-[10px] font-bold text-slate-600 truncate w-full text-center pointer-events-none">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 2. PIE / DONUT CHART RENDER
  if (chartStyle === 'pie') {
    const totalVal = data.reduce((s, d) => s + d.value, 0) || 1;
    let currentAngle = 0;
    const slices = data.map((item, idx) => {
      const angle = (item.value / totalVal) * 360;
      const start = currentAngle;
      const end = currentAngle + angle;
      currentAngle = end;
      return { item, start, end, color: COLORS[idx % COLORS.length] };
    });

    return (
      <div className="h-[220px] bg-white rounded-xl border border-slate-200 shadow-inner p-3 flex items-center justify-between gap-3 overflow-hidden">
        <div className="w-36 h-36 relative flex items-center justify-center shrink-0">
          <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
            {slices.map((slice, idx) => {
              if (slice.end - slice.start < 0.1) return null;
              const pathD = getArcPath(100, 100, 90, 50, slice.start, slice.end);
              return (
                <path
                  key={idx}
                  d={pathD}
                  fill={slice.color}
                  className="transition-all duration-200 hover:opacity-80 cursor-pointer"
                  onMouseEnter={() => onHover(slice.item.key)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onClick(slice.item.key)}
                />
              );
            })}
          </svg>
          <div className="absolute text-center pointer-events-none">
            <div className="text-[9px] font-bold text-slate-400 uppercase">Share</div>
            <div className="text-xs font-extrabold text-slate-800">100%</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto max-h-40 space-y-1.5 pr-1">
          {slices.map((slice, idx) => (
            <div
              key={idx}
              onMouseEnter={() => onHover(slice.item.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(slice.item.key)}
              className="flex items-center justify-between text-[10px] p-1 rounded hover:bg-slate-50 cursor-pointer select-none"
            >
              <div className="flex items-center gap-1.5 truncate pointer-events-none">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                <span className="font-bold text-slate-700 truncate">{slice.item.label}</span>
              </div>
              <span className="font-bold text-slate-900 ml-1 pointer-events-none truncate max-w-[110px]">{slice.item.displayValue}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. HISTOGRAM CHART RENDER
  if (chartStyle === 'histogram') {
    const maxHCount = Math.max(...histogramBuckets.map(b => b.count), 1);
    return (
      <div className="h-[220px] p-3 bg-white rounded-xl border border-slate-200 shadow-inner flex flex-col justify-between">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Bill Size Frequency Distribution (Histogram)
        </div>
        <div className="flex-1 flex items-end justify-between gap-2 pt-2 pb-1">
          {histogramBuckets.map((b, idx) => {
            const hPct = (b.count / maxHCount) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end select-none">
                <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1 rounded border pointer-events-none">
                  {b.count} bill{b.count !== 1 ? 's' : ''}
                </span>
                <div
                  className="w-full rounded-t transition-all duration-300 pointer-events-none"
                  style={{
                    height: `${Math.max(hPct, 8)}%`,
                    backgroundColor: COLORS[idx % COLORS.length]
                  }}
                ></div>
                <span className="text-[9px] font-bold text-slate-600 whitespace-nowrap pointer-events-none">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. SCATTER PLOT RENDER (Quantity vs Spend)
  if (chartStyle === 'scatter') {
    const width = 500;
    const height = 160;
    const padX = 40;
    const padY = 25;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const maxQty = Math.max(...scatterPoints.map(p => p.qty), 1);
    const maxSpend = Math.max(...scatterPoints.map(p => p.spend), 1);

    return (
      <div className="h-[220px] bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col justify-between relative overflow-hidden">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2">
          Scatter Plot: Quantity (X) vs Spend (Y)
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full flex-1 overflow-visible">
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e2e8f0" strokeWidth="1" />
          <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#e2e8f0" strokeWidth="1" />

          {scatterPoints.map((pt, idx) => {
            const cx = padX + (pt.qty / maxQty) * chartW;
            const cy = height - padY - (pt.spend / maxSpend) * chartH;
            return (
              <g key={idx}>
                <circle cx={cx} cy={cy} r="6" fill={colorHex} opacity="0.85" className="pointer-events-none" />
                <circle
                  cx={cx}
                  cy={cy}
                  r="14"
                  fill="transparent"
                  className="cursor-pointer"
                >
                  <title>{`Invoice #${pt.id}: Qty ${pt.qty}, ${formatINRFull(pt.spend)}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between px-2 text-[9px] font-bold text-slate-500">
          <span>0 Units</span>
          <span>Scatter Invoices</span>
          <span>{maxQty} Max Quantity</span>
        </div>
      </div>
    );
  }

  // 5. BUBBLE CHART RENDER
  if (chartStyle === 'bubble') {
    const width = 500;
    const height = 160;
    const padX = 40;
    const padY = 30;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const points = data.map((item, idx) => {
      const x = padX + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
      const y = padY + chartH - (maxValue > 0 ? (item.value / maxValue) * chartH : 0);
      const r = Math.min(Math.max((item.value / (maxValue || 1)) * 22 + 8, 8), 26);
      return { x, y, r, item };
    });

    return (
      <div className="h-[220px] bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col justify-between relative overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full flex-1 overflow-visible">
          {points.map((p, idx) => {
            const isSelected = activeKey === p.item.key;
            return (
              <g key={idx}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={colorHex}
                  opacity={isSelected ? '0.85' : '0.45'}
                  stroke={colorHex}
                  strokeWidth="2"
                  className="pointer-events-none transition-all duration-200"
                />
                <text
                  x={p.x}
                  y={p.y + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill="#ffffff"
                  className="pointer-events-none"
                >
                  {p.item.displayValue.split(' ')[0]}
                </text>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(p.r + 4, 16)}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => onHover(p.item.key)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onClick(p.item.key)}
                />
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between px-3 text-[10px] font-bold text-slate-600 border-t border-slate-100 pt-1">
          {data.map((item) => (
            <span
              key={item.key}
              className="cursor-pointer hover:text-indigo-600 select-none"
              onMouseEnter={() => onHover(item.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(item.key)}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // 6. LINE & AREA SVG RENDER (Single Series)
  const width = 500;
  const height = 200;
  const padX = 40;
  const padY = 42;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = data.map((item, idx) => {
    const x = padX + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
    const y = padY + chartH - (maxValue > 0 ? (item.value / maxValue) * chartH : 0);
    return { x, y, item };
  });

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${lineD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  const gradientId = `grad-${colorHex.replace('#', '')}`;

  return (
    <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col justify-between relative overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.4" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {chartStyle === 'area' && <path d={areaD} fill={`url(#${gradientId})`} className="pointer-events-none" />}

        <path
          d={lineD}
          fill="none"
          stroke={colorHex}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
        />

        {points.map((p, idx) => {
          const isSelected = activeKey === p.item.key;
          return (
            <g key={idx}>
              {isSelected && (
                <circle cx={p.x} cy={p.y} r="9" fill={colorHex} opacity="0.2" className="pointer-events-none" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isSelected ? '6' : '4'}
                fill="#ffffff"
                stroke={colorHex}
                strokeWidth="3"
                className="pointer-events-none transition-all duration-150"
              />

              <text
                x={p.x}
                y={p.y - 9}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="bold"
                fill="#334155"
                className="pointer-events-none"
              >
                {p.item.displayValue}
              </text>
            </g>
          );
        })}

        {/* Full column hit targets to eliminate hover flicker */}
        {points.map((pt, idx) => {
          const colW = chartW / Math.max(data.length - 1, 1);
          const rx = data.length > 1 ? pt.x - colW / 2 : padX;
          const rw = data.length > 1 ? colW : chartW;
          return (
            <rect
              key={idx}
              x={rx}
              y={0}
              width={rw}
              height={height}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(pt.item.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(pt.item.key)}
            />
          );
        })}
      </svg>

      <div className="flex justify-between px-3 pt-1 border-t border-slate-100 text-[10px] font-bold text-slate-600 select-none">
        {data.map((item) => (
          <span
            key={item.key}
            className={`cursor-pointer transition-colors ${activeKey === item.key ? 'text-indigo-600 font-extrabold' : 'hover:text-slate-900'}`}
            onMouseEnter={() => onHover(item.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick(item.key)}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export const CustomerSpendingModal: React.FC<CustomerSpendingModalProps> = ({
  customer,
  invoices,
  settings,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'monthly' | 'products' | 'bills'>('monthly');
  const [chartStyle, setChartStyle] = useState<ChartType>('line');
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [invoiceScale, setInvoiceScale] = useState(1);
  const invoiceWrapRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!viewingInvoice) return;
    const updateScale = () => {
      if (invoiceWrapRef.current) {
        const containerW = invoiceWrapRef.current.offsetWidth;
        const targetW = 794;
        const padding = 16;
        const calculatedScale = Math.min((containerW - padding) / targetW, 1);
        setInvoiceScale(Math.max(calculatedScale, 0.3));
      }
    };

    const timer = setTimeout(updateScale, 20);
    window.addEventListener('resize', updateScale);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScale);
    };
  }, [viewingInvoice]);

  // Filter invoices for this customer (case-insensitive name match)
  const customerInvoices = useMemo(() => {
    const custNameLower = customer.name.trim().toLowerCase();
    return invoices.filter(
      inv => inv.customerName && inv.customerName.trim().toLowerCase() === custNameLower
    ).sort((a, b) => b.id.localeCompare(a.id));
  }, [customer.name, invoices]);

  // Calculate customer spending statistics & monthly analysis with unit aggregation
  const stats = useMemo(() => {
    const totalSpent = customerInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const invoiceCount = customerInvoices.length;
    const avgOrderValue = invoiceCount > 0 ? totalSpent / invoiceCount : 0;

    let totalQty = 0;
    const totalUnitsMap: Record<string, number> = {};

    const productMap: Record<string, ProductSummary> = {};
    const monthlyMap: Record<string, MonthlySummary> = {};

    customerInvoices.forEach(inv => {
      const { key: mKey, label: mLabel } = getMonthKeyAndLabel(inv.date);
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = {
          key: mKey,
          label: mLabel,
          totalSpent: 0,
          totalQty: 0,
          unitsMap: {},
          invoiceCount: 0,
          products: {}
        };
      }
      monthlyMap[mKey].totalSpent += Number(inv.total) || 0;
      monthlyMap[mKey].invoiceCount += 1;

      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const qty = Number(item.quantity) || 0;
          const amt = Number(item.amount) || 0;
          const rawUnit = (item.unit || 'Unit').trim();
          const unitName = rawUnit ? rawUnit.charAt(0).toUpperCase() + rawUnit.slice(1) : 'Unit';

          totalQty += qty;
          totalUnitsMap[unitName] = (totalUnitsMap[unitName] || 0) + qty;

          monthlyMap[mKey].totalQty += qty;
          monthlyMap[mKey].unitsMap[unitName] = (monthlyMap[mKey].unitsMap[unitName] || 0) + qty;

          const pKey = item.name.trim();
          if (!productMap[pKey]) {
            productMap[pKey] = {
              name: item.name,
              quantity: 0,
              amount: 0,
              unit: item.unit || 'Unit',
              packing: item.packing
            };
          }
          productMap[pKey].quantity += qty;
          productMap[pKey].amount += amt;

          if (!monthlyMap[mKey].products[pKey]) {
            monthlyMap[mKey].products[pKey] = {
              name: item.name,
              quantity: 0,
              amount: 0,
              unit: item.unit || 'Unit',
              packing: item.packing
            };
          }
          monthlyMap[mKey].products[pKey].quantity += qty;
          monthlyMap[mKey].products[pKey].amount += amt;
        });
      }
    });

    const productBreakdown: ProductSummary[] = Object.values(productMap).sort((a, b) => b.amount - a.amount);
    const maxProductAmount = productBreakdown.length > 0 ? productBreakdown[0].amount : 1;

    const monthlyList: MonthlySummary[] = Object.values(monthlyMap).sort((a, b) => a.key.localeCompare(b.key));
    const maxMonthlySpent = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.totalSpent), 1) : 1;
    const maxMonthlyQty = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.totalQty), 1) : 1;
    const maxMonthlyAvg = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.invoiceCount > 0 ? m.totalSpent / m.invoiceCount : 0), 1) : 1;

    return {
      totalSpent,
      invoiceCount,
      avgOrderValue,
      totalQty,
      totalUnitsMap,
      productBreakdown,
      maxProductAmount,
      monthlyList,
      maxMonthlySpent,
      maxMonthlyQty,
      maxMonthlyAvg
    };
  }, [customerInvoices]);

  // 1. Revenue / Spend Histogram buckets calculation
  const revenueHistogramBuckets = useMemo(() => {
    const buckets = [
      { label: '< ₹5k', count: 0, total: 0 },
      { label: '₹5k-15k', count: 0, total: 0 },
      { label: '₹15k-30k', count: 0, total: 0 },
      { label: '₹30k-50k', count: 0, total: 0 },
      { label: '₹50k+', count: 0, total: 0 },
    ];

    customerInvoices.forEach(inv => {
      const amt = Number(inv.total) || 0;
      if (amt < 5000) { buckets[0].count++; buckets[0].total += amt; }
      else if (amt < 15000) { buckets[1].count++; buckets[1].total += amt; }
      else if (amt < 30000) { buckets[2].count++; buckets[2].total += amt; }
      else if (amt < 50000) { buckets[3].count++; buckets[3].total += amt; }
      else { buckets[4].count++; buckets[4].total += amt; }
    });

    return buckets;
  }, [customerInvoices]);

  // 2. Average Invoice Size Histogram buckets calculation
  const avgOrderHistogramBuckets = useMemo(() => {
    const invTotals = customerInvoices.map(inv => Number(inv.total) || 0).filter(t => t > 0);
    const maxVal = Math.max(...invTotals, 5000);

    const b1 = Math.ceil((maxVal * 0.25) / 500) * 500 || 1500;
    const b2 = Math.ceil((maxVal * 0.5) / 500) * 500 || 3500;
    const b3 = Math.ceil((maxVal * 0.75) / 500) * 500 || 7000;

    const buckets = [
      { label: `< ₹${b1.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b1.toLocaleString('en-IN')}-${b2.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b2.toLocaleString('en-IN')}-${b3.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b3.toLocaleString('en-IN')}+`, count: 0, total: 0 },
    ];

    invTotals.forEach(amt => {
      if (amt < b1) { buckets[0].count++; buckets[0].total += amt; }
      else if (amt < b2) { buckets[1].count++; buckets[1].total += amt; }
      else if (amt < b3) { buckets[2].count++; buckets[2].total += amt; }
      else { buckets[3].count++; buckets[3].total += amt; }
    });

    return buckets;
  }, [customerInvoices]);

  // Scatter plot points (Qty vs Spend)
  const scatterPoints = useMemo(() => {
    return customerInvoices.map(inv => ({
      id: inv.id,
      qty: inv.items ? inv.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : 0,
      spend: Number(inv.total) || 0
    }));
  }, [customerInvoices]);

  // Set default expanded month to latest month
  React.useEffect(() => {
    if (stats.monthlyList.length > 0 && !expandedMonthKey) {
      setExpandedMonthKey(stats.monthlyList[stats.monthlyList.length - 1].key);
    }
  }, [stats.monthlyList]);

  // Active month object for chart info banner
  const activeMonth = useMemo(() => {
    const key = hoveredMonthKey || expandedMonthKey || (stats.monthlyList.length > 0 ? stats.monthlyList[stats.monthlyList.length - 1].key : null);
    return stats.monthlyList.find(m => m.key === key) || null;
  }, [hoveredMonthKey, expandedMonthKey, stats.monthlyList]);

  const activeMonthTopProduct = useMemo(() => {
    if (!activeMonth) return null;
    const prods = (Object.values(activeMonth.products) as ProductSummary[]).sort((a, b) => b.amount - a.amount);
    return prods.length > 0 ? prods[0] : null;
  }, [activeMonth]);

  // Formatted dataset series for 4 graphs
  const spendData = useMemo(() => stats.monthlyList.map(m => ({
    key: m.key,
    label: m.label,
    value: m.totalSpent,
    displayValue: formatINRFull(m.totalSpent)
  })), [stats.monthlyList]);

  const avgData = useMemo(() => stats.monthlyList.map(m => ({
    key: m.key,
    label: m.label,
    value: m.invoiceCount > 0 ? m.totalSpent / m.invoiceCount : 0,
    displayValue: formatINRFull(m.invoiceCount > 0 ? m.totalSpent / m.invoiceCount : 0)
  })), [stats.monthlyList]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-6xl h-full sm:h-auto max-h-none sm:max-h-[94vh] flex flex-col overflow-hidden border-0 sm:border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 md:p-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white flex justify-between items-start shrink-0 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <ShoppingBag size={200} />
          </div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/20 rounded-full text-[10px] sm:text-xs font-semibold backdrop-blur-md mb-1.5">
              <Award size={13} className="text-yellow-300" /> Customer Buying & Spend Analysis
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{customer.name}</h2>
            <p className="text-indigo-100 text-xs md:text-sm mt-0.5 flex flex-wrap items-center gap-2 sm:gap-3">
              <span>📍 {customer.city || 'No city specified'}</span>
              {customer.phone && <span>📞 {customer.phone}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative z-10 p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 p-2.5 sm:p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <IndianRupee size={14} className="text-emerald-600 shrink-0" /> Total Spent
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-900 truncate">
              {formatINRFull(stats.totalSpent)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lifetime value</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <Package size={14} className="text-indigo-600 shrink-0" /> Total Volume Purchased
            </div>
            <div className="text-xs sm:text-sm md:text-base font-bold text-slate-900 truncate" title={formatUnitBreakdown(stats.totalUnitsMap)}>
              {formatUnitBreakdown(stats.totalUnitsMap)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lifetime unit breakdown</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <FileText size={14} className="text-blue-600 shrink-0" /> Total Bills
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-900 truncate">
              {stats.invoiceCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Invoices generated</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <TrendingUp size={14} className="text-purple-600 shrink-0" /> Avg Order Value
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-900 truncate">
              {formatINRFull(stats.avgOrderValue)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Per invoice average</div>
          </div>
        </div>

        {/* Modal Tabs Header */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-white px-1 sm:px-4 shrink-0">
          <button
            onClick={() => setActiveTab('monthly')}
            className={`py-2.5 sm:py-3 px-1 sm:px-4 text-[11px] sm:text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'monthly'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 size={14} className="shrink-0" />
            <span className="sm:hidden">Buying</span>
            <span className="hidden sm:inline">1. Buying Analysis</span>
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`py-2.5 sm:py-3 px-1 sm:px-4 text-[11px] sm:text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'products'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <PieChart size={14} className="shrink-0" />
            <span className="sm:hidden">Share</span>
            <span className="hidden sm:inline">2. Product Share</span>
          </button>
          <button
            onClick={() => setActiveTab('bills')}
            className={`py-2.5 sm:py-3 px-1 sm:px-4 text-[11px] sm:text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'bills'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={14} className="shrink-0" />
            <span className="sm:hidden">Bills ({customerInvoices.length})</span>
            <span className="hidden sm:inline">3. Invoices ({customerInvoices.length})</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6">
          {customerInvoices.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-bold text-base">No Purchase History Found</p>
              <p className="text-xs text-slate-400 mt-1">This customer does not have any recorded invoices yet.</p>
            </div>
          ) : (
            <>
              {/* TAB 1: 1st Menu - 6 Visual Charts Analysis in 2x2 Grid with 6 Style Options */}
              {activeTab === 'monthly' && (
                <div className="space-y-6">
                  
                  {/* Chart Style Switcher Header (4 Modes) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                        Visual Chart Type Switcher (4 Modes)
                      </h3>
                      <p className="text-[11px] text-slate-500">Select chart rendering style (Line, Bar, Pie, or Histogram)</p>
                    </div>

                    <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs w-full sm:w-80">
                      <button
                        onClick={() => setChartStyle('line')}
                        className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          chartStyle === 'line' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <TrendingUp size={13} /> Line
                      </button>
                      <button
                        onClick={() => setChartStyle('bar')}
                        className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          chartStyle === 'bar' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <BarChart3 size={13} /> Bar
                      </button>
                      <button
                        onClick={() => setChartStyle('pie')}
                        className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          chartStyle === 'pie' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <PieChart size={13} /> Pie
                      </button>
                      <button
                        onClick={() => setChartStyle('histogram')}
                        className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          chartStyle === 'histogram' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <BarChart2 size={13} /> Histogram
                      </button>
                    </div>
                  </div>

                  {/* Interactive Month Details Banner */}
                  {activeMonth && (
                    <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-3 py-1 bg-indigo-500/30 text-indigo-300 rounded-lg border border-indigo-400/30">
                          📅 {activeMonth.label}
                        </span>
                        <span className="text-xs text-slate-300 font-medium">
                          {activeMonth.invoiceCount} Invoice{activeMonth.invoiceCount > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 mr-1">Monthly Spend:</span>
                          <span className="font-bold text-emerald-400">{formatINRFull(activeMonth.totalSpent)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 mr-1">Monthly Volume:</span>
                          <span className="font-bold text-indigo-300">{formatUnitBreakdown(activeMonth.unitsMap)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 mr-1">Avg Bill:</span>
                          <span className="font-bold text-purple-300">{formatINRFull(activeMonth.totalSpent / activeMonth.invoiceCount)}</span>
                        </div>
                        {activeMonthTopProduct && (
                          <div className="bg-amber-400/10 border border-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded text-[11px] font-medium">
                            ⭐ Top Item: {activeMonthTopProduct.name} ({formatINRFull(activeMonthTopProduct.amount)})
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2x2 GRID OF 4 ANALYSIS GRAPHS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* CHART 1: Monthly Spend Trend (₹) */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="mb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <IndianRupee className="w-4 h-4 text-emerald-600" />
                          1. Monthly Spend Analysis (₹)
                        </h4>
                        <p className="text-[11px] text-slate-500">Total rupee amount spent per month</p>
                      </div>
                      <TrendChart
                        data={spendData}
                        maxValue={stats.maxMonthlySpent}
                        colorHex="#10b981"
                        chartStyle={chartStyle}
                        activeKey={activeMonth?.key || null}
                        onHover={setHoveredMonthKey}
                        onClick={setExpandedMonthKey}
                        scatterPoints={scatterPoints}
                        histogramBuckets={revenueHistogramBuckets}
                      />
                    </div>

                    {/* CHART 2: Product Volume Trend */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="mb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <Package className="w-4 h-4 text-indigo-600" />
                          2. Product Volume Trend
                        </h4>
                        <p className="text-[11px] text-slate-500">Product multi-line volume tracking (Kg, Pkt, etc.)</p>
                      </div>
                      <ProductWiseTrendChart
                        monthlyList={stats.monthlyList}
                        products={stats.productBreakdown}
                        activeMonthKey={activeMonth?.key || null}
                        onHoverMonth={setHoveredMonthKey}
                        onClickMonth={setExpandedMonthKey}
                        chartStyle={chartStyle}
                      />
                    </div>

                    {/* CHART 3: Top Products Share Distribution */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="mb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <PieChart className="w-4 h-4 text-purple-600" />
                          3. Product Share Analysis (Top Spend)
                        </h4>
                        <p className="text-[11px] text-slate-500">Distribution of customer spend across products</p>
                      </div>
                      <div className="h-48 p-3 bg-white rounded-xl border border-slate-200 shadow-inner overflow-y-auto space-y-2.5">
                        {stats.productBreakdown.slice(0, 5).map((item, idx) => {
                          const percent = stats.totalSpent > 0 ? ((item.amount / stats.totalSpent) * 100).toFixed(1) : '0';
                          const widthPercent = (item.amount / stats.maxProductAmount) * 100;
                          const barColor = COLORS[idx % COLORS.length];

                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="font-bold text-slate-800 truncate max-w-[160px]">{item.name}</span>
                                <span className="font-bold text-slate-900">{formatINRFull(item.amount)} <span className="text-[10px] text-slate-400 font-normal">({percent}%)</span></span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(widthPercent, 3)}%`, backgroundColor: barColor }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* CHART 4: Average Bill Size per Month (₹/Bill) */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div className="mb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-600" />
                          4. Average Invoice Size per Month (₹/Bill)
                        </h4>
                        <p className="text-[11px] text-slate-500">Average order value spent on each invoice</p>
                      </div>
                      <TrendChart
                        data={avgData}
                        maxValue={stats.maxMonthlyAvg}
                        colorHex="#3b82f6"
                        chartStyle={chartStyle}
                        activeKey={activeMonth?.key || null}
                        onHover={setHoveredMonthKey}
                        onClick={setExpandedMonthKey}
                        scatterPoints={scatterPoints}
                        histogramBuckets={avgOrderHistogramBuckets}
                      />
                    </div>

                  </div>

                  {/* Monthly Buying Breakdown List / Cards */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Layers size={16} className="text-indigo-600" />
                        Monthly Itemized Product Breakdown
                      </span>
                      <span className="text-xs text-slate-500 font-normal">
                        Click any month to inspect products bought
                      </span>
                    </h3>

                    <div className="space-y-3">
                      {stats.monthlyList.map((m) => {
                        const isExpanded = expandedMonthKey === m.key;
                        const monthProducts = (Object.values(m.products) as ProductSummary[]).sort((a, b) => b.amount - a.amount);
                        const unitBreakdownStr = formatUnitBreakdown(m.unitsMap);

                        return (
                          <div
                            key={m.key}
                            className={`bg-white border rounded-xl overflow-hidden transition-all shadow-sm ${
                              isExpanded ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {/* Card Header */}
                            <button
                              onClick={() => setExpandedMonthKey(isExpanded ? null : m.key)}
                              className="w-full p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="px-2.5 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs uppercase tracking-wider text-center shrink-0 min-w-[4.5rem]">
                                  {m.label}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                                    <span>{formatINRFull(m.totalSpent)}</span>
                                    <span className="text-xs font-medium text-slate-500">total spend</span>
                                  </div>
                                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-medium">
                                    <span className="font-bold text-indigo-700 whitespace-nowrap">📦 {unitBreakdownStr}</span>
                                    <span className="whitespace-nowrap">📜 {m.invoiceCount} bill{m.invoiceCount > 1 ? 's' : ''}</span>
                                    <span className="whitespace-nowrap">🏷️ {monthProducts.length} product type{monthProducts.length > 1 ? 's' : ''}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between sm:justify-end gap-2 text-indigo-600 font-bold text-xs shrink-0 border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0">
                                <span className="whitespace-nowrap">{isExpanded ? 'Hide Items' : 'View Items'}</span>
                                {isExpanded ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
                              </div>
                            </button>

                            {/* Card Expanded Items Table */}
                            {isExpanded && (
                              <div className="p-4 border-t border-slate-200 bg-white space-y-3">
                                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                  Products Bought in {m.label}
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                      <tr>
                                        <th className="p-2.5">Product Name</th>
                                        <th className="p-2.5">Purchased Qty / Unit</th>
                                        <th className="p-2.5 text-right">Total Amount</th>
                                        <th className="p-2.5 text-right">% Month Spend</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {monthProducts.map((p, pIdx) => (
                                        <tr key={pIdx} className="hover:bg-slate-50">
                                          <td className="p-2.5 font-bold text-slate-800">
                                            {p.name}
                                            {p.packing && (
                                              <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                                                ({p.packing})
                                              </span>
                                            )}
                                          </td>
                                          <td className="p-2.5 text-indigo-700 font-bold">
                                            {p.quantity} {p.unit}
                                          </td>
                                          <td className="p-2.5 text-right font-bold text-slate-900">
                                            {formatINRFull(p.amount)}
                                          </td>
                                          <td className="p-2.5 text-right text-slate-600 font-medium">
                                            {m.totalSpent > 0 ? ((p.amount / m.totalSpent) * 100).toFixed(1) : 0}%
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: 2nd Menu - Product Share & Item Breakdown */}
              {activeTab === 'products' && (
                <div className="space-y-6">
                  {/* Top Spending Products Bar Visualization */}
                  <div className="bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
                      <span>Overall Spending Share by Product</span>
                      <span className="text-xs text-slate-500 font-normal">Sorted by highest expenditure</span>
                    </h3>
                    <div className="space-y-4">
                      {stats.productBreakdown.map((item, idx) => {
                        const percentOfCustomerTotal = stats.totalSpent > 0
                          ? ((item.amount / stats.totalSpent) * 100).toFixed(1)
                          : '0';
                        const barWidthPercent = (item.amount / stats.maxProductAmount) * 100;
                        const barColor = COLORS[idx % COLORS.length];

                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-800 flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full inline-block"
                                  style={{ backgroundColor: barColor }}
                                ></span>
                                {item.name}
                                {item.packing && (
                                  <span className="text-[10px] text-slate-500 font-normal bg-slate-200 px-1.5 py-0.5 rounded">
                                    {item.packing}
                                  </span>
                                )}
                              </span>
                              <div className="text-right">
                                <span className="font-bold text-slate-900">{formatINRFull(item.amount)}</span>
                                <span className="text-[10px] text-slate-500 ml-2">({percentOfCustomerTotal}%)</span>
                              </div>
                            </div>
                            <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex items-center p-0.5">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.max(barWidthPercent, 2)}%`,
                                  backgroundColor: barColor
                                }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-500 flex justify-between">
                              <span>Purchased Qty: {item.quantity} {item.unit}</span>
                              <span>Avg Rate: {formatINRFull(item.quantity > 0 ? item.amount / item.quantity : 0)}/{item.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Product Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-100 font-bold text-xs text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      Lifetime Products Purchased Table
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Product Name</th>
                            <th className="p-3">Total Quantity</th>
                            <th className="p-3 text-right">Total Amount</th>
                            <th className="p-3 text-right">% of Total Spend</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.productBreakdown.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">
                                {item.name}
                                {item.packing && (
                                  <span className="text-[10px] text-slate-400 font-normal ml-2">
                                    ({item.packing})
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-indigo-700 font-bold">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-900">
                                {formatINRFull(item.amount)}
                              </td>
                              <td className="p-3 text-right text-slate-600 font-medium">
                                {stats.totalSpent > 0 ? ((item.amount / stats.totalSpent) * 100).toFixed(1) : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: 3rd Menu - Customer Invoices List */}
              {activeTab === 'bills' && (
                <div className="space-y-3">
                  {customerInvoices.map(inv => (
                    <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm sm:text-base">Invoice #{inv.id}</span>
                          <span className="text-xs text-slate-500 font-medium">📅 {inv.date}</span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-base sm:text-lg font-extrabold text-indigo-600">
                            {formatINRFull(inv.total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingInvoice(inv)}
                            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-indigo-200 shadow-2xs"
                          >
                            <Eye size={14} /> View Invoice
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Items Bought:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {inv.items.map((item, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium border border-slate-200/60">
                              {item.name} × {item.quantity} {item.unit} ({formatINRFull(item.amount)})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-md cursor-pointer"
          >
            Close Details
          </button>
        </div>

      </div>

      {/* Invoice Template Viewer Overlay Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-[70] bg-slate-950/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 w-full max-w-4xl h-full sm:h-[90vh] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
            {/* Header Bar */}
            <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between border-b border-slate-700 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm sm:text-base">Invoice #{viewingInvoice.id}</span>
                <span className="text-xs text-slate-400">({viewingInvoice.date})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setViewingInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {/* Printable Invoice Container */}
            <div ref={invoiceWrapRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-6 flex justify-center items-start bg-slate-950/50">
              <div
                className="bg-white shadow-xl rounded-lg overflow-hidden shrink-0 origin-top transition-transform duration-150 ease-out"
                style={{
                  width: '794px',
                  transform: `scale(${invoiceScale})`,
                  marginBottom: invoiceScale < 1 ? `-${(1 - invoiceScale) * 1050}px` : '0px'
                }}
              >
                <InvoiceTemplate
                  id={`cust-inv-${viewingInvoice.id}`}
                  billNo={viewingInvoice.id}
                  date={viewingInvoice.date}
                  customerName={viewingInvoice.customerName}
                  customerCity={viewingInvoice.customerCity}
                  customerMobile={viewingInvoice.customerMobile}
                  items={viewingInvoice.items}
                  settings={settings || DEFAULT_BUSINESS_SETTINGS}
                  gstRate={viewingInvoice.gstRate}
                  payments={viewingInvoice.payments}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
