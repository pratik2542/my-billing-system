import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Product, Invoice, Customer, BusinessSettings } from '../types';
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
  Users,
  Eye,
  Printer
} from 'lucide-react';
import { InvoiceTemplate } from './InvoiceTemplate';

interface ProductAnalysisModalProps {
  product: Product;
  invoices: Invoice[];
  customers?: Customer[];
  settings?: BusinessSettings;
  onClose: () => void;
}

interface CustomerSummary {
  name: string;
  city: string;
  quantity: number;
  amount: number;
  unit: string;
}

interface MonthlySummary {
  key: string;
  label: string;
  totalSpent: number;
  totalQty: number;
  unitsMap: Record<string, number>;
  invoiceCount: number;
  customers: Record<string, CustomerSummary>;
  invoiceItems: Array<{
    invoiceId: string;
    date: string;
    customerName: string;
    customerCity: string;
    quantity: number;
    rate: number;
    amount: number;
    unit: string;
    packing?: string;
  }>;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'histogram';

const COLORS = ['#10b981', '#6366f1', '#ec4899', '#f97316', '#8b5cf6', '#06b6d4', '#eab308', '#3b82f6'];

const formatINRFull = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

const formatUnitBreakdown = (unitsMap: Record<string, number>): string => {
  const entries = Object.entries(unitsMap).filter(([_, qty]) => qty > 0);
  if (entries.length === 0) return '0 Units';
  return entries.map(([unit, qty]) => `${qty.toLocaleString('en-IN')} ${unit}`).join(' + ');
};

const getMonthKeyAndLabel = (dateStr: string): { key: string; label: string } => {
  if (!dateStr) return { key: '1970-01', label: 'Jan 1970' };
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      return { key: `${yyyy}-${mm}`, label };
    }
  }
  return { key: '2026-01', label: dateStr };
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

// ---- Multi-Line Customer-Wise Volume Trend Chart ----
interface CustomerWiseTrendChartProps {
  monthlyList: MonthlySummary[];
  topCustomers: CustomerSummary[];
  activeMonthKey: string | null;
  onHoverMonth: (key: string | null) => void;
  onClickMonth: (key: string) => void;
  chartStyle: ChartType;
}

const CustomerWiseTrendChart: React.FC<CustomerWiseTrendChartProps> = ({
  monthlyList,
  topCustomers,
  activeMonthKey,
  onHoverMonth,
  onClickMonth,
  chartStyle
}) => {
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

  // Customer focus state
  const [selectedCust, setSelectedCust] = useState<string | null>(null);
  const toggleCust = useCallback((name: string) => {
    setSelectedCust(prev => prev === name ? null : name);
  }, []);

  const topCusts = useMemo(() => topCustomers.slice(0, 6), [topCustomers]);

  const getCustQty = useCallback((m: MonthlySummary, custName: string): number => {
    if (!m || !m.customers) return 0;
    if (m.customers[custName]) return m.customers[custName].quantity || 0;
    const trimmed = custName.trim();
    if (m.customers[trimmed]) return m.customers[trimmed].quantity || 0;
    const matchKey = Object.keys(m.customers).find(k => k.trim().toLowerCase() === trimmed.toLowerCase());
    return matchKey ? m.customers[matchKey].quantity || 0 : 0;
  }, []);

  const maxQty = useMemo(() => {
    let mx = 1;
    const custsToCheck = selectedCust
      ? topCusts.filter(c => c.name.trim() === selectedCust.trim())
      : topCusts;
    custsToCheck.forEach(c => {
      monthlyList.forEach(m => {
        const q = getCustQty(m, c.name);
        if (q > mx) mx = q;
      });
    });
    return mx;
  }, [selectedCust, topCusts, monthlyList, getCustQty]);

  const width = 500;
  const height = 200;
  const padX = 40;
  const padY = 42;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const LABEL_OFFSETS = [-14, 14, -26, 26, -38, 38];

  if (chartStyle === 'bar') {
    return (
      <div className="h-48 flex flex-col justify-between bg-white rounded-xl border border-slate-200 shadow-inner p-2">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold px-2 pb-1 border-b border-slate-100 overflow-x-auto shrink-0">
          {topCusts.map((c, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
              <span className="text-slate-700">{c.name} ({c.unit})</span>
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
                  {topCusts.map((c, cIdx) => {
                    const q = getCustQty(m, c.name);
                    const hPct = maxQty > 0 ? (q / maxQty) * 100 : 0;
                    return (
                      <div
                        key={cIdx}
                        className="flex-1 rounded-t transition-all duration-300 pointer-events-none"
                        style={{
                          height: `${Math.max(hPct, 4)}%`,
                          backgroundColor: COLORS[cIdx % COLORS.length],
                          opacity: q > 0 ? 1 : 0.15
                        }}
                        title={`${c.name}: ${q} ${c.unit}`}
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col relative flex-1 h-full" style={{ minHeight: '240px' }}>
      {/* Legend + Controls row */}
      <div className="flex items-start justify-between gap-2 pb-1 border-b border-slate-100 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold overflow-x-auto">
          {topCusts.map((c, idx) => {
            const color = COLORS[idx % COLORS.length];
            const isSelected = selectedCust !== null && selectedCust.trim() === c.name.trim();
            const isDimmed = selectedCust !== null && !isSelected;
            return (
              <div
                key={idx}
                onClick={() => toggleCust(c.name)}
                className="flex items-center gap-1 shrink-0 cursor-pointer select-none rounded-md px-1.5 py-0.5 transition-all duration-150"
                style={{
                  opacity: isDimmed ? 0.35 : 1,
                  backgroundColor: isSelected ? `${color}12` : 'transparent',
                  boxShadow: isSelected ? `inset 0 0 0 1.5px ${color}` : 'none',
                }}
                title={isSelected ? 'Click to show all' : 'Click to focus this customer'}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full transition-all"
                  style={{ backgroundColor: color, boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 3.5px ${color}` : 'none' }}
                />
                <span className={`transition-colors ${isSelected ? 'font-extrabold' : 'font-bold'}`} style={{ color: isSelected ? color : '#1e293b' }}>{c.name}</span>
                <span className="text-slate-400 font-normal">({c.unit})</span>
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
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: `${width / 2}px ${height / 2}px` }}>
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padX} y1={padY + chartH / 2} x2={width - padX} y2={padY + chartH / 2} stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="4 4" />

            {topCusts.map((c, cIdx) => {
              const cColor = COLORS[cIdx % COLORS.length];
              const isThisSelected = selectedCust !== null && selectedCust.trim() === c.name.trim();
              const isActiveCust = selectedCust === null || isThisSelected;
              const lineOpacity = isActiveCust ? 1 : 0.1;
              const strokeW = isThisSelected ? 4 / zoom : 2.5 / zoom;

              const points = monthlyList.map((m, mIdx) => {
                const q = getCustQty(m, c.name);
                const x = padX + (monthlyList.length > 1 ? (mIdx / (monthlyList.length - 1)) * chartW : chartW / 2);
                const y = padY + chartH - (maxQty > 0 ? (q / maxQty) * chartH : 0);
                return { x, y, q, unit: c.unit, monthKey: m.key, label: m.label };
              });

              const nonZeroPts = points.filter(pt => pt.q > 0);
              const lineD = nonZeroPts.map((pt, i) =>
                `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
              ).join(' ');

              return (
                <g key={cIdx} style={{ opacity: lineOpacity, transition: 'opacity 0.2s' }}>
                  <path
                    d={lineD}
                    fill="none"
                    stroke={cColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                  {points.map((pt, ptIdx) => {
                    if (pt.q === 0) return null;
                    const isSelected = activeMonthKey === pt.monthKey;
                    const labelOffset = LABEL_OFFSETS[cIdx % LABEL_OFFSETS.length];
                    const labelY = pt.y + labelOffset;
                    const labelAbove = labelOffset < 0;
                    const label = `${pt.q} ${pt.unit}`;
                    const textW = Math.max(label.length * 5.2 + 6, 28);
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
                          stroke={cColor}
                          strokeWidth={0.8 / zoom}
                          className="pointer-events-none"
                        />
                        <text
                          x={pt.x}
                          y={labelAbove ? labelY + 1 : labelY + 8}
                          textAnchor="middle"
                          fontSize={scaledFontSize}
                          fontWeight="bold"
                          fill={cColor}
                          className="pointer-events-none"
                        >
                          {label}
                        </text>
                        {nonZeroPts.length <= 2 && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={nodeR * 1.8}
                            fill={cColor}
                            fillOpacity="0.12"
                            stroke={cColor}
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
                          stroke={cColor}
                          strokeWidth={scaledStroke}
                          className="pointer-events-none"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* Hit areas */}
          {monthlyList.map((m, mIdx) => {
            const xBase = padX + (monthlyList.length > 1 ? (mIdx / (monthlyList.length - 1)) * chartW : chartW / 2);
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
    return <div className="flex-1 h-full min-h-[240px] flex items-center justify-center text-xs text-slate-400">No data available</div>;
  }

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
      <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-3 flex items-center justify-between gap-3 overflow-hidden">
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
              className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                activeKey === slice.item.key ? 'bg-indigo-50 border border-indigo-200 font-bold' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                <span className="truncate text-slate-700">{slice.item.label}</span>
              </div>
              <span className="font-extrabold text-slate-900 ml-2">{slice.item.displayValue}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chartStyle === 'histogram') {
    const maxCount = Math.max(...histogramBuckets.map(b => b.count), 1);
    return (
      <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-3 flex flex-col justify-between">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Bill Value Distribution Brackets
        </div>
        <div className="flex-1 flex items-end justify-between gap-2 pt-2 pb-1">
          {histogramBuckets.map((bucket, idx) => {
            const hPct = (bucket.count / maxCount) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                <div className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1 rounded mb-1">
                  {bucket.count} bills
                </div>
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: `${Math.max(hPct, 6)}%`,
                    backgroundColor: COLORS[idx % COLORS.length]
                  }}
                  title={`${bucket.label}: ${bucket.count} bills (${formatINRFull(bucket.total)})`}
                ></div>
                <div className="text-[9px] font-bold text-slate-600 truncate w-full text-center mt-1">
                  {bucket.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (chartStyle === 'scatter') {
    const maxQty = Math.max(...scatterPoints.map(p => p.qty), 1);
    const maxSpend = Math.max(...scatterPoints.map(p => p.spend), 1);
    return (
      <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-3 flex flex-col justify-between relative overflow-hidden">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
          <span>Qty (X) vs Revenue (Y) Scatter</span>
          <span>{scatterPoints.length} Invoices</span>
        </div>
        <div className="flex-1 relative w-full my-1">
          <svg viewBox="0 0 500 200" className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
            <line x1="40" y1="160" x2="460" y2="160" stroke="#e2e8f0" strokeWidth="1" />
            <line x1="40" y1="30" x2="460" y2="30" stroke="#e2e8f0" strokeWidth="1" />
            {scatterPoints.map((pt, idx) => {
              const cx = 40 + (pt.qty / maxQty) * 420;
              const cy = 160 - (pt.spend / maxSpend) * 130;
              return (
                <g key={idx}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r="6"
                    fill={colorHex}
                    fillOpacity="0.6"
                    stroke={colorHex}
                    strokeWidth="2"
                    className="transition-all hover:scale-150 cursor-pointer"
                  >
                    <title>{`Qty: ${pt.qty} | Revenue: ${formatINRFull(pt.spend)}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex justify-between text-[9px] font-bold text-slate-400">
          <span>0 Units</span>
          <span>Max Qty: {maxQty}</span>
        </div>
      </div>
    );
  }

  if (chartStyle === 'bubble') {
    const width = 500;
    const height = 200;
    const padX = 40;
    const padY = 42;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    return (
      <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col justify-between relative overflow-hidden">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 pt-1">
          Bubble Size = Quantity Sold
        </div>
        <div className="flex-1 relative w-full h-full my-1">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#f1f5f9" strokeWidth="1" />
            <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#f1f5f9" strokeWidth="1" />

            {data.map((item, idx) => {
              const isSelected = activeKey === item.key;
              const cx = padX + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
              const cy = padY + chartH - (maxValue > 0 ? (item.value / maxValue) * chartH : 0);
              const r = Math.max(8, Math.min(22, (item.value / (maxValue || 1)) * 24));

              return (
                <g key={item.key}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={colorHex}
                    fillOpacity={isSelected ? 0.85 : 0.45}
                    stroke={colorHex}
                    strokeWidth={isSelected ? '3' : '1.5'}
                    className="transition-all duration-300 pointer-events-none"
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="#ffffff"
                    className="pointer-events-none"
                  >
                    {item.label.split(' ')[0]}
                  </text>
                  <circle
                    cx={cx}
                    cy={cy}
                    r="20"
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => onHover(item.key)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onClick(item.key)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex justify-between px-3 pt-1 border-t border-slate-100 text-[10px] font-bold text-slate-600">
          {data.map((d) => (
            <span key={d.key}>{d.label}</span>
          ))}
        </div>
      </div>
    );
  }

  // DEFAULT: LINE CHART
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

  const linePathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  return (
    <div className="flex-1 h-full min-h-[240px] bg-white rounded-xl border border-slate-200 shadow-inner p-2 flex flex-col justify-between relative overflow-hidden">
      <div className="flex-1 relative w-full h-full my-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#f1f5f9" strokeWidth="1" />

          <path
            d={linePathD}
            fill="none"
            stroke={colorHex}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none"
          />

          {points.map((pt) => {
            const isSelected = activeKey === pt.item.key;
            return (
              <g key={pt.item.key}>
                {isSelected && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="9"
                    fill={colorHex}
                    fillOpacity="0.25"
                    className="pointer-events-none"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? '6' : '4'}
                  fill="#ffffff"
                  stroke={colorHex}
                  strokeWidth="3"
                  className="pointer-events-none transition-all duration-150"
                />
                <text
                  x={pt.x}
                  y={pt.y - 10}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill="#334155"
                  className="pointer-events-none"
                >
                  {pt.item.displayValue}
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
      </div>

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

export const ProductAnalysisModal: React.FC<ProductAnalysisModalProps> = ({
  product,
  invoices,
  customers = [],
  settings,
  onClose
}) => {
  const [chartStyle, setChartStyle] = useState<ChartType>('line');
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
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

  // Aggregate Product Stats across all invoices
  const stats = useMemo(() => {
    const prodNameClean = product.name.trim().toLowerCase();
    const productInvoices = invoices.filter(inv =>
      inv.items && inv.items.some(it => it.name.trim().toLowerCase() === prodNameClean)
    );

    let totalSpent = 0;
    let totalQty = 0;
    const totalUnitsMap: Record<string, number> = {};
    const customerMap: Record<string, CustomerSummary> = {};
    const monthlyMap: Record<string, MonthlySummary> = {};

    productInvoices.forEach(inv => {
      const { key: mKey, label: mLabel } = getMonthKeyAndLabel(inv.date);
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = {
          key: mKey,
          label: mLabel,
          totalSpent: 0,
          totalQty: 0,
          unitsMap: {},
          invoiceCount: 0,
          customers: {},
          invoiceItems: []
        };
      }

      const custName = inv.customerName.trim();
      const custCity = inv.customerCity || '';

      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          if (item.name.trim().toLowerCase() !== prodNameClean) return;

          const qty = Number(item.quantity) || 0;
          const amt = Number(item.amount) || (qty * (Number(item.rate) || 0));
          const rawUnit = (item.unit || product.unit || 'Unit').trim();
          const unitName = rawUnit ? rawUnit.charAt(0).toUpperCase() + rawUnit.slice(1) : 'Unit';

          totalSpent += amt;
          totalQty += qty;
          totalUnitsMap[unitName] = (totalUnitsMap[unitName] || 0) + qty;

          monthlyMap[mKey].totalSpent += amt;
          monthlyMap[mKey].totalQty += qty;
          monthlyMap[mKey].invoiceCount += 1;
          monthlyMap[mKey].unitsMap[unitName] = (monthlyMap[mKey].unitsMap[unitName] || 0) + qty;

          // Customer aggregate for this product
          if (!customerMap[custName]) {
            customerMap[custName] = {
              name: custName,
              city: custCity,
              quantity: 0,
              amount: 0,
              unit: unitName
            };
          }
          customerMap[custName].quantity += qty;
          customerMap[custName].amount += amt;

          // Monthly customer breakdown
          if (!monthlyMap[mKey].customers[custName]) {
            monthlyMap[mKey].customers[custName] = {
              name: custName,
              city: custCity,
              quantity: 0,
              amount: 0,
              unit: unitName
            };
          }
          monthlyMap[mKey].customers[custName].quantity += qty;
          monthlyMap[mKey].customers[custName].amount += amt;

          monthlyMap[mKey].invoiceItems.push({
            invoiceId: inv.id,
            date: inv.date,
            customerName: custName,
            customerCity: custCity,
            quantity: qty,
            rate: Number(item.rate) || 0,
            amount: amt,
            unit: unitName,
            packing: item.packing
          });
        });
      }
    });

    const customerBreakdown: CustomerSummary[] = Object.values(customerMap).sort((a, b) => b.amount - a.amount);
    const topCustomer = customerBreakdown.length > 0 ? customerBreakdown[0] : null;

    const monthlyList: MonthlySummary[] = Object.values(monthlyMap).sort((a, b) => a.key.localeCompare(b.key));
    const maxMonthlySpent = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.totalSpent), 1) : 1;
    const maxMonthlyQty = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.totalQty), 1) : 1;
    const maxMonthlyAvg = monthlyList.length > 0 ? Math.max(...monthlyList.map(m => m.invoiceCount > 0 ? m.totalSpent / m.invoiceCount : 0), 1) : 1;

    return {
      productInvoices,
      totalSpent,
      totalQty,
      totalUnitsMap,
      customerBreakdown,
      topCustomer,
      monthlyList,
      maxMonthlySpent,
      maxMonthlyQty,
      maxMonthlyAvg
    };
  }, [product, invoices]);

  // 1. Revenue Histogram buckets calculation
  const revenueHistogramBuckets = useMemo(() => {
    const buckets = [
      { label: '< ₹5k', count: 0, total: 0 },
      { label: '₹5k-15k', count: 0, total: 0 },
      { label: '₹15k-30k', count: 0, total: 0 },
      { label: '₹30k-50k', count: 0, total: 0 },
      { label: '₹50k+', count: 0, total: 0 },
    ];

    stats.productInvoices.forEach(inv => {
      const amt = Number(inv.total) || 0;
      if (amt < 5000) { buckets[0].count++; buckets[0].total += amt; }
      else if (amt < 15000) { buckets[1].count++; buckets[1].total += amt; }
      else if (amt < 30000) { buckets[2].count++; buckets[2].total += amt; }
      else if (amt < 50000) { buckets[3].count++; buckets[3].total += amt; }
      else { buckets[4].count++; buckets[4].total += amt; }
    });

    return buckets;
  }, [stats.productInvoices]);

  // 2. Quantity / Volume Histogram buckets calculation
  const quantityHistogramBuckets = useMemo(() => {
    const prodNameClean = product.name.trim().toLowerCase();
    const qtys = stats.productInvoices.map(inv => {
      const matchingItems = inv.items ? inv.items.filter(it => it.name.trim().toLowerCase() === prodNameClean) : [];
      return matchingItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    }).filter(q => q > 0);

    const maxQty = Math.max(...qtys, 40);
    const b1 = Math.ceil((maxQty * 0.25) / 5) * 5 || 10;
    const b2 = Math.ceil((maxQty * 0.5) / 5) * 5 || 25;
    const b3 = Math.ceil((maxQty * 0.75) / 5) * 5 || 50;

    const buckets = [
      { label: `< ${b1} units`, count: 0, total: 0 },
      { label: `${b1}-${b2} units`, count: 0, total: 0 },
      { label: `${b2}-${b3} units`, count: 0, total: 0 },
      { label: `${b3}+ units`, count: 0, total: 0 },
    ];

    qtys.forEach(q => {
      if (q < b1) { buckets[0].count++; buckets[0].total += q; }
      else if (q < b2) { buckets[1].count++; buckets[1].total += q; }
      else if (q < b3) { buckets[2].count++; buckets[2].total += q; }
      else { buckets[3].count++; buckets[3].total += q; }
    });

    return buckets;
  }, [stats.productInvoices, product.name]);

  // 3. Average Order Value Histogram buckets calculation
  const avgOrderHistogramBuckets = useMemo(() => {
    const prodNameClean = product.name.trim().toLowerCase();
    const spends = stats.productInvoices.map(inv => {
      const matchingItems = inv.items ? inv.items.filter(it => it.name.trim().toLowerCase() === prodNameClean) : [];
      return matchingItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    }).filter(s => s > 0);

    const maxSpend = Math.max(...spends, 4000);
    const b1 = Math.ceil((maxSpend * 0.25) / 500) * 500 || 1000;
    const b2 = Math.ceil((maxSpend * 0.5) / 500) * 500 || 2500;
    const b3 = Math.ceil((maxSpend * 0.75) / 500) * 500 || 5000;

    const buckets = [
      { label: `< ₹${b1.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b1.toLocaleString('en-IN')}-${b2.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b2.toLocaleString('en-IN')}-${b3.toLocaleString('en-IN')}`, count: 0, total: 0 },
      { label: `₹${b3.toLocaleString('en-IN')}+`, count: 0, total: 0 },
    ];

    spends.forEach(s => {
      if (s < b1) { buckets[0].count++; buckets[0].total += s; }
      else if (s < b2) { buckets[1].count++; buckets[1].total += s; }
      else if (s < b3) { buckets[2].count++; buckets[2].total += s; }
      else { buckets[3].count++; buckets[3].total += s; }
    });

    return buckets;
  }, [stats.productInvoices, product.name]);

  // Scatter plot points
  const scatterPoints = useMemo(() => {
    const prodNameClean = product.name.trim().toLowerCase();
    return stats.productInvoices.map(inv => {
      const matchingItems = inv.items ? inv.items.filter(it => it.name.trim().toLowerCase() === prodNameClean) : [];
      const qty = matchingItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const spend = matchingItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      return { id: inv.id, qty, spend };
    });
  }, [stats.productInvoices, product.name]);

  React.useEffect(() => {
    if (stats.monthlyList.length > 0 && !expandedMonthKey) {
      setExpandedMonthKey(stats.monthlyList[stats.monthlyList.length - 1].key);
    }
  }, [stats.monthlyList]);

  const activeMonth = useMemo(() => {
    const key = hoveredMonthKey || expandedMonthKey || (stats.monthlyList.length > 0 ? stats.monthlyList[stats.monthlyList.length - 1].key : null);
    return stats.monthlyList.find(m => m.key === key) || null;
  }, [hoveredMonthKey, expandedMonthKey, stats.monthlyList]);

  const activeMonthTopCustomer = useMemo(() => {
    if (!activeMonth) return null;
    const custs = (Object.values(activeMonth.customers) as CustomerSummary[]).sort((a, b) => b.amount - a.amount);
    return custs.length > 0 ? custs[0] : null;
  }, [activeMonth]);

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
        <div className="p-3.5 sm:p-5 md:p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white flex justify-between items-start shrink-0 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <Package size={200} />
          </div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-white/20 rounded-full text-[10px] sm:text-xs font-semibold backdrop-blur-md mb-1.5">
              <Award size={13} className="text-yellow-300" /> Product Sales & Customer Buying Analysis
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{product.name}</h2>
            <p className="text-emerald-100 text-xs md:text-sm mt-0.5 flex flex-wrap items-center gap-2 sm:gap-3">
              <span>🏷️ Rate: ₹{product.rate} / {product.unit}</span>
              {product.packing && <span>📦 Packing: {product.packing}</span>}
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
              <IndianRupee size={14} className="text-emerald-600 shrink-0" /> Total Sales Revenue
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-900 truncate">
              {formatINRFull(stats.totalSpent)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lifetime sales</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <Package size={14} className="text-indigo-600 shrink-0" /> Total Volume Sold
            </div>
            <div className="text-xs sm:text-sm md:text-base font-bold text-slate-900 truncate" title={formatUnitBreakdown(stats.totalUnitsMap)}>
              {formatUnitBreakdown(stats.totalUnitsMap)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Lifetime unit breakdown</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <FileText size={14} className="text-blue-600 shrink-0" /> Invoices Count
            </div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-slate-900 truncate">
              {stats.productInvoices.length} Bills
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Total orders generated</div>
          </div>

          <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] sm:text-xs font-medium mb-0.5">
              <Users size={14} className="text-purple-600 shrink-0" /> Top Buying Customer
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={stats.topCustomer ? stats.topCustomer.name : 'N/A'}>
              {stats.topCustomer ? stats.topCustomer.name : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">
              {stats.topCustomer ? `${stats.topCustomer.quantity} ${stats.topCustomer.unit} (${formatINRFull(stats.topCustomer.amount)})` : 'No data'}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6">

          {/* Chart Style Switcher Header (4 Modes) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/80 p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              <Layers size={16} className="text-indigo-600" /> Chart Style View (4 Modes):
            </div>
            <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200 w-full sm:w-80">
              <button
                type="button"
                onClick={() => setChartStyle('line')}
                className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chartStyle === 'line' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Activity size={14} /> Line
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('bar')}
                className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chartStyle === 'bar' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <BarChart3 size={14} /> Bar
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('pie')}
                className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chartStyle === 'pie' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <PieChart size={14} /> Pie
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('histogram')}
                className={`w-full justify-center px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chartStyle === 'histogram' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <BarChart2 size={14} /> Histogram
              </button>
            </div>
          </div>

          {/* Active Month Info Banner */}
          {activeMonth && (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 p-3 sm:p-4 rounded-xl border border-emerald-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shadow-sm shrink-0">
                  {activeMonth.label.split(' ')[0]}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inspecting Month</div>
                  <div className="text-base font-extrabold text-slate-900">{activeMonth.label}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 w-full sm:w-auto text-xs">
                <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                  <span className="text-slate-400 block text-[9px] font-bold">REVENUE</span>
                  <span className="font-extrabold text-emerald-700 text-xs sm:text-sm truncate block">{formatINRFull(activeMonth.totalSpent)}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                  <span className="text-slate-400 block text-[9px] font-bold">VOLUME SOLD</span>
                  <span className="font-extrabold text-indigo-700 text-xs sm:text-sm truncate block">{formatUnitBreakdown(activeMonth.unitsMap)}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                  <span className="text-slate-400 block text-[9px] font-bold">INVOICES</span>
                  <span className="font-extrabold text-slate-800 text-xs sm:text-sm block">{activeMonth.invoiceCount} Bills</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                  <span className="text-slate-400 block text-[9px] font-bold">AVG BILL SIZE</span>
                  <span className="font-extrabold text-purple-700 text-xs sm:text-sm truncate block">
                    {formatINRFull(activeMonth.invoiceCount > 0 ? activeMonth.totalSpent / activeMonth.invoiceCount : 0)}
                  </span>
                </div>
                {activeMonthTopCustomer && (
                  <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs col-span-2 sm:col-span-1">
                    <span className="text-slate-400 block text-[9px] font-bold">TOP BUYER</span>
                    <span className="font-extrabold text-slate-900 text-xs truncate block" title={activeMonthTopCustomer.name}>
                      {activeMonthTopCustomer.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4 VISUAL CHARTS LAYOUT (2x2 Grid) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Product Sales & Customer Buying Analysis Graphs
              </h3>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Click any month bar to expand itemized breakdown below</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* GRAPH 1: Monthly Product Revenue */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    1. Monthly Product Revenue (₹)
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Sales Trend</span>
                </div>
                <TrendChart
                  data={spendData}
                  maxValue={stats.maxMonthlySpent}
                  colorHex="#10b981"
                  chartStyle={chartStyle}
                  activeKey={hoveredMonthKey || expandedMonthKey}
                  onHover={setHoveredMonthKey}
                  onClick={setExpandedMonthKey}
                  scatterPoints={scatterPoints}
                  histogramBuckets={revenueHistogramBuckets}
                />
              </div>

              {/* GRAPH 2: Customer Volume Trend */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800 truncate">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                    <span>2. Customer Volume Trend</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-600 uppercase bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 shrink-0 whitespace-nowrap">
                    Click to isolate
                  </span>
                </div>
                <CustomerWiseTrendChart
                  monthlyList={stats.monthlyList}
                  topCustomers={stats.customerBreakdown}
                  activeMonthKey={hoveredMonthKey || expandedMonthKey}
                  onHoverMonth={setHoveredMonthKey}
                  onClickMonth={setExpandedMonthKey}
                  chartStyle={chartStyle}
                />
              </div>

              {/* GRAPH 3: Total Monthly Volume Sold */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    3. Total Monthly Volume Sold (Units/Kg/Pkt)
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    {formatUnitBreakdown(stats.totalUnitsMap)}
                  </span>
                </div>
                <TrendChart
                  data={stats.monthlyList.map(m => ({
                    key: m.key,
                    label: m.label,
                    value: m.totalQty,
                    displayValue: formatUnitBreakdown(m.unitsMap)
                  }))}
                  maxValue={stats.maxMonthlyQty}
                  colorHex="#6366f1"
                  chartStyle={chartStyle}
                  activeKey={hoveredMonthKey || expandedMonthKey}
                  onHover={setHoveredMonthKey}
                  onClick={setExpandedMonthKey}
                  scatterPoints={scatterPoints}
                  histogramBuckets={quantityHistogramBuckets}
                />
              </div>

              {/* GRAPH 4: Average Order Value for this product */}
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
                    4. Average Order Value per Bill (₹/Bill)
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Order Size</span>
                </div>
                <TrendChart
                  data={avgData}
                  maxValue={stats.maxMonthlyAvg}
                  colorHex="#ec4899"
                  chartStyle={chartStyle}
                  activeKey={hoveredMonthKey || expandedMonthKey}
                  onHover={setHoveredMonthKey}
                  onClick={setExpandedMonthKey}
                  scatterPoints={scatterPoints}
                  histogramBuckets={avgOrderHistogramBuckets}
                />
              </div>

            </div>
          </div>

          {/* MONTHLY ITEMIZATION & CUSTOMER BREAKDOWN TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Monthly Customer Breakdown Table
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Select any month to inspect customer-wise purchase items and invoice dates</p>
              </div>

              {/* Month Selector Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1.5 sm:pb-0 no-scrollbar scroll-smooth">
                {stats.monthlyList.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setExpandedMonthKey(m.key)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      expandedMonthKey === m.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {m.label} ({formatINRFull(m.totalSpent)})
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Month Content */}
            {expandedMonthKey && (() => {
              const mData = stats.monthlyList.find(m => m.key === expandedMonthKey);
              if (!mData) return <div className="p-6 text-center text-xs text-slate-400">No data for this month</div>;

              return (
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0"></span>
                      <span>{mData.label} Customer Summary</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                      <span className="whitespace-nowrap">Total Revenue: <strong className="text-indigo-700 font-bold">{formatINRFull(mData.totalSpent)}</strong></span>
                      <span className="whitespace-nowrap">Total Volume: <strong className="text-slate-800 font-bold">{formatUnitBreakdown(mData.unitsMap)}</strong></span>
                      <span className="whitespace-nowrap">Invoices: <strong className="text-slate-800 font-bold">{mData.invoiceCount} Bills</strong></span>
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase">
                        <tr>
                          <th className="p-3">Invoice Date</th>
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">City</th>
                          <th className="p-3 text-right">Quantity</th>
                          <th className="p-3 text-right">Rate (₹)</th>
                          <th className="p-3 text-right">Total Amount</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mData.invoiceItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-slate-600 font-medium whitespace-nowrap">{item.date}</td>
                            <td className="p-3 font-bold text-slate-900">{item.customerName}</td>
                            <td className="p-3 text-slate-500">{item.customerCity || '-'}</td>
                            <td className="p-3 text-right font-bold text-indigo-600">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="p-3 text-right text-slate-600">₹{item.rate}</td>
                            <td className="p-3 text-right font-bold text-slate-900">{formatINRFull(item.amount)}</td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const foundInv = invoices.find(inv => inv.id === item.invoiceId);
                                  if (foundInv) setViewingInvoice(foundInv);
                                }}
                                className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-indigo-200"
                              >
                                <Eye size={12} /> View Invoice
                              </button>
                            </td>
                          </tr>
                        ))}
                        {mData.invoiceItems.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-400">No items recorded for this month</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View */}
                  <div className="sm:hidden space-y-2.5">
                    {mData.invoiceItems.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{item.date}</span>
                            <h5 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.customerName}</h5>
                            {item.customerCity && <p className="text-[11px] text-slate-500">📍 {item.customerCity}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-extrabold text-slate-900 block">{formatINRFull(item.amount)}</span>
                            <span className="text-xs font-bold text-indigo-600 block">{item.quantity} {item.unit}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 text-xs">
                          <span className="text-[11px] text-slate-500 font-medium">Rate: ₹{item.rate}/{item.unit}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const foundInv = invoices.find(inv => inv.id === item.invoiceId);
                              if (foundInv) setViewingInvoice(foundInv);
                            }}
                            className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-indigo-200 cursor-pointer"
                          >
                            <Eye size={12} /> View Invoice
                          </button>
                        </div>
                      </div>
                    ))}
                    {mData.invoiceItems.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-400">No items recorded for this month</div>
                    )}
                  </div>

                </div>
              );
            })()}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2 min-w-0">
            <ShoppingBag size={14} className="text-indigo-600 shrink-0" />
            <span className="truncate">Product Sales & Customer Analysis: <strong className="text-slate-800">{product.name}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer shrink-0"
          >
            Close Analysis
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
                  id={`prod-inv-${viewingInvoice.id}`}
                  billNo={viewingInvoice.id}
                  date={viewingInvoice.date}
                  customerName={viewingInvoice.customerName}
                  customerCity={viewingInvoice.customerCity}
                  items={viewingInvoice.items}
                  settings={settings || { businessName: 'INVOICE', address: '', phone: '', email: '', gstNo: '' }}
                  gstRate={viewingInvoice.gstRate}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
