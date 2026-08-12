import React, { useState, useMemo } from 'react';
import { Invoice, Product, Customer } from '../types';
import { CustomerSpendingModal } from './CustomerSpendingModal';
import { ProductAnalysisModal } from './ProductAnalysisModal';
import { GoogleGenAI, Type } from "@google/genai";
import {
  BarChart3,
  TrendingUp,
  Users,
  Wallet,
  Sparkles,
  AlertCircle,
  Lightbulb,
  RefreshCw,
  PieChart as PieIcon,
  TrendingDown,
  Calendar,
  Target,
  Package,
  Search
} from 'lucide-react';

interface AnalyticsDashboardProps {
  invoices: Invoice[];
  products: Product[];
  customers: Customer[];
  onAiRequest?: () => void;
  enablePaymentTracking?: boolean;
}

interface AIAnalysisResult {
  business_health: string;
  top_performing_product_insight: string;
  customer_behavior_insight: string;
  actionable_tips: string[];
  sales_forecast?: string;
  growth_trends?: string;
  seasonal_patterns?: string;
  inventory_insights?: string;
  customer_segments?: string;
  forecast_revenue?: number;
  growth_percentage?: number;
  top_selling_days?: string[];
  high_value_customer_count?: number;
  low_stock_items?: string[];
  // Smart business-aware fields
  business_type?: string;
  predicted_top_products?: string[];
  churn_risk_customers?: string[];
  confidence_level?: string;
  business_kpi_label?: string;
  business_kpi_value?: string;
  seasonal_adjustment?: string;
  order_frequency_trend?: string;
}

type AIChartSpec =
  | {
    type: 'bar';
    title: string;
    data: { dateStr: string; revenue: number }[];
  }
  | {
    type: 'pie';
    title: string;
    data: { name: string; value: number; weight?: number }[];
    showWeight?: boolean;
  }
  | {
    type: 'progress';
    title: string;
    valuePrefix?: string;
    bars: { label: string; value: number; meta?: string }[];
  };

type AIQAResult = {
  language: 'en' | 'gu';
  answer: string;
  charts?: AIChartSpec[];
};

type AIChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  charts?: AIChartSpec[];
};

const COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#2563eb', '#7c3aed'];

type RevenueRange = '10d' | 'month' | 'year' | 'till';

const formatDayLabel = (ts: number) => {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};

const formatMonthLabel = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
};

const aggregateMonthlyWithFill = (
  items: { timestamp: number; revenue: number }[],
  year: number
) => {
  const bucket: Record<number, number> = {};
  items.forEach(item => {
    const d = new Date(item.timestamp);
    if (d.getFullYear() !== year) return;
    const month = d.getMonth();
    bucket[month] = (bucket[month] || 0) + item.revenue;
  });

  return Array.from({ length: 12 }, (_, m) => {
    const ts = new Date(year, m, 1).getTime();
    return { dateStr: formatMonthLabel(ts), revenue: bucket[m] || 0 };
  });
};

const aggregateYearlyWithFill = (items: { timestamp: number; revenue: number }[]) => {
  if (items.length === 0) return [] as { dateStr: string; revenue: number }[];
  const years = items.map(i => new Date(i.timestamp).getFullYear());
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const bucket: Record<number, number> = {};
  items.forEach(item => {
    const y = new Date(item.timestamp).getFullYear();
    bucket[y] = (bucket[y] || 0) + item.revenue;
  });

  const result: { dateStr: string; revenue: number }[] = [];
  for (let y = minYear; y <= maxYear; y += 1) {
    result.push({ dateStr: String(y), revenue: bucket[y] || 0 });
  }
  return result;
};

const getRevenueChartData = (
  items: { dateStr: string; timestamp: number; revenue: number }[],
  range: RevenueRange
) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  const startOf10Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9).getTime();

  let filtered = items;
  if (range === '10d') filtered = items.filter(i => i.timestamp >= startOf10Days);
  if (range === 'month') filtered = items.filter(i => i.timestamp >= startOfMonth);
  if (range === 'year') filtered = items.filter(i => i.timestamp >= startOfYear);
  if (range === 'till') filtered = items;

  if (range === '10d' || range === 'month') {
    return filtered.map(i => ({ dateStr: formatDayLabel(i.timestamp), revenue: i.revenue }));
  }

  if (range === 'year') {
    return aggregateMonthlyWithFill(items, now.getFullYear());
  }

  return aggregateYearlyWithFill(items);
};

const formatCompactNumber = (value: number): string => {
  const abs = Math.abs(value);

  const trim = (s: string) => s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  const withSuffix = (unit: number, suffix: string) => {
    const v = value / unit;
    const av = Math.abs(v);
    const decimals = av >= 100 ? 0 : av >= 10 ? 1 : 2;
    return `${trim(v.toFixed(decimals))}${suffix}`;
  };

  if (!isFinite(value)) return '0';
  if (abs < 1000) return Math.round(value).toLocaleString('en-IN');
  if (abs < 100000) return withSuffix(1000, 'K');
  if (abs < 10000000) return withSuffix(100000, 'L');
  return withSuffix(10000000, 'Cr');
};

const formatINRCompact = (amount: number): string => `₹${formatCompactNumber(amount)}`;
const formatINRFull = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

const TooltipValue = ({
  display,
  full,
  align = 'center',
  className = ''
}: {
  display: string;
  full: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) => {
  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  return (
    <span className={`relative inline-flex items-center ${className} group`} tabIndex={0}>
      <span className="whitespace-nowrap">{display}</span>
      <span
        className={`absolute ${alignClass} bottom-full mb-1 hidden group-hover:block group-focus:block group-active:block bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-50 max-w-[90vw] break-words`}
      >
        {full}
      </span>
    </span>
  );
};

// Helper to normalize unit names dynamically across businesses (Sq Ft, Pcs, Kg, Meters, Ltr, etc.)
const normalizeUnitName = (rawUnit?: string, packing?: string): string => {
  let u = (rawUnit || '').trim().toLowerCase();
  if (!u && packing) {
    const text = packing.toLowerCase().trim();
    const match = text.match(/^(?:\d+(?:\.\d+)?)\s*([a-z]+)/);
    if (match) u = match[1];
  }
  if (['sqft', 'sq ft', 'sq.ft', 'ft', 'feet', 'square feet', 'sq-ft', 'sqft.'].includes(u)) return 'Sq Ft';
  if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'num', 'unit', 'units'].includes(u)) return 'Pcs';
  if (['kg', 'kilos', 'kilogram', 'kilograms'].includes(u)) return 'Kg';
  if (['gm', 'g', 'gram', 'grams'].includes(u)) return 'Gm';
  if (['meter', 'meters', 'mtr', 'm'].includes(u)) return 'Meters';
  if (['roll', 'rolls'].includes(u)) return 'Rolls';
  if (['box', 'boxes', 'pkt', 'packet', 'packets'].includes(u)) return 'Boxes';
  if (['ltr', 'liter', 'litres', 'l', 'ml'].includes(u)) return 'Ltr';
  if (!u) return 'Pcs';
  return (rawUnit || u).trim().charAt(0).toUpperCase() + (rawUnit || u).trim().slice(1);
};

const formatVolumeSummary = (unitsMap?: Record<string, number>): { text: string; dominantUnit: string; totalQty: number } => {
  if (!unitsMap) return { text: '', dominantUnit: 'Pcs', totalQty: 0 };
  const entries = Object.entries(unitsMap).filter(([_, qty]) => qty > 0);
  if (entries.length === 0) return { text: '', dominantUnit: 'Pcs', totalQty: 0 };

  entries.sort((a, b) => b[1] - a[1]);
  const dominantUnit = entries[0][0];
  const totalQty = entries.reduce((sum, [_, q]) => sum + q, 0);

  const text = entries
    .map(([unit, qty]) => `${qty % 1 === 0 ? qty.toLocaleString('en-IN') : qty.toFixed(1)} ${unit}`)
    .join(' + ');

  return { text, dominantUnit, totalQty };
};

const getVolumeIcon = (unit: string) => {
  const u = (unit || '').toLowerCase();
  if (['sq ft', 'meters', 'roll', 'rolls'].includes(u)) return '📐';
  if (['kg', 'gm', 'ltr'].includes(u)) return '⚖️';
  return '📦';
};

// --- Auto Business Type Detection Engine ---
const BUSINESS_KEYWORDS: Record<string, { keywords: string[]; unitSignals: string[]; label: string }> = {
  printing: {
    keywords: ['flex', 'banner', 'poster', 'vinyl', 'board', 'sunboard', 'standee', 'hoarding', 'sticker', 'sign', 'backlit', 'frontlit', 'acp', 'led sign', 'glow sign', 'canopy', 'wrap', 'print'],
    unitSignals: ['sq ft', 'sqft'],
    label: 'Printing & Signage'
  },
  grocery: {
    keywords: ['rice', 'dal', 'sugar', 'oil', 'spice', 'masala', 'atta', 'flour', 'salt', 'tea', 'coffee', 'ghee', 'turmeric', 'chilli', 'cumin', 'coriander'],
    unitSignals: ['kg', 'gm'],
    label: 'Grocery & Spices'
  },
  textile: {
    keywords: ['fabric', 'cloth', 'silk', 'cotton', 'polyester', 'saree', 'suit', 'dress', 'material', 'curtain', 'linen'],
    unitSignals: ['meters', 'mtr'],
    label: 'Textile & Fabrics'
  },
  retail: {
    keywords: ['pipe', 'wire', 'fitting', 'switch', 'bulb', 'socket', 'screw', 'nail', 'paint', 'cement', 'tool', 'hardware'],
    unitSignals: ['pcs', 'boxes'],
    label: 'Retail & Hardware'
  },
  liquid: {
    keywords: ['water', 'juice', 'drink', 'beverage', 'milk', 'chemical', 'solvent', 'detergent', 'acid'],
    unitSignals: ['ltr', 'ml'],
    label: 'Liquids & Beverages'
  }
};

const detectBusinessType = (invoices: Invoice[], volumeMap: Record<string, number>): { type: string; confidence: string } => {
  const scores: Record<string, number> = {};

  // Score by product name keywords
  const allItemNames = new Set<string>();
  invoices.forEach(inv => {
    (inv.items || []).forEach(item => allItemNames.add((item.name || '').toLowerCase()));
  });
  const nameStr = Array.from(allItemNames).join(' ');

  for (const [key, config] of Object.entries(BUSINESS_KEYWORDS)) {
    scores[key] = 0;
    config.keywords.forEach(kw => {
      if (nameStr.includes(kw)) scores[key] += 3;
    });
  }

  // Score by dominant volume units
  const sortedUnits = Object.entries(volumeMap).sort((a, b) => b[1] - a[1]);
  const dominantUnit = sortedUnits.length > 0 ? sortedUnits[0][0].toLowerCase() : '';

  for (const [key, config] of Object.entries(BUSINESS_KEYWORDS)) {
    config.unitSignals.forEach(sig => {
      if (dominantUnit.includes(sig)) scores[key] += 5;
    });
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] === 0) {
    return { type: 'General Business', confidence: 'Low' };
  }

  const topScore = sorted[0][1];
  const secondScore = sorted.length > 1 ? sorted[1][1] : 0;
  const confidence = topScore >= 8 ? 'High' : topScore >= 4 ? 'Medium' : 'Low';
  const gap = topScore - secondScore;

  return {
    type: BUSINESS_KEYWORDS[sorted[0][0]]?.label || 'General Business',
    confidence: gap >= 4 ? confidence : (confidence === 'High' ? 'Medium' : 'Low')
  };
};

// --- Rich AI Data Summary Builder ---
const buildAIDataSummary = (
  invoices: Invoice[],
  stats: any,
  businessType: string,
  isPrediction: boolean
) => {
  // Monthly revenue trend (last 12 months)
  const monthlyRevenue: Record<string, number> = {};
  const monthlyOrders: Record<string, number> = {};
  const dayOfWeekRevenue: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  invoices.forEach(inv => {
    const parts = (inv.date || '').split('/');
    const d = parts.length === 3 ? new Date(+parts[2], +parts[1] - 1, +parts[0]) : new Date(inv.date);
    if (!isNaN(d.getTime())) {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + (Number(inv.total) || 0);
      monthlyOrders[monthKey] = (monthlyOrders[monthKey] || 0) + 1;
      const dayName = dayNames[d.getDay()];
      dayOfWeekRevenue[dayName] = (dayOfWeekRevenue[dayName] || 0) + (Number(inv.total) || 0);
    }
  });

  // Sort monthly data chronologically
  const monthlyTrend = Object.entries(monthlyRevenue)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, revenue]) => ({
      month,
      revenue: Math.round(revenue),
      orders: monthlyOrders[month] || 0,
      avgOrderValue: monthlyOrders[month] ? Math.round(revenue / monthlyOrders[month]) : 0
    }));

  // Top 10 products with volume data
  const topProducts = (stats.topProducts || []).slice(0, 10).map((p: any) => {
    const vol = formatVolumeSummary(p.unitsMap);
    const avgRate = vol.totalQty > 0 ? Math.round(p.amount / vol.totalQty) : 0;
    return {
      name: p.name,
      revenue: Math.round(p.amount),
      volume: vol.text,
      unit: vol.dominantUnit,
      avgRate: avgRate,
      orderCount: p.invoiceCount
    };
  });

  // Top 10 customers with recency
  const topCustomers = (stats.topCustomers || []).slice(0, 10).map((c: any) => {
    const vol = formatVolumeSummary(c.unitsMap);
    return {
      name: c.name,
      totalSpent: Math.round(c.totalSpent),
      orders: c.invoiceCount,
      lastPurchase: c.lastPurchase,
      volume: vol.text
    };
  });

  // Volume summary
  const volSummary = formatVolumeSummary(stats.totalBusinessVolumeMap);

  // Payment stats (if available)
  let paymentInfo = '';
  const totalPaid = invoices.reduce((sum, inv) => {
    const paid = (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return sum + paid;
  }, 0);
  const totalBilled = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  if (totalPaid > 0) {
    paymentInfo = `Collection rate: ${((totalPaid / totalBilled) * 100).toFixed(1)}% (₹${Math.round(totalPaid).toLocaleString()} of ₹${Math.round(totalBilled).toLocaleString()} collected)`;
  }

  return {
    businessType,
    totalRevenue: Math.round(stats.totalRevenue),
    totalBills: stats.totalBills,
    avgBillValue: Math.round(stats.avgBillValue),
    totalCustomers: stats.totalCustomers,
    repeatCustomers: stats.repeatCustomers,
    repeatPurchaseRate: stats.repeatPurchaseRate?.toFixed(1) + '%',
    dominantUnit: volSummary.dominantUnit,
    totalVolume: volSummary.text,
    monthlyTrend,
    dayOfWeekRevenue,
    topProducts,
    topCustomers,
    paymentInfo,
    dataSpanMonths: monthlyTrend.length,
    isPredictionMode: isPrediction
  };
};

// --- Simple Custom Charts (No Recharts Dependency) ---

const SimpleBarChart = ({ data }: { data: { dateStr: string, revenue: number }[] }) => {
  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">No data</div>;

  const maxVal = Math.max(...data.map(d => d.revenue));

  return (
    <div className="h-full w-full overflow-x-auto pb-2">
      <div className="h-full flex items-end justify-between gap-2 pt-10 px-2 min-w-[300px] md:min-w-0">
        {data.map((d, i) => {
          const heightPercent = maxVal > 0 ? (d.revenue / maxVal) * 100 : 0;
          const isNearTop = heightPercent > 75;
          const isLeftBoundary = i < 3;
          const isRightBoundary = i >= data.length - 3;
          const horizontalPosClass = isLeftBoundary
            ? 'left-0 translate-x-0'
            : isRightBoundary
            ? 'right-0 translate-x-0'
            : 'left-1/2 -translate-x-1/2';

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end min-w-[20px]">
              {/* Tooltip */}
              <div
                className={`absolute transition-opacity opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-xs font-bold rounded py-1 px-2 whitespace-nowrap z-30 pointer-events-none ${horizontalPosClass} shadow-md ${
                  isNearTop ? 'top-1' : 'bottom-full mb-1.5'
                }`}
              >
                {d.dateStr}: {formatINRFull(d.revenue)}
              </div>

              <div
                className="w-full bg-red-500 rounded-t hover:bg-red-600 transition-all relative"
                style={{ height: `${heightPercent}%`, minHeight: '4px' }}
              ></div>
              <div className="text-[10px] text-slate-500 truncate w-full text-center">{d.dateStr.split('/')[0]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function getArcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngleDeg: number, endAngleDeg: number) {
  const startRad = (startAngleDeg - 90) * (Math.PI / 180);
  const endRad = (endAngleDeg - 90) * (Math.PI / 180);

  const x1 = cx + rOuter * Math.cos(startRad);
  const y1 = cy + rOuter * Math.sin(startRad);
  const x2 = cx + rOuter * Math.cos(endRad);
  const y2 = cy + rOuter * Math.sin(endRad);

  const x3 = cx + rInner * Math.cos(endRad);
  const y3 = cy + rInner * Math.sin(endRad);
  const x4 = cx + rInner * Math.cos(startRad);
  const y4 = cy + rInner * Math.sin(startRad);

  const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
    'Z'
  ].join(' ');
}

const SimplePieChart = ({
  data,
  showWeight,
  showLegend = true
}: {
  data: { name: string; value: number; weight?: number; unitLabel?: string }[];
  showWeight?: boolean;
  showLegend?: boolean;
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">No data</div>;

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  let currentAngle = 0;

  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    currentAngle = end;
    const color = COLORS[i % COLORS.length];
    const pct = ((d.value / total) * 100).toFixed(1);
    return { ...d, start, end, color, pct, index: i };
  });

  const activeItem = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-center gap-3 md:gap-8 py-1 select-none">
      {/* Pie SVG */}
      <div className={`${showLegend ? 'w-32 h-32 md:w-44 md:h-44' : 'w-24 h-24 sm:w-28 sm:h-28'} relative flex items-center justify-center flex-shrink-0`}>
        <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
          {slices.map((slice) => {
            if (slice.end - slice.start < 0.1) return null;
            const isHovered = hoveredIdx === slice.index;
            const rOut = isHovered ? 96 : 90;
            const rIn = isHovered ? 48 : 52;
            const pathD = getArcPath(100, 100, rOut, rIn, slice.start, slice.end);

            return (
              <g key={slice.index}>
                <path
                  d={pathD}
                  fill={slice.color}
                  opacity={hoveredIdx === null || isHovered ? 1 : 0.55}
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(slice.index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <title>{`${slice.name}: ${formatINRFull(slice.value)} (${slice.pct}%)`}</title>
                </path>
              </g>
            );
          })}

          {/* SVG Donut Hole Center Circle & Info */}
          <circle cx="100" cy="100" r="48" fill="#ffffff" stroke="#f1f5f9" strokeWidth="1" className="pointer-events-none shadow-sm" />
          {activeItem ? (
            <g className="pointer-events-none select-none">
              <text x="100" y="86" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={activeItem.color} className="uppercase">
                {activeItem.name.length > 13 ? activeItem.name.slice(0, 11) + '…' : activeItem.name}
              </text>
              <text x="100" y="103" textAnchor="middle" fontSize="11" fontWeight="900" fill="#0f172a">
                {formatINRFull(activeItem.value)}
              </text>
              <text x="100" y="117" textAnchor="middle" fontSize="8" fontWeight="700" fill="#64748b">
                {activeItem.pct}% {showWeight && (activeItem.unitLabel || (activeItem.weight ? `${activeItem.weight} Units` : '')) ? `(${activeItem.unitLabel || `${activeItem.weight} Units`})` : ''}
              </text>
            </g>
          ) : (
            <g className="pointer-events-none select-none">
              <text x="100" y="92" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" className="uppercase">
                Total
              </text>
              <text x="100" y="110" textAnchor="middle" fontSize="12" fontWeight="900" fill="#1e293b">
                {formatINRFull(total)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="w-full md:w-auto px-2 md:px-4">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-x-3 gap-y-2 md:gap-2 w-full md:w-auto max-h-60 overflow-y-auto pr-1.5 scrollbar-thin">
            {slices.map((d) => {
              const isHovered = hoveredIdx === d.index;
              const displayVol = d.unitLabel || (d.weight ? `${d.weight} Units` : '');

              return (
                <div
                  key={d.index}
                  onMouseEnter={() => setHoveredIdx(d.index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center gap-2 text-[10px] md:text-xs p-1.5 rounded-lg cursor-pointer transition-colors ${
                    isHovered ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-2.5 md:w-3 h-2.5 md:h-3 rounded-full flex-shrink-0 shadow-xs" style={{ background: d.color }}></div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-slate-700 font-bold truncate" title={d.name}>{d.name}</span>
                    <span className="text-slate-500 font-semibold break-all">
                      {formatINRFull(d.value)} <span className="text-[9px] text-slate-400 font-normal">({d.pct}%)</span>
                    </span>
                    {showWeight && displayVol && (
                      <span className="text-slate-500 font-medium text-[9px] md:text-[10px]">{displayVol}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
// Metric Card Component for Visual Stats
const MetricCard = ({ icon, title, value, subtitle, trend, color }: {
  icon: React.ReactNode,
  title: string,
  value: string | number,
  subtitle?: string,
  trend?: 'up' | 'down' | 'neutral',
  color: string
}) => (
  <div className={`bg-gradient-to-br ${color} p-4 rounded-xl shadow-md border border-white/20`}>
    <div className="flex items-start justify-between mb-2">
      <div className="p-2 bg-white/20 rounded-lg">
        {icon}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'up' ? 'text-green-300' : trend === 'down' ? 'text-red-300' : 'text-white/70'
          }`}>
          {trend === 'up' && <TrendingUp size={14} />}
          {trend === 'down' && <TrendingDown size={14} />}
        </div>
      )}
    </div>
    <div className="text-2xl md:text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-xs font-medium text-white/90">{title}</div>
    {subtitle && <div className="text-xs text-white/70 mt-1">{subtitle}</div>}
  </div>
);

// Progress Bar Component
const ProgressBar = ({
  label,
  value,
  max,
  color,
  valuePrefix = '₹',
  meta
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  valuePrefix?: string;
  meta?: string;
}) => {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-start text-xs gap-2">
        <span className="text-slate-600 font-medium truncate flex-1">{label}</span>
        <div className="text-right flex flex-col items-end">
          <span className="text-slate-900 font-bold break-all" title={`${valuePrefix}${Math.round(value).toLocaleString('en-IN')}`}>
            {valuePrefix}{Math.round(value).toLocaleString('en-IN')}
          </span>
          {meta && <span className="text-[10px] text-slate-500 whitespace-nowrap">{meta}</span>}
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};
export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ invoices, products, customers, onAiRequest, enablePaymentTracking = true }) => {
  // State for global filters
  const [timeFilter, setTimeFilter] = useState<string>('month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<Customer | null>(null);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [cachedPrediction, setCachedPrediction] = useState<AIAnalysisResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string>('');

  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string>('');
  const [qaInput, setQaInput] = useState('');
  const [chat, setChat] = useState<AIChatMessage[]>([]);

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  // --- Date Parsing Helper ---
  const parseInvoiceDate = (dateStr: string): number => {
    let timestamp = 0;
    if (!dateStr) return 0;

    // Try DD/MM/YYYY
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(s => parseInt(s.trim(), 10));
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          timestamp = new Date(y, m - 1, d).getTime();
        }
      }
    }
    // Try YYYY-MM-DD
    else if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        if (parts[0].trim().length === 4) {
          const [y, m, d] = parts.map(s => parseInt(s.trim(), 10));
          timestamp = new Date(y, m - 1, d).getTime();
        } else {
          const [d, m, y] = parts.map(s => parseInt(s.trim(), 10));
          timestamp = new Date(y, m - 1, d).getTime();
        }
      }
    }

    if (timestamp === 0 || isNaN(timestamp)) {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) timestamp = parsed;
    }
    return timestamp;
  };

  // --- Filtering Logic ---
  const filteredInvoices = useMemo(() => {
    if (timeFilter === 'all' || timeFilter === 'prediction') return invoices;

    const now = new Date();
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;

    switch (timeFilter) {
      case 'month': // This Month
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
        break;
      case 'year': // This Year
        start = new Date(now.getFullYear(), 0, 1).getTime();
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
        break;
      case 'last-year':
        start = new Date(now.getFullYear() - 1, 0, 1).getTime();
        end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).getTime();
        break;
      case 'custom':
        if (customStart) start = new Date(customStart).getTime();
        if (customEnd) end = new Date(customEnd).setHours(23, 59, 59, 999);
        break;
      default:
        break;
    }

    return invoices.filter(inv => {
      const ts = parseInvoiceDate(inv.date);
      return ts >= start && ts <= end;
    });
  }, [invoices, timeFilter, customStart, customEnd]);

  // --- Local Calculations (Instant) ---
  const stats = useMemo(() => {
    const currentInvoices = filteredInvoices;
    const totalRevenue = currentInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const totalBills = currentInvoices.length;
    const avgBillValue = totalBills > 0 ? totalRevenue / totalBills : 0;

    // Total Business Volume Map (tracks total Sq Ft, Pcs, Kg, Meters, etc.)
    const totalBusinessVolumeMap: Record<string, number> = {};

    // Product Sales Frequency & Volume
    const productSales: Record<string, { amount: number; invoiceCount: number; unitsMap: Record<string, number> }> = {};

    // Customer Analytics & Volume
    const customerData: Record<string, {
      totalSpent: number;
      invoiceCount: number;
      items: Record<string, { quantity: number; amount: number; unitsMap: Record<string, number>; dominantUnit?: string }>;
      lastPurchase: string;
      unitsMap: Record<string, number>;
    }> = {};

    currentInvoices.forEach(inv => {
      const customer = inv.customerName;
      if (!customerData[customer]) {
        customerData[customer] = {
          totalSpent: 0,
          invoiceCount: 0,
          items: {},
          lastPurchase: inv.date,
          unitsMap: {}
        };
      }

      customerData[customer].totalSpent += Number(inv.total) || 0;
      customerData[customer].invoiceCount += 1;

      const currentDate = inv.date;
      if (currentDate > customerData[customer].lastPurchase) {
        customerData[customer].lastPurchase = currentDate;
      }

      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const amt = Number(item.amount) || 0;
          const rawQty = Number(item.quantity) || 0;
          const unitName = normalizeUnitName(item.unit, item.packing);
          let displayQty = rawQty;

          if (unitName === 'Gm' && rawQty >= 1000) {
            displayQty = rawQty / 1000;
          }

          // Business-wide volume map
          totalBusinessVolumeMap[unitName] = (totalBusinessVolumeMap[unitName] || 0) + displayQty;

          // Product volume map
          if (!productSales[item.name]) {
            productSales[item.name] = { amount: 0, invoiceCount: 0, unitsMap: {} };
          }
          productSales[item.name].amount += amt;
          productSales[item.name].invoiceCount += 1;
          productSales[item.name].unitsMap[unitName] = (productSales[item.name].unitsMap[unitName] || 0) + displayQty;

          // Customer item volume map
          if (!customerData[customer].items[item.name]) {
            customerData[customer].items[item.name] = { quantity: 0, amount: 0, unitsMap: {}, dominantUnit: unitName };
          }
          customerData[customer].items[item.name].quantity += rawQty;
          customerData[customer].items[item.name].amount += amt;
          customerData[customer].items[item.name].unitsMap[unitName] = (customerData[customer].items[item.name].unitsMap[unitName] || 0) + displayQty;

          // Customer total volume map
          customerData[customer].unitsMap[unitName] = (customerData[customer].unitsMap[unitName] || 0) + displayQty;
        });
      }
    });

    const topProduct = Object.entries(productSales).sort((a, b) => b[1].amount - a[1].amount)[0];

    // Top customers by revenue (all customers, sorted)
    const topCustomers = Object.entries(customerData)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Customer metrics
    const totalCustomers = topCustomers.length;
    const repeatCustomers = topCustomers.filter(c => c.invoiceCount > 1).length;
    const repeatPurchaseRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
    const avgLTV = totalCustomers > 0
      ? topCustomers.reduce((sum, c) => sum + (Number(c.totalSpent) || 0), 0) / totalCustomers
      : 0;
    const topLTVCustomer = topCustomers[0];

    // Customer frequency chart data (top 5)
    const chartDataCustomers = topCustomers.slice(0, 5).map(c => ({
      name: c.name,
      value: c.totalSpent
    }));

    // --- Chart Data Preparation ---

    // 1. Daily Revenue (Last 7 days or all time)
    const salesByDate: Record<string, number> = {};
    currentInvoices.forEach(inv => {
      if (inv.date) {
        const amount = Number(inv.total) || 0;
        salesByDate[inv.date] = (salesByDate[inv.date] || 0) + amount;
      }
    });

    const chartDataRevenueAll = Object.entries(salesByDate)
      .map(([date, total]) => {
        const timestamp = parseInvoiceDate(date);
        return {
          dateStr: date,
          timestamp: isNaN(timestamp) ? 0 : timestamp,
          revenue: total
        };
      })
      .filter(item => {
        return item.timestamp > 0;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // 2. Product Distribution (Top 5)
    const chartDataProducts = Object.entries(productSales)
      .map(([name, data]) => {
        const vol = formatVolumeSummary(data.unitsMap);
        return {
          name,
          value: data.amount,
          weight: vol.totalQty,
          unitLabel: vol.text
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalRevenue,
      totalBills,
      avgBillValue,
      totalBusinessVolumeMap,
      totalCustomers,
      repeatCustomers,
      repeatPurchaseRate,
      avgLTV,
      topLTVCustomerName: topLTVCustomer ? topLTVCustomer.name : 'N/A',
      topProductName: topProduct ? topProduct[0] : 'N/A',
      topProductValue: topProduct ? topProduct[1].amount : 0,
      chartDataRevenueAll,
      chartDataProducts,
      chartDataCustomers,
      topCustomers,
      topProducts,
      customerData,
      productSales
    };
  }, [filteredInvoices]);

  const chartDataRevenue = useMemo(() => {
    // Determine aggregation based on filter
    const items = stats.chartDataRevenueAll;

    // For Year views (yearly or all time), show Monthly or Yearly
    if (timeFilter === 'year' || timeFilter === 'last-year') {
      const year = timeFilter === 'year' ? new Date().getFullYear() : new Date().getFullYear() - 1;
      return aggregateMonthlyWithFill(items, year);
    }

    if (timeFilter === 'all') {
      return aggregateYearlyWithFill(items);
    }

    // For Month/Custom/Short periods, show Daily
    return items.map(i => ({ dateStr: formatDayLabel(i.timestamp), revenue: i.revenue }));

  }, [stats.chartDataRevenueAll, timeFilter]);

  // --- Payment Analytics Calculations ---
  const paymentStats = useMemo(() => {
    if (!enablePaymentTracking) return null;

    let totalBilled = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    const modeTotals: Record<string, number> = { Cash: 0, UPI: 0, Cheque: 0, 'Bank Transfer': 0, Other: 0 };
    const customerUnpaid: Record<string, { customerName: string; totalBilled: number; totalPaid: number; totalOwed: number; unpaidBills: number; lastDate: string }> = {};

    const now = Date.now();
    const aging = { current: 0, days30: 0, days60: 0, days90Plus: 0 };
    const monthlyCollections: Record<string, number> = {};

    filteredInvoices.forEach(inv => {
      const invTotal = Number(inv.total) || 0;
      totalBilled += invTotal;

      const payments = inv.payments || [];
      const invPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      totalCollected += invPaid;

      const owed = Math.max(0, invTotal - invPaid);

      if (invPaid >= invTotal - 0.5) {
        paidCount++;
      } else if (invPaid > 0) {
        partialCount++;
      } else {
        unpaidCount++;
      }

      payments.forEach(p => {
        const pAmt = Number(p.amount) || 0;
        const mode = p.mode || 'Cash';
        modeTotals[mode] = (modeTotals[mode] || 0) + pAmt;

        if (p.date) {
          const parts = p.date.split('/');
          const monthKey = parts.length === 3 ? `${parts[1]}/${parts[2]}` : p.date;
          monthlyCollections[monthKey] = (monthlyCollections[monthKey] || 0) + pAmt;
        }
      });

      if (inv.customerName) {
        if (!customerUnpaid[inv.customerName]) {
          customerUnpaid[inv.customerName] = {
            customerName: inv.customerName,
            totalBilled: 0,
            totalPaid: 0,
            totalOwed: 0,
            unpaidBills: 0,
            lastDate: inv.date
          };
        }
        customerUnpaid[inv.customerName].totalBilled += invTotal;
        customerUnpaid[inv.customerName].totalPaid += invPaid;
        if (owed > 0.5) {
          customerUnpaid[inv.customerName].totalOwed += owed;
          customerUnpaid[inv.customerName].unpaidBills += 1;
        }
        if (inv.date > customerUnpaid[inv.customerName].lastDate) {
          customerUnpaid[inv.customerName].lastDate = inv.date;
        }
      }

      if (owed > 0.5) {
        const invTs = parseInvoiceDate(inv.date);
        const ageDays = invTs > 0 ? Math.floor((now - invTs) / (1000 * 60 * 60 * 24)) : 0;
        if (ageDays <= 30) aging.current += owed;
        else if (ageDays <= 60) aging.days30 += owed;
        else if (ageDays <= 90) aging.days60 += owed;
        else aging.days90Plus += owed;
      }
    });

    const totalOutstanding = Math.max(0, totalBilled - totalCollected);
    const collectionRate = totalBilled > 0 ? Math.min(100, (totalCollected / totalBilled) * 100) : 0;

    const modeChartData = Object.entries(modeTotals)
      .filter(([_, amt]) => amt > 0)
      .map(([name, amt]) => ({ name, value: amt }));

    const topOverdueCustomers = Object.values(customerUnpaid)
      .sort((a, b) => b.totalOwed - a.totalOwed)
      .slice(0, 5);

    const collectionTrendData = Object.entries(monthlyCollections)
      .map(([dateStr, revenue]) => ({ dateStr, revenue }))
      .slice(-6);

    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      paidCount,
      partialCount,
      unpaidCount,
      modeChartData,
      topOverdueCustomers,
      aging,
      collectionTrendData
    };
  }, [filteredInvoices, enablePaymentTracking]);

  // --- AI Analysis ---
  const generateInsights = async (isPredictionMode = false) => {
    // If prediction mode, we analyze ALL data to forecast future
    // If not prediction mode, analyze currently filtered data
    const useGlobalData = isPredictionMode || timeFilter === 'prediction';
    const dataToAnalyze = useGlobalData ? invoices : filteredInvoices;

    if (dataToAnalyze.length === 0) {
      setError("Not enough data to generate insights. Create some bills first.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Auto-detect business type
      const bizDetection = detectBusinessType(dataToAnalyze, stats.totalBusinessVolumeMap || {});

      // 2. Build rich AI data summary
      const aiSummary = buildAIDataSummary(dataToAnalyze, stats, bizDetection.type, isPredictionMode || timeFilter === 'prediction');
      const summaryJSON = JSON.stringify(aiSummary);

      // 3. Initialize Gemini
      if (!geminiApiKey) {
        setError('Missing Gemini API key. Add VITE_GEMINI_API_KEY in .env.local and restart.');
        return;
      }

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      // Track AI usage for admin
      onAiRequest?.();

      // 4. Build business-aware prompt
      const isPrediction = isPredictionMode || timeFilter === 'prediction';

      const businessContext = `
This is a "${bizDetection.type}" business (detected with ${bizDetection.confidence} confidence).
The primary unit of measurement is "${aiSummary.dominantUnit}".
All volume/quantity insights MUST use this unit ("${aiSummary.dominantUnit}"), NOT Kg or generic units.
For business KPIs, calculate metrics specific to this business type:
- Printing & Signage: Revenue per Sq Ft, avg job size in Sq Ft, popular sizes
- Grocery & Spices: Revenue per Kg, top selling items by weight, restock frequency
- Textile & Fabrics: Revenue per Meter, avg cut length, popular fabric types
- Retail & Hardware: Revenue per piece, fast-moving items, slow movers
- Liquids & Beverages: Revenue per Liter, popular volumes
- General Business: Revenue per unit, order frequency
`;

      const predictionPrompt = isPrediction ? `
PREDICTION MODE: You must focus HEAVILY on FORECASTING next month's performance.
Use the monthly_trend data to identify growth/decline patterns and extrapolate.
Predict:
- forecast_revenue: A specific numeric revenue prediction for next month based on trend analysis
- predicted_top_products: Which 3-5 products will sell most next month (by name)
- churn_risk_customers: Which 2-3 customers haven't ordered recently and may be churning
- confidence_level: "High" if 6+ months of data, "Medium" if 3-5 months, "Low" if <3 months
- seasonal_adjustment: Note any seasonal factors (festivals, weather, end-of-quarter)
- order_frequency_trend: Is order frequency "Increasing", "Stable", or "Declining"?

IMPORTANT: Base forecast_revenue on mathematical trend from monthlyTrend data. If revenue is growing 10% month-over-month, predict accordingly. Do NOT just repeat last month's number.
` : `
REPORT MODE: Provide a comprehensive business health report.
Focus on actionable insights specific to a ${bizDetection.type} business.
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
You are an expert business intelligence analyst specializing in small/medium Indian businesses.
${businessContext}
${predictionPrompt}

Business Intelligence Data:
${summaryJSON}

Analyze all data thoroughly and provide CONCISE, SPECIFIC insights.
Do NOT use generic advice. Reference actual product names, customer names, and numbers from the data.
All monetary values are in Indian Rupees (₹).

Provide response in JSON with these fields:
- "business_health": One specific sentence about business status referencing real numbers
- "business_type": The detected business type ("${bizDetection.type}")
- "sales_forecast": 1-2 sentence forecast with specific numbers
- "forecast_revenue": Predicted next month revenue (numeric, calculated from trend)
- "growth_trends": One sentence growth summary with percentage
- "growth_percentage": Month-over-month growth rate (numeric)
- "seasonal_patterns": One sentence about observed seasonal patterns from data
- "top_selling_days": Array of 3 best performing days/periods
- "customer_behavior_insight": One sentence about buying patterns referencing real customers
- "customer_segments": One sentence about customer segmentation
- "high_value_customer_count": Number of customers contributing >50% revenue
- "top_performing_product_insight": One sentence referencing actual top product with volume in ${aiSummary.dominantUnit}
- "inventory_insights": One sentence about stock/demand trends
- "low_stock_items": Array of 3 items likely to need restocking
- "actionable_tips": Array of 5 brief, specific action items for a ${bizDetection.type} business
- "business_kpi_label": The most relevant KPI name for this business (e.g. "Revenue per ${aiSummary.dominantUnit}")
- "business_kpi_value": The calculated KPI value as a string (e.g. "₹45.2/${aiSummary.dominantUnit}")
- "predicted_top_products": Array of 3-5 product names expected to sell well next month
- "churn_risk_customers": Array of 2-3 customer names who may be at risk of churning
- "confidence_level": "High", "Medium", or "Low" based on data quality/quantity
- "seasonal_adjustment": One sentence about upcoming seasonal factors
- "order_frequency_trend": "Increasing", "Stable", or "Declining"
`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              business_health: { type: Type.STRING },
              business_type: { type: Type.STRING },
              sales_forecast: { type: Type.STRING },
              forecast_revenue: { type: Type.NUMBER },
              growth_trends: { type: Type.STRING },
              growth_percentage: { type: Type.NUMBER },
              seasonal_patterns: { type: Type.STRING },
              top_selling_days: { type: Type.ARRAY, items: { type: Type.STRING } },
              customer_behavior_insight: { type: Type.STRING },
              customer_segments: { type: Type.STRING },
              high_value_customer_count: { type: Type.NUMBER },
              top_performing_product_insight: { type: Type.STRING },
              inventory_insights: { type: Type.STRING },
              low_stock_items: { type: Type.ARRAY, items: { type: Type.STRING } },
              actionable_tips: { type: Type.ARRAY, items: { type: Type.STRING } },
              business_kpi_label: { type: Type.STRING },
              business_kpi_value: { type: Type.STRING },
              predicted_top_products: { type: Type.ARRAY, items: { type: Type.STRING } },
              churn_risk_customers: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence_level: { type: Type.STRING },
              seasonal_adjustment: { type: Type.STRING },
              order_frequency_trend: { type: Type.STRING }
            },
            required: ["business_health", "customer_behavior_insight", "top_performing_product_insight", "actionable_tips"]
          }
        }
      });

      // 5. Parse Response
      if (response.text) {
        const result = JSON.parse(response.text) as AIAnalysisResult;
        setAnalysis(result);
        if (useGlobalData) {
          setCachedPrediction(result);
        }
      } else {
        setError("AI could not generate a response. Please try again.");
      }

    } catch (err) {
      console.error(err);
      setError("Failed to generate insights. Please check your API key configuration.");
    } finally {
      setLoading(false);
    }
  };

  const generateFallbackCharts = (userQuestion: string): AIChartSpec[] => {
    const q = userQuestion.toLowerCase();
    const isProductQuery = /product|item|selling|goods|માલ|પ્રોડક્ટ|આઇટમ/.test(q);
    const isCustomerQuery = /customer|buyer|client|ખરીદે|ગ્રાહક|પાર્ટી/.test(q);
    const isRevenueQuery = /revenue|sales|date|day|daily|trend|મહિના|વેચાણ|આવક|ચાર્ટ|ગ્રાફ/.test(q);

    const resultCharts: AIChartSpec[] = [];

    if (isProductQuery) {
      if (stats.chartDataProducts.length > 0) {
        resultCharts.push({
          type: 'pie',
          title: 'Top Product Revenue Distribution',
          showWeight: true,
          data: stats.chartDataProducts.map(p => ({ name: p.name, value: p.value, weight: p.weight }))
        });
      }
    }

    if (isCustomerQuery) {
      if (stats.chartDataCustomers.length > 0) {
        resultCharts.push({
          type: 'progress',
          title: 'Top Customer Spending Breakdown',
          valuePrefix: '₹',
          bars: stats.chartDataCustomers.map(c => ({ label: c.name, value: c.value }))
        });
      }
    }

    if (isRevenueQuery || resultCharts.length === 0) {
      if (stats.chartDataRevenueAll.length > 0) {
        resultCharts.push({
          type: 'bar',
          title: 'Daily Revenue & Invoicing Activity Trend',
          data: stats.chartDataRevenueAll.slice(-14).map(d => ({ dateStr: d.dateStr, revenue: d.revenue }))
        });
      }
      if (resultCharts.length === 1 && stats.chartDataProducts.length > 0 && !isRevenueQuery) {
        resultCharts.push({
          type: 'pie',
          title: 'Product Sales Share',
          showWeight: true,
          data: stats.chartDataProducts.map(p => ({ name: p.name, value: p.value, weight: p.weight }))
        });
      }
    }

    return resultCharts;
  };

  const askBillsQuestion = async (overridePrompt?: string) => {
    const question = (overridePrompt || qaInput).trim();
    if (!question) return;
    if (invoices.length === 0) {
      setQaError('Not enough data. Create some bills first.');
      return;
    }
    if (!geminiApiKey) {
      setQaError('Missing Gemini API key. Add VITE_GEMINI_API_KEY in .env.local and restart.');
      return;
    }

    setQaLoading(true);
    setQaError('');

    const nextChat = [...chat, { role: 'user' as const, text: question }];
    setChat(nextChat);
    setQaInput('');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      // Track AI usage for admin
      onAiRequest?.();

      const recentInvoices = invoices.slice(-200).map(inv => ({
        date: inv.date,
        total: Number(inv.total) || 0,
        customer: inv.customerName,
        city: inv.customerCity,
        items: (inv.items || []).map(i => ({
          name: i.name,
          qty: i.quantity,
          unit: i.unit,
          amount: Number(i.amount) || 0,
          packing: i.packing || ''
        }))
      }));

      const metricsContext = {
        total_revenue: stats.totalRevenue,
        total_bills: stats.totalBills,
        aov: stats.avgBillValue,
        repeat_purchase_rate_percent: stats.repeatPurchaseRate,
        avg_ltv: stats.avgLTV,
        total_customers: stats.totalCustomers,
        total_kg_sold: (stats.totalWeightGramsSold || 0) / 1000,
        top_products_by_revenue: stats.chartDataProducts,
        top_customers_by_revenue: stats.chartDataCustomers,
        daily_revenue_trend: stats.chartDataRevenueAll.slice(-14)
      };

      const chatHistory = chat.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `
      You are an expert business intelligence & billing analytics assistant.

      CRITICAL language rules:
      - If user asks in Gujarati (ગુજરાતી script), answer in Gujarati.
      - If user asks in Gujarati using English letters (Gujarati WhatsApp Latin), still answer in proper Gujarati script.
      - Otherwise answer in English.

      CHART GENERATION MANDATE:
      - ALWAYS return populated chart objects in the "charts" array whenever user asks for ANY chart, graph, plot, trend, visual, breakdown, top products, top customers, or mentions keywords like "chart", "graph", "plot", "show chart", "build chart", "ચાર્ટ", "ગ્રાફ", "વેચાણ".
      - IMPORTANT: "charts" must contain AT MOST 1 or 2 high-level chart specification objects total (e.g. 1 "bar" chart for revenue trend, 1 "pie" chart for products). DO NOT return individual data rows as separate chart objects!

      Available chart types:
      - bar: dateStr + revenue
      - pie: name + value (+ optional weight grams)
      - progress: list of bars with label/value/meta

      Business data context (aggregates):
      ${JSON.stringify(metricsContext)}

      Recent bills (latest first; up to 200):
      ${JSON.stringify(recentInvoices)}

      Chat history (latest first):
      ${chatHistory}

      User question:
      ${question}
        `,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              language: { type: Type.STRING, description: 'en or gu' },
              answer: { type: Type.STRING },
              charts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    title: { type: Type.STRING },
                    showWeight: { type: Type.BOOLEAN },
                    valuePrefix: { type: Type.STRING },
                    data: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          value: { type: Type.NUMBER },
                          weight: { type: Type.NUMBER },
                          dateStr: { type: Type.STRING },
                          revenue: { type: Type.NUMBER }
                        }
                      }
                    },
                    bars: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          value: { type: Type.NUMBER },
                          meta: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ['language', 'answer']
          }
        }
      });

      const parsed: AIQAResult = response.text ? JSON.parse(response.text) : { language: 'en', answer: 'No response.' };
      let rawCharts = parsed.charts || [];

      // Filter and sanitize charts: keep only objects with valid array data/bars
      let finalCharts = (rawCharts as any[]).filter(c => c && typeof c === 'object' && ((Array.isArray(c.data) && c.data.length > 0) || (Array.isArray(c.bars) && c.bars.length > 0))) as AIChartSpec[];

      // Deduplicate by chart title & type, limit to max 2 charts per AI response
      const seen = new Set<string>();
      finalCharts = finalCharts.filter(c => {
        const key = `${(c.type || 'bar').toLowerCase()}_${c.title || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 2);

      // Check if user specifically requested a chart/graph or if Gemini returned no valid charts
      const isChartRequest = /chart|graph|plot|visualize|breakdown|trend|compare|show|ચાર્ટ|ગ્રાફ|બતાવો/.test(question.toLowerCase());
      if (isChartRequest && finalCharts.length === 0) {
        finalCharts = generateFallbackCharts(question);
      }

      setChat(prev => [...prev, { role: 'assistant', text: parsed.answer, charts: finalCharts }]);
    } catch (e) {
      console.error('Gemini Q&A error:', e);
      let errMsg = 'Failed to answer. Check API key and try again.';
      if (e && typeof e === 'object') {
        if ('message' in e) errMsg += `\n${(e as any).message}`;
        if ('response' in e && (e as any).response?.data) errMsg += `\n${JSON.stringify((e as any).response.data)}`;
      }
      setQaError(errMsg);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-3 md:p-5 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 shrink-0">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-violet-600 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-base md:text-2xl font-bold text-slate-800 truncate">Analytics Dashboard</h2>
                <p className="text-[10px] md:text-xs text-slate-500">Real-time insights</p>
              </div>
            </div>
            <div className="bg-white px-2 md:px-3 py-1.5 md:py-2 rounded-lg shadow-sm border border-slate-200 shrink-0">
              <div className="text-sm md:text-2xl font-bold text-violet-600">{invoices.length}</div>
              <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold">Bills</div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
          <div className="space-y-4 md:space-y-6">
            {/* --- Global Filter Bar (Zero Right Scroll: 3-Col Mobile Grid / Desktop Flex Row) --- */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-white/95 backdrop-blur-md p-2.5 md:p-3 rounded-xl border border-slate-200 shadow-xs sticky top-0 z-20">
              <div className="grid grid-cols-3 md:flex md:items-center gap-1.5 w-full md:w-auto select-none">
                {[
                  { id: 'month', label: 'Month', fullLabel: 'This Month', icon: '🗓️' },
                  { id: 'last-month', label: 'Last Month', fullLabel: 'Last Month', icon: '📅' },
                  { id: 'prediction', label: 'Prediction', fullLabel: 'AI Prediction', icon: '✨', special: true },
                  { id: 'year', label: 'This Year', fullLabel: 'This Year', icon: '📈' },
                  { id: 'last-year', label: 'Last Year', fullLabel: 'Last Year', icon: '📊' },
                  { id: 'all', label: 'All Time', fullLabel: 'All Time', icon: '🌐' },
                  { id: 'custom', label: 'Custom Date', fullLabel: 'Custom Date Range', icon: '📆', fullWidthMobile: true },
                ].map((opt) => {
                  const isActive = timeFilter === opt.id;
                  const isSpecial = opt.special;
                  const isFullWidthMobile = opt.fullWidthMobile;

                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTimeFilter(opt.id)}
                      className={`px-2 md:px-3 py-1.5 text-[11px] md:text-xs font-bold rounded-lg md:rounded-full transition-all flex items-center justify-center gap-1 cursor-pointer text-center ${
                        isFullWidthMobile ? 'col-span-3 md:col-span-1' : ''
                      } ${
                        isActive
                          ? isSpecial
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md ring-2 ring-purple-200'
                            : 'bg-violet-600 text-white shadow-md ring-2 ring-violet-200'
                          : isSpecial
                          ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
                      }`}
                    >
                      <span className="text-xs">{opt.icon}</span>
                      <span className="md:hidden truncate">{opt.label}</span>
                      <span className="hidden md:inline whitespace-nowrap">{opt.fullLabel}</span>
                    </button>
                  );
                })}
              </div>

              {timeFilter === 'custom' && (
                <div className="flex items-center gap-2 w-full md:w-auto bg-slate-50 p-1.5 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2 md:slide-in-from-right-4">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 w-full md:w-auto"
                  />
                  <span className="text-slate-400 font-bold">-</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 w-full md:w-auto"
                  />
                </div>
              )}
            </div>


            {timeFilter === 'prediction' && (
              <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 text-white p-3.5 rounded-xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur-xs flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm sm:text-base flex flex-wrap items-center gap-2">
                      <span>Next Month Prediction Mode Active</span>
                      {cachedPrediction?.forecast_revenue ? (
                        <span className="bg-yellow-400 text-slate-900 text-xs font-black px-2 py-0.5 rounded-full shadow-xs">
                          Forecasted Revenue: {formatINRFull(cachedPrediction.forecast_revenue)}
                        </span>
                      ) : (
                        <span className="bg-purple-900/60 text-purple-200 text-xs font-bold px-2 py-0.5 rounded-full border border-purple-400/30">
                          Baseline Sales Loaded
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-purple-100 font-medium mt-0.5">
                      {cachedPrediction
                        ? "Showing session-cached prediction insights. Click Redo to refresh forecast."
                        : "Click 'Start AI Prediction' below to calculate next month's sales forecast."}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => generateInsights(true)}
                  disabled={loading}
                  className="bg-white text-purple-950 hover:bg-purple-50 font-bold px-4 py-2 rounded-lg text-xs shadow-md flex items-center justify-center gap-2 whitespace-nowrap transition-all disabled:opacity-60 flex-shrink-0 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      <span>Analyzing Sales…</span>
                    </>
                  ) : cachedPrediction ? (
                    <>
                      <RefreshCw size={14} />
                      <span>Redo Prediction Analysis</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-yellow-600 fill-yellow-400" />
                      <span>Start AI Prediction</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* --- KPI Cards (Local Data) --- */}
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-2 md:gap-4">
              <div className="bg-gradient-to-br from-red-50 to-orange-50 p-4 md:p-5 rounded-lg shadow-sm border border-red-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-red-600 shadow-sm"><Wallet size={20} /></div>
                  <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Revenue</span>
                </div>
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 whitespace-nowrap">
                  <TooltipValue display={formatINRCompact(stats.totalRevenue)} full={formatINRFull(stats.totalRevenue)} />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Total Earnings</div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 md:p-5 rounded-lg shadow-sm border border-blue-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm"><TrendingUp size={20} /></div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Bills</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-slate-900">{stats.totalBills}</div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Total Invoices</div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-5 rounded-lg shadow-sm border border-purple-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-purple-600 shadow-sm"><Users size={20} /></div>
                  <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">Avg</span>
                </div>
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 whitespace-nowrap">
                  <TooltipValue display={formatINRCompact(Math.round(stats.avgBillValue))} full={formatINRFull(Math.round(stats.avgBillValue))} />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-medium">AOV (Avg Order)</div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 md:p-5 rounded-lg shadow-sm border border-emerald-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm"><Users size={20} /></div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Repeat</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-slate-900">{stats.repeatPurchaseRate.toFixed(0)}%</div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Repeat Purchase Rate</div>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 to-sky-50 p-4 md:p-5 rounded-lg shadow-sm border border-indigo-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm"><Wallet size={20} /></div>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full">LTV</span>
                </div>
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 whitespace-nowrap">
                  <TooltipValue display={formatINRCompact(Math.round(stats.avgLTV))} full={formatINRFull(Math.round(stats.avgLTV))} />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Avg Customer LTV</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 md:p-5 rounded-lg shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
                {(() => {
                  const summary = formatVolumeSummary(stats.totalBusinessVolumeMap);
                  const title = summary.dominantUnit ? `Total ${summary.dominantUnit} Sold` : 'Total Volume Sold';
                  const iconText = getVolumeIcon(summary.dominantUnit);
                  const valueDisplay = summary.text || '0 Units';

                  return (
                    <>
                      <div className="flex justify-between items-start mb-3">
                        <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm text-base flex items-center justify-center">
                          {iconText}
                        </div>
                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">{summary.dominantUnit || 'Volume'}</span>
                      </div>
                      <div className="text-lg md:text-xl font-bold text-slate-900 truncate" title={valueDisplay}>
                        {valueDisplay}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 font-medium">{title}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Revenue Chart */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600 md:w-5 md:h-5" />
                  <span>Revenue Trends</span>
                </h3>
              </div>
              <div className="h-48 md:h-64 w-full">
                <SimpleBarChart data={chartDataRevenue} />
              </div>
            </div>

            {/* --- Product Analytics Section --- */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 md:p-6 rounded-xl shadow-sm border border-purple-200">
              <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-purple-600" />
                Product Analytics
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Top Products by Revenue */}
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Top Products by Revenue</h4>
                  {/* Mobile: Pie + Bars side-by-side */}
                  <div className="md:hidden">
                    <div className="grid grid-cols-[6rem_1fr] gap-4 items-center">
                      <div className="flex justify-start pt-1">
                        <SimplePieChart data={stats.chartDataProducts} showWeight={true} showLegend={false} />
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {(() => {
                          const maxVal = Math.max(...stats.chartDataProducts.map(d => d.value), 0);
                          return stats.chartDataProducts.map((d) => (
                            <React.Fragment key={d.name}>
                              <ProgressBar
                                label={d.name}
                                value={d.value}
                                max={maxVal}
                                color="bg-purple-500"
                                meta={(d as any).unitLabel || ((d.weight ?? 0) > 0 ? `${d.weight} Units` : '-')}
                              />
                            </React.Fragment>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Desktop: Pie + Legend */}
                  <div className="hidden md:block w-full min-h-[18rem]">
                    <SimplePieChart data={stats.chartDataProducts} showWeight={true} />
                  </div>
                </div>

                {/* Product Leaderboard */}
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Product Leaderboard</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {(stats.topProducts || []).map((prod, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-purple-50 text-purple-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => {
                            const found = products.find(p => p.name.toLowerCase().trim() === prod.name.toLowerCase().trim());
                            setSelectedProductForModal(found || { id: prod.name, name: prod.name, price: 0 });
                          }}
                        >
                          <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate hover:text-purple-600 underline-offset-2 hover:underline">
                            {prod.name}
                          </div>
                          {(() => {
                            const vol = formatVolumeSummary(prod.unitsMap);
                            return (
                              <div className="text-[11px] sm:text-xs text-slate-500">
                                {prod.invoiceCount} invoice{prod.invoiceCount !== 1 ? 's' : ''} {vol.text ? `• ${vol.text}` : ''}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-bold text-purple-600 text-xs sm:text-sm whitespace-nowrap">
                              {formatINRFull(prod.amount)}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">
                              {stats.totalRevenue > 0 ? ((prod.amount / stats.totalRevenue) * 100).toFixed(1) : 0}% share
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const found = products.find(p => p.name.toLowerCase().trim() === prod.name.toLowerCase().trim());
                              setSelectedProductForModal(found || { id: prod.name, name: prod.name, price: 0 });
                            }}
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Inspect Product Breakdown & Analysis"
                          >
                            <Search size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* --- Customer Analytics Section --- */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-6 rounded-xl shadow-sm border border-blue-200">
              <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-6 text-blue-600" />
                Customer Analytics
              </h3>

              {/* Top Customers by Revenue */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
                {/* Customer Revenue Distribution */}
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Top Customers by Revenue</h4>
                  {/* Mobile: Pie + Bars side-by-side */}
                  <div className="md:hidden">
                    <div className="grid grid-cols-[6rem_1fr] gap-4 items-center">
                      <div className="flex justify-start pt-1">
                        <SimplePieChart data={stats.chartDataCustomers || []} showLegend={false} />
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {(() => {
                          const maxVal = Math.max(...(stats.chartDataCustomers || []).map(d => d.value), 0);
                          return (stats.chartDataCustomers || []).map((d) => (
                            <React.Fragment key={d.name}>
                              <ProgressBar label={d.name} value={d.value} max={maxVal} color="bg-blue-500" />
                            </React.Fragment>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Desktop: Pie + Legend */}
                  <div className="hidden md:block w-full min-h-[16rem] md:h-64">
                    <SimplePieChart data={stats.chartDataCustomers || []} />
                  </div>
                </div>

                {/* Customer Leaderboard */}
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Customer Leaderboard</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {(stats.topCustomers || []).map((customer, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                            idx === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-50 text-blue-600'
                          }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                          const found = customers.find(c => c.name.toLowerCase().trim() === customer.name.toLowerCase().trim());
                          setSelectedCustomerForModal(found || { id: customer.name, name: customer.name, city: '' });
                        }}>
                          <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate hover:text-blue-600 underline-offset-2 hover:underline">{customer.name}</div>
                          {(() => {
                            const vol = formatVolumeSummary(customer.unitsMap);
                            return (
                              <div className="text-[11px] sm:text-xs text-slate-500">
                                {customer.invoiceCount} invoice{customer.invoiceCount !== 1 ? 's' : ''} {vol.text ? `• ${vol.text}` : ''}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-bold text-blue-600 text-xs sm:text-sm whitespace-nowrap">
                              {formatINRFull(customer.totalSpent)}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">
                              {formatINRFull(Math.round(customer.totalSpent / customer.invoiceCount))}/avg
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const found = customers.find(c => c.name.toLowerCase().trim() === customer.name.toLowerCase().trim());
                              setSelectedCustomerForModal(found || { id: customer.name, name: customer.name, city: '' });
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                            title="View Spending & Purchase Chart"
                          >
                            <BarChart3 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detailed Customer Insights */}
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-bold text-slate-700 text-sm mb-3">Customer Purchase Details</h4>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {(stats.topCustomers || []).map((customer, idx) => {
                    const topItems = Object.entries(customer.items)
                      .map(([name, data]) => {
                        const d = data as any;
                        return typeof d === 'object' && d !== null
                          ? { name, quantity: d.quantity || 0, amount: d.amount || 0, unitsMap: d.unitsMap || {} }
                          : { name, quantity: 0, amount: 0, unitsMap: {} };
                      })
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 3);

                    const customerVol = formatVolumeSummary(customer.unitsMap);
                    const customerIcon = getVolumeIcon(customerVol.dominantUnit);

                    return (
                      <div key={idx} className="border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h5 className="font-bold text-slate-900 text-sm sm:text-base">{customer.name}</h5>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-slate-500 mt-1">
                              <span>📅 Last: {customer.lastPurchase}</span>
                              <span>📊 {customer.invoiceCount} orders</span>
                              {customerVol.text && <span>{customerIcon} {customerVol.text}</span>}
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className="text-sm sm:text-lg font-bold text-blue-600 whitespace-nowrap">
                              {formatINRFull(customer.totalSpent)}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500">Total Spent</div>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="text-[11px] sm:text-xs font-bold text-slate-600 mb-2 uppercase">Favorite Products</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {topItems.map((item, i) => {
                              const itemVol = formatVolumeSummary(item.unitsMap);
                              const itemIcon = getVolumeIcon(itemVol.dominantUnit);

                              return (
                                <div key={i} className="bg-slate-50 p-2 rounded">
                                  <div className="text-[11px] sm:text-xs font-medium text-slate-700 truncate" title={item.name}>{item.name}</div>
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 mt-1">
                                    <div className="text-[11px] sm:text-xs font-bold text-slate-900 whitespace-nowrap">
                                      {formatINRFull(item.amount)}
                                    </div>
                                    {itemVol.text ? (
                                      <div className="text-[11px] sm:text-xs text-slate-600 whitespace-nowrap">{itemIcon} {itemVol.text}</div>
                                    ) : (
                                      <div className="text-[11px] sm:text-xs text-slate-600 whitespace-nowrap">📦 {item.quantity} qty</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* --- Payment & Collection Analytics Section --- */}
            {enablePaymentTracking && paymentStats && (
              <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-4 md:p-6 rounded-xl shadow-sm border border-emerald-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-600" />
                      Payment & Collection Analytics
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Real-time receivables, payment modes & collection health</p>
                  </div>
                  <div className="bg-white/90 backdrop-blur-xs px-3 py-1 rounded-full border border-emerald-300 text-xs font-bold text-emerald-800 shrink-0 self-start sm:self-auto">
                    Collection Rate: {paymentStats.collectionRate.toFixed(1)}%
                  </div>
                </div>

                {/* 4 Payment KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
                  <MetricCard
                    icon={<Wallet size={20} className="text-white" />}
                    title="Total Collected"
                    value={formatINRFull(paymentStats.totalCollected)}
                    subtitle={`${paymentStats.paidCount} fully paid`}
                    color="from-emerald-500 to-green-600"
                  />

                  <MetricCard
                    icon={<AlertCircle size={20} className="text-white" />}
                    title="Outstanding Balance"
                    value={formatINRFull(paymentStats.totalOutstanding)}
                    subtitle={`${paymentStats.unpaidCount + paymentStats.partialCount} pending bills`}
                    color="from-rose-500 to-red-600"
                  />

                  <MetricCard
                    icon={<TrendingUp size={20} className="text-white" />}
                    title="Collection Rate"
                    value={`${paymentStats.collectionRate.toFixed(1)}%`}
                    subtitle={`₹${Math.round(paymentStats.totalCollected).toLocaleString()} of ₹${Math.round(paymentStats.totalBilled).toLocaleString()}`}
                    color="from-blue-500 to-indigo-600"
                  />

                  <MetricCard
                    icon={<BarChart3 size={20} className="text-white" />}
                    title="Invoice Status"
                    value={`${paymentStats.paidCount} Paid`}
                    subtitle={`${paymentStats.partialCount} Partial • ${paymentStats.unpaidCount} Unpaid`}
                    color="from-purple-500 to-violet-600"
                  />
                </div>

                {/* Payment Charts & Overdue Customers Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {/* Payment Modes Breakdown */}
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="font-bold text-slate-700 text-sm mb-3">Payment Modes Breakdown</h4>
                    {paymentStats.modeChartData.length > 0 ? (
                      <SimplePieChart data={paymentStats.modeChartData} showLegend={true} />
                    ) : (
                      <div className="h-44 flex items-center justify-center text-xs text-slate-400">No payment mode records recorded</div>
                    )}
                  </div>

                  {/* Top Pending / Overdue Customers */}
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="font-bold text-slate-700 text-sm mb-3">Top Pending / Overdue Customers</h4>
                    {paymentStats.topOverdueCustomers.length > 0 ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {paymentStats.topOverdueCustomers.map((cust, idx) => {
                          const billed = cust.totalBilled || 1;
                          const paid = cust.totalPaid || 0;
                          const owed = cust.totalOwed || 0;

                          const paidPct = Math.min(100, Math.max(0, (paid / billed) * 100));
                          const owedPct = Math.min(100 - paidPct, Math.max(0, (owed / billed) * 100));

                          return (
                            <div key={idx} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-all border border-slate-100 space-y-2">
                              {/* Header: Customer Name & Pending Bill count */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                <div>
                                  <span className="font-bold text-xs sm:text-sm text-slate-800">{cust.customerName}</span>
                                  <span className="text-[10px] text-slate-500 font-medium ml-2">
                                    ({cust.unpaidBills} pending bill{cust.unpaidBills !== 1 ? 's' : ''})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold whitespace-nowrap">
                                  <span className="text-slate-900 font-bold" title="Total Billed">Total: {formatINRFull(billed)}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-emerald-600 font-bold" title="Paid Amount">Paid: {formatINRFull(paid)}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-red-600 font-bold" title="Due Amount">Due: {formatINRFull(owed)}</span>
                                </div>
                              </div>

                              {/* Stacked Progress Bar: Green for Paid, Red for Outstanding Due */}
                              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex shadow-xs">
                                {paidPct > 0 && (
                                  <div
                                    className="bg-emerald-500 h-full transition-all duration-300"
                                    style={{ width: `${paidPct}%` }}
                                    title={`Paid: ${formatINRFull(paid)} (${paidPct.toFixed(1)}%)`}
                                  />
                                )}
                                {owedPct > 0 && (
                                  <div
                                    className="bg-red-500 h-full transition-all duration-300"
                                    style={{ width: `${owedPct}%` }}
                                    title={`Due: ${formatINRFull(owed)} (${owedPct.toFixed(1)}%)`}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-44 flex items-center justify-center text-xs text-emerald-600 font-medium">
                        🎉 All customer invoices are 100% paid!
                      </div>
                    )}
                  </div>
                </div>

                {/* Outstanding Aging Breakdown */}
                <div className="mt-4 bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Outstanding Aging Analysis</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-[10px] font-bold uppercase text-emerald-700">0-30 Days</div>
                      <div className="text-sm sm:text-base font-extrabold text-emerald-900 mt-1">{formatINRFull(paymentStats.aging.current)}</div>
                    </div>
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="text-[10px] font-bold uppercase text-yellow-700">31-60 Days</div>
                      <div className="text-sm sm:text-base font-extrabold text-yellow-900 mt-1">{formatINRFull(paymentStats.aging.days30)}</div>
                    </div>
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="text-[10px] font-bold uppercase text-orange-700">61-90 Days</div>
                      <div className="text-sm sm:text-base font-extrabold text-orange-900 mt-1">{formatINRFull(paymentStats.aging.days60)}</div>
                    </div>
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                      <div className="text-[10px] font-bold uppercase text-rose-700">90+ Days (High Risk)</div>
                      <div className="text-sm sm:text-base font-extrabold text-rose-900 mt-1">{formatINRFull(paymentStats.aging.days90Plus)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- AI Section --- */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-3 md:p-6 text-white shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div className="flex-1">
                  <h3 className="text-base md:text-xl font-bold flex items-center gap-2">
                    <Sparkles className="text-yellow-400 fill-yellow-400" size={18} />
                    AI Business Analyst
                  </h3>
                  <p className="text-slate-400 text-[10px] md:text-sm mt-1">
                    Visual insights & forecasting
                  </p>
                </div>

                <button
                  onClick={() => generateInsights(timeFilter === 'prediction')}
                  disabled={loading}
                  className="w-full sm:w-auto bg-white text-slate-900 hover:bg-slate-100 font-bold py-2 md:py-3 px-4 md:px-6 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : timeFilter === 'prediction' && cachedPrediction ? (
                    <RefreshCw size={16} />
                  ) : (
                    <Lightbulb size={16} />
                  )}
                  <span>
                    {loading
                      ? 'Analyzing...'
                      : timeFilter === 'prediction'
                      ? (cachedPrediction ? 'Redo Prediction Analysis' : 'Start Next Month Prediction')
                      : 'Generate Report'}
                  </span>
                </button>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-lg flex items-center gap-2 text-red-200 mb-4 text-xs md:text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {timeFilter === 'prediction' && !cachedPrediction && !loading && (
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 text-center max-w-lg mx-auto my-4 shadow-inner">
                  <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Sparkles size={24} className="text-yellow-400 fill-yellow-400 animate-pulse" />
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-white mb-1">Generate Next Month Sales Forecast</h4>
                  <p className="text-slate-300 text-xs mb-4">
                    Run Gemini AI predictive analysis using historical sales, product performance, and customer purchasing patterns. Results are saved for this session.
                  </p>
                  <button
                    onClick={() => generateInsights(true)}
                    disabled={loading}
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow-md inline-flex items-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
                  >
                    <Sparkles size={16} className="text-yellow-300 fill-yellow-300" />
                    <span>Start Next Month Prediction Analysis</span>
                  </button>
                </div>
              )}

              {(() => {
                const activeAnalysis = timeFilter === 'prediction' ? cachedPrediction : analysis;
                if (!activeAnalysis || loading) return null;

                return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Business Type & Confidence Badge */}
                    {(activeAnalysis.business_type || activeAnalysis.confidence_level) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {activeAnalysis.business_type && (
                          <span className="bg-violet-500/30 text-violet-200 text-[11px] font-bold px-3 py-1 rounded-full border border-violet-400/40 flex items-center gap-1.5">
                            🏢 {activeAnalysis.business_type}
                          </span>
                        )}
                        {activeAnalysis.confidence_level && (
                          <span className={`text-[11px] font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                            activeAnalysis.confidence_level === 'High'
                              ? 'bg-green-500/30 text-green-200 border-green-400/40'
                              : activeAnalysis.confidence_level === 'Medium'
                              ? 'bg-yellow-500/30 text-yellow-200 border-yellow-400/40'
                              : 'bg-red-500/30 text-red-200 border-red-400/40'
                          }`}>
                            {activeAnalysis.confidence_level === 'High' ? '🟢' : activeAnalysis.confidence_level === 'Medium' ? '🟡' : '🔴'} {activeAnalysis.confidence_level} Confidence
                          </span>
                        )}
                        {activeAnalysis.order_frequency_trend && (
                          <span className={`text-[11px] font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                            activeAnalysis.order_frequency_trend === 'Increasing'
                              ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                              : activeAnalysis.order_frequency_trend === 'Declining'
                              ? 'bg-red-500/30 text-red-200 border-red-400/40'
                              : 'bg-slate-500/30 text-slate-200 border-slate-400/40'
                          }`}>
                            {activeAnalysis.order_frequency_trend === 'Increasing' ? '📈' : activeAnalysis.order_frequency_trend === 'Declining' ? '📉' : '➡️'} Orders {activeAnalysis.order_frequency_trend}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Key Metrics Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                      {/* Forecast Revenue */}
                      {activeAnalysis.forecast_revenue !== undefined && (
                        <MetricCard
                          icon={<Target size={20} className="text-white" />}
                          title="30-Day Forecast"
                          value={`₹${Math.round(activeAnalysis.forecast_revenue).toLocaleString()}`}
                          trend="up"
                          color="from-blue-500 to-blue-600"
                        />
                      )}

                      {/* Growth Rate */}
                      {activeAnalysis.growth_percentage !== undefined && (
                        <MetricCard
                          icon={<TrendingUp size={20} className="text-white" />}
                          title="Growth Rate"
                          value={`${activeAnalysis.growth_percentage > 0 ? '+' : ''}${activeAnalysis.growth_percentage.toFixed(1)}%`}
                          trend={activeAnalysis.growth_percentage > 0 ? 'up' : 'down'}
                          color="from-green-500 to-green-600"
                        />
                      )}

                      {/* Business KPI */}
                      {activeAnalysis.business_kpi_label && activeAnalysis.business_kpi_value && (
                        <MetricCard
                          icon={<BarChart3 size={20} className="text-white" />}
                          title={activeAnalysis.business_kpi_label}
                          value={activeAnalysis.business_kpi_value}
                          color="from-teal-500 to-teal-600"
                        />
                      )}

                      {/* High Value Customers */}
                      {activeAnalysis.high_value_customer_count !== undefined && (
                        <MetricCard
                          icon={<Users size={20} className="text-white" />}
                          title="VIP Customers"
                          value={activeAnalysis.high_value_customer_count}
                          subtitle="High spenders"
                          color="from-purple-500 to-purple-600"
                        />
                      )}
                    </div>

                    {/* Insights Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {/* Sales Forecast */}
                      {activeAnalysis.sales_forecast && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar size={14} className="text-cyan-400" />
                            <h4 className="font-bold text-cyan-400 text-xs uppercase tracking-wider">Sales Forecast</h4>
                          </div>
                          <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.sales_forecast}</p>
                        </div>
                      )}

                      {/* Growth Trends */}
                      {activeAnalysis.growth_trends && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp size={14} className="text-green-400" />
                            <h4 className="font-bold text-green-400 text-xs uppercase tracking-wider">Growth Trends</h4>
                          </div>
                          <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.growth_trends}</p>
                        </div>
                      )}

                      {/* Customer Insights */}
                      <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Users size={14} className="text-blue-400" />
                          <h4 className="font-bold text-blue-400 text-xs uppercase tracking-wider">Customer Insights</h4>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.customer_behavior_insight}</p>
                      </div>

                      {/* Product Performance */}
                      <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Package size={14} className="text-orange-400" />
                          <h4 className="font-bold text-orange-400 text-xs uppercase tracking-wider">Top Product</h4>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.top_performing_product_insight}</p>
                      </div>

                      {/* Seasonal Adjustment */}
                      {activeAnalysis.seasonal_adjustment && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar size={14} className="text-amber-400" />
                            <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">Seasonal Factors</h4>
                          </div>
                          <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.seasonal_adjustment}</p>
                        </div>
                      )}

                      {/* Customer Segments */}
                      {activeAnalysis.customer_segments && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <div className="flex items-center gap-2 mb-2">
                            <Users size={14} className="text-indigo-400" />
                            <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider">Customer Segments</h4>
                          </div>
                          <p className="text-slate-200 text-xs leading-relaxed">{activeAnalysis.customer_segments}</p>
                        </div>
                      )}
                    </div>

                    {/* Predicted Products & Churn Risk */}
                    {(activeAnalysis.predicted_top_products?.length || activeAnalysis.churn_risk_customers?.length) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {/* Predicted Top Products */}
                        {activeAnalysis.predicted_top_products && activeAnalysis.predicted_top_products.length > 0 && (
                          <div className="bg-gradient-to-br from-emerald-500/15 to-teal-500/15 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-emerald-500/30">
                            <h4 className="font-bold text-emerald-400 mb-3 text-xs uppercase tracking-wider">🚀 Predicted Top Products (Next Month)</h4>
                            <div className="space-y-2">
                              {activeAnalysis.predicted_top_products.map((product, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                  <span className="bg-emerald-500/40 text-emerald-200 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                                  <span className="text-slate-200 text-xs">{product}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Churn Risk Customers */}
                        {activeAnalysis.churn_risk_customers && activeAnalysis.churn_risk_customers.length > 0 && (
                          <div className="bg-gradient-to-br from-red-500/15 to-orange-500/15 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-red-500/30">
                            <h4 className="font-bold text-red-400 mb-3 text-xs uppercase tracking-wider">⚠️ Churn Risk Customers</h4>
                            <div className="space-y-2">
                              {activeAnalysis.churn_risk_customers.map((customer, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                  <TrendingDown size={14} className="text-red-400 shrink-0" />
                                  <span className="text-slate-200 text-xs">{customer}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Peak Days & Low Stock */}
                    {(activeAnalysis.top_selling_days?.length || activeAnalysis.low_stock_items?.length) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {/* Peak Selling Days */}
                        {activeAnalysis.top_selling_days && activeAnalysis.top_selling_days.length > 0 && (
                          <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                            <h4 className="font-bold text-pink-400 mb-3 text-xs uppercase tracking-wider">🔥 Peak Selling Periods</h4>
                            <div className="space-y-2">
                              {activeAnalysis.top_selling_days.map((day, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                  <span className="bg-pink-500/40 text-pink-200 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                                  <span className="text-slate-200 text-xs">{day}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Low Stock Items */}
                        {activeAnalysis.low_stock_items && activeAnalysis.low_stock_items.length > 0 && (
                          <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                            <h4 className="font-bold text-red-400 mb-3 text-xs uppercase tracking-wider">⚠️ Items Need Attention</h4>
                            <div className="space-y-2">
                              {activeAnalysis.low_stock_items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                                  <span className="text-slate-200 text-xs truncate">{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Recommendations */}
                    <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-yellow-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb size={16} className="text-yellow-400 shrink-0" />
                        <h4 className="font-bold text-yellow-400 text-xs uppercase tracking-wider">Action Plan</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {activeAnalysis.actionable_tips.map((tip, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-white/5 p-2 rounded">
                            <span className="bg-yellow-500/40 text-yellow-200 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                            <span className="text-yellow-100 text-xs leading-tight">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!(timeFilter === 'prediction' ? cachedPrediction : analysis) && !loading && !error && timeFilter !== 'prediction' && (
                <div className="text-center py-12 md:py-16 text-slate-400 border-2 border-dashed border-slate-700 rounded-lg">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <div className="text-xs md:text-sm">Click "Generate Report" to analyze your sales data</div>
                </div>
              )}

              {/* --- Q&A Section --- */}
              <div className="mt-5 md:mt-6 bg-white/5 border border-white/10 rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="font-bold text-sm md:text-base">Ask about your bills</div>
                  <div className="text-[10px] md:text-xs text-slate-300">Gujarati / English supported</div>
                </div>

                {qaError && (
                  <div className="bg-red-500/20 border border-red-500/40 p-2 rounded-lg text-red-100 text-xs mb-3 break-words">
                    {qaError}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {chat.length === 0 ? (
                      <div className="text-slate-300 text-xs">
                        Try: “મારે સૌથી વધારે કોણ ખરીદે છે?” or “Show chart of revenue by date”
                      </div>
                    ) : (
                      chat.map((m, idx) => (
                        <div key={idx} className={`rounded-lg p-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-white/10 text-white' : 'bg-slate-950/40 text-slate-100'
                          }`}>
                          <div className="text-[10px] uppercase tracking-wide text-slate-300 mb-1">
                            {m.role === 'user' ? 'ME' : 'AI'}
                          </div>
                          <div className="whitespace-pre-wrap break-words">{m.text}</div>

                          {m.role === 'assistant' && m.charts && m.charts.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {m.charts.map((c, ci) => {
                                const typeStr = (c.type || '').toLowerCase();
                                const isPie = typeStr.includes('pie') || typeStr.includes('donut');
                                const isProgress = typeStr.includes('progress') || typeStr.includes('rank') || (typeStr === '' && Array.isArray(c.bars));
                                const isBar = typeStr.includes('bar') || typeStr.includes('column') || typeStr.includes('line') || typeStr.includes('daily') || typeStr.includes('trend') || (!isPie && !isProgress);

                                return (
                                  <div key={ci} className="bg-white rounded-xl p-3 text-slate-900 shadow-sm border border-slate-200">
                                    <div className="font-bold text-xs text-slate-800 mb-2 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                                      <span>{c.title || 'Data Chart'}</span>
                                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">
                                        {isPie ? 'Pie Chart' : isProgress ? 'Progress Ranking' : 'Bar Trend'}
                                      </span>
                                    </div>

                                    {isBar && (
                                      <div className="h-44 w-full">
                                        {(() => {
                                          const raw = Array.isArray(c.data) ? c.data : Array.isArray(c.bars) ? c.bars : [];
                                          const normalized = raw
                                            .map((d: any) => {
                                              if (!d || typeof d !== 'object') return null;
                                              const dateStr = String(d.dateStr || d.date || d.name || d.day || d.label || d.x || '');
                                              const revenue = Number(d.revenue ?? d.amount ?? d.total ?? d.value ?? d.sales ?? d.y ?? 0);
                                              if (!dateStr || dateStr === 'N/A' || isNaN(revenue)) return null;
                                              return { dateStr, revenue };
                                            })
                                            .filter((item): item is { dateStr: string; revenue: number } => item !== null && item.revenue > 0);

                                          const finalData = normalized.length > 0
                                            ? normalized
                                            : stats.chartDataRevenueAll.slice(-14).map(d => ({ dateStr: d.dateStr, revenue: d.revenue }));

                                          return finalData.length > 0 ? (
                                            <SimpleBarChart data={finalData} />
                                          ) : (
                                            <div className="text-xs text-slate-400 py-6 text-center">No sales revenue recorded to plot chart</div>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {isPie && (
                                      <div className="w-full min-h-[14rem]">
                                        {(() => {
                                          const raw = Array.isArray(c.data) ? c.data : [];
                                          const normalized = raw
                                            .map((d: any) => {
                                              if (!d || typeof d !== 'object') return null;
                                              const name = String(d.name || d.product || d.customer || d.label || d.dateStr || d.date || '');
                                              const value = Number(d.value ?? d.revenue ?? d.amount ?? d.total ?? d.sales ?? 0);
                                              const weight = Number(d.weight ?? d.weightGrams ?? 0);
                                              if (!name || isNaN(value) || value <= 0) return null;
                                              return { name, value, weight: isNaN(weight) ? 0 : weight };
                                            })
                                            .filter((item): item is { name: string; value: number; weight?: number } => item !== null);

                                          const finalData = normalized.length > 0
                                            ? normalized
                                            : stats.chartDataProducts.map(p => ({ name: p.name, value: p.value, weight: p.weight }));

                                          return finalData.length > 0 ? (
                                            <SimplePieChart data={finalData} showWeight={c.showWeight} />
                                          ) : (
                                            <div className="text-xs text-slate-400 py-6 text-center">No product data recorded to plot pie chart</div>
                                          );
                                        })()}
                                      </div>
                                    )}

                                    {isProgress && (
                                      <div className="space-y-2 py-1">
                                        {(() => {
                                          const raw = Array.isArray(c.bars) ? c.bars : Array.isArray(c.data) ? c.data : [];
                                          const normalized = raw
                                            .map((b: any) => {
                                              if (!b || typeof b !== 'object') return null;
                                              const label = String(b.label || b.name || b.customer || b.product || b.title || '');
                                              const value = Number(b.value ?? b.amount ?? b.total ?? b.revenue ?? 0);
                                              const meta = b.meta ? String(b.meta) : undefined;
                                              if (!label || isNaN(value) || value <= 0) return null;
                                              return { label, value, meta };
                                            })
                                            .filter((item): item is { label: string; value: number; meta?: string } => item !== null);

                                          const finalBars = normalized.length > 0
                                            ? normalized
                                            : stats.chartDataCustomers.map(c => ({ label: c.name, value: c.value }));

                                          if (finalBars.length === 0) {
                                            return <div className="text-xs text-slate-400 py-4 text-center">No metrics recorded to plot ranking</div>;
                                          }
                                          const maxVal = Math.max(...finalBars.map(b => b.value), 1);
                                          return finalBars.map((b) => (
                                            <React.Fragment key={b.label}>
                                              <ProgressBar
                                                label={b.label}
                                                value={b.value}
                                                max={maxVal}
                                                color="bg-indigo-600"
                                                valuePrefix={c.valuePrefix ?? '₹'}
                                                meta={b.meta}
                                              />
                                            </React.Fragment>
                                          ));
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Quick Chart Suggestion Pills - Wrapped for Mobile */}
                  <div className="flex flex-wrap items-center gap-1.5 py-1">
                    <span className="text-[10px] font-bold uppercase text-amber-400 shrink-0 flex items-center gap-1">
                      <Sparkles size={11} /> Quick Charts:
                    </span>
                    <button
                      type="button"
                      onClick={() => askBillsQuestion('Show chart of revenue by date')}
                      className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/20 transition-colors cursor-pointer"
                    >
                      📊 Revenue Trend
                    </button>
                    <button
                      type="button"
                      onClick={() => askBillsQuestion('Show pie chart of top products')}
                      className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/20 transition-colors cursor-pointer"
                    >
                      🍩 Top Products
                    </button>
                    <button
                      type="button"
                      onClick={() => askBillsQuestion('Show chart of top customers by spending')}
                      className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/20 transition-colors cursor-pointer"
                    >
                      🏆 Top Customers
                    </button>
                    <button
                      type="button"
                      onClick={() => askBillsQuestion('સૌથી વધુ વેચાતી પ્રોડક્ટ્સનો ચાર્ટ બતાવો')}
                      className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/20 transition-colors cursor-pointer"
                    >
                      🇮🇳 ગુજરાતી ચાર્ટ
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      value={qaInput}
                      onChange={(e) => setQaInput(e.target.value)}
                      placeholder="Ask anything… (e.g., Gujarati, English, charts)"
                      className="w-full bg-white/10 border border-white/10 rounded-lg p-2 text-xs text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-yellow-400/60 resize-none min-h-[44px]"
                      rows={2}
                    />
                    <button
                      onClick={() => askBillsQuestion()}
                      disabled={qaLoading}
                      className="bg-yellow-400 text-slate-900 font-bold rounded-lg px-4 py-2 text-sm disabled:opacity-70"
                    >
                      {qaLoading ? 'Thinking…' : 'Ask'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Spending & Purchase Details Modal */}
      {selectedCustomerForModal && (
        <CustomerSpendingModal
          customer={selectedCustomerForModal}
          invoices={invoices}
          onClose={() => setSelectedCustomerForModal(null)}
        />
      )}

      {/* Product Analysis & Trend Breakdown Modal */}
      {selectedProductForModal && (
        <ProductAnalysisModal
          product={selectedProductForModal}
          invoices={invoices}
          customers={customers}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}
    </div>
  );
};