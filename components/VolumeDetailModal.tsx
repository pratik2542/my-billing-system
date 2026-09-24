import React, { useState, useRef } from 'react';
import { X, Scale, Package, TrendingUp, Users, Award, ChevronRight, BarChart3, Layers, ShoppingBag } from 'lucide-react';
const formatINRFull = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

export interface VolumeAnalysisData {
  dominantUnit: string;
  totalVolume: number;
  directVolume: number;
  directRevenue: number;
  packagedVolume: number;
  packagedCount: number;
  packagedRevenue: number;
  packageBreakdown: Array<{
    packageLabel: string;
    count: number;
    weightKg: number;
    revenue: number;
    percentage: number;
  }>;
  productsByVolume: Array<{
    name: string;
    volume: number;
    unit: string;
    revenue: number;
    orders: number;
    percentage: number;
  }>;
  customersByVolume: Array<{
    name: string;
    city?: string;
    volume: number;
    unit: string;
    totalSpent: number;
    orders: number;
    percentage: number;
  }>;
  unitsMap: Record<string, number>;
}

interface VolumeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeFilterLabel: string;
  data: VolumeAnalysisData;
}

export const VolumeDetailModal: React.FC<VolumeDetailModalProps> = ({
  isOpen,
  onClose,
  timeFilterLabel,
  data
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'packages' | 'products' | 'customers'>('overview');
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const unit = data.dominantUnit || 'Units';
  const isWeight = unit.toLowerCase() === 'kg' || unit.toLowerCase() === 'gm';
  const hasPackages = data.packageBreakdown && data.packageBreakdown.length > 0;

  const formattedTotalVolume = data.totalVolume % 1 === 0
    ? data.totalVolume.toLocaleString('en-IN')
    : data.totalVolume.toFixed(1);

  const formattedDirectVolume = data.directVolume % 1 === 0
    ? data.directVolume.toLocaleString('en-IN')
    : data.directVolume.toFixed(1);

  const formattedPackagedVolume = data.packagedVolume % 1 === 0
    ? data.packagedVolume.toLocaleString('en-IN')
    : data.packagedVolume.toFixed(1);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shadow-sm">
              {isWeight ? <Scale size={22} className="text-amber-700" /> : <BarChart3 size={22} className="text-blue-700" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                  {isWeight ? 'Weight & Volume Analysis' : `Volume Analysis (${unit})`}
                </h3>
                <span className="text-[11px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                  {timeFilterLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isWeight
                  ? 'Granular breakdown of total kilograms sold across loose items and converted packets'
                  : `Comprehensive breakdown of total ${unit} volume sold across catalog and clients`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-xl transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total {unit}</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5">
              {formattedTotalVolume} <span className="text-xs sm:text-sm font-semibold text-slate-500">{unit}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Overall Business Volume</div>
          </div>

          {isWeight && hasPackages ? (
            <>
              <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Packaged ({unit})</span>
                  <Package size={13} className="text-amber-600" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-amber-700 mt-0.5">
                  {formattedPackagedVolume} <span className="text-xs sm:text-sm font-semibold text-amber-600">{unit}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  From {data.packagedCount.toLocaleString('en-IN')} Packets
                </div>
              </div>

              <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Loose / Direct</span>
                  <Scale size={13} className="text-emerald-600" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-emerald-700 mt-0.5">
                  {formattedDirectVolume} <span className="text-xs sm:text-sm font-semibold text-emerald-600">{unit}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Weighed directly</div>
              </div>
            </>
          ) : (
            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Unit Type</div>
              <div className="text-lg sm:text-2xl font-black text-blue-700 mt-0.5">{unit}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Primary Business Metric</div>
            </div>
          )}

          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Products Active</div>
            <div className="text-lg sm:text-2xl font-black text-indigo-700 mt-0.5">
              {data.productsByVolume.length}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Contributing products</div>
          </div>
        </div>

        {/* Tab Navigation: Fits all tabs on mobile without scrolling, elegant flex on desktop */}
        <div className="border-b border-slate-200 bg-slate-100/90 sm:bg-white shrink-0 p-1 sm:p-2 sm:px-5">
          <div className={`grid ${hasPackages ? 'grid-cols-4' : 'grid-cols-3'} sm:flex items-center gap-1 sm:gap-2`}>
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center min-w-0 ${
                activeTab === 'overview'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                  : 'bg-white/80 sm:bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 sm:border-transparent'
              }`}
            >
              <Layers size={15} className={`shrink-0 ${activeTab === 'overview' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Overview</span>
            </button>

            {hasPackages && (
              <button
                onClick={() => setActiveTab('packages')}
                className={`py-2 px-1 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center min-w-0 ${
                  activeTab === 'packages'
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                    : 'bg-white/80 sm:bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 sm:border-transparent'
                }`}
              >
                <Package size={15} className={`shrink-0 ${activeTab === 'packages' ? 'text-white' : 'text-amber-600'}`} />
                <span className="truncate flex items-center justify-center gap-1">
                  <span className="sm:hidden">Sizes</span>
                  <span className="hidden sm:inline">Package Sizes</span>
                  <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-tight ${
                    activeTab === 'packages' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {data.packageBreakdown.length}
                  </span>
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('products')}
              className={`py-2 px-1 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center min-w-0 ${
                activeTab === 'products'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                  : 'bg-white/80 sm:bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 sm:border-transparent'
              }`}
            >
              <ShoppingBag size={15} className={`shrink-0 ${activeTab === 'products' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">
                <span className="sm:hidden">Products</span>
                <span className="hidden sm:inline">Top Products by {unit}</span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('customers')}
              className={`py-2 px-1 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-sm font-bold transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 text-center min-w-0 ${
                activeTab === 'customers'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                  : 'bg-white/80 sm:bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 sm:border-transparent'
              }`}
            >
              <Users size={15} className={`shrink-0 ${activeTab === 'customers' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">
                <span className="sm:hidden">Customers</span>
                <span className="hidden sm:inline">Top Customers by {unit}</span>
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* If Weight & Packages exist, show composition */}
              {isWeight && hasPackages && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl border border-amber-200">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Scale size={14} /> Volume Composition
                  </h4>
                  <p className="text-xs text-slate-600 mb-3">
                    Your business sold a total of <strong>{formattedTotalVolume} Kg</strong>. Here is the split between loose bulk sales and pre-packaged packets:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800">Pre-Packaged Packets</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {data.packagedCount.toLocaleString('en-IN')} Packets converted to Kg
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-amber-700">{formattedPackagedVolume} Kg</div>
                        <div className="text-[11px] font-bold text-slate-500">
                          {data.totalVolume > 0 ? ((data.packagedVolume / data.totalVolume) * 100).toFixed(1) : 0}% of weight
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800">Direct / Loose Sales</div>
                        <div className="text-xs text-slate-500 mt-0.5">Sold directly by weight (Kg/Gm)</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-emerald-700">{formattedDirectVolume} Kg</div>
                        <div className="text-[11px] font-bold text-slate-500">
                          {data.totalVolume > 0 ? ((data.directVolume / data.totalVolume) * 100).toFixed(1) : 0}% of weight
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Package Size Quick Preview */}
              {hasPackages && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Package size={14} className="text-amber-600" /> Package Sizes Breakdown
                    </h4>
                    <button
                      onClick={() => setActiveTab('packages')}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      View All ({data.packageBreakdown.length}) <ChevronRight size={13} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {data.packageBreakdown.slice(0, 6).map((pkg, i) => (
                      <div key={i} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900 bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                            {pkg.packageLabel}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">{pkg.percentage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-2">
                          <div className="text-sm font-bold text-slate-800">
                            {pkg.count.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">Pkts</span>
                          </div>
                          <div className="text-xs font-extrabold text-amber-700">
                            {pkg.weightKg.toLocaleString('en-IN')} Kg
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Revenue: {formatINRFull(pkg.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 5 Products by Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Award size={14} className="text-amber-600" /> Leading Products by {unit}
                  </h4>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5 cursor-pointer"
                  >
                    View All ({data.productsByVolume.length}) <ChevronRight size={13} />
                  </button>
                </div>

                <div className="space-y-2">
                  {data.productsByVolume.slice(0, 5).map((prod, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">{prod.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                          <span>{prod.orders} orders</span>
                          <span>Revenue: {formatINRFull(prod.revenue)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm sm:text-base font-extrabold text-slate-900">
                          {prod.volume.toLocaleString('en-IN')} {prod.unit}
                        </div>
                        <div className="text-[10px] font-bold text-amber-700">
                          {prod.percentage.toFixed(1)}% of volume
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PACKAGES */}
          {activeTab === 'packages' && hasPackages && (
            <div className="space-y-3">
              <div className="text-xs text-slate-600">
                Detailed table showing all packet sizes sold, total packet quantities, equivalent calculated weight in kilograms, and revenue generated:
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Package Size</th>
                      <th className="py-2.5 px-3 text-right">Packets Sold</th>
                      <th className="py-2.5 px-3 text-right">Total Weight (Kg)</th>
                      <th className="py-2.5 px-3 text-right">Share of Weight</th>
                      <th className="py-2.5 px-3 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.packageBreakdown.map((pkg, i) => (
                      <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                        <td className="py-2.5 px-3 font-extrabold text-slate-900">
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">
                            {pkg.packageLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                          {pkg.count.toLocaleString('en-IN')} Pkts
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-800">
                          {pkg.weightKg.toLocaleString('en-IN')} Kg
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                              <div className="bg-amber-600 h-full rounded-full" style={{ width: `${Math.min(pkg.percentage, 100)}%` }} />
                            </div>
                            <span className="font-bold text-slate-700">{pkg.percentage.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatINRFull(pkg.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PRODUCTS */}
          {activeTab === 'products' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-600">
                All catalog products ranked by total volume sold in {unit}:
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 text-right">Volume ({unit})</th>
                      <th className="py-2.5 px-3 text-right">Share of Volume</th>
                      <th className="py-2.5 px-3 text-right">Orders</th>
                      <th className="py-2.5 px-3 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.productsByVolume.map((prod, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-bold">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[200px] truncate" title={prod.name}>
                          {prod.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          {prod.volume.toLocaleString('en-IN')} {prod.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(prod.percentage, 100)}%` }} />
                            </div>
                            <span className="font-bold text-slate-700">{prod.percentage.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{prod.orders}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatINRFull(prod.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOMERS */}
          {activeTab === 'customers' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-600">
                Customers ranked by the total volume of {unit} purchased:
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">City</th>
                      <th className="py-2.5 px-3 text-right">Volume ({unit})</th>
                      <th className="py-2.5 px-3 text-right">Share of Volume</th>
                      <th className="py-2.5 px-3 text-right">Orders</th>
                      <th className="py-2.5 px-3 text-right">Total Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.customersByVolume.map((cust, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-bold">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[200px] truncate" title={cust.name}>
                          {cust.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{cust.city || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          {cust.volume.toLocaleString('en-IN')} {cust.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
                              <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${Math.min(cust.percentage, 100)}%` }} />
                            </div>
                            <span className="font-bold text-slate-700">{cust.percentage.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{cust.orders}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-blue-600">
                          {formatINRFull(cust.totalSpent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            {isWeight
              ? '💡 Tip: Packets are converted to kilograms automatically based on their package size (e.g. 500g = 0.5 Kg).'
              : `💡 Tip: Volume is tracked dynamically based on your business measurement units (${unit}).`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
