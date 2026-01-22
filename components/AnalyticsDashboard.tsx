import React, { useState, useMemo } from 'react';
import { Invoice, Product, Customer } from '../types';
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
  Package
} from 'lucide-react';

interface AnalyticsDashboardProps {
  invoices: Invoice[];
  products: Product[];
  customers: Customer[];
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

// Helper to format weight
const formatWeight = (grams: number): string => {
  if (grams === 0) return '-';
  const kg = Math.floor(grams / 1000);
  const gm = Math.round(grams % 1000);
  const parts = [];
  if (kg > 0) parts.push(`${kg} Kg`);
  if (gm > 0) parts.push(`${gm} Gm`);
  return parts.join(' ') || '-';
};

// --- Simple Custom Charts (No Recharts Dependency) ---

const SimpleBarChart = ({ data }: { data: { dateStr: string, revenue: number }[] }) => {
  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">No data</div>;

  const maxVal = Math.max(...data.map(d => d.revenue));

  return (
    <div className="h-full w-full flex items-end justify-between gap-2 pt-6 pb-6 px-2">
      {data.map((d, i) => {
        const heightPercent = maxVal > 0 ? (d.revenue / maxVal) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10 pointer-events-none">
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
  );
};

const SimplePieChart = ({
  data,
  showWeight,
  showLegend = true
}: {
  data: { name: string; value: number; weight?: number }[];
  showWeight?: boolean;
  showLegend?: boolean;
}) => {
  if (data.length === 0) return <div className="h-full flex items-center justify-center text-slate-400">No data</div>;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  // Create conic gradient string
  const gradientSegments = data.map((d, i) => {
    const percentage = (d.value / total) * 100;
    const start = currentAngle;
    const end = currentAngle + percentage;
    currentAngle = end;
    return `${COLORS[i % COLORS.length]} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-center gap-3 md:gap-8 py-1">
      {/* Pie */}
      <div
        className="w-28 h-28 md:w-40 md:h-40 rounded-full shadow-inner relative group flex-shrink-0"
        style={{ background: `conic-gradient(${gradientSegments})` }}
      >
        <div className="absolute inset-0 m-auto w-16 h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center shadow-sm">
          <div className="text-center">
            <div className="text-[7px] md:text-[10px] uppercase font-bold text-slate-400">Total</div>
            <div className="text-[9px] md:text-sm font-bold text-slate-800 leading-tight break-all max-w-[5.5rem] md:max-w-none">
              {formatINRFull(total)}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="w-full md:w-auto px-2 md:px-4">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-x-3 gap-y-2 md:gap-2 w-full md:w-auto max-h-28 overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] md:text-xs">
                <div className="w-2 md:w-3 h-2 md:h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }}></div>
                <div className="flex flex-col min-w-0">
                  <span className="text-slate-600 font-bold truncate" title={d.name}>{d.name}</span>
                  <span className="text-slate-400 font-medium break-all" title={formatINRFull(d.value)}>
                    {formatINRFull(d.value)}
                  </span>
                  {showWeight && d.weight !== undefined && (
                    <span className="text-slate-500 font-medium text-[9px] md:text-[10px]">{formatWeight(d.weight)}</span>
                  )}
                </div>
              </div>
            ))}
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
        <div className={`flex items-center gap-1 text-xs font-bold ${
          trend === 'up' ? 'text-green-300' : trend === 'down' ? 'text-red-300' : 'text-white/70'
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
export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ invoices, products, customers }) => {
  const [revenueRange, setRevenueRange] = useState<RevenueRange>('month');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string>('');

  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string>('');
  const [qaInput, setQaInput] = useState('');
  const [chat, setChat] = useState<AIChatMessage[]>([]);

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  // --- Local Calculations (Instant) ---
  const stats = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const totalBills = invoices.length;
    const avgBillValue = totalBills > 0 ? totalRevenue / totalBills : 0;

    // Total Weight Sold (in grams)
    let totalWeightGramsSold = 0;

    // Product Frequency
    const productSales: Record<string, { amount: number; weightGrams: number }> = {};
    invoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const amt = Number(item.amount) || 0;
          if (!productSales[item.name]) {
            productSales[item.name] = { amount: 0, weightGrams: 0 };
          }
          productSales[item.name].amount += amt;

          // Calculate weight for this item
          const qty = item.quantity;
          const unit = item.unit.toLowerCase().trim();

          let itemWeight = 0;
          
          if (['kg'].includes(unit)) {
            itemWeight = qty * 1000;
            productSales[item.name].weightGrams += itemWeight;
          } else if (['gm', 'g', 'gram', 'grams'].includes(unit)) {
            itemWeight = qty;
            productSales[item.name].weightGrams += itemWeight;
          } else if (item.packing) {
            // Non-weight unit, calculate from packing
            const text = item.packing.toLowerCase().trim();
            const match = text.match(/^(\d+(\.\d+)?)\s*(kg|gm|g|ltr|ml|l)/);
            if (match) {
              let value = parseFloat(match[1]);
              const packingUnit = match[3];
              if (['kg', 'ltr', 'l'].includes(packingUnit)) {
                value *= 1000;
              }
              itemWeight = value * qty;
              productSales[item.name].weightGrams += itemWeight;
            }
          }

          totalWeightGramsSold += itemWeight;
        });
      }
    });

    const topProduct = Object.entries(productSales).sort((a, b) => b[1].amount - a[1].amount)[0];

    // --- Customer Analytics ---
    const customerData: Record<string, {
      totalSpent: number;
      invoiceCount: number;
      items: Record<string, { quantity: number; amount: number; weightGrams: number }>;
      lastPurchase: string;
      totalWeightGrams: number;
    }> = {};

    invoices.forEach(inv => {
      const customer = inv.customerName;
      if (!customerData[customer]) {
        customerData[customer] = {
          totalSpent: 0,
          invoiceCount: 0,
          items: {},
          lastPurchase: inv.date,
          totalWeightGrams: 0
        };
      }

      customerData[customer].totalSpent += Number(inv.total) || 0;
      customerData[customer].invoiceCount += 1;
      
      // Track last purchase date
      const currentDate = inv.date;
      const existingDate = customerData[customer].lastPurchase;
      // Simple string comparison works for DD/MM/YYYY if same format
      if (currentDate > existingDate) {
        customerData[customer].lastPurchase = currentDate;
      }

      // Track items bought by customer
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          if (!customerData[customer].items[item.name]) {
            customerData[customer].items[item.name] = { quantity: 0, amount: 0, weightGrams: 0 };
          }
          customerData[customer].items[item.name].quantity += item.quantity;
          customerData[customer].items[item.name].amount += Number(item.amount) || 0;

          // Calculate weight for this item
          const qty = item.quantity;
          const unit = item.unit.toLowerCase().trim();
          let itemWeight = 0;
          
          if (['kg'].includes(unit)) {
            itemWeight = qty * 1000;
            customerData[customer].totalWeightGrams += itemWeight;
          } else if (['gm', 'g', 'gram', 'grams'].includes(unit)) {
            itemWeight = qty;
            customerData[customer].totalWeightGrams += itemWeight;
          } else if (item.packing) {
            const text = item.packing.toLowerCase().trim();
            const match = text.match(/^(\d+(\.\d+)?)\s*(kg|gm|g|ltr|ml|l)/);
            if (match) {
              let value = parseFloat(match[1]);
              const packingUnit = match[3];
              if (['kg', 'ltr', 'l'].includes(packingUnit)) {
                value *= 1000;
              }
              itemWeight = value * qty;
              customerData[customer].totalWeightGrams += itemWeight;
            }
          }
          
          customerData[customer].items[item.name].weightGrams += itemWeight;
        });
      }
    });

    // Top customers by revenue (all customers, sorted)
    const topCustomers = Object.entries(customerData)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Customer metrics
    const totalCustomers = topCustomers.length;
    const repeatCustomers = topCustomers.filter(c => c.invoiceCount > 1).length;
    const repeatPurchaseRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
    // LTV here is defined as lifetime revenue per customer (their totalSpent)
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
    // We parse DD/MM/YYYY manually, but also handle other formats robustly
    const salesByDate: Record<string, number> = {};
    invoices.forEach(inv => {
      if (inv.date) {
        // Ensure total is a number
        const amount = Number(inv.total) || 0;
        salesByDate[inv.date] = (salesByDate[inv.date] || 0) + amount;
      }
    });

    console.log("Analytics: Raw Sales Data", salesByDate);

    const chartDataRevenueAll = Object.entries(salesByDate)
      .map(([date, total]) => {
        let timestamp = 0;

        // Try DD/MM/YYYY (e.g. 30/12/2025)
        if (date.includes('/')) {
          const parts = date.split('/');
          if (parts.length === 3) {
            const [d, m, y] = parts.map(s => parseInt(s.trim(), 10));
            if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
              timestamp = new Date(y, m - 1, d).getTime();
            }
          }
        }
        // Try YYYY-MM-DD (e.g. 2025-12-30)
        else if (date.includes('-')) {
          const parts = date.split('-');
          if (parts.length === 3) {
            // Check if first part is year (4 digits)
            if (parts[0].trim().length === 4) {
              const [y, m, d] = parts.map(s => parseInt(s.trim(), 10));
              timestamp = new Date(y, m - 1, d).getTime();
            } else {
              // Assume DD-MM-YYYY
              const [d, m, y] = parts.map(s => parseInt(s.trim(), 10));
              timestamp = new Date(y, m - 1, d).getTime();
            }
          }
        }

        // Fallback to standard Date parsing if manual parsing failed
        if (timestamp === 0 || isNaN(timestamp)) {
          const parsed = Date.parse(date);
          if (!isNaN(parsed)) {
            timestamp = parsed;
          }
        }

        return {
          dateStr: date,
          timestamp: isNaN(timestamp) ? 0 : timestamp,
          revenue: total
        };
      })
      .filter(item => {
        if (item.timestamp <= 0) console.warn("Analytics: Invalid date filtered out:", item.dateStr);
        return item.timestamp > 0;
      }) // Remove invalid dates
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log("Analytics: Chart Data", chartDataRevenueAll);

    // 2. Product Distribution (Top 5)
    const chartDataProducts = Object.entries(productSales)
      .map(([name, data]) => ({ 
        name, 
        value: data.amount,
        weight: data.weightGrams
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalRevenue,
      totalBills,
      avgBillValue,
      totalWeightGramsSold,
      totalCustomers,
      repeatCustomers,
      repeatPurchaseRate,
      avgLTV,
      topLTVCustomerName: topLTVCustomer ? topLTVCustomer.name : 'N/A',
      topProductName: topProduct ? topProduct[0] : 'N/A',
      topProductValue: topProduct ? topProduct[1].amount : 0,
      chartDataRevenueAll,
      chartDataProducts,
      topCustomers,
      chartDataCustomers,
      customerData,
      productSales
    };
  }, [invoices]);

  const chartDataRevenue = useMemo(
    () => getRevenueChartData(stats.chartDataRevenueAll, revenueRange),
    [stats.chartDataRevenueAll, revenueRange]
  );

  // --- AI Analysis ---
  const generateInsights = async () => {
    if (invoices.length === 0) {
      setError("Not enough data to generate insights. Create some bills first.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Prepare Data Summary for AI
      // We include specific items to allow analysis of what sells together
      const salesSummary = invoices.map(inv => ({
        date: inv.date,
        total: inv.total,
        customer: inv.customerName,
        city: inv.customerCity,
        items: inv.items.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')
      }));

      // 2. Prepare Calculated Metrics for Context
      // LLMs are better at analysis when provided with pre-calculated aggregates for accuracy
      const metricsContext = {
        total_revenue: stats.totalRevenue,
        number_of_bills: stats.totalBills,
        average_bill_value: stats.avgBillValue,
        top_selling_product_by_revenue: stats.topProductName
      };

      const promptData = JSON.stringify(salesSummary);
      const metricsData = JSON.stringify(metricsContext);

      // 3. Initialize Gemini
      if (!geminiApiKey) {
        setError('Missing Gemini API key. Add VITE_GEMINI_API_KEY in .env.local and restart.');
        return;
      }

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      // 4. Call Model with Enhanced Analysis
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          You are an advanced business intelligence analyst specializing in retail and sales analytics.
          
          Here are the key calculated metrics for the business:
          ${metricsData}

          Here is the raw transaction data:
          ${promptData}

          Analyze the data and provide CONCISE insights (max 2 sentences each) with QUANTITATIVE DATA for visualization:

          1. Business Health: One line summary + current status
          2. Sales Forecast: Predict next 30-day revenue (numeric value) + confidence
          3. Growth: Calculate percentage growth rate (numeric value)
          4. Seasonal Patterns: Identify top 3 selling days/periods (as array)
          5. Customer Segments: Count of high-value customers (numeric)
          6. Product Performance: Brief insight on top product
          7. Inventory: List 3 items needing attention (as array)
          8. Actions: 3-5 specific recommendations

          Provide response in JSON with SHORT text (1-2 sentences max) and NUMERIC values for charts:
          - "business_health": One sentence status
          - "sales_forecast": Brief forecast statement
          - "forecast_revenue": Predicted revenue as number
          - "growth_trends": One sentence growth summary
          - "growth_percentage": Growth rate as number (e.g., 15.5 for 15.5%)
          - "seasonal_patterns": One sentence pattern summary
          - "top_selling_days": Array of 3 peak days/periods
          - "customer_behavior_insight": One sentence behavior summary
          - "customer_segments": One sentence segment summary
          - "high_value_customer_count": Number of high-value customers
          - "top_performing_product_insight": One sentence product insight
          - "inventory_insights": One sentence inventory status
          - "low_stock_items": Array of 3 items needing attention
          - "actionable_tips": Array of 3-5 brief action items
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              business_health: { type: Type.STRING },
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
              actionable_tips: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["business_health", "customer_behavior_insight", "top_performing_product_insight", "actionable_tips"]
          }
        }
      });

      // 5. Parse Response
      if (response.text) {
        const result = JSON.parse(response.text) as AIAnalysisResult;
        setAnalysis(result);
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

  const askBillsQuestion = async () => {
    const question = qaInput.trim();
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

      // Keep the prompt small but useful: last 200 invoices + aggregates.
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
        top_customers_by_revenue: stats.chartDataCustomers
      };

            // Prepare chat history for context
            const chatHistory = chat.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

            const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `
      You are a billing analytics assistant.

      CRITICAL language rules:
      - If user asks in Gujarati (ગુજરાતી script), answer in Gujarati.
      - If user asks in Gujarati using English letters (Gujarati WhatsApp Latin), still answer in proper Gujarati script.
      - Otherwise answer in English.

      Answer style rules:
      - Be clear, concise, and directly answer the question.
      - If the user asks for charts/graphs/visualize, return chart specs in JSON so UI can render charts.
      - If charts are not requested, keep charts empty.
      - For Gujarati answers, always format product lists with each product on a new line (use \n), and optionally use bullet points or numbers. Example:
        "તમારી સૌથી વધુ વેચાતી પ્રોડક્ટ્સ:\n• Guchda Sev : ₹208054\n• Roasted Nylon Pauva Chevdo : ₹93810\n..."

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
                          // For pie: name, value, weight; for bar: dateStr, revenue
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
      setChat(prev => [...prev, { role: 'assistant', text: parsed.answer, charts: parsed.charts }]);
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
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm"><Sparkles size={20} /></div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Top</span>
                </div>
                <div className="text-lg md:text-xl font-bold text-slate-900">{((stats.totalWeightGramsSold || 0) / 1000).toFixed(2)} Kg</div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Total Kg Sold</div>
              </div>
            </div>

            {/* --- Charts Section --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Revenue Chart */}
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-600 md:w-5 md:h-5" />
                    <span>Revenue Trends</span>
                  </h3>
                  <select
                    value={revenueRange}
                    onChange={(e) => setRevenueRange(e.target.value as RevenueRange)}
                    className="text-xs md:text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                  >
                    <option value="10d">Last 10 days</option>
                    <option value="month">This month</option>
                    <option value="year">This year</option>
                    <option value="till">Till date (all)</option>
                  </select>
                </div>
                <div className="h-48 md:h-64 w-full">
                  <SimpleBarChart data={chartDataRevenue} />
                </div>
              </div>

              {/* Product Pie Chart */}
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PieIcon size={18} className="text-purple-600 md:w-5 md:h-5" />
                  <span>Top Products</span>
                </h3>
                {/* Mobile: Pie + Bars side-by-side */}
                <div className="md:hidden">
                  <div className="grid grid-cols-[7rem_1fr] gap-2 items-start">
                    <div className="flex justify-center pt-1">
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
                              meta={(d.weight ?? 0) > 0 ? `${((d.weight ?? 0) / 1000).toFixed(2)} Kg` : '-'}
                            />
                          </React.Fragment>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Desktop: Pie + Legend */}
                <div className="hidden md:block w-full min-h-[18rem] md:h-64">
                  <SimplePieChart data={stats.chartDataProducts} showWeight={true} />
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
                    <div className="grid grid-cols-[7rem_1fr] gap-2 items-start">
                      <div className="flex justify-center pt-1">
                        <SimplePieChart data={stats.chartDataCustomers} showLegend={false} />
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {(() => {
                          const maxVal = Math.max(...stats.chartDataCustomers.map(d => d.value), 0);
                          return stats.chartDataCustomers.map((d) => (
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
                    <SimplePieChart data={stats.chartDataCustomers} />
                  </div>
                </div>

                {/* Customer Leaderboard */}
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h4 className="font-bold text-slate-700 text-sm mb-3">Customer Leaderboard</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {stats.topCustomers.map((customer, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-50 text-blue-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate">{customer.name}</div>
                          <div className="text-[11px] sm:text-xs text-slate-500">{customer.invoiceCount} invoices • {formatWeight(customer.totalWeightGrams)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-blue-600 text-xs sm:text-sm whitespace-nowrap">
                            {formatINRFull(customer.totalSpent)}
                          </div>
                          <div className="text-[11px] sm:text-xs text-slate-500 whitespace-nowrap">
                            {formatINRFull(Math.round(customer.totalSpent / customer.invoiceCount))}/avg
                          </div>
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
                  {stats.topCustomers.map((customer, idx) => {
                    const topItems = Object.entries(customer.items)
                      .map(([name, data]) => (
                        typeof data === 'object' && data !== null
                          ? { name, ...data }
                          : { name, amount: 0, weightGrams: 0 }
                      ))
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 3);

                    return (
                      <div key={idx} className="border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h5 className="font-bold text-slate-900 text-sm sm:text-base">{customer.name}</h5>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-slate-500 mt-1">
                              <span>📅 Last: {customer.lastPurchase}</span>
                              <span>📊 {customer.invoiceCount} orders</span>
                              <span>⚖️ {formatWeight(customer.totalWeightGrams)}</span>
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
                            {topItems.map((item, i) => (
                              <div key={i} className="bg-slate-50 p-2 rounded">
                                <div className="text-[11px] sm:text-xs font-medium text-slate-700 truncate" title={item.name}>{item.name}</div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 mt-1">
                                  <div className="text-[11px] sm:text-xs font-bold text-slate-900 whitespace-nowrap">
                                    {formatINRFull(item.amount)}
                                  </div>
                                  <div className="text-[11px] sm:text-xs text-slate-600 whitespace-nowrap">⚖️ {formatWeight(item.weightGrams)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

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
                  onClick={generateInsights}
                  disabled={loading}
                  className="w-full sm:w-auto bg-white text-slate-900 hover:bg-slate-100 font-bold py-2 md:py-3 px-4 md:px-6 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <Lightbulb size={16} />}
                  <span>{loading ? 'Analyzing...' : 'Generate Report'}</span>
                </button>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-lg flex items-center gap-2 text-red-200 mb-4 text-xs md:text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {analysis && !loading && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Key Metrics Cards - Mobile Optimized */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                    {/* Forecast Revenue */}
                    {analysis.forecast_revenue !== undefined && (
                      <MetricCard
                        icon={<Target size={20} className="text-white" />}
                        title="30-Day Forecast"
                        value={`₹${Math.round(analysis.forecast_revenue).toLocaleString()}`}
                        trend="up"
                        color="from-blue-500 to-blue-600"
                      />
                    )}
                    
                    {/* Growth Rate */}
                    {analysis.growth_percentage !== undefined && (
                      <MetricCard
                        icon={<TrendingUp size={20} className="text-white" />}
                        title="Growth Rate"
                        value={`${analysis.growth_percentage > 0 ? '+' : ''}${analysis.growth_percentage.toFixed(1)}%`}
                        trend={analysis.growth_percentage > 0 ? 'up' : 'down'}
                        color="from-green-500 to-green-600"
                      />
                    )}

                    {/* High Value Customers */}
                    {analysis.high_value_customer_count !== undefined && (
                      <MetricCard
                        icon={<Users size={20} className="text-white" />}
                        title="VIP Customers"
                        value={analysis.high_value_customer_count}
                        subtitle="High spenders"
                        color="from-purple-500 to-purple-600"
                      />
                    )}

                    {/* Business Status */}
                    <MetricCard
                      icon={<Sparkles size={20} className="text-white" />}
                      title="Business Health"
                      value="Active"
                      subtitle={`${stats.totalBills} orders`}
                      color="from-orange-500 to-orange-600"
                    />
                  </div>

                  {/* Insights Grid - Better Mobile Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    {/* Sales Forecast */}
                    {analysis.sales_forecast && (
                      <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar size={14} className="text-cyan-400" />
                          <h4 className="font-bold text-cyan-400 text-xs uppercase tracking-wider">Sales Forecast</h4>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed">{analysis.sales_forecast}</p>
                      </div>
                    )}

                    {/* Growth Trends */}
                    {analysis.growth_trends && (
                      <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp size={14} className="text-green-400" />
                          <h4 className="font-bold text-green-400 text-xs uppercase tracking-wider">Growth Trends</h4>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed">{analysis.growth_trends}</p>
                      </div>
                    )}

                    {/* Customer Insights */}
                    <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Users size={14} className="text-blue-400" />
                        <h4 className="font-bold text-blue-400 text-xs uppercase tracking-wider">Customer Insights</h4>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed">{analysis.customer_behavior_insight}</p>
                    </div>

                    {/* Product Performance */}
                    <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Package size={14} className="text-orange-400" />
                        <h4 className="font-bold text-orange-400 text-xs uppercase tracking-wider">Top Product</h4>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed">{analysis.top_performing_product_insight}</p>
                    </div>
                  </div>

                  {/* Peak Days & Low Stock - Visual Lists */}
                  {(analysis.top_selling_days?.length || analysis.low_stock_items?.length) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {/* Peak Selling Days */}
                      {analysis.top_selling_days && analysis.top_selling_days.length > 0 && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <h4 className="font-bold text-pink-400 mb-3 text-xs uppercase tracking-wider">🔥 Peak Selling Periods</h4>
                          <div className="space-y-2">
                            {analysis.top_selling_days.map((day, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                <span className="bg-pink-500/40 text-pink-200 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                                <span className="text-slate-200 text-xs">{day}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Low Stock Items */}
                      {analysis.low_stock_items && analysis.low_stock_items.length > 0 && (
                        <div className="bg-white/10 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-white/10">
                          <h4 className="font-bold text-red-400 mb-3 text-xs uppercase tracking-wider">⚠️ Items Need Attention</h4>
                          <div className="space-y-2">
                            {analysis.low_stock_items.map((item, idx) => (
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

                  {/* Recommendations - Compact & Mobile-Friendly */}
                  <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-3 md:p-4 rounded-lg backdrop-blur-sm border border-yellow-500/30">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb size={16} className="text-yellow-400 shrink-0" />
                      <h4 className="font-bold text-yellow-400 text-xs uppercase tracking-wider">Action Plan</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {analysis.actionable_tips.map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-white/5 p-2 rounded">
                          <span className="bg-yellow-500/40 text-yellow-200 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</span>
                          <span className="text-yellow-100 text-xs leading-tight">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!analysis && !loading && !error && (
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
                        <div key={idx} className={`rounded-lg p-2 text-xs leading-relaxed ${
                          m.role === 'user' ? 'bg-white/10 text-white' : 'bg-slate-950/40 text-slate-100'
                        }`}>
                          <div className="text-[10px] uppercase tracking-wide text-slate-300 mb-1">
                            {m.role === 'user' ? 'ME' : 'AI'}
                          </div>
                          <div className="whitespace-pre-wrap break-words">{m.text}</div>

                          {m.role === 'assistant' && m.charts && m.charts.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {m.charts.map((c, ci) => (
                                <div key={ci} className="bg-white rounded-lg p-3 text-slate-900">
                                  <div className="font-bold text-xs text-slate-700 mb-2">{c.title}</div>
                                  {c.type === 'bar' && (
                                    <div className="h-40 w-full">
                                      {(() => {
                                        const raw = Array.isArray(c.data) ? c.data : [];
                                        const normalized = raw.map((d: any) => {
                                          if (typeof d?.dateStr === 'string' && typeof d?.revenue === 'number') {
                                            return d as { dateStr: string; revenue: number };
                                          }
                                          if (typeof d?.name === 'string' && typeof d?.value === 'number') {
                                            return { dateStr: d.name, revenue: d.value };
                                          }
                                          return { dateStr: 'N/A', revenue: 0 };
                                        });
                                        return normalized.length > 0 ? (
                                          <SimpleBarChart data={normalized} />
                                        ) : (
                                          <div className="text-[11px] text-slate-500">No chart data</div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                  {c.type === 'pie' && (
                                    <div className="w-full min-h-[14rem]">
                                      {(() => {
                                        const raw = Array.isArray(c.data) ? c.data : [];
                                        const normalized = raw.map((d: any) => {
                                          if (typeof d?.name === 'string' && typeof d?.value === 'number') {
                                            return d as { name: string; value: number; weight?: number };
                                          }
                                          if (typeof d?.dateStr === 'string' && typeof d?.revenue === 'number') {
                                            return { name: d.dateStr, value: d.revenue };
                                          }
                                          return { name: 'N/A', value: 0 };
                                        });
                                        return normalized.length > 0 ? (
                                          <SimplePieChart data={normalized} showWeight={c.showWeight} />
                                        ) : (
                                          <div className="text-[11px] text-slate-500">No chart data</div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                  {c.type === 'progress' && (
                                    <div className="space-y-2">
                                      {(() => {
                                        const bars = Array.isArray(c.bars) ? c.bars : [];
                                        if (bars.length === 0) {
                                          return <div className="text-[11px] text-slate-500">No chart data</div>;
                                        }
                                        const maxVal = Math.max(...bars.map(b => b.value), 0);
                                        return bars.map((b) => (
                                          <React.Fragment key={b.label}>
                                            <ProgressBar
                                              label={b.label}
                                              value={b.value}
                                              max={maxVal}
                                              color="bg-blue-600"
                                              valuePrefix={c.valuePrefix ?? '₹'}
                                              meta={b.meta}
                                            />
                                          </React.Fragment>
                                        ));
                                      })()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
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
                      onClick={askBillsQuestion}
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
    </div>
  );
};