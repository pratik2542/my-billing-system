import React, { useState, useEffect } from 'react';
import {
  Settings, Package, FileText, BarChart3, Upload, X, PlusCircle, Check,
  Type, Sliders, Palette, Eye, Table, ArrowLeft, ArrowRight, Save,
  Loader2, ShieldCheck, Database, Key, Cloud, Bot, HardDrive, RefreshCw
} from 'lucide-react';
import { BusinessSettings, BillFontScope, ColumnId } from '../types';
import {
  DEFAULT_BUSINESS_SETTINGS, DEFAULT_COLUMN_HEADERS,
  DEFAULT_UNMERGED_COLUMN_ORDER, DEFAULT_MERGED_COLUMN_ORDER,
  getEffectiveColumnOrder, DEFAULT_COLUMN_WIDTHS, COLUMN_WIDTH_OPTIONS,
  DEFAULT_PRODUCT_UNITS, BILL_FONT_OPTIONS, getBillFontFamily
} from '../constants';
import { createBackup, openBackupFolder, getAiStatus, installLicense } from '../electron-api';

interface OfflineSettingsProps {
  settings: BusinessSettings;
  onUpdateSettings: (s: BusinessSettings) => Promise<void>;
  features: {
    enableAnalytics: boolean;
    enableAiAnalyst: boolean;
    ollamaModel: string;
    enablePaymentTracking: boolean;
    enableProductsMenu: boolean;
    enableCustomersMenu: boolean;
    enableGst: boolean;
    enableCsvImport: boolean;
    enableAuditTrail: boolean;
    enableCloudImport: boolean;
    autoUpdates: string;
    maxInvoicesPerMonth: number;
    customerName: string;
  };
  onShowBackup: () => void;
  onCloudImport: () => void;
  onReloadFeatures: () => Promise<void>;
}

type SettingsSubTab = 'branding' | 'units' | 'billing' | 'tax_bank' | 'data_license';

// Helper to compress base64 image data URLs for database optimization
const compressImageToMaxDataUrl = (
  dataUrl: string,
  maxWidth = 800,
  maxHeight = 400,
  quality = 0.8
): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      ctx.drawImage(img, 0, 0, width, height);

      try {
        let compressed = canvas.toDataURL('image/webp', quality);
        if (!compressed.startsWith('image/webp')) {
          compressed = canvas.toDataURL('image/png');
        }
        resolve(compressed);
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const areSettingsEqual = (a: BusinessSettings, b: BusinessSettings) => {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
};

export const OfflineSettings: React.FC<OfflineSettingsProps> = ({
  settings,
  onUpdateSettings,
  features,
  onShowBackup,
  onCloudImport,
  onReloadFeatures
}) => {
  const [tempSettings, setTempSettings] = useState<BusinessSettings>(settings || DEFAULT_BUSINESS_SETTINGS);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('branding');
  const [newUnitInput, setNewUnitInput] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // License & AI state
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  useEffect(() => {
    if (settings) {
      setTempSettings(settings);
      setHasUnsavedSettings(false);
    }
  }, [settings]);

  useEffect(() => {
    if (features?.enableAiAnalyst) {
      getAiStatus().then(setAiStatus).catch(() => {});
    }
  }, [features?.enableAiAnalyst]);

  const handleTempSettingsChange = (newSettings: BusinessSettings) => {
    setTempSettings(newSettings);
    setHasUnsavedSettings(!areSettingsEqual(newSettings, settings));
    setSaveSuccessNotice(false);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      let settingsToSave: BusinessSettings = {
        ...tempSettings,
        columnHeaders: {
          ...DEFAULT_COLUMN_HEADERS,
          ...(tempSettings.columnHeaders || {}),
          totalQuantityCustomText: ''
        }
      };

      if (settingsToSave.logoUrl && settingsToSave.logoUrl.length > 100000) {
        settingsToSave.logoUrl = await compressImageToMaxDataUrl(settingsToSave.logoUrl, 800, 400, 0.8);
      }
      if (settingsToSave.signatureUrl && settingsToSave.signatureUrl.length > 100000) {
        settingsToSave.signatureUrl = await compressImageToMaxDataUrl(settingsToSave.signatureUrl, 600, 300, 0.8);
      }

      await onUpdateSettings(settingsToSave);
      setTempSettings(settingsToSave);
      setHasUnsavedSettings(false);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 4000);
    } catch (e: any) {
      console.error('Error saving settings:', e);
      alert('Failed to save settings: ' + (e.message || 'Unknown error'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Logo handlers
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File size must be less than 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const raw = reader.result as string;
        const compressed = await compressImageToMaxDataUrl(raw, 800, 400, 0.8);
        handleTempSettingsChange({ ...tempSettings, logoUrl: compressed });
      };
      reader.onerror = () => alert('Error reading file. Please try again.');
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    if (!tempSettings.logoUrl) return;
    handleTempSettingsChange({ ...tempSettings, logoUrl: '' });
  };

  // Signature handlers
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File size must be less than 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const raw = reader.result as string;
        const compressed = await compressImageToMaxDataUrl(raw, 600, 300, 0.8);
        handleTempSettingsChange({ ...tempSettings, signatureUrl: compressed });
      };
      reader.onerror = () => alert('Error reading file. Please try again.');
      reader.readAsDataURL(file);
    }
  };

  const removeSignature = () => {
    if (!tempSettings.signatureUrl) return;
    handleTempSettingsChange({ ...tempSettings, signatureUrl: '' });
  };

  // Unit handlers
  const handleAddCustomUnit = () => {
    const trimmed = newUnitInput.trim();
    if (!trimmed) return;
    const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
    if (current.some((u: string) => u.toLowerCase() === trimmed.toLowerCase())) {
      alert(`Unit "${trimmed}" already exists.`);
      return;
    }
    handleTempSettingsChange({ ...tempSettings, customUnits: [...current, trimmed] });
    setNewUnitInput('');
  };

  // License upgrade handler
  const handleUpdateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setLicenseStatus({ type: 'loading', message: 'Validating and applying license key...' });
    try {
      const res = await installLicense(newKey.trim());
      if (res.valid || res.success) {
        setLicenseStatus({ type: 'success', message: '✅ License updated successfully! New features are now active.' });
        await onReloadFeatures();
        setTimeout(() => {
          setShowLicenseModal(false);
          setNewKey('');
          setLicenseStatus({ type: 'idle' });
        }, 1500);
      } else {
        setLicenseStatus({ type: 'error', message: res.error || 'Invalid license key for this computer.' });
      }
    } catch (err: any) {
      setLicenseStatus({ type: 'error', message: err.message || 'Failed to apply license.' });
    }
  };

  const currentOrder = getEffectiveColumnOrder(tempSettings.columnHeaders || DEFAULT_COLUMN_HEADERS);
  const colHdrs = tempSettings.columnHeaders || DEFAULT_COLUMN_HEADERS;
  const colLabels: Record<ColumnId, string> = {
    sn: colHdrs.snHeader || 'No.',
    particulars: colHdrs.particularsHeader || 'Details',
    packing: colHdrs.packingHeader || 'Packing',
    qty: colHdrs.qtyHeader || 'Qty',
    packingQty: colHdrs.mergedPackingQtyHeader || 'Packing / Qty',
    rate: colHdrs.rateHeader || 'Rate',
    amount: colHdrs.amountHeader || 'Amount'
  };

  const moveCol = (index: number, direction: 'left' | 'right') => {
    const newOrder = [...currentOrder];
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    const tmp = newOrder[index];
    newOrder[index] = newOrder[targetIdx];
    newOrder[targetIdx] = tmp;

    handleTempSettingsChange({
      ...tempSettings,
      columnHeaders: {
        ...DEFAULT_COLUMN_HEADERS,
        ...tempSettings.columnHeaders,
        columnOrder: newOrder
      }
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <div className="max-w-5xl mx-auto w-full bg-slate-800 rounded-xl shadow-xl border border-slate-700 flex flex-col h-full overflow-hidden my-2 sm:my-4">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
              <Settings className="w-6 h-6 text-blue-500" />
              Business & Bill Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize branding, invoice typography, column headers, units, GST, bank & local backups
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-700/60 px-3 py-1.5 rounded-lg border border-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">Offline SQLite Storage</span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="border-b border-slate-700 bg-slate-900/60 px-2 sm:px-6 pt-2 shrink-0">
          <div className="grid grid-cols-5 gap-1">
            {[
              { key: 'branding' as const, icon: <Settings className="w-4 h-4 text-blue-400" />, label: 'Branding', fullLabel: 'Branding & Header' },
              { key: 'units' as const, icon: <Package className="w-4 h-4 text-orange-400" />, label: 'Units', fullLabel: 'Product Units' },
              { key: 'billing' as const, icon: <FileText className="w-4 h-4 text-purple-400" />, label: 'Invoice', fullLabel: 'Invoice & Signature' },
              { key: 'tax_bank' as const, icon: <BarChart3 className="w-4 h-4 text-emerald-400" />, label: 'Tax/Bank', fullLabel: 'Tax, Bank & UPI' },
              { key: 'data_license' as const, icon: <HardDrive className="w-4 h-4 text-amber-400" />, label: 'Backups', fullLabel: 'Backups & License' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSettingsSubTab(tab.key)}
                className={`py-2.5 px-1 sm:px-3 rounded-t-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  settingsSubTab === tab.key
                    ? 'border-blue-500 text-blue-400 bg-slate-800 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tab.icon}
                <span className="sm:hidden">{tab.label}</span>
                <span className="hidden sm:inline">{tab.fullLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* SUB-TAB 1: Branding & Header */}
          {settingsSubTab === 'branding' && (
            <div className="space-y-6">
              <h3 className="font-bold text-white text-base flex items-center gap-2 border-b border-slate-700 pb-2">
                <Settings className="w-5 h-5 text-blue-400" />
                Branding, Logo & Header Configuration
              </h3>

              {/* Theme Color & Logo Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-750 p-4 rounded-xl border border-slate-700 bg-slate-850">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Theme Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={tempSettings.themeColor || '#dc2626'}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, themeColor: e.target.value })}
                      className="h-10 w-16 p-1 border border-slate-600 rounded bg-slate-800 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={tempSettings.themeColor || '#dc2626'}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, themeColor: e.target.value })}
                      className="p-2 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white font-mono w-28"
                    />
                    <span className="text-xs text-slate-400">Used for borders and header highlights on invoices</span>
                  </div>
                </div>

                <div className="bg-slate-750 p-4 rounded-xl border border-slate-700 bg-slate-850">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Business Logo</label>
                  <div className="flex flex-wrap gap-2.5 items-center">
                    <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-all shadow-sm">
                      <Upload size={14} />
                      <span>Upload Logo</span>
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleLogoUpload} className="hidden" />
                    </label>

                    {tempSettings.logoUrl && (
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="text-red-400 hover:text-white hover:bg-red-600/80 py-2 px-3 border border-red-500/40 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold"
                      >
                        <X size={14} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Saved locally as Base64 in SQLite. Max 5MB PNG/JPG.</p>
                </div>
              </div>

              {/* Logo Width & Live Header Preview */}
              {tempSettings.logoUrl && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-4">
                    <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                      <span className="text-xs font-bold text-blue-400">
                        Logo Width: {tempSettings.logoWidth || 80}px
                      </span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-2/3">
                      <input
                        type="range"
                        min="40"
                        max="350"
                        value={tempSettings.logoWidth || 80}
                        onChange={e => handleTempSettingsChange({ ...tempSettings, logoWidth: parseInt(e.target.value) || 80 })}
                        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 text-center">
                    Live Header Preview (Matches Printed Bill)
                  </div>
                  <div className="overflow-x-auto border-2 bg-white rounded-xl p-4 text-center relative shadow-lg" style={{ borderColor: tempSettings.themeColor || '#dc2626' }}>
                    <div className="min-w-[700px] relative">
                      <img
                        src={tempSettings.logoUrl}
                        alt="Logo"
                        className="absolute left-2 top-2 object-contain"
                        style={{ width: `${tempSettings.logoWidth || 80}px`, maxHeight: '100px' }}
                      />
                      <div className="mt-1">
                        <h1 className="text-4xl font-bold mb-1" style={{ color: tempSettings.themeColor || '#dc2626', letterSpacing: tempSettings.nameLetterSpacing || '0.05em' }}>
                          {tempSettings.name || 'Business Name'}
                        </h1>
                        <h2 className="text-xl font-bold" style={{ color: tempSettings.themeColor || '#dc2626' }}>
                          {tempSettings.subName || ''}
                        </h2>
                        <p className="mt-1 text-xs" style={{ color: tempSettings.themeColor || '#dc2626' }}>
                          {tempSettings.address} {tempSettings.mobile ? `M.: ${tempSettings.mobile}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Text Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Business Name (Header)</label>
                  <input
                    value={tempSettings.name}
                    onChange={e => handleTempSettingsChange({ ...tempSettings, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white focus:border-blue-500 outline-none"
                  />

                  {/* Character Spacing */}
                  <div className="bg-slate-850 p-3 rounded-lg border border-slate-700 mt-2 flex flex-wrap items-center gap-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Letter Spacing:
                    </label>
                    <select
                      value={tempSettings.nameLetterSpacing || '0.05em'}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, nameLetterSpacing: e.target.value })}
                      className="p-1.5 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white font-medium cursor-pointer"
                    >
                      <option value="-0.05em">Very Tight (-2px)</option>
                      <option value="-0.025em">Tight (-1px)</option>
                      <option value="0em">Normal (0px)</option>
                      <option value="0.025em">Wide (+1px)</option>
                      <option value="0.05em">Wider (+2px) [Default]</option>
                      <option value="0.08em">Extra Wide (+3px)</option>
                      <option value="0.1em">Widest (+4px)</option>
                      <option value="0.15em">Ultra Wide (+6px)</option>
                    </select>
                    <span className="text-[11px] text-slate-400">
                      Adjusts spacing between characters in your main business title.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Subtitle / Tagline</label>
                  <input
                    value={tempSettings.subName}
                    onChange={e => handleTempSettingsChange({ ...tempSettings, subName: e.target.value })}
                    placeholder="e.g. offset & screen printing, packaging box"
                    className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Address</label>
                  <input
                    value={tempSettings.address}
                    onChange={e => handleTempSettingsChange({ ...tempSettings, address: e.target.value })}
                    placeholder="e.g. Opposite Ram Temple, Talaja Road, Palitana"
                    className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Mobile / Phone</label>
                    <input
                      value={tempSettings.mobile}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, mobile: e.target.value })}
                      placeholder="e.g. 94269 89569"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Logo Initial (Fallback if no logo)</label>
                    <input
                      value={tempSettings.logoInitial}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, logoInitial: e.target.value })}
                      maxLength={1}
                      placeholder="P"
                      className="w-20 p-2.5 border border-slate-600 rounded-lg text-center font-bold text-sm bg-slate-800 text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: Product Units */}
          {settingsSubTab === 'units' && (
            <div className="space-y-6">
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-400" />
                  Product Measurement Units
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Configure which measurement units appear in your item and product entry dropdowns.
                </p>

                {/* Active Selected Units */}
                <div className="mb-5">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Active Units ({ (tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).length })
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).map((u: string) => (
                      <span
                        key={u}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30"
                      >
                        {u}
                        <button
                          type="button"
                          onClick={() => {
                            const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
                            handleTempSettingsChange({ ...tempSettings, customUnits: current.filter((x: string) => x !== u) });
                          }}
                          className="hover:bg-orange-500/40 rounded-full p-0.5 text-orange-400 hover:text-white transition-colors cursor-pointer"
                          title={`Remove ${u}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Add Custom Unit Form */}
                <div className="flex items-center gap-2 mb-5">
                  <input
                    type="text"
                    placeholder="Add custom unit (e.g. Carton, Roll, Set, Bundle...)"
                    value={newUnitInput}
                    onChange={e => setNewUnitInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomUnit();
                      }
                    }}
                    className="flex-1 p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomUnit}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                  >
                    <PlusCircle size={14} />
                    <span>Add Unit</span>
                  </button>
                </div>

                {/* Quick Add Presets */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Quick Add Preset Units
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_PRODUCT_UNITS.filter(u => !(tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).includes(u)).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
                          handleTempSettingsChange({ ...tempSettings, customUnits: [...current, preset] });
                        }}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <PlusCircle size={11} className="text-orange-400" />
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 3: Invoice & Signature */}
          {settingsSubTab === 'billing' && (
            <div className="space-y-6">
              {/* Typography / Font Selection */}
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Type className="w-5 h-5 text-purple-400" />
                      Bill Item & Customer Typography
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select realistic invoice printing fonts that give an authentic paper receipt look.
                    </p>
                  </div>
                  <span className="bg-purple-900/60 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Authentic Typography
                  </span>
                </div>

                {/* Font Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {BILL_FONT_OPTIONS.map(font => {
                    const isSelected = (tempSettings.billFont || 'crimson-serif') === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => handleTempSettingsChange({ ...tempSettings, billFont: font.id })}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-purple-500 bg-purple-950/40 ring-2 ring-purple-500/30'
                            : 'border-slate-700 bg-slate-800 hover:border-purple-400/50 hover:bg-slate-750'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                isSelected ? 'bg-purple-500 text-white' : 'border border-slate-500 bg-slate-900'
                              }`}>
                                {isSelected && <Check size={10} strokeWidth={3} />}
                              </div>
                              <span className="font-bold text-sm text-white">{font.name}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isSelected ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {font.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{font.description}</p>
                        </div>
                        <div
                          className="px-2.5 py-1.5 rounded-lg bg-white text-slate-900 text-xs truncate font-medium mt-auto"
                          style={{ fontFamily: font.fontFamily }}
                        >
                          {font.exampleCustomer} • {font.exampleItem}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Font Scope & Weight */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-purple-400" />
                      Font Application Scope
                    </label>
                    <select
                      value={tempSettings.billFontScope || 'items_and_customer'}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, billFontScope: e.target.value as BillFontScope })}
                      className="w-full p-2 border border-slate-600 rounded-lg text-xs font-semibold bg-slate-900 text-white cursor-pointer outline-none focus:border-purple-500"
                    >
                      <option value="items_and_customer">Items, Customer & Amounts Only (Stationery Look)</option>
                      <option value="entire_bill">Entire Invoice Body (Uniform Modern)</option>
                    </select>
                  </div>

                  <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-purple-400" />
                      Ink Weight / Thickness
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['normal', 'medium', 'bold'] as const).map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => handleTempSettingsChange({ ...tempSettings, billFontWeight: w })}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border text-center capitalize transition-all cursor-pointer ${
                            (tempSettings.billFontWeight || 'medium') === w
                              ? 'border-purple-500 bg-purple-600 text-white'
                              : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Typography Preview */}
                <div className="bg-slate-900 p-3.5 rounded-xl border border-dashed border-purple-500/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">
                      <Eye size={12} />
                      Live Bill Typography Preview
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Font: {BILL_FONT_OPTIONS.find(f => f.id === (tempSettings.billFont || 'crimson-serif'))?.name || 'Classic'}
                    </span>
                  </div>

                  <div
                    className="bg-white p-3 rounded-lg border shadow-sm text-slate-900"
                    style={{
                      borderColor: tempSettings.themeColor || '#dc2626',
                      fontFamily: tempSettings.billFontScope === 'entire_bill' ? getBillFontFamily(tempSettings.billFont) : undefined
                    }}
                  >
                    <div className="text-center pb-2 border-b" style={{ borderColor: tempSettings.themeColor || '#dc2626' }}>
                      <div className="font-bold text-sm" style={{ color: tempSettings.themeColor || '#dc2626' }}>
                        {tempSettings.name || 'PRINT WORKS'}
                      </div>
                    </div>
                    <div className="py-1.5 border-b flex justify-between text-xs" style={{ borderColor: tempSettings.themeColor || '#dc2626' }}>
                      <div>
                        <span className="font-bold mr-1" style={{ color: tempSettings.themeColor || '#dc2626' }}>M/s.</span>
                        <span
                          className={`${tempSettings.billFontWeight === 'bold' ? 'font-bold' : tempSettings.billFontWeight === 'normal' ? 'font-normal' : 'font-medium'}`}
                          style={tempSettings.billFontScope !== 'entire_bill' ? { fontFamily: getBillFontFamily(tempSettings.billFont) } : undefined}
                        >
                          Shreeji Trading Co. (Palitana)
                        </span>
                      </div>
                      <div>
                        <span className="font-bold mr-1" style={{ color: tempSettings.themeColor || '#dc2626' }}>Bill No:</span>
                        <span className="font-semibold">1042</span>
                      </div>
                    </div>
                    <div className="text-xs pt-1">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span style={tempSettings.billFontScope !== 'entire_bill' ? { fontFamily: getBillFontFamily(tempSettings.billFont) } : undefined}>
                          1. Offset Color Box Printing (1000 Pcs)
                        </span>
                        <span className="font-bold">₹4,500.00</span>
                      </div>
                      <div className="flex justify-between pt-1.5 font-bold text-xs" style={{ color: tempSettings.themeColor || '#dc2626' }}>
                        <span>Total:</span>
                        <span>₹4,500.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column Headers & Merging */}
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                  <Table className="w-5 h-5 text-blue-400" />
                  Column Headers & Merging
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Customize table column names, merge Packing and Qty, or reorder column layout.
                </p>

                {/* Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                    <label htmlFor="mergePackingAndQty" className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="mergePackingAndQty"
                        checked={tempSettings.columnHeaders?.mergePackingAndQty || false}
                        onChange={e => handleTempSettingsChange({
                          ...tempSettings,
                          columnHeaders: {
                            ...DEFAULT_COLUMN_HEADERS,
                            ...tempSettings.columnHeaders,
                            mergePackingAndQty: e.target.checked
                          }
                        })}
                        className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">Merge Packing & Qty column</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">Combines both into one column (e.g., "50 kg (2 Pcs)").</span>
                      </div>
                    </label>
                  </div>

                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                    <label htmlFor="showUnitInItemsTable" className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="showUnitInItemsTable"
                        checked={tempSettings.columnHeaders?.showUnitInItemsTable !== false}
                        onChange={e => handleTempSettingsChange({
                          ...tempSettings,
                          columnHeaders: {
                            ...DEFAULT_COLUMN_HEADERS,
                            ...tempSettings.columnHeaders,
                            showUnitInItemsTable: e.target.checked
                          }
                        })}
                        className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">Show Unit in Bill Rows</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">Uncheck if column header already mentions unit.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Column Headers Names */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">No. Header</label>
                    <input
                      value={tempSettings.columnHeaders?.snHeader ?? 'No.'}
                      onChange={e => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, snHeader: e.target.value }
                      })}
                      className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Details Header</label>
                    <input
                      value={tempSettings.columnHeaders?.particularsHeader ?? 'Details'}
                      onChange={e => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, particularsHeader: e.target.value }
                      })}
                      className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                    />
                  </div>

                  {tempSettings.columnHeaders?.mergePackingAndQty ? (
                    <div>
                      <label className="block text-[10px] font-bold text-purple-400 uppercase mb-1">Merged Header</label>
                      <input
                        value={tempSettings.columnHeaders?.mergedPackingQtyHeader ?? 'Packing / Qty'}
                        onChange={e => handleTempSettingsChange({
                          ...tempSettings,
                          columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, mergedPackingQtyHeader: e.target.value }
                        })}
                        className="w-full p-2 border border-purple-500 rounded-lg text-xs bg-purple-950/40 text-purple-200 font-bold"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Packing Header</label>
                        <input
                          value={tempSettings.columnHeaders?.packingHeader ?? 'Packing'}
                          onChange={e => handleTempSettingsChange({
                            ...tempSettings,
                            columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, packingHeader: e.target.value }
                          })}
                          className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qty Header</label>
                        <input
                          value={tempSettings.columnHeaders?.qtyHeader ?? 'Qty'}
                          onChange={e => handleTempSettingsChange({
                            ...tempSettings,
                            columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, qtyHeader: e.target.value }
                          })}
                          className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rate Header</label>
                    <input
                      value={tempSettings.columnHeaders?.rateHeader ?? 'Rate'}
                      onChange={e => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, rateHeader: e.target.value }
                      })}
                      className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount Header</label>
                    <input
                      value={tempSettings.columnHeaders?.amountHeader ?? 'Amount'}
                      onChange={e => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, amountHeader: e.target.value }
                      })}
                      className="w-full p-2 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white"
                    />
                  </div>
                </div>

                {/* Column Reordering */}
                <div className="pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      Reorder Columns
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: {
                          ...DEFAULT_COLUMN_HEADERS,
                          ...tempSettings.columnHeaders,
                          columnOrder: tempSettings.columnHeaders?.mergePackingAndQty ? [...DEFAULT_MERGED_COLUMN_ORDER] : [...DEFAULT_UNMERGED_COLUMN_ORDER]
                        }
                      })}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                    >
                      Reset Order
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {currentOrder.map((colId, idx) => (
                      <div key={colId} className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-slate-400">Col {idx + 1}</span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveCol(idx, 'left')}
                              className="p-0.5 rounded bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Move Left"
                            >
                              <ArrowLeft size={11} />
                            </button>
                            <button
                              type="button"
                              disabled={idx === currentOrder.length - 1}
                              onClick={() => moveCol(idx, 'right')}
                              className="p-0.5 rounded bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                              title="Move Right"
                            >
                              <ArrowRight size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="font-bold text-xs text-white truncate mb-1">
                          {colLabels[colId]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Show Total Quantity in Footer */}
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <label htmlFor="showTotalQuantityInFooter" className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="showTotalQuantityInFooter"
                      checked={tempSettings.columnHeaders?.showTotalQuantityInFooter !== false}
                      onChange={e => handleTempSettingsChange({
                        ...tempSettings,
                        columnHeaders: {
                          ...DEFAULT_COLUMN_HEADERS,
                          ...tempSettings.columnHeaders,
                          showTotalQuantityInFooter: e.target.checked
                        }
                      })}
                      className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Show Total Quantity in Bill Footer</span>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        Sums and displays the quantity total at the bottom of the bill table.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Invoice Auto-Increment */}
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Invoice Auto-Increment
                </h3>
                <label className="block text-xs font-bold text-slate-400 mb-1">Next Invoice Number</label>
                <input
                  type="number"
                  value={tempSettings.nextInvoiceNumber}
                  onChange={e => handleTempSettingsChange({ ...tempSettings, nextInvoiceNumber: parseInt(e.target.value) || 1 })}
                  className="w-36 p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white font-bold outline-none focus:border-blue-500"
                />
              </div>

              {/* Signature Settings */}
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" />
                  Signature Settings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Signature Name (Optional)</label>
                    <input
                      value={tempSettings.signatureName || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, signatureName: e.target.value })}
                      placeholder="e.g. S.J.B.G.U"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Appears as "For, [Name]" on printed invoices.</p>
                  </div>

                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Signature Image (Optional)</label>
                    <div className="flex flex-wrap gap-3 items-center">
                      <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-all shadow-sm">
                        <Upload size={14} />
                        <span>Upload Signature</span>
                        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleSignatureUpload} className="hidden" />
                      </label>

                      {tempSettings.signatureUrl && (
                        <button
                          type="button"
                          onClick={removeSignature}
                          className="text-red-400 hover:text-white hover:bg-red-600/80 py-2 px-3 border border-red-500/40 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        >
                          <X size={14} />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    {tempSettings.signatureUrl && (
                      <div className="mt-3 p-3 bg-white rounded-lg inline-block">
                        <img
                          src={tempSettings.signatureUrl}
                          alt="Signature"
                          className="max-h-16 object-contain filter contrast-125"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Invoice Declaration */}
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Invoice Declaration Note
                </h3>
                <div className="space-y-3 mt-3">
                  <label htmlFor="showDeclaration" className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="showDeclaration"
                      checked={tempSettings.showDeclaration !== false}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, showDeclaration: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Show Declaration on Invoice</span>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">Displays standard declaration at footer of printed bills.</span>
                    </div>
                  </label>

                  {tempSettings.showDeclaration !== false && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-400">Declaration Text</label>
                        <button
                          type="button"
                          onClick={() => handleTempSettingsChange({
                            ...tempSettings,
                            declarationText: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."
                          })}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                        >
                          Reset to Default
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={tempSettings.declarationText ?? "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}
                        onChange={e => handleTempSettingsChange({ ...tempSettings, declarationText: e.target.value })}
                        className="w-full p-2.5 border border-slate-600 rounded-lg text-xs bg-slate-800 text-white outline-none focus:border-blue-500 resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Create Bill Display Options */}
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-400" />
                  Create Bill Display Options
                </h3>
                <p className="text-[11px] text-slate-400 mb-3">
                  Customize which controls and details appear while generating bills.
                </p>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-3.5">
                  <label htmlFor="offlineShowUnitInBillRow" className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="offlineShowUnitInBillRow"
                      checked={tempSettings.showUnitInBillRow !== false}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, showUnitInBillRow: e.target.checked })}
                      className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Show Unit & Footer Total Section in Create Bill</span>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        When enabled, the section with "Show Unit in Bill Rows" and "Footer Total Quantity" appears in Create Bill. When disabled, this section is hidden and the bill uses default values.
                      </span>
                    </div>
                  </label>

                  <div className="border-t border-slate-700 pt-3">
                    <label htmlFor="offlineShowProductPriceInDropdown" className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="offlineShowProductPriceInDropdown"
                        checked={tempSettings.showProductPriceInDropdown !== false}
                        onChange={e => handleTempSettingsChange({ ...tempSettings, showProductPriceInDropdown: e.target.checked })}
                        className="w-4 h-4 accent-blue-500 mt-0.5 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">Show Price in Product Catalog Dropdown</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                          When enabled, displays the rate and unit (e.g. - ₹50/Kg) next to product names in the quick-select catalog dropdown.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 4: Tax, Bank & UPI */}
          {settingsSubTab === 'tax_bank' && (
            <div className="space-y-6">
              {/* GST Settings */}
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  Tax & GST Settings
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="enableGst"
                    checked={tempSettings.enableGst}
                    onChange={e => handleTempSettingsChange({ ...tempSettings, enableGst: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="enableGst" className="text-sm font-bold text-white cursor-pointer select-none">
                    Enable GST Calculation on Bills
                  </label>
                </div>

                {tempSettings.enableGst && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-8">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">GSTIN (Optional)</label>
                      <input
                        value={tempSettings.gstin || ''}
                        onChange={e => handleTempSettingsChange({ ...tempSettings, gstin: e.target.value })}
                        placeholder="e.g. 24ABCDE1234F1Z5"
                        className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Default GST Rate (%)</label>
                      <input
                        type="number"
                        value={tempSettings.defaultGstRate || 0}
                        onChange={e => handleTempSettingsChange({ ...tempSettings, defaultGstRate: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bank Details */}
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-3">Bank Details (Printed on Invoice)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Bank Name</label>
                    <input
                      value={tempSettings.bankName || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, bankName: e.target.value })}
                      placeholder="e.g. Kotak Mahindra Bank"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Account Number</label>
                    <input
                      value={tempSettings.bankAccountNumber || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, bankAccountNumber: e.target.value })}
                      placeholder="e.g. 1234567890"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">IFSC Code</label>
                    <input
                      value={tempSettings.bankIfsc || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, bankIfsc: e.target.value })}
                      placeholder="e.g. KKBK0001234"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Branch</label>
                    <input
                      value={tempSettings.bankBranch || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, bankBranch: e.target.value })}
                      placeholder="e.g. Palitana Branch"
                      className="w-full p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* UPI QR Settings */}
              <div className="bg-slate-850 p-4 sm:p-5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-white text-base mb-2">UPI Payment & Dynamic QR Code</h3>
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="showUpiQr"
                    checked={tempSettings.showUpiQr}
                    onChange={e => handleTempSettingsChange({ ...tempSettings, showUpiQr: e.target.checked })}
                    className="w-5 h-5 accent-blue-500 cursor-pointer"
                  />
                  <label htmlFor="showUpiQr" className="text-sm font-bold text-white cursor-pointer select-none">
                    Show Dynamic UPI QR Code on Bill
                  </label>
                </div>

                {tempSettings.showUpiQr && (
                  <div className="pl-8">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">UPI ID (VPA)</label>
                    <input
                      value={tempSettings.upiId || ''}
                      onChange={e => handleTempSettingsChange({ ...tempSettings, upiId: e.target.value })}
                      placeholder="e.g. 9426989569@upi or name@bank"
                      className="w-full sm:w-96 p-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-white outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-2 italic">A dynamic payment QR code with the invoice amount will be printed on bills.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUB-TAB 5: Backups, Cloud & License */}
          {settingsSubTab === 'data_license' && (
            <div className="space-y-6">
              {/* Backup Section */}
              <div className="bg-slate-850 rounded-xl p-5 border border-slate-700">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  Local Database Backup & Restore
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Automated backups are created daily in your Documents/BillingBackups directory. You can create an instant snapshot or restore any previous backup.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={onShowBackup}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw size={14} />
                    <span>Manage Backups</span>
                  </button>
                  <button
                    onClick={() => createBackup().then(r => alert(r.success ? `✅ Backup saved to:\n${r.filePath}` : `❌ ${r.error}`))}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Save size={14} />
                    <span>Backup Now</span>
                  </button>
                  <button
                    onClick={openBackupFolder}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Open Backup Folder</span>
                  </button>
                </div>
              </div>

              {/* Cloud Import Section */}
              {features?.enableCloudImport && (
                <div className="bg-slate-850 rounded-xl p-5 border border-slate-700">
                  <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                    <Cloud className="w-5 h-5 text-purple-400" />
                    Import from Cloud App
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Import businesses, invoices, products, and customers exported from the cloud Admin Portal JSON file.
                  </p>
                  <button
                    onClick={onCloudImport}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Import Cloud Export JSON</span>
                  </button>
                </div>
              )}

              {/* Offline AI Status */}
              {features?.enableAiAnalyst && aiStatus && (
                <div className="bg-slate-850 rounded-xl p-5 border border-slate-700">
                  <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                    <Bot className="w-5 h-5 text-amber-400" />
                    Offline AI Engine Status
                  </h3>
                  <div className="text-xs space-y-1.5 text-slate-300">
                    <div>AI Model: <span className="font-bold text-amber-400">{aiStatus.model}</span></div>
                    <div>Ollama Daemon: <span className={`font-bold ${aiStatus.ollamaRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                      {aiStatus.ollamaRunning ? '● Running' : '● Stopped'}
                    </span></div>
                    <div>Model Weights: <span className={`font-bold ${aiStatus.modelAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {aiStatus.modelAvailable ? '✓ Ready Offline' : '⚠ Not Downloaded'}
                    </span></div>
                  </div>
                </div>
              )}

              {/* License Information */}
              <div className="bg-slate-850 rounded-xl p-5 border border-slate-700">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  Software License Details
                </h3>
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Licensed Customer: <span className="text-white font-bold">{features?.customerName || 'Standard User'}</span></div>
                  <div className="text-[11px] text-slate-500">Hardware locked to this computer. Offline verification active.</div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => setShowLicenseModal(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Key size={14} />
                    <span>Update / Upgrade License Key</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Floating Unsaved / Saved Bar */}
        <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-700 shrink-0 flex items-center justify-between gap-3">
          {hasUnsavedSettings ? (
            <div className="flex items-center justify-between w-full bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 rounded-lg">
              <span className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2">
                <span>⚠️ You have unsaved configuration changes</span>
              </span>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold py-2 px-5 rounded-lg flex items-center gap-2 transition-all shadow-md cursor-pointer"
              >
                {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                <span>{isSavingSettings ? 'Saving to SQLite...' : 'Save Settings'}</span>
              </button>
            </div>
          ) : saveSuccessNotice ? (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg w-full">
              <Check size={16} />
              <span>All settings saved successfully to local database!</span>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Check size={14} className="text-emerald-400" />
                <span>All settings up to date</span>
              </span>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold py-1.5 px-4 rounded-lg transition-all cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* License Modal */}
      {showLicenseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                Update License Key
              </h3>
              <button
                onClick={() => setShowLicenseModal(false)}
                className="text-slate-400 hover:text-white text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Enter a new license key generated by your administrator to unlock new features or extend your license on this machine.
            </p>
            <form onSubmit={handleUpdateLicense} className="space-y-3">
              <textarea
                rows={3}
                required
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="Paste new license key here..."
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs outline-none focus:border-amber-500"
              />
              {licenseStatus.message && (
                <div className={`p-2.5 rounded-lg text-xs font-medium ${
                  licenseStatus.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                  licenseStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {licenseStatus.message}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLicenseModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={licenseStatus.type === 'loading'}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-5 rounded-lg transition-all"
                >
                  {licenseStatus.type === 'loading' ? 'Applying...' : 'Apply License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
