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
  PieChart as PieIcon
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
}

const COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#2563eb', '#7c3aed'];

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
              {d.dateStr}: ₹{d.revenue}
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

const SimplePieChart = ({ data }: { data: { name: string, value: number }[] }) => {
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
    <div className="w-full flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 py-1">
      {/* Pie */}
      <div
        className="w-28 h-28 md:w-40 md:h-40 rounded-full shadow-inner relative group flex-shrink-0"
        style={{ background: `conic-gradient(${gradientSegments})` }}
      >
        <div className="absolute inset-0 m-auto w-16 h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center shadow-sm">
          <div className="text-center">
            <div className="text-[7px] md:text-[10px] uppercase font-bold text-slate-400">Total</div>
            <div className="text-[10px] md:text-sm font-bold text-slate-800">₹{total}</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-2 md:gap-2 w-full md:w-auto px-4">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] md:text-xs">
            <div className="w-2 md:w-3 h-2 md:h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }}></div>
            <div className="flex flex-col min-w-0">
              <span className="text-slate-600 font-bold truncate" title={d.name}>{d.name}</span>
              <span className="text-slate-400 font-medium whitespace-nowrap">₹{d.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ invoices, products, customers }) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string>('');

  // --- Local Calculations (Instant) ---
  const stats = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const totalBills = invoices.length;
    const avgBillValue = totalBills > 0 ? totalRevenue / totalBills : 0;

    // Product Frequency
    const productSales: Record<string, number> = {};
    invoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const amt = Number(item.amount) || 0;
          productSales[item.name] = (productSales[item.name] || 0) + amt;
        });
      }
    });

    const topProduct = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0];

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

    const chartDataRevenue = Object.entries(salesByDate)
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
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-10); // Last 10 days with activity

    console.log("Analytics: Chart Data", chartDataRevenue);

    // 2. Product Distribution (Top 5)
    const chartDataProducts = Object.entries(productSales)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalRevenue,
      totalBills,
      avgBillValue,
      topProductName: topProduct ? topProduct[0] : 'N/A',
      topProductValue: topProduct ? topProduct[1] : 0,
      chartDataRevenue,
      chartDataProducts
    };
  }, [invoices]);

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 4. Call Model
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          You are a business analyst assistant.
          
          Here are the key calculated metrics for the business:
          ${metricsData}

          Here is the raw transaction data:
          ${promptData}

          Please analyze this data, focusing specifically on:
          1. Total Revenue performance.
          2. The Volume of Bills generated.
          3. The Average Bill Value and what it indicates about customer size.
          4. The Top Selling Products and their impact.

          Provide a response in JSON format containing:
          - "business_health": A summary paragraph evaluating the business performance based on the metrics provided.
          - "top_performing_product_insight": Specific analysis on why the top product is successful.
          - "customer_behavior_insight": Observations on customer buying patterns (frequency, location, ticket size).
          - "actionable_tips": An array of 3 specific, data-driven tips to improve revenue or efficiency.
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              business_health: { type: Type.STRING, description: "Executive summary of business health metrics." },
              top_performing_product_insight: { type: Type.STRING, description: "Analysis of product performance." },
              customer_behavior_insight: { type: Type.STRING, description: "Analysis of customer segments and behavior." },
              actionable_tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 strategic tips."
              }
            }
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 flex justify-between items-center shrink-0">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-violet-600" />
              Analytics Dashboard
            </h2>
            <p className="text-xs text-slate-500 mt-1">Real-time stats & AI-powered insights</p>
          </div>
          <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
            <div className="text-lg md:text-2xl font-bold text-violet-600">{invoices.length}</div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Invoices</div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="space-y-6">

            {/* --- KPI Cards (Local Data) --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-red-50 to-orange-50 p-4 md:p-5 rounded-lg shadow-sm border border-red-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-red-600 shadow-sm"><Wallet size={20} /></div>
                  <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Revenue</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-slate-900">₹{stats.totalRevenue.toLocaleString()}</div>
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
                <div className="text-2xl md:text-3xl font-bold text-slate-900">₹{Math.round(stats.avgBillValue).toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Average Order Value</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 md:p-5 rounded-lg shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm"><Sparkles size={20} /></div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Top</span>
                </div>
                <div className="text-lg md:text-xl font-bold text-slate-900 truncate" title={stats.topProductName}>{stats.topProductName}</div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Best Selling Product</div>
              </div>
            </div>

            {/* --- Charts Section --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Revenue Chart */}
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600 md:w-5 md:h-5" />
                  <span>Revenue Trends</span>
                </h3>
                <div className="h-48 md:h-64 w-full">
                  <SimpleBarChart data={stats.chartDataRevenue} />
                </div>
              </div>

              {/* Product Pie Chart */}
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PieIcon size={18} className="text-purple-600 md:w-5 md:h-5" />
                  <span>Top Products</span>
                </h3>
                <div className="h-48 md:h-64 w-full">
                  <SimplePieChart data={stats.chartDataProducts} />
                </div>
              </div>
            </div>

            {/* --- AI Section --- */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 md:p-6 text-white shadow-lg">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex-1">
                  <h3 className="text-lg md:text-xl font-bold flex items-center gap-2">
                    <Sparkles className="text-yellow-400 fill-yellow-400" size={20} />
                    AI Business Analyst
                  </h3>
                  <p className="text-slate-400 text-xs md:text-sm mt-1">
                    Generate insights using Google Gemini AI
                  </p>
                </div>

                <button
                  onClick={generateInsights}
                  disabled={loading}
                  className="w-full md:w-auto bg-white text-slate-900 hover:bg-slate-100 font-bold py-3 px-6 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <Lightbulb size={18} />}
                  <span className="text-sm md:text-base">{loading ? 'Analyzing...' : 'Generate Report'}</span>
                </button>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-200 mb-4">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              {analysis && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Health & Customers */}
                  <div className="space-y-4">
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/10">
                      <h4 className="font-bold text-green-400 mb-2 text-xs md:text-sm uppercase tracking-wider">Business Health</h4>
                      <p className="text-slate-200 text-sm leading-relaxed">{analysis.business_health}</p>
                    </div>
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/10">
                      <h4 className="font-bold text-blue-400 mb-2 text-xs md:text-sm uppercase tracking-wider">Customer Trends</h4>
                      <p className="text-slate-200 text-sm leading-relaxed">{analysis.customer_behavior_insight}</p>
                    </div>
                  </div>

                  {/* Products & Tips */}
                  <div className="space-y-4">
                    <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/10">
                      <h4 className="font-bold text-orange-400 mb-2 text-xs md:text-sm uppercase tracking-wider">Product Insight</h4>
                      <p className="text-slate-200 text-sm leading-relaxed">{analysis.top_performing_product_insight}</p>
                    </div>

                    <div className="bg-yellow-500/20 p-4 rounded-lg backdrop-blur-sm border border-yellow-500/30">
                      <h4 className="font-bold text-yellow-400 mb-3 text-xs md:text-sm uppercase tracking-wider flex items-center gap-2">
                        <Lightbulb size={16} /> Recommended Actions
                      </h4>
                      <ul className="space-y-2">
                        {analysis.actionable_tips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs md:text-sm text-yellow-100">
                            <span className="bg-yellow-500/40 text-yellow-200 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {!analysis && !loading && !error && (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-700 rounded-lg">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <div className="text-sm">Click the button above to analyze your invoices</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};