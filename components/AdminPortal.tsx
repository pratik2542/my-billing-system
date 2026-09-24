import React, { useState, useEffect, useCallback, useMemo } from "react";
import { db, firebaseConfig } from "../firebase";
import { collection, collectionGroup, doc, getDocs, setDoc, updateDoc, onSnapshot, query, orderBy, limit, deleteDoc } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { InvoiceTemplate, formatBillNum } from "./InvoiceTemplate";
import { InvoiceAuditTrailModal } from "./InvoiceAuditTrailModal";
import { Invoice, UserProfile, UserSession, AppErrorLog, UserActivityLog, ActivityCategory, BusinessSettings, ColumnId, InvoiceHeaderCustomization } from "../types";
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_COLUMN_HEADERS, DEFAULT_UNMERGED_COLUMN_ORDER, DEFAULT_MERGED_COLUMN_ORDER, getEffectiveColumnOrder, DEFAULT_COLUMN_WIDTHS, COLUMN_WIDTH_OPTIONS } from "../constants";
import {
  Users, ShieldCheck, Activity, AlertTriangle, UserPlus, Lock, Unlock, RefreshCw, Loader2, X,
  Smartphone, Monitor, Tablet, Clock, Sparkles, Bug, BarChart3, CheckCircle2, Eye, Building,
  Upload, Download, KeyRound, Edit, Mail, Calendar, TrendingUp, DollarSign, PieChart, Layers,
  Zap, Award, UserCheck, Filter, ArrowUpRight, FileText, Package, CreditCard, Trash2, Sliders,
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Columns, RotateCcw, Save, Copy, Check
} from "lucide-react";

// ---- Helpers ----
export const parseDeviceInfo = (ua: string): { device: string; browser: string } => {
  const browser = ua.includes("Chrome") && !ua.includes("Edg") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") && !ua.includes("Chrome") ? "Safari" : ua.includes("Edg") ? "Edge" : "Browser";
  const device = ua.includes("iPhone") || ua.includes("Android") ? "Mobile" : ua.includes("iPad") ? "Tablet" : "Desktop";
  return { device, browser };
};

const DeviceIcon: React.FC<{ device: string }> = ({ device }) => {
  if (device === "Mobile") return <Smartphone size={14} className="text-indigo-500" />;
  if (device === "Tablet") return <Tablet size={14} className="text-violet-500" />;
  return <Monitor size={14} className="text-slate-500" />;
};

const formatTs = (ts: number): string => {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export const relativeTime = (ts: number): string => {
  if (!ts) return "Never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

const StatusBadge: React.FC<{ status: "active" | "blocked" }> = ({ status }) =>
  status === "active" ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Blocked
    </span>
  );

// ---- Add / Sync User Modal ----
interface AddUserModalProps {
  onClose: () => void;
  onCreated: () => void;
  profiles: UserProfile[];
  preselectedBusinessId?: string;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ onClose, onCreated, profiles, preselectedBusinessId }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [targetBusinessId, setTargetBusinessId] = useState(preselectedBusinessId || "new");
  const [maxSessions, setMaxSessions] = useState<number>(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"create" | "sync">("create");

  const businessOptions = Array.from(new Set(profiles.map(p => p.businessId || p.uid))).map(bId => {
    const owner = profiles.find(p => p.uid === bId || p.businessId === bId);
    return {
      businessId: bId,
      name: owner?.businessName || owner?.displayName || owner?.email || bId
    };
  });

  // Automatically populate maxSessions & permissions preview when targetBusinessId changes
  useEffect(() => {
    if (targetBusinessId !== "new") {
      const parentOwner = profiles.find(p => p.uid === targetBusinessId || p.businessId === targetBusinessId);
      if (parentOwner && parentOwner.maxAllowedSessions) {
        setMaxSessions(parentOwner.maxAllowedSessions);
      }
    }
  }, [targetBusinessId, profiles]);

  const handleCreateOrSync = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setCreating(true);
    try {
      if (mode === "create") {
        const SECONDARY = "admin-user-creator";
        let secondaryApp = getApps().find((a) => a.name === SECONDARY);
        if (!secondaryApp) secondaryApp = initializeApp(firebaseConfig, SECONDARY);
        const secondaryAuth = getAuth(secondaryApp);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        
        const newUid = cred.user.uid;
        const finalBusinessId = targetBusinessId === "new" ? newUid : targetBusinessId;
        const parentOwner = profiles.find(p => p.uid === finalBusinessId || p.businessId === finalBusinessId);
        const businessName = parentOwner?.businessName || displayName.trim() || email.split("@")[0];

        // Inherit exact permissions, max sessions, and settings from first/existing account of this business
        const inheritedPermissions = parentOwner ? {
          paymentTrackingBlocked: !!parentOwner.paymentTrackingBlocked,
          productsMenuBlocked: !!parentOwner.productsMenuBlocked,
          customersMenuBlocked: !!parentOwner.customersMenuBlocked,
          csvImportAllowed: !!parentOwner.csvImportAllowed,
          analyticsPermissions: parentOwner.analyticsPermissions || parentOwner.analyticsVisibility || {
            showProductAnalysis: true,
            showCustomerAnalysis: true,
            showCustomerPurchaseDetails: true,
            showAiBusinessAnalyst: true
          }
        } : {
          paymentTrackingBlocked: false,
          productsMenuBlocked: false,
          customersMenuBlocked: false,
          csvImportAllowed: false
        };

        await setDoc(doc(db, "userProfiles", newUid), {
          uid: newUid,
          email,
          displayName: displayName.trim() || email.split("@")[0],
          status: "active",
          businessId: finalBusinessId,
          businessName: businessName,
          role: targetBusinessId === "new" ? "owner" : "member",
          maxAllowedSessions: parentOwner?.maxAllowedSessions || maxSessions,
          activeSessions: [],
          createdAt: Date.now(),
          lastLogin: 0,
          lastSeen: 0,
          aiRequestCount: 0,
          errorCount: 0,
          invoiceCount: 0,
          ...inheritedPermissions
        } as UserProfile);

        await fbSignOut(secondaryAuth);
      } else {
        const generatedUid = `user-${Date.now()}`;
        const finalBusinessId = targetBusinessId === "new" ? generatedUid : targetBusinessId;
        const parentOwner = profiles.find(p => p.uid === finalBusinessId || p.businessId === finalBusinessId);
        const businessName = parentOwner?.businessName || displayName.trim() || email.split("@")[0];

        const inheritedPermissions = parentOwner ? {
          paymentTrackingBlocked: !!parentOwner.paymentTrackingBlocked,
          productsMenuBlocked: !!parentOwner.productsMenuBlocked,
          customersMenuBlocked: !!parentOwner.customersMenuBlocked,
          csvImportAllowed: !!parentOwner.csvImportAllowed,
          analyticsPermissions: parentOwner.analyticsPermissions || parentOwner.analyticsVisibility || {
            showProductAnalysis: true,
            showCustomerAnalysis: true,
            showCustomerPurchaseDetails: true,
            showAiBusinessAnalyst: true
          }
        } : {
          paymentTrackingBlocked: false,
          productsMenuBlocked: false,
          customersMenuBlocked: false,
          csvImportAllowed: false
        };

        await setDoc(doc(db, "userProfiles", generatedUid), {
          uid: generatedUid,
          email: email.trim().toLowerCase(),
          displayName: displayName.trim() || email.split("@")[0],
          status: "active",
          businessId: finalBusinessId,
          businessName: businessName,
          role: targetBusinessId === "new" ? "owner" : "member",
          maxAllowedSessions: parentOwner?.maxAllowedSessions || maxSessions,
          activeSessions: [],
          createdAt: Date.now(),
          lastLogin: 0,
          lastSeen: 0,
          aiRequestCount: 0,
          errorCount: 0,
          invoiceCount: 0,
          ...inheritedPermissions
        } as UserProfile);
      }

      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1200);
    } catch (err: any) { setError(err.message || "Failed to save user profile."); }
    finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2"><UserPlus size={20}/><h2 className="font-bold text-lg">{mode === "create" ? "Add New User" : "Sync Existing Account"}</h2></div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full"><X size={18}/></button>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider ${mode === "create" ? "border-b-2 border-indigo-600 text-indigo-600 bg-white" : "text-slate-500"}`}
          >
            Create New Account
          </button>
          <button
            type="button"
            onClick={() => setMode("sync")}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider ${mode === "sync" ? "border-b-2 border-indigo-600 text-indigo-600 bg-white" : "text-slate-500"}`}
          >
            Sync Existing Auth Email
          </button>
        </div>

        <form onSubmit={handleCreateOrSync} className="p-6 space-y-4">
          {mode === "create" && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Business Account Workspace</label>
              <select
                value={targetBusinessId}
                onChange={(e) => setTargetBusinessId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-slate-50 font-medium"
              >
                <option value="new">+ Create New Standalone Business</option>
                {businessOptions.map(b => (
                  <option key={b.businessId} value={b.businessId}>
                    Join Existing: {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Display Name / User Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ramesh Store" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
          </div>

          {mode === "create" && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Password * (min 6 chars)</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Max Allowed Concurrent Logins</label>
            <select
              value={maxSessions}
              onChange={(e) => setMaxSessions(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-slate-50 font-medium"
            >
              <option value={1}>1 Device (Strict Concurrency)</option>
              <option value={2}>2 Devices</option>
              <option value={3}>3 Devices</option>
              <option value={5}>5 Devices</option>
              <option value={10}>10 Devices</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> {error}</p>}
          {success && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> User saved successfully!</p>}
          <button type="submit" disabled={creating || success} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2">
            {creating ? <><Loader2 size={16} className="animate-spin"/> Processing...</> : <><UserPlus size={16}/> {mode === "create" ? "Create Account" : "Sync Profile"}</>}
          </button>
        </form>
      </div>
    </div>
  );
};

// ---- Edit User Modal (Name, Business & Email) ----
interface EditUserModalProps {
  profile: UserProfile;
  onClose: () => void;
  onUpdated: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ profile, onClose, onUpdated }) => {
  const [displayName, setDisplayName] = useState(profile.displayName || profile.email.split("@")[0] || "");
  const [businessName, setBusinessName] = useState(profile.businessName || "");
  const [email, setEmail] = useState(profile.email || "");
  const [status, setStatus] = useState<"active" | "blocked">(profile.status || "active");
  const [maxAllowedSessions, setMaxAllowedSessions] = useState<number>(profile.maxAllowedSessions || 1);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const isMainAdmin = profile.email?.toLowerCase() === "admin_billing@pratik.ca";
  const [analyticsPermissions, setAnalyticsPermissions] = useState({
    showProductAnalysis: profile.analyticsPermissions?.showProductAnalysis !== false,
    showCustomerAnalysis: profile.analyticsPermissions?.showCustomerAnalysis !== false,
    showCustomerPurchaseDetails: profile.analyticsPermissions?.showCustomerPurchaseDetails !== false,
    showAiBusinessAnalyst: profile.analyticsPermissions?.showAiBusinessAnalyst !== false,
  });
  const [productsMenuBlocked, setProductsMenuBlocked] = useState(!!profile.productsMenuBlocked);
  const [customersMenuBlocked, setCustomersMenuBlocked] = useState(!!profile.customersMenuBlocked);
  const [paymentTrackingBlocked, setPaymentTrackingBlocked] = useState(!!profile.paymentTrackingBlocked);
  const [csvImportAllowed, setCsvImportAllowed] = useState(!!profile.csvImportAllowed);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedBiz = businessName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError("User name / display name cannot be empty.");
      return;
    }

    if (!isMainAdmin && (!trimmedEmail || !trimmedEmail.includes("@"))) {
      setError("Please enter a valid email address.");
      return;
    }

    setUpdating(true);
    setError("");
    try {
      const updates: any = {
        displayName: trimmedName,
        businessName: trimmedBiz || trimmedName,
        status,
        maxAllowedSessions,
        analyticsPermissions,
        productsMenuBlocked,
        customersMenuBlocked,
        paymentTrackingBlocked,
        csvImportAllowed,
      };
      if (!isMainAdmin) {
        updates.email = trimmedEmail;
      }

      await updateDoc(doc(db, "userProfiles", profile.uid), updates);
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update user profile.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Edit size={20} className="text-indigo-400" />
            <h2 className="font-bold text-lg">Edit User & Permissions</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">User Name / Display Name *</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ramesh Store"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Business Workspace Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Ramesh Enterprises"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email Address *</label>
            {isMainAdmin ? (
              <div>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-500 font-medium cursor-not-allowed mb-1"
                />
                <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                  Main Admin email (admin_billing@pratik.ca) cannot be edited.
                </p>
              </div>
            ) : (
              <div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none font-medium"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 <strong>Note:</strong> Updates account details in Firestore database.
                </p>
              </div>
            )}
          </div>

          {/* Account Status & Login Limits */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Account Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "blocked")}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="active">🟢 Active / Enabled</option>
                <option value="blocked">🔴 Blocked / Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Max Active Logins</label>
              <select
                value={maxAllowedSessions}
                onChange={(e) => setMaxAllowedSessions(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value={1}>1 Login</option>
                <option value={2}>2 Logins</option>
                <option value={3}>3 Logins</option>
                <option value={5}>5 Logins</option>
                <option value={10}>10 Logins</option>
              </select>
            </div>
          </div>

          {/* Admin Navigation & Modules Access for Business/User */}
          <div className="bg-indigo-50/80 p-3.5 rounded-xl border border-indigo-200 space-y-2">
            <div className="flex items-center gap-1.5 border-b border-indigo-200/80 pb-1.5">
              <Sliders size={14} className="text-indigo-600 shrink-0" />
              <span className="text-xs font-bold text-slate-800">Menu & Feature Access (Admin Control)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={!productsMenuBlocked}
                  onChange={(e) => setProductsMenuBlocked(!e.target.checked)}
                  className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Products Menu</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={!customersMenuBlocked}
                  onChange={(e) => setCustomersMenuBlocked(!e.target.checked)}
                  className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Customers Menu</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={!paymentTrackingBlocked}
                  onChange={(e) => setPaymentTrackingBlocked(!e.target.checked)}
                  className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Payment Tracking</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={csvImportAllowed}
                  onChange={(e) => setCsvImportAllowed(e.target.checked)}
                  className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">CSV Import</span>
              </label>
            </div>
            <p className="text-[10px] text-slate-500 italic">
              Unchecked menus will be hidden and blocked for this business user.
            </p>
          </div>

          {/* Admin Analytics & AI Permissions for User */}
          <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-2 mt-2">
            <div className="flex items-center gap-1.5 border-b border-purple-200 pb-1.5">
              <Sparkles size={14} className="text-purple-600 shrink-0" />
              <span className="text-xs font-bold text-slate-800">Analytics & AI Permissions for User</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={analyticsPermissions.showProductAnalysis}
                  onChange={(e) => setAnalyticsPermissions(prev => ({ ...prev, showProductAnalysis: e.target.checked }))}
                  className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Product Analysis</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={analyticsPermissions.showCustomerAnalysis}
                  onChange={(e) => setAnalyticsPermissions(prev => ({ ...prev, showCustomerAnalysis: e.target.checked }))}
                  className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Customer Analysis</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={analyticsPermissions.showCustomerPurchaseDetails}
                  onChange={(e) => setAnalyticsPermissions(prev => ({ ...prev, showCustomerPurchaseDetails: e.target.checked }))}
                  className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">Purchase Details</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={analyticsPermissions.showAiBusinessAnalyst}
                  onChange={(e) => setAnalyticsPermissions(prev => ({ ...prev, showAiBusinessAnalyst: e.target.checked }))}
                  className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="font-semibold text-slate-700 select-none">AI Business Analyst</span>
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> {error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updating}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
            >
              {updating ? <><Loader2 size={16} className="animate-spin"/> Saving...</> : <><Edit size={16}/> Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---- Helper: Category Config & Badges ----
export const CATEGORY_CONFIG: Record<ActivityCategory, { name: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  invoice: { name: "Invoices & Billing", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200", icon: <FileText size={14} className="text-indigo-600" /> },
  ai: { name: "AI Assistant", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", icon: <Sparkles size={14} className="text-violet-600" /> },
  product: { name: "Products Catalog", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: <Package size={14} className="text-amber-600" /> },
  customer: { name: "Customers Directory", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: <Users size={14} className="text-blue-600" /> },
  payment: { name: "Payment Tracking", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: <CreditCard size={14} className="text-emerald-600" /> },
  analytics: { name: "Analytics & Reports", color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200", icon: <BarChart3 size={14} className="text-sky-600" /> },
  settings: { name: "Settings & Config", color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-300", icon: <Edit size={14} className="text-slate-600" /> },
  auth: { name: "Login & Sessions", color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", icon: <Smartphone size={14} className="text-teal-600" /> }
};

export const computeUserBehavior = (
  profile: UserProfile,
  activityLogs: UserActivityLog[] = []
) => {
  const userLogs = activityLogs.filter(l => l.userId === profile.uid || (l as any).userEmail === profile.email);
  
  const rawCounts: Record<ActivityCategory, number> = {
    invoice: 0, ai: 0, product: 0, customer: 0, payment: 0, analytics: 0, settings: 0, auth: 0
  };

  userLogs.forEach(l => {
    if (l.category && rawCounts[l.category] !== undefined) {
      rawCounts[l.category] += 1;
    }
  });

  const counts: Record<ActivityCategory, number> = {
    invoice: Math.max(rawCounts.invoice, profile.invoiceCount || 0),
    ai: Math.max(rawCounts.ai, profile.aiRequestCount || 0),
    product: rawCounts.product,
    customer: rawCounts.customer,
    payment: rawCounts.payment,
    analytics: rawCounts.analytics,
    settings: rawCounts.settings,
    auth: Math.max(rawCounts.auth, profile.activeSessions?.length || 1)
  };

  const totalActions = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const stats = (Object.keys(counts) as ActivityCategory[]).map(cat => ({
    category: cat,
    count: counts[cat],
    percentage: Math.round((counts[cat] / totalActions) * 100)
  })).sort((a, b) => b.count - a.count);

  const invoicePct = (counts.invoice / totalActions) * 100;
  const aiPct = (counts.ai / totalActions) * 100;
  const productPct = (counts.product / totalActions) * 100;
  const paymentPct = (counts.payment / totalActions) * 100;
  const settingsPct = (counts.settings / totalActions) * 100;
  const customerPct = (counts.customer / totalActions) * 100;
  const analyticsPct = (counts.analytics / totalActions) * 100;

  let personaTitle = "⚡ Invoice Power Generator";
  let personaBadgeColor = "bg-indigo-100 text-indigo-800 border-indigo-300";
  let personaSummary = "This user mainly focuses on creating and managing invoices, issuing bills, and handling customer billing transactions.";

  if (aiPct >= 20 || counts.ai >= 8) {
    personaTitle = "🤖 AI Prompt Master";
    personaBadgeColor = "bg-violet-100 text-violet-800 border-violet-300";
    personaSummary = "Heavy power user of AI features! Frequently uses AI smart autofill for invoice items and rate predictions.";
  } else if (productPct >= 15) {
    personaTitle = "📦 Inventory & Catalog Manager";
    personaBadgeColor = "bg-amber-100 text-amber-800 border-amber-300";
    personaSummary = "Primary focus is managing product lines, unit packaging, pricing rates, and updating inventory catalogs.";
  } else if (paymentPct >= 15) {
    personaTitle = "💳 Payment & Cashflow Collector";
    personaBadgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300";
    personaSummary = "Actively tracks customer payments, records partial settlements, and monitors outstanding balances.";
  } else if (settingsPct + customerPct >= 25) {
    personaTitle = "⚙️ Operations & Directory Administrator";
    personaBadgeColor = "bg-slate-100 text-slate-800 border-slate-300";
    personaSummary = "Manages business workspace configurations, customer contact directories, and multi-user login rules.";
  } else if (analyticsPct >= 20) {
    personaTitle = "📊 Business Analyst & Viewer";
    personaBadgeColor = "bg-sky-100 text-sky-800 border-sky-300";
    personaSummary = "Focuses on reviewing business intelligence reports, customer spending trends, and overall revenue metrics.";
  } else if (invoicePct >= 50) {
    personaTitle = "⚡ High-Volume Invoice Creator";
    personaBadgeColor = "bg-indigo-100 text-indigo-800 border-indigo-300";
    personaSummary = "Dedicated billing specialist creating bills with high frequency across daily transactions.";
  } else {
    personaTitle = "🌟 Versatile Power User";
    personaBadgeColor = "bg-teal-100 text-teal-800 border-teal-300";
    personaSummary = "Demonstrates a balanced workflow across invoice generation, AI assistant tools, product management, and reporting.";
  }

  const timeBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  userLogs.forEach(l => {
    if (!l.timestamp) return;
    const hour = new Date(l.timestamp).getHours();
    if (hour >= 6 && hour < 12) timeBuckets.morning++;
    else if (hour >= 12 && hour < 18) timeBuckets.afternoon++;
    else if (hour >= 18 && hour < 24) timeBuckets.evening++;
    else timeBuckets.night++;
  });

  if (profile.lastLogin) {
    const h = new Date(profile.lastLogin).getHours();
    if (h >= 6 && h < 12) timeBuckets.morning++;
    else if (h >= 12 && h < 18) timeBuckets.afternoon++;
    else if (h >= 18 && h < 24) timeBuckets.evening++;
    else timeBuckets.night++;
  }

  let peakTimeLabel = "Afternoon (12 PM - 6 PM)";
  let maxTimeVal = timeBuckets.afternoon;
  if (timeBuckets.morning > maxTimeVal) { peakTimeLabel = "Morning (6 AM - 12 PM)"; maxTimeVal = timeBuckets.morning; }
  if (timeBuckets.evening > maxTimeVal) { peakTimeLabel = "Evening (6 PM - 12 AM)"; maxTimeVal = timeBuckets.evening; }
  if (timeBuckets.night > maxTimeVal) { peakTimeLabel = "Night (12 AM - 6 AM)"; maxTimeVal = timeBuckets.night; }

  return {
    userLogs,
    counts,
    stats,
    totalActions,
    personaTitle,
    personaBadgeColor,
    personaSummary,
    timeBuckets,
    peakTimeLabel
  };
};

// ---- User Detail Drawer ----
const UserDetailDrawer: React.FC<{ profile: UserProfile; activityLogs?: UserActivityLog[]; onClose: () => void }> = ({ profile, activityLogs = [], onClose }) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [errors, setErrors] = useState<AppErrorLog[]>([]);
  const [tab, setTab] = useState<"sessions" | "errors" | "behavior">("behavior");
  const [loading, setLoading] = useState(true);

  const behavior = useMemo(() => computeUserBehavior(profile, activityLogs), [profile, activityLogs]);

  useEffect(() => {
    setLoading(true);
    const unsubSessions = onSnapshot(
      query(collection(db, "userProfiles", profile.uid, "sessions"), orderBy("loginAt", "desc"), limit(20)),
      (sessSnap) => {
        setSessions(sessSnap.docs.map((d) => ({ id: d.id, ...d.data() } as UserSession)));
        setLoading(false);
      },
      (e) => { console.error(e); setLoading(false); }
    );
    const unsubErrors = onSnapshot(
      query(collection(db, "userProfiles", profile.uid, "errorLogs"), orderBy("timestamp", "desc"), limit(30)),
      (errSnap) => {
        setErrors(errSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AppErrorLog)));
      },
      (e) => console.error(e)
    );
    return () => { unsubSessions(); unsubErrors(); };
  }, [profile.uid]);

  const clearErrors = async () => {
    if (!window.confirm("Clear all error logs for this user?")) return;
    const errSnap = await getDocs(collection(db, "userProfiles", profile.uid, "errorLogs"));
    await Promise.all(errSnap.docs.map((d) => deleteDoc(d.ref)));
    setErrors([]);
    await updateDoc(doc(db, "userProfiles", profile.uid), { errorCount: 0 });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end md:items-center justify-center backdrop-blur-sm">
      <div className="bg-white w-full md:max-w-2xl h-[85vh] md:h-[80vh] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">User Profile & Behavior Analysis</p>
            <h3 className="font-bold text-lg">{profile.displayName || profile.email.split("@")[0]}</h3>
            <p className="text-xs text-slate-400">{profile.email} &bull; Max Logins: {profile.maxAllowedSessions || 1}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={18}/></button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 shrink-0">
          <div className="p-3 text-center"><div className="text-lg font-bold text-indigo-600">{profile.invoiceCount || 0}</div><div className="text-[10px] text-slate-500 uppercase font-bold">Invoices</div></div>
          <div className="p-3 text-center"><div className="text-lg font-bold text-violet-600">{profile.aiRequestCount || 0}</div><div className="text-[10px] text-slate-500 uppercase font-bold">AI Requests</div></div>
          <div className="p-3 text-center"><div className={`text-lg font-bold ${(profile.errorCount || 0) > 0 ? "text-red-600" : "text-green-600"}`}>{profile.errorCount || 0}</div><div className="text-[10px] text-slate-500 uppercase font-bold">Errors</div></div>
        </div>
        <div className="flex border-b border-slate-200 shrink-0">
          <button onClick={() => setTab("behavior")} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === "behavior" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500"}`}><Activity size={12} className="inline mr-1"/>Behavior & Persona</button>
          <button onClick={() => setTab("sessions")} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === "sessions" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500"}`}><Smartphone size={12} className="inline mr-1"/>Sessions ({sessions.length})</button>
          <button onClick={() => setTab("errors")} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === "errors" ? "border-b-2 border-red-500 text-red-600" : "text-slate-500"}`}><Bug size={12} className="inline mr-1"/>Errors ({errors.length})</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-slate-400"/></div>
          : tab === "behavior" ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${behavior.personaBadgeColor} flex items-center gap-1`}>
                    {behavior.personaTitle}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">Peak: {behavior.peakTimeLabel}</span>
                </div>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">{behavior.personaSummary}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2.5">Feature Activity Breakdown</h4>
                <div className="space-y-2">
                  {behavior.stats.map(s => {
                    const cfg = CATEGORY_CONFIG[s.category];
                    return (
                      <div key={s.category} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">{cfg.icon} {cfg.name}</span>
                          <span className="font-bold text-slate-900">{s.count} actions ({s.percentage}%)</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${cfg.bg.replace("bg-", "bg-").replace("-50", "-500")} rounded-full`} style={{ width: `${s.percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
          : tab === "sessions" ? (
            sessions.length === 0 ? <p className="text-center text-slate-400 py-10 text-sm">No sessions recorded yet</p> : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <DeviceIcon device={s.device}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{s.device} &mdash; {s.browser}</div>
                      <div className="text-xs text-slate-500">Login: {formatTs(s.loginAt)} &bull; Last active: {relativeTime(s.lastActive)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            errors.length === 0 ? (
              <div className="text-center py-10"><CheckCircle2 size={32} className="mx-auto mb-2 text-green-400"/><p className="text-slate-400 text-sm">No errors logged</p></div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end mb-2"><button onClick={clearErrors} className="text-xs text-red-600 underline">Clear all</button></div>
                {errors.map((e) => (
                  <div key={e.id} className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-red-700 truncate">{e.message}</p>
                        {e.route && <p className="text-[10px] text-red-500 mt-0.5">Tab: {e.route}</p>}
                        {e.stack && <pre className="text-[9px] text-red-400 mt-1 whitespace-pre-wrap max-h-16 overflow-hidden">{e.stack.slice(0, 200)}</pre>}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{relativeTime(e.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Export for Offline Modal (Per-Business or All) ----
const ExportOfflineModal: React.FC<{
  profiles: UserProfile[];
  onClose: () => void;
}> = ({ profiles, onClose }) => {
  const businessOptions = useMemo(() => {
    const list: Array<{ businessId: string; name: string }> = [];
    const seen = new Set<string>();
    profiles.forEach(p => {
      const bId = p.businessId || p.uid;
      if (bId && !seen.has(bId)) {
        seen.add(bId);
        list.push({
          businessId: bId,
          name: p.businessName || p.displayName || p.email.split("@")[0]
        });
      }
    });
    return list;
  }, [profiles]);

  const [targetBusinessId, setTargetBusinessId] = useState<string>(
    businessOptions.length > 0 ? businessOptions[0].businessId : "all"
  );
  const [isExporting, setIsExporting] = useState(false);

  const selectedBusinessName = useMemo(() => {
    if (targetBusinessId === "all") return "All Businesses";
    const found = businessOptions.find(b => b.businessId === targetBusinessId);
    return found?.name || targetBusinessId;
  }, [targetBusinessId, businessOptions]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const targets = targetBusinessId === "all"
        ? businessOptions.map(b => b.businessId)
        : [targetBusinessId];

      const exportData: any = {
        version: 1,
        exportedAt: Date.now(),
        exportFormat: "cloud-to-offline",
        targetBusinessId: targetBusinessId === "all" ? "all" : targetBusinessId,
        targetBusinessName: selectedBusinessName,
        settings: null,
        products: [],
        customers: [],
        invoices: [],
      };

      for (const wId of targets) {
        try {
          const [settingsSnap, productsSnap, customersSnap, invoicesSnap] = await Promise.all([
            getDocs(collection(db, "users", wId, "settings")).catch(() => null),
            getDocs(collection(db, "users", wId, "products")).catch(() => null),
            getDocs(collection(db, "users", wId, "customers")).catch(() => null),
            getDocs(collection(db, "users", wId, "invoices")).catch(() => null),
          ]);

          const settingsDoc = settingsSnap?.docs.find(d => d.id === "general");
          if (!exportData.settings && settingsDoc) {
            exportData.settings = settingsDoc.data();
          }

          const prods = productsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
          const custs = customersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
          const invs = invoicesSnap?.docs.map(d => ({ ...d.data() })) || [];

          exportData.products.push(...prods);
          exportData.customers.push(...custs);
          exportData.invoices.push(...invs);
        } catch (err) {
          console.warn("Could not export workspace:", wId, err);
        }
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      const safeName = selectedBusinessName.replace(/[^a-zA-Z0-9_-]/g, "_");
      a.href = url;
      a.download = `billing-export-${safeName}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`✅ Export complete for ${selectedBusinessName}!\n\nInvoices: ${exportData.invoices.length}\nProducts: ${exportData.products.length}\nCustomers: ${exportData.customers.length}\n\nFile downloaded: billing-export-${safeName}-${dateStr}.json`);
      onClose();
    } catch (e: any) {
      alert("❌ Export failed: " + (e.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Download size={22} className="text-emerald-100" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Export for Offline App</h2>
              <p className="text-xs text-emerald-100 mt-0.5">Choose which business data to export</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Business Account *
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-emerald-500 font-medium outline-none"
            >
              {businessOptions.map(b => (
                <option key={b.businessId} value={b.businessId}>
                  🏢 {b.name}
                </option>
              ))}
              <option value="all">📦 All Businesses (Full Backup)</option>
            </select>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 text-xs text-emerald-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-emerald-800">
              <ShieldCheck size={16} /> Privacy & Isolation:
            </div>
            <p className="text-slate-600 leading-relaxed">
              {targetBusinessId === "all"
                ? "All businesses will be exported into one combined JSON file."
                : `Only the products, customers, invoices, and settings of "${selectedBusinessName}" will be exported. No other business's data will be included.`}
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg flex items-center gap-2 shadow-xs"
            >
              {isExporting ? (
                <><Loader2 size={15} className="animate-spin" /> Exporting...</>
              ) : (
                <><Download size={15} /> Download Export JSON</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Offline Client & License Types ----
export interface OfflineClient {
  id: string;
  customerName: string;
  adminEmail: string;
  fingerprint: string;
  expiryMode: "lifetime" | "1year";
  expiresAt: number;
  autoUpdates: "manual" | "silent" | "disabled";
  ollamaModel: string;
  features: string[];
  licenseKey: string;
  createdAt: number;
  updatedAt: number;
  status?: "active" | "revoked";
}

// ---- Offline License Key Generator & Cloud Sync Modal ----
const OfflineLicenseModal: React.FC<{
  profiles: UserProfile[];
  clientToEdit?: OfflineClient | null;
  onClose: () => void;
  onSaved?: (client: OfflineClient) => void;
}> = ({ profiles, clientToEdit, onClose, onSaved }) => {
  const [customerName, setCustomerName] = useState(clientToEdit?.customerName || "");
  const [adminEmail, setAdminEmail] = useState(clientToEdit?.adminEmail || "");
  const [fingerprint, setFingerprint] = useState(clientToEdit?.fingerprint || "");
  const [expiryMode, setExpiryMode] = useState<"lifetime" | "1year">(clientToEdit?.expiryMode || "lifetime");
  const [autoUpdates, setAutoUpdates] = useState<"manual" | "silent" | "disabled">(clientToEdit?.autoUpdates || "manual");
  const [ollamaModel, setOllamaModel] = useState(clientToEdit?.ollamaModel || "qwen2.5:7b");

  // Feature Toggles (if editing, initialize from client's existing features)
  const [enableAnalytics, setEnableAnalytics] = useState(clientToEdit ? clientToEdit.features.includes("analytics") : true);
  const [enableAiAnalyst, setEnableAiAnalyst] = useState(clientToEdit ? clientToEdit.features.includes("ai") : true);
  const [enablePayments, setEnablePayments] = useState(clientToEdit ? clientToEdit.features.includes("payments") : true);
  const [enableProductsMenu, setEnableProductsMenu] = useState(clientToEdit ? clientToEdit.features.includes("products") : true);
  const [enableCustomersMenu, setEnableCustomersMenu] = useState(clientToEdit ? clientToEdit.features.includes("customers") : true);
  const [enableGst, setEnableGst] = useState(clientToEdit ? clientToEdit.features.includes("gst") : true);
  const [enableCsvImport, setEnableCsvImport] = useState(clientToEdit ? clientToEdit.features.includes("csv") : true);
  const [enableAuditTrail, setEnableAuditTrail] = useState(clientToEdit ? clientToEdit.features.includes("audit") : true);
  const [enableCloudImport, setEnableCloudImport] = useState(clientToEdit ? clientToEdit.features.includes("cloudimport") : true);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedFeatures, setGeneratedFeatures] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Master signing key: loaded from local .env or sessionStorage (NEVER hardcoded in source)
  const [signingKey, setSigningKey] = useState<string>(() => {
    return (
      (import.meta as any).env?.VITE_LICENSE_PRIVATE_KEY ||
      sessionStorage.getItem("admin_license_signing_key") ||
      ""
    );
  });
  const [showKeyField, setShowKeyField] = useState(false);

  // Business options from existing profiles
  const businessNames = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach(p => {
      if (p.businessName?.trim()) set.add(p.businessName.trim());
      else if (p.displayName?.trim()) set.add(p.displayName.trim());
    });
    return Array.from(set);
  }, [profiles]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanFp = fingerprint.trim().toLowerCase();
    if (!cleanFp || cleanFp.length < 32) {
      setError("Please enter a valid hardware machine fingerprint (at least 32 characters hex).");
      return;
    }
    if (!customerName.trim()) {
      setError("Please enter the client / customer business name.");
      return;
    }
    if (!adminEmail.trim() || !adminEmail.includes("@")) {
      setError("Please enter a valid admin email address (used for the primary colleague administrator).");
      return;
    }

    const activeKey = (
      signingKey.trim() ||
      ((import.meta as any).env?.VITE_LICENSE_PRIVATE_KEY || "").trim() ||
      sessionStorage.getItem("admin_license_signing_key") ||
      ""
    ).trim().replace(/\s+/g, "");

    if (!activeKey || activeKey.length < 32) {
      setError("Please enter your Master Private Signing Key (or configure VITE_LICENSE_PRIVATE_KEY in .env).");
      setShowKeyField(true);
      return;
    }

    setGenerating(true);
    try {
      try {
        sessionStorage.setItem("admin_license_signing_key", activeKey);
      } catch {}

      const features = [
        enableAnalytics ? "analytics" : "",
        enableAiAnalyst ? "ai" : "",
        enablePayments ? "payments" : "",
        enableProductsMenu ? "products" : "",
        enableCustomersMenu ? "customers" : "",
        enableGst ? "gst" : "",
        enableCsvImport ? "csv" : "",
        enableAuditTrail ? "audit" : "",
        enableCloudImport ? "cloudimport" : "",
      ].filter(Boolean);

      const expiresAt = expiryMode === "lifetime" ? -1 : Date.now() + 365 * 24 * 60 * 60 * 1000;

      const licensePayload: any = {
        fingerprint: cleanFp,
        customerName: customerName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        issuedAt: Date.now(),
        expiresAt,
        features,
        version: 2,
      };

      // Sign with Ed25519 Private Key via WebCrypto
      const privKeyBytes = new Uint8Array(activeKey.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      const cryptoKey = await window.crypto.subtle.importKey(
        "pkcs8",
        privKeyBytes,
        { name: "Ed25519" },
        false,
        ["sign"]
      );

      const payloadStr = JSON.stringify(licensePayload);
      const sigBuf = await window.crypto.subtle.sign(
        { name: "Ed25519" },
        cryptoKey,
        new TextEncoder().encode(payloadStr)
      );

      const sigBytes = new Uint8Array(sigBuf);
      let sigBin = "";
      for (let i = 0; i < sigBytes.length; i++) sigBin += String.fromCharCode(sigBytes[i]);
      const sigBase64Url = btoa(sigBin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const envelope = {
        p: licensePayload,
        s: sigBase64Url,
      };

      const envBytes = new TextEncoder().encode(JSON.stringify(envelope));
      let envBin = "";
      for (let i = 0; i < envBytes.length; i++) envBin += String.fromCharCode(envBytes[i]);
      const licKey = btoa(envBin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      // Also create features payload
      const featuresPayload = {
        enableAnalytics,
        enableAiAnalyst,
        ollamaModel,
        enablePaymentTracking: enablePayments,
        enableProductsMenu,
        enableCustomersMenu,
        enableGst,
        enableCsvImport,
        enableAuditTrail,
        enableCloudImport,
        autoUpdates,
        maxInvoicesPerMonth: -1,
        customerName: customerName.trim(),
        installedAt: Date.now(),
        featureVersion: 1,
      };

      // Save to Cloud Firestore collection 'offlineClients'
      const clientId = clientToEdit?.id || `off_${cleanFp.slice(0, 10)}_${Date.now()}`;
      const record: OfflineClient = {
        id: clientId,
        customerName: customerName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        fingerprint: cleanFp,
        expiryMode,
        expiresAt,
        autoUpdates,
        ollamaModel,
        features,
        licenseKey: licKey,
        createdAt: clientToEdit?.createdAt || Date.now(),
        updatedAt: Date.now(),
        status: "active",
      };

      let cloudSaveWarning: string | null = null;
      try {
        await setDoc(doc(db, "offlineClients", clientId), record);
      } catch (cloudErr: any) {
        console.warn("Could not sync offline client to Firestore (check Firestore security rules):", cloudErr);
        cloudSaveWarning = cloudErr.code === "permission-denied" || cloudErr.message?.includes("Missing or insufficient permissions")
          ? "Key generated successfully! Note: Could not save record to Cloud Firestore because 'offlineClients' collection write rule is not enabled in Firebase Console."
          : `Key generated successfully! Cloud sync notice: ${cloudErr.message || "Failed to save to Firestore."}`;
      }

      setGeneratedKey(licKey);
      setGeneratedFeatures(JSON.stringify(featuresPayload, null, 2));
      if (cloudSaveWarning) {
        setError(cloudSaveWarning);
      }
      if (onSaved) onSaved(record);
    } catch (err: any) {
      setError(err.message || "Failed to generate offline license.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleDownloadFiles = () => {
    if (!generatedKey || !generatedFeatures) return;
    const safeName = customerName.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "client";

    const blobKey = new Blob([generatedKey], { type: "text/plain" });
    const urlKey = URL.createObjectURL(blobKey);
    const a1 = document.createElement("a");
    a1.href = urlKey;
    a1.download = `license_${safeName}.key`;
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);
    URL.revokeObjectURL(urlKey);

    setTimeout(() => {
      const blobFeat = new Blob([generatedFeatures], { type: "text/plain" });
      const urlFeat = URL.createObjectURL(blobFeat);
      const a2 = document.createElement("a");
      a2.href = urlFeat;
      a2.download = `features_${safeName}.dat`;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
      URL.revokeObjectURL(urlFeat);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6 overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <KeyRound size={22} className="text-amber-100" />
            </div>
            <div>
              <h2 className="font-bold text-lg sm:text-xl leading-tight">
                {clientToEdit ? `Edit & Regenerate License: ${clientToEdit.customerName}` : "Offline License Generator & Cloud Sync"}
              </h2>
              <p className="text-xs text-amber-100 mt-0.5">
                Generate cryptographic license keys and save customer access records permanently in the Cloud
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!generatedKey ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ramesh Super Market"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  {businessNames.length > 0 && !clientToEdit && (
                    <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Quick Fill:</span>
                      {businessNames.slice(0, 4).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setCustomerName(name)}
                          className="text-[10px] bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Local Admin Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@customerbiz.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    🔑 Main admin of the local app who can create accounts for colleagues.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Machine Fingerprint (From Customer PC) *
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) setFingerprint(text.trim());
                      } catch {
                        alert("Could not access clipboard. Please paste manually into the box.");
                      }
                    }}
                    className="text-[11px] text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    Paste from Clipboard
                  </button>
                </div>
                <textarea
                  rows={2}
                  required
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value)}
                  placeholder="Paste 64-character SHA-256 fingerprint displayed on client's activation screen..."
                  className="w-full px-3 py-2 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 Hardware fingerprint displayed on the client's PC activation screen.
                </p>
              </div>

              {/* Master Private Signing Key (Configurable in UI or .env, never hardcoded in git) */}
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <KeyRound size={13} className="text-amber-600" />
                    Master Private Signing Key *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyField(!showKeyField)}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold underline"
                  >
                    {showKeyField ? "Hide Key" : signingKey ? "Configured ✓ (Click to edit)" : "Enter Key"}
                  </button>
                </div>
                {(showKeyField || !signingKey) ? (
                  <input
                    type="password"
                    value={signingKey}
                    onChange={(e) => {
                      setSigningKey(e.target.value);
                      try {
                        sessionStorage.setItem("admin_license_signing_key", e.target.value.trim());
                      } catch {}
                    }}
                    placeholder="Paste Ed25519 PKCS#8 private key hex (loaded automatically from .env if set)..."
                    className="w-full px-3 py-1.5 font-mono text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white outline-none"
                  />
                ) : (
                  <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                    <span>✓ Active signing key loaded safely from session / local environment.</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  🔒 Kept in memory/browser session only. Never saved in source files or pushed to GitHub.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">License Expiry</label>
                  <select
                    value={expiryMode}
                    onChange={(e) => setExpiryMode(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none font-medium"
                  >
                    <option value="lifetime">⭐ Lifetime (No Expiry)</option>
                    <option value="1year">1 Year License</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Auto-Updates</label>
                  <select
                    value={autoUpdates}
                    onChange={(e) => setAutoUpdates(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none font-medium"
                  >
                    <option value="manual">Manual (Customer notified)</option>
                    <option value="silent">Silent (Auto-install in background)</option>
                    <option value="disabled">Disabled (No checks)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Features Included in License</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableAnalytics} onChange={(e) => setEnableAnalytics(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">📊 Analytics & Dashboard</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enablePayments} onChange={(e) => setEnablePayments(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">💳 Payment Tracking</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableProductsMenu} onChange={(e) => setEnableProductsMenu(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">📦 Products Directory</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableCustomersMenu} onChange={(e) => setEnableCustomersMenu(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">👥 Customers Directory</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableGst} onChange={(e) => setEnableGst(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">🧾 GST Billing & Tax</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableCsvImport} onChange={(e) => setEnableCsvImport(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">📥 CSV Bulk Import</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableAuditTrail} onChange={(e) => setEnableAuditTrail(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">📜 Invoice Audit Trail</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={enableCloudImport} onChange={(e) => setEnableCloudImport(e.target.checked)} className="rounded text-amber-600 focus:ring-amber-500" />
                    <span className="font-semibold text-slate-700">☁️ Cloud → Offline Import</span>
                  </label>
                </div>
              </div>

              <div className="p-3.5 bg-violet-50/60 rounded-xl border border-violet-100">
                <label className="flex items-center gap-2 text-xs font-bold text-violet-900 cursor-pointer mb-2">
                  <input type="checkbox" checked={enableAiAnalyst} onChange={(e) => setEnableAiAnalyst(e.target.checked)} className="rounded text-violet-600 focus:ring-violet-500" />
                  <span>🤖 Enable Offline AI Business Analyst (Ollama)</span>
                </label>
                {enableAiAnalyst && (
                  <div className="mt-2 pl-6">
                    <label className="block text-[11px] font-bold text-violet-700 mb-1">Recommended Model</label>
                    <select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-violet-200 rounded-lg outline-none font-medium text-slate-700"
                    >
                      <option value="qwen2.5:7b">qwen2.5:7b (⭐ Recommended — Best for billing, financial queries & GST)</option>
                      <option value="phi3.5:mini">phi3.5:mini (Lightweight ~2.2 GB — For older 4–6 GB RAM PCs)</option>
                      <option value="qwen2.5:14b">qwen2.5:14b (~9 GB — For 16–32 GB RAM workstations)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-lg flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
                >
                  {generating ? (
                    <><Loader2 size={15} className="animate-spin" /> Saving & Generating...</>
                  ) : clientToEdit ? (
                    <><Zap size={15} /> Regenerate Key & Save to Cloud</>
                  ) : (
                    <><Zap size={15} /> Generate License & Save to Cloud</>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm">License Successfully Generated!</div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    Hardware-locked for <strong>{customerName}</strong> ({expiryMode === "lifetime" ? "Lifetime" : "1 Year"}). Admin email: <strong>{adminEmail}</strong>.
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    🔑 Client License Key
                  </label>
                  <button
                    onClick={handleCopyKey}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-lg transition-colors shadow-xs cursor-pointer"
                  >
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedKey ? "Copied to Clipboard!" : "Copy License Key"}</span>
                  </button>
                </div>
                <div className="bg-slate-900 text-amber-300 font-mono text-xs p-3.5 rounded-xl border border-slate-800 break-all select-all shadow-inner">
                  {generatedKey}
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 text-sm">
                  <Sparkles size={16} /> How to activate on Customer's PC:
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-slate-700 font-medium">
                  <li>On the customer's PC, open the installed <strong>Billing System</strong> desktop app.</li>
                  <li>Paste this <strong>License Key</strong> into the activation box and click <strong>Activate System</strong>.</li>
                  <li>The app unlocks immediately, saves the license permanently on their PC, and opens the dashboard!</li>
                </ol>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setGeneratedKey(null); setGeneratedFeatures(null); }}
                  className="w-full sm:w-auto text-xs text-slate-600 font-bold px-3 py-2 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  ← Generate Another Key
                </button>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleDownloadFiles}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    title="Download license.key and features.dat files for USB transfer"
                  >
                    <Download size={14} /> Download Files (USB)
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 sm:flex-none text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Offline Clients Tab Content (Cloud Management) ----
const OfflineClientsTabContent: React.FC<{
  clients: OfflineClient[];
  loading: boolean;
  onAddNew: () => void;
  onEditClient: (client: OfflineClient) => void;
  onDeleteClient: (id: string, name: string) => void;
}> = ({ clients, loading, onAddNew, onEditClient, onDeleteClient }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(c =>
      c.customerName.toLowerCase().includes(q) ||
      (c.adminEmail && c.adminEmail.toLowerCase().includes(q)) ||
      c.fingerprint.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const handleCopyKey = (client: OfflineClient) => {
    navigator.clipboard.writeText(client.licenseKey);
    setCopiedId(client.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 rounded-xl border border-amber-200/60">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <KeyRound size={18} className="text-amber-600" /> Offline Desktop Clients &amp; License Keys
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cloud database of all your offline client installations, assigned features, and hardware licenses.
          </p>
        </div>
        <button
          onClick={onAddNew}
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
        >
          <KeyRound size={16} /> Generate New Client License
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2">
        <Filter size={16} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search by business name, admin email, or hardware fingerprint..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-xs sm:text-sm outline-none bg-transparent"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Clients List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading offline clients from Cloud...
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <KeyRound size={40} className="mx-auto mb-2 opacity-30 text-amber-600" />
          <p className="font-semibold text-slate-700 text-sm">No offline clients found</p>
          <p className="text-xs text-slate-400 mt-1">
            When you generate a license key, client data is automatically stored here in Firestore so you can view, edit, or regenerate keys anytime.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClients.map((client) => {
            return (
              <div key={client.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{client.customerName}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Admin Email: <span className="font-semibold text-slate-700">{client.adminEmail || "Not specified"}</span></p>
                    </div>
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                      client.expiryMode === "lifetime"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {client.expiryMode === "lifetime" ? "⭐ Lifetime" : "1 Year"}
                    </span>
                  </div>

                  {/* Fingerprint */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs mt-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Hardware Machine Hash</div>
                    <div className="font-mono text-[11px] text-slate-700 break-all select-all">
                      {client.fingerprint}
                    </div>
                  </div>

                  {/* Features badges */}
                  <div className="mt-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Enabled Features</div>
                    <div className="flex flex-wrap gap-1">
                      {client.features?.map(feat => (
                        <span key={feat} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium border border-slate-200">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer & Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-400">
                    Updated: {new Date(client.updatedAt || client.createdAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopyKey(client)}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      title="Copy License Key to Clipboard"
                    >
                      {copiedId === client.id ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedId === client.id ? "Copied" : "Copy Key"}</span>
                    </button>

                    <button
                      onClick={() => onEditClient(client)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      title="Edit features and regenerate a new key"
                    >
                      <Edit size={13} /> Edit &amp; Regenerate
                    </button>

                    <button
                      onClick={() => onDeleteClient(client.id, client.customerName)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete client record"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---- Main AdminPortal ----
type AdminTab = "users" | "businesses" | "offline_clients" | "errors" | "usage";

export const AdminPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [offlineClients, setOfflineClients] = useState<OfflineClient[]>([]);
  const [offlineClientsLoading, setOfflineClientsLoading] = useState(true);
  const [editingOfflineClient, setEditingOfflineClient] = useState<OfflineClient | null>(null);
  const [allErrors, setAllErrors] = useState<Array<AppErrorLog & { userEmail: string }>>([]);
  const [allInvoices, setAllInvoices] = useState<Array<{ id: string; date?: string; total?: number; customerName?: string; workspaceId: string; timestamp?: number }>>([]);
  const [allActivityLogs, setAllActivityLogs] = useState<Array<UserActivityLog & { userEmail: string; userId: string }>>([]);
  const [workspaceInvoiceCounts, setWorkspaceInvoiceCounts] = useState<Record<string, number>>({});
  const [totalInvoicesCount, setTotalInvoicesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [preselectedBusinessId, setPreselectedBusinessId] = useState<string | undefined>(undefined);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [inspectingBusiness, setInspectingBusiness] = useState<{ businessId: string; businessName: string } | null>(null);
  const [managingInvoicesBusiness, setManagingInvoicesBusiness] = useState<{ businessId: string; businessName: string } | null>(null);
  const [isExportingOffline, setIsExportingOffline] = useState(false);
  const [showOfflineLicenseModal, setShowOfflineLicenseModal] = useState(false);
  const [showExportOfflineModal, setShowExportOfflineModal] = useState(false);

  // ── Export for Offline Import ─────────────────────────────────────────────
  const handleExportForOffline = useCallback(async () => {
    setIsExportingOffline(true);
    try {
      // Gather all data from Firestore for the active workspace
      const workspaceIds = Array.from(
        new Set([...profiles.map((p) => p.businessId || p.uid).filter(Boolean)])
      );

      const exportData: any = {
        version: 1,
        exportedAt: Date.now(),
        exportFormat: 'cloud-to-offline',
        workspaces: [],
      };

      for (const wId of workspaceIds) {
        try {
          const [settingsSnap, productsSnap, customersSnap, invoicesSnap] = await Promise.all([
            getDocs(collection(db, 'users', wId, 'settings')).catch(() => null),
            getDocs(collection(db, 'users', wId, 'products')).catch(() => null),
            getDocs(collection(db, 'users', wId, 'customers')).catch(() => null),
            getDocs(collection(db, 'users', wId, 'invoices')).catch(() => null),
          ]);

          const settingsDoc = settingsSnap?.docs.find(d => d.id === 'general');
          const workspace: any = {
            businessId: wId,
            settings: settingsDoc ? settingsDoc.data() : null,
            products: productsSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [],
            customers: customersSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [],
            invoices: invoicesSnap?.docs.map(d => ({ ...d.data() })) || [],
          };

          // Top-level structure expected by offline import
          if (!exportData.settings && workspace.settings) exportData.settings = workspace.settings;
          exportData.products = [...(exportData.products || []), ...workspace.products];
          exportData.customers = [...(exportData.customers || []), ...workspace.customers];
          exportData.invoices = [...(exportData.invoices || []), ...workspace.invoices];
          exportData.workspaces.push(workspace);
        } catch (err) {
          console.warn('Could not export workspace:', wId, err);
        }
      }

      // Trigger file download
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `billing-export-offline-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const invoiceCount = exportData.invoices?.length || 0;
      const productCount = exportData.products?.length || 0;
      const customerCount = exportData.customers?.length || 0;
      alert(`✅ Export complete!\n\nInvoices: ${invoiceCount}\nProducts: ${productCount}\nCustomers: ${customerCount}\n\nFile: billing-export-offline-${dateStr}.json\n\nImport this file in the offline desktop app: Settings → Import from Cloud.`);
    } catch (e: any) {
      alert('❌ Export failed: ' + (e.message || 'Unknown error'));
    } finally {
      setIsExportingOffline(false);
    }
  }, [profiles]);

  // 1. Live User Profiles Listener
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "userProfiles"), orderBy("createdAt", "desc")),
      (snap) => { setProfiles(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile))); setLoading(false); },
      (err) => { console.warn("Admin profiles listener error:", err.message); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // 1b. Live Offline Clients Listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "offlineClients"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineClient));
        // Sort by createdAt desc
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setOfflineClients(list);
        setOfflineClientsLoading(false);
      },
      (err) => {
        console.warn("Offline clients listener error:", err.message);
        setOfflineClientsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 2. Live Invoices Subscription across all Workspaces & Root Collections (with Full Document Payload)
  useEffect(() => {
    if (profiles.length === 0) return;

    const workspaceIds = Array.from(
      new Set(["global", ...profiles.map((p) => p.businessId || p.uid).filter(Boolean)])
    );

    const unsubs: Array<() => void> = [];
    const countsMap: Record<string, number> = {};
    const invoicesMap: Record<string, Array<{ id: string; date?: string; total?: number; customerName?: string; workspaceId: string; timestamp?: number }>> = {};

    const updateInvoices = () => {
      let total = 0;
      Object.values(countsMap).forEach((c) => { total += c; });
      setWorkspaceInvoiceCounts({ ...countsMap });
      setTotalInvoicesCount(total);

      const allInv: Array<{ id: string; date?: string; total?: number; customerName?: string; workspaceId: string; timestamp?: number }> = [];
      Object.values(invoicesMap).forEach((list) => { allInv.push(...list); });
      setAllInvoices(allInv);
    };

    // Subscribe to root invoices
    const unsubGlobal = onSnapshot(
      collection(db, "invoices"),
      (snap) => {
        countsMap["global"] = snap.docs.length;
        invoicesMap["global"] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            date: data.date,
            total: data.total || data.subtotal || 0,
            customerName: data.customerName,
            workspaceId: "global",
            timestamp: data.timestamp || Date.now()
          };
        });
        updateInvoices();
      },
      (err) => console.warn("Root invoices listener warning:", err.message)
    );
    unsubs.push(unsubGlobal);

    // Subscribe to each workspace's invoices
    workspaceIds.forEach((wId) => {
      if (wId === "global") return;
      const unsubWorkspace = onSnapshot(
        collection(db, "users", wId, "invoices"),
        (snap) => {
          countsMap[wId] = snap.docs.length;
          invoicesMap[wId] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              date: data.date,
              total: data.total || data.subtotal || 0,
              customerName: data.customerName,
              workspaceId: wId,
              timestamp: data.timestamp || Date.now()
            };
          });
          updateInvoices();
        },
        (err) => console.warn(`Workspace ${wId} invoices listener warning:`, err.message)
      );
      unsubs.push(unsubWorkspace);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [profiles]);

  // 3. Live Error Logs Subscription across all User Profiles
  useEffect(() => {
    if (profiles.length === 0) return;

    const unsubs: Array<() => void> = [];
    const logsMap: Record<string, Array<AppErrorLog & { userEmail: string }>> = {};

    const updateErrors = () => {
      const all: Array<AppErrorLog & { userEmail: string }> = [];
      Object.values(logsMap).forEach((userLogs) => {
        all.push(...userLogs);
      });
      all.sort((a, b) => b.timestamp - a.timestamp);
      setAllErrors(all);
    };

    profiles.forEach((p) => {
      const unsubUserErrors = onSnapshot(
        query(collection(db, "userProfiles", p.uid, "errorLogs"), orderBy("timestamp", "desc"), limit(30)),
        (snap) => {
          logsMap[p.uid] = snap.docs.map((d) => ({
            ...(d.data() as AppErrorLog),
            id: d.id,
            userEmail: p.email,
          }));
          updateErrors();
        },
        (err) => console.warn(`User ${p.uid} errorLogs listener warning:`, err.message)
      );
      unsubs.push(unsubUserErrors);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [profiles]);

  // 4. Live Activity Logs Subscription across all User Profiles
  useEffect(() => {
    if (profiles.length === 0) return;

    const unsubs: Array<() => void> = [];
    const activityMap: Record<string, Array<UserActivityLog & { userEmail: string; userId: string }>> = {};

    const updateActivities = () => {
      const all: Array<UserActivityLog & { userEmail: string; userId: string }> = [];
      Object.values(activityMap).forEach((userLogs) => {
        all.push(...userLogs);
      });
      all.sort((a, b) => b.timestamp - a.timestamp);
      setAllActivityLogs(all);
    };

    profiles.forEach((p) => {
      const unsubUserActivity = onSnapshot(
        query(collection(db, "userProfiles", p.uid, "activityLogs"), orderBy("timestamp", "desc"), limit(100)),
        (snap) => {
          activityMap[p.uid] = snap.docs.map((d) => ({
            ...(d.data() as UserActivityLog),
            id: d.id,
            userEmail: p.email,
            userId: p.uid
          }));
          updateActivities();
        },
        (err) => console.warn(`User ${p.uid} activityLogs listener warning:`, err.message)
      );
      unsubs.push(unsubUserActivity);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [profiles]);

  const loadAllErrors = useCallback(async () => {}, []);

  // Enrich user profiles with their live workspace invoice counts
  const enrichedProfiles = profiles.map((p) => {
    const bId = p.businessId || p.uid;
    const isGlobal = bId === "global" || p.businessId === "global";
    let liveCount = 0;
    if (isGlobal) {
      liveCount = workspaceInvoiceCounts["global"] || 0;
    } else {
      liveCount = workspaceInvoiceCounts[bId] ?? workspaceInvoiceCounts[p.uid] ?? (p.invoiceCount || 0);
    }
    return { ...p, invoiceCount: liveCount };
  });

  const openAddUserForBusiness = (bId: string) => {
    setPreselectedBusinessId(bId);
    setShowAddUser(true);
  };

  const handleDeleteUser = async (profile: UserProfile) => {
    if (profile.email?.toLowerCase() === "admin_billing@pratik.ca") {
      alert("Main admin profile cannot be deleted.");
      return;
    }
    const name = profile.displayName || profile.email;
    if (!window.confirm(`Are you sure you want to remove the profile for "${name}" (${profile.email}) from the Admin Portal?\n\nNote: This removes the profile entry from Firestore.`)) {
      return;
    }
    setDeletingId(profile.uid);
    try {
      await deleteDoc(doc(db, "userProfiles", profile.uid));
    } catch {
      alert("Failed to delete user profile from Firestore.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalAiRequests = enrichedProfiles.reduce((s, p) => s + (p.aiRequestCount || 0), 0);
  const totalErrors = allErrors.length || enrichedProfiles.reduce((s, p) => s + (p.errorCount || 0), 0);
  const activeUsersCount = enrichedProfiles.filter((p) => p.status === "active").length;
  const blockedUsersCount = enrichedProfiles.filter((p) => p.status === "blocked").length;
  const totalInvoices = totalInvoicesCount > 0 ? totalInvoicesCount : enrichedProfiles.reduce((s, p) => s + (p.invoiceCount || 0), 0);
  const tabCls = (t: AdminTab) => `flex items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-4 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wide border-b-2 transition-colors ${activeTab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`;

  const handleDeleteOfflineClient = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove offline client record "${name}" from Cloud storage?\n\nNote: If this client has already activated their desktop app with their key, the app continues to validate locally offline until expired.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "offlineClients", id));
    } catch (e: any) {
      alert("Failed to delete offline client record: " + (e.message || "Unknown error"));
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-3.5 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400"/>Admin Portal</h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Manage users, login limits, activate/deactivate accounts, monitor health</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => { setEditingOfflineClient(null); setShowOfflineLicenseModal(true); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-xs"
              title="Generate a machine-locked offline license key for a customer's computer"
            >
              <KeyRound size={16}/> Offline License Keygen
            </button>
            <button
              onClick={() => setShowExportOfflineModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-xs"
              title="Export data as JSON for import into the offline desktop app"
            >
              <Download size={16}/> Export for Offline
            </button>
            <button onClick={() => { setPreselectedBusinessId(undefined); setShowAddUser(true); }} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-xs">
              <UserPlus size={16}/> Add / Sync User
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-200 border-b border-slate-200 shrink-0">
          <div className="p-2.5 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-indigo-600">{enrichedProfiles.length}</div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase mt-0.5 sm:mt-1 truncate">Total Users ({activeUsersCount} Active, {blockedUsersCount} Blocked)</div>
          </div>
          <div className="p-2.5 sm:p-4 text-center"><div className="text-xl sm:text-2xl font-bold text-slate-700">{totalInvoices}</div><div className="text-[9px] sm:text-xs text-slate-500 uppercase font-bold mt-0.5 sm:mt-1 truncate">Total Invoices</div></div>
          <div className="p-2.5 sm:p-4 text-center"><div className="text-xl sm:text-2xl font-bold text-violet-600">{totalAiRequests}</div><div className="text-[9px] sm:text-xs text-slate-500 uppercase font-bold mt-0.5 sm:mt-1 truncate">AI Requests</div></div>
          <div className="p-2.5 sm:p-4 text-center"><div className={`text-xl sm:text-2xl font-bold ${totalErrors > 0 ? "text-red-600" : "text-green-600"}`}>{totalErrors}</div><div className="text-[9px] sm:text-xs text-slate-500 uppercase font-bold mt-0.5 sm:mt-1 truncate">Total Errors</div></div>
        </div>
        <div className="grid grid-cols-5 border-b border-slate-200 shrink-0 w-full bg-slate-50/50">
          <button className={tabCls("users")} onClick={() => setActiveTab("users")}>
            <Users size={14} className="shrink-0"/>
            <span className="truncate">Users<span className="hidden sm:inline"> ({enrichedProfiles.length})</span></span>
          </button>
          <button className={tabCls("businesses")} onClick={() => setActiveTab("businesses")}>
            <Building size={14} className="shrink-0"/>
            <span className="truncate">Businesses</span>
          </button>
          <button className={tabCls("offline_clients")} onClick={() => setActiveTab("offline_clients")}>
            <KeyRound size={14} className="shrink-0 text-amber-500"/>
            <span className="truncate">Offline Clients<span className="hidden sm:inline"> ({offlineClients.length})</span></span>
          </button>
          <button className={tabCls("errors")} onClick={() => setActiveTab("errors")}>
            <Bug size={14} className="shrink-0"/>
            <span className="truncate"><span className="sm:hidden">Errors</span><span className="hidden sm:inline">Error Logs</span></span>
          </button>
          <button className={tabCls("usage")} onClick={() => setActiveTab("usage")}>
            <BarChart3 size={14} className="shrink-0"/>
            <span className="truncate">Usage</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-slate-400"/></div>
          : activeTab === "users" ? (
            <UsersTabContent
              profiles={enrichedProfiles}
              deletingId={deletingId}
              onDeleteUser={handleDeleteUser}
              onViewUser={setSelectedUser}
              onEditUser={setEditingUser}
            />
          )
          : activeTab === "businesses" ? <BusinessesTabContent profiles={enrichedProfiles} onAddMember={openAddUserForBusiness} onInspectBill={setInspectingBusiness} onManageInvoices={setManagingInvoicesBusiness}/>
          : activeTab === "offline_clients" ? (
            <OfflineClientsTabContent
              clients={offlineClients}
              loading={offlineClientsLoading}
              onEditClient={(client) => {
                setEditingOfflineClient(client);
                setShowOfflineLicenseModal(true);
              }}
              onDeleteClient={handleDeleteOfflineClient}
              onAddNew={() => {
                setEditingOfflineClient(null);
                setShowOfflineLicenseModal(true);
              }}
            />
          )
          : activeTab === "errors" ? <ErrorLogsTabContent errors={allErrors} onRefresh={loadAllErrors}/>
          : <UsageTabContent profiles={enrichedProfiles} allInvoices={allInvoices} allActivityLogs={allActivityLogs} allErrors={allErrors}/>}
        </div>
      </div>
      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onCreated={() => setShowAddUser(false)} profiles={enrichedProfiles} preselectedBusinessId={preselectedBusinessId}/>}
      {selectedUser && <UserDetailDrawer profile={selectedUser} activityLogs={allActivityLogs} onClose={() => setSelectedUser(null)}/>}
      {editingUser && <EditUserModal profile={editingUser} onClose={() => setEditingUser(null)} onUpdated={() => setEditingUser(null)} />}
      {inspectingBusiness && <BusinessBillLayoutModal businessId={inspectingBusiness.businessId} businessName={inspectingBusiness.businessName} onClose={() => setInspectingBusiness(null)} />}
      {managingInvoicesBusiness && <BusinessInvoicesManagementModal businessId={managingInvoicesBusiness.businessId} businessName={managingInvoicesBusiness.businessName} onClose={() => setManagingInvoicesBusiness(null)} />}
      {showOfflineLicenseModal && (
        <OfflineLicenseModal
          profiles={enrichedProfiles}
          clientToEdit={editingOfflineClient}
          onSaved={() => {
            setEditingOfflineClient(null);
          }}
          onClose={() => {
            setShowOfflineLicenseModal(false);
            setEditingOfflineClient(null);
          }}
        />
      )}
      {showExportOfflineModal && (
        <ExportOfflineModal
          profiles={enrichedProfiles}
          onClose={() => setShowExportOfflineModal(false)}
        />
      )}
    </div>
  );
};

// ---- Users Tab Content ----
const UsersTabContent: React.FC<{
  profiles: UserProfile[];
  deletingId: string | null;
  onDeleteUser: (p: UserProfile) => void;
  onViewUser: (p: UserProfile) => void;
  onEditUser: (p: UserProfile) => void;
}> = ({ profiles, deletingId, onDeleteUser, onViewUser, onEditUser }) => (
  <div>
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0 z-10">
          <tr>
            <th className="p-4">User / Business</th>
            <th className="p-4 text-center">Status</th>
            <th className="p-4 text-center">Max Logins</th>
            <th className="p-4 text-center">Last Login</th>
            <th className="p-4 text-center">Invoices</th>
            <th className="p-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {profiles.map((p) => (
            <tr key={p.uid} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-sm border border-indigo-100 shrink-0">
                    {(p.displayName || p.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{p.displayName || p.email.split("@")[0]}</span>
                      {p.businessName && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                          🏢 {p.businessName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="p-4 text-center"><StatusBadge status={p.status}/></td>
              <td className="p-4 text-center">
                <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200">
                  {p.maxAllowedSessions || 1} Login{(p.maxAllowedSessions || 1) > 1 ? "s" : ""}
                </span>
              </td>
              <td className="p-4 text-center text-xs text-slate-500">
                <div className="font-semibold text-slate-700">{p.lastLogin ? relativeTime(p.lastLogin) : "Never"}</div>
                <div className="text-[10px] text-slate-400">{p.lastLogin ? formatTs(p.lastLogin) : ""}</div>
              </td>
              <td className="p-4 text-center font-bold text-slate-800 text-base">{p.invoiceCount || 0}</td>
              <td className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEditUser(p)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                    title="Edit User & Manage Permissions"
                  >
                    <Edit size={13} />
                    <span>Edit & Permissions</span>
                  </button>
                  <button
                    onClick={() => onViewUser(p)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                    title="View Activity & Details"
                  >
                    <Eye size={15}/>
                  </button>
                  {p.email?.toLowerCase() !== "admin_billing@pratik.ca" && (
                    <button
                      onClick={() => onDeleteUser(p)}
                      disabled={deletingId === p.uid}
                      title="Remove User Profile from Firestore"
                      className="p-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === p.uid ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {profiles.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No users found</td></tr>}
        </tbody>
      </table>
    </div>
    {/* Mobile Card List */}
    <div className="md:hidden p-3 space-y-3">
      {profiles.map((p) => (
        <div key={p.uid} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-sm border border-indigo-100 shrink-0">
                {(p.displayName || p.email)[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  {p.displayName || p.email.split("@")[0]}
                </div>
                <div className="text-xs text-slate-400">{p.email}</div>
                {p.businessName && (
                  <div className="text-[10px] text-indigo-600 font-bold mt-0.5">🏢 {p.businessName}</div>
                )}
              </div>
            </div>
            <StatusBadge status={p.status}/>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Logins</div>
              <div className="font-bold text-slate-700">{p.maxAllowedSessions || 1}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Invoices</div>
              <div className="font-bold text-slate-700">{p.invoiceCount || 0}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Last Login</div>
              <div className="font-bold text-slate-700 truncate">{p.lastLogin ? relativeTime(p.lastLogin) : "Never"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onEditUser(p)}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Edit size={13} /> Edit & Permissions
            </button>
            <button
              onClick={() => onViewUser(p)}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Eye size={13} /> Details
            </button>
            {p.email?.toLowerCase() !== "admin_billing@pratik.ca" && (
              <button
                onClick={() => onDeleteUser(p)}
                disabled={deletingId === p.uid}
                className="py-2.5 px-2.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                title="Remove Profile"
              >
                {deletingId === p.uid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        </div>
      ))}
      {profiles.length === 0 && <div className="text-center py-12 text-slate-400"><Users size={40} className="mx-auto mb-2 opacity-20"/><p>No users found</p></div>}
    </div>
  </div>
);

// ---- Businesses Tab Content ----
const BusinessesTabContent: React.FC<{
  profiles: UserProfile[];
  onAddMember: (bId: string) => void;
  onInspectBill: (b: { businessId: string; businessName: string }) => void;
  onManageInvoices: (b: { businessId: string; businessName: string }) => void;
}> = ({ profiles, onAddMember, onInspectBill, onManageInvoices }) => {
  const businessMap: Record<string, { businessId: string; businessName: string; members: UserProfile[]; totalInvoices: number }> = {};

  profiles.forEach(p => {
    const bId = p.businessId || p.uid;
    if (!businessMap[bId]) {
      businessMap[bId] = {
        businessId: bId,
        businessName: p.businessName || p.displayName || p.email.split('@')[0],
        members: [],
        totalInvoices: 0
      };
    }
    businessMap[bId].members.push(p);
  });

  Object.values(businessMap).forEach(b => {
    const ownerOrFirst = b.members.find(m => m.role === 'owner') || b.members[0];
    b.totalInvoices = ownerOrFirst?.invoiceCount || 0;
  });

  const businessList = Object.values(businessMap);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Building size={16} className="text-indigo-600" /> Active Business Workspaces ({businessList.length})
        </h3>
      </div>

      {businessList.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Building size={40} className="mx-auto mb-2 opacity-20" />
          <p>No businesses found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {businessList.map((b) => (
            <div key={b.businessId} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Building size={18} className="text-indigo-600 shrink-0" /> {b.businessName}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Workspace ID: {b.businessId}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <button
                    onClick={() => onManageInvoices({ businessId: b.businessId, businessName: b.businessName })}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-xs"
                    title="Manage Invoices, Audit Trail & Trash"
                  >
                    <FileText size={14} /> Invoices & Trash
                  </button>
                  <button
                    onClick={() => onInspectBill({ businessId: b.businessId, businessName: b.businessName })}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                    title="View & Reorder Bill Columns"
                  >
                    <Sliders size={14} /> Bill & Columns
                  </button>
                  <button
                    onClick={() => onAddMember(b.businessId)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                  >
                    <UserPlus size={14} /> Add User
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg text-center">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{b.members.length}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Team Members</div>
                </div>
                <div>
                  <div className="font-bold text-indigo-600 text-sm">{b.totalInvoices}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Invoices</div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Associated Users:</p>
                <div className="space-y-1.5">
                  {b.members.map((m) => (
                    <div key={m.uid} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-800">{m.displayName || m.email}</span>
                        <span className="text-[10px] text-slate-400 block">{m.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {m.role === 'owner' ? (
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">Owner</span>
                        ) : (
                          <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">Member</span>
                        )}
                        <StatusBadge status={m.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Business Bill Layout Modal ----
interface BusinessBillLayoutModalProps {
  businessId: string;
  businessName: string;
  onClose: () => void;
}

const SAMPLE_PREVIEW_ITEMS = [
  { id: '1', productId: 'p1', name: '50 Kg Premium White Sugar', quantity: 2, unit: 'Bag', rate: 2150, amount: 4300, packing: '50 Kg' },
  { id: '2', productId: 'p2', name: 'Brand Super Tea Powder', quantity: 10, unit: 'Pkt', rate: 180, amount: 1800, packing: '500 Gm' },
  { id: '3', productId: 'p3', name: 'Refined Sunflower Cooking Oil', quantity: 5, unit: 'Ltr', rate: 145, amount: 725, packing: '1 Ltr Tin' }
];

const COLUMN_NAMES_MAP: Record<ColumnId, string> = {
  sn: 'Serial No. (No.)',
  particulars: 'Item Details (Particulars)',
  packing: 'Packing Size',
  qty: 'Quantity (Qty)',
  packingQty: 'Packing & Qty (Merged)',
  rate: 'Rate / Price',
  amount: 'Total Amount'
};

const BusinessBillLayoutModal: React.FC<BusinessBillLayoutModalProps> = ({ businessId, businessName, onClose }) => {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "users", businessId, "settings", "general"),
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_BUSINESS_SETTINGS, ...snap.data() } as BusinessSettings);
        } else {
          setSettings({ ...DEFAULT_BUSINESS_SETTINGS, name: businessName || DEFAULT_BUSINESS_SETTINGS.name });
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Failed to load business settings:", err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [businessId, businessName]);

  const colHeaders = settings.columnHeaders || DEFAULT_COLUMN_HEADERS;
  const activeOrder = getEffectiveColumnOrder(colHeaders);

  const moveColumn = (index: number, direction: 'left' | 'right') => {
    const newOrder = [...activeOrder];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setSettings(prev => ({
      ...prev,
      columnHeaders: {
        ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS),
        columnOrder: newOrder
      }
    }));
  };

  const handleHeaderChange = (colId: ColumnId, val: string) => {
    const headerKeyMap: Record<ColumnId, keyof InvoiceHeaderCustomization> = {
      sn: 'snHeader',
      particulars: 'particularsHeader',
      packing: 'packingHeader',
      qty: 'qtyHeader',
      packingQty: 'mergedPackingQtyHeader',
      rate: 'rateHeader',
      amount: 'amountHeader'
    };
    const key = headerKeyMap[colId];
    setSettings(prev => ({
      ...prev,
      columnHeaders: {
        ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS),
        [key]: val
      }
    }));
  };

  const handleWidthChange = (colId: ColumnId, widthVal: string) => {
    setSettings(prev => ({
      ...prev,
      columnHeaders: {
        ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS),
        columnWidths: {
          ...(prev.columnHeaders?.columnWidths || {}),
          [colId]: widthVal
        }
      }
    }));
  };

  const handleToggleMerge = (merged: boolean) => {
    const newOrder = merged ? [...DEFAULT_MERGED_COLUMN_ORDER] : [...DEFAULT_UNMERGED_COLUMN_ORDER];
    setSettings(prev => ({
      ...prev,
      columnHeaders: {
        ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS),
        mergePackingAndQty: merged,
        columnOrder: newOrder
      }
    }));
  };

  const handleReset = () => {
    setSettings(prev => ({
      ...prev,
      columnHeaders: {
        ...DEFAULT_COLUMN_HEADERS,
        mergePackingAndQty: prev.columnHeaders?.mergePackingAndQty || false,
        columnOrder: prev.columnHeaders?.mergePackingAndQty ? [...DEFAULT_MERGED_COLUMN_ORDER] : [...DEFAULT_UNMERGED_COLUMN_ORDER]
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true); setSaveSuccess(false);
    try {
      await setDoc(
        doc(db, "users", businessId, "settings", "general"),
        { columnHeaders: settings.columnHeaders || DEFAULT_COLUMN_HEADERS },
        { merge: true }
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      alert("Failed to save column layout: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm overflow-hidden">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-lg sm:text-xl flex items-center gap-2">
              <Columns className="w-5 h-5 text-indigo-400" />
              <span>Business Bill & Column Layout Inspector</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Workspace: <strong className="text-white">{businessName}</strong> ({businessId})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            {/* Left Controls Column */}
            <div className="lg:col-span-5 border-r border-slate-200 bg-slate-50 p-4 sm:p-5 overflow-y-auto flex flex-col justify-between gap-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Sliders size={16} className="text-indigo-600" /> Bill Table Column Sequence
                  </h3>
                  <button onClick={handleReset} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-semibold">
                    <RotateCcw size={12} /> Reset Default
                  </button>
                </div>

                {/* Column Re-ordering list */}
                <div className="space-y-2.5">
                  {activeOrder.map((colId, idx) => {
                    const headerValue =
                      colId === 'sn' ? colHeaders.snHeader || 'No.'
                      : colId === 'particulars' ? colHeaders.particularsHeader || 'Details'
                      : colId === 'packing' ? colHeaders.packingHeader || 'Packing'
                      : colId === 'qty' ? colHeaders.qtyHeader || 'Qty'
                      : colId === 'packingQty' ? colHeaders.mergedPackingQtyHeader || 'Packing / Qty'
                      : colId === 'rate' ? colHeaders.rateHeader || 'Rate'
                      : colHeaders.amountHeader || 'Amount';

                    return (
                      <div key={colId} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 hover:border-indigo-300 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{COLUMN_NAMES_MAP[colId]}</span>
                          </div>

                          {/* Left / Right Move Buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveColumn(idx, 'left')}
                              title="Move column up / left"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 transition-colors"
                            >
                              <ArrowUp size={14} className="hidden sm:block" />
                              <ArrowLeft size={14} className="sm:hidden" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === activeOrder.length - 1}
                              onClick={() => moveColumn(idx, 'right')}
                              title="Move column down / right"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 transition-colors"
                            >
                              <ArrowDown size={14} className="hidden sm:block" />
                              <ArrowRight size={14} className="sm:hidden" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Header Label</label>
                            <input
                              type="text"
                              value={headerValue}
                              onChange={(e) => handleHeaderChange(colId, e.target.value)}
                              className="w-full mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-400 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Column Width</label>
                            {colId === 'sn' || colId === 'particulars' ? (
                              <div className="mt-0.5 px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium text-center">
                                {colId === 'sn' ? 'Fixed (w-10)' : 'Auto Flex'}
                              </div>
                            ) : (
                              <select
                                value={colHeaders.columnWidths?.[colId] || DEFAULT_COLUMN_WIDTHS[colId] || 'w-24'}
                                onChange={(e) => handleWidthChange(colId, e.target.value)}
                                className="w-full mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-xs font-semibold bg-slate-50 focus:ring-2 focus:ring-indigo-400 outline-none"
                              >
                                {COLUMN_WIDTH_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Additional Toggles */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 text-xs font-medium text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!colHeaders.mergePackingAndQty}
                      onChange={(e) => handleToggleMerge(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-400 w-4 h-4"
                    />
                    <span>Merge Packing & Quantity into single column</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={colHeaders.showUnitInItemsTable !== false}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        columnHeaders: { ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS), showUnitInItemsTable: e.target.checked }
                      }))}
                      className="rounded text-indigo-600 focus:ring-indigo-400 w-4 h-4"
                    />
                    <span>Show product units (e.g. Kg, Pcs, Sq Ft) in table</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={colHeaders.showTotalQuantityInFooter !== false}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        columnHeaders: { ...(prev.columnHeaders || DEFAULT_COLUMN_HEADERS), showTotalQuantityInFooter: e.target.checked }
                      }))}
                      className="rounded text-indigo-600 focus:ring-indigo-400 w-4 h-4"
                    />
                    <span>Show total quantity / weight in table footer</span>
                  </label>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-md disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  <span>{saveSuccess ? "Column Order Saved!" : "Save Column Configuration"}</span>
                </button>
              </div>
            </div>

            {/* Right Live Bill Preview Column */}
            <div className="lg:col-span-7 bg-slate-900 p-4 overflow-y-auto flex flex-col items-center justify-start">
              <div className="w-full flex items-center justify-between mb-3 text-white">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Eye size={14} /> Live Business Bill Preview
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Updates in real-time as columns move</span>
              </div>

              {/* Scale Wrapper for Invoice Template */}
              <div className="w-full max-w-[800px] overflow-x-auto p-2 flex justify-center">
                <div className="transform scale-[0.75] origin-top bg-white rounded shadow-2xl">
                  <InvoiceTemplate
                    id="admin-bill-layout-preview"
                    billNo="INV-2026-001"
                    date={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    customerName="M/s. Royal Traders & Supermarket"
                    customerCity="Palitana"
                    customerMobile="98765 43210"
                    items={SAMPLE_PREVIEW_ITEMS}
                    settings={settings}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Business Invoices & Trash Management Modal (Main Admin) ----
interface BusinessInvoicesManagementModalProps {
  businessId: string;
  businessName: string;
  onClose: () => void;
}

const BusinessInvoicesManagementModal: React.FC<BusinessInvoicesManagementModalProps> = ({ businessId, businessName, onClose }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [auditTrailInvoice, setAuditTrailInvoice] = useState<Invoice | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "users", businessId, "settings", "general"), (snap) => {
      if (snap.exists()) {
        setSettings({ ...DEFAULT_BUSINESS_SETTINGS, ...snap.data() } as BusinessSettings);
      } else {
        setSettings({ ...DEFAULT_BUSINESS_SETTINGS, name: businessName || DEFAULT_BUSINESS_SETTINGS.name });
      }
    });

    const colRef = businessId === 'global' ? collection(db, 'invoices') : collection(db, 'users', businessId, 'invoices');
    const unsubInvoices = onSnapshot(colRef, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice));
      setInvoices(list);
      setLoading(false);
    }, (err) => {
      console.warn("Error loading workspace invoices:", err);
      setLoading(false);
    });

    return () => {
      unsubSettings();
      unsubInvoices();
    };
  }, [businessId, businessName]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === 'active' && inv.isDeleted) return false;
      if (statusFilter === 'deleted' && !inv.isDeleted) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const idMatch = (inv.id || '').toLowerCase().includes(q);
        const nameMatch = (inv.customerName || '').toLowerCase().includes(q);
        const cityMatch = (inv.customerCity || '').toLowerCase().includes(q);
        const dateMatch = (inv.date || '').toLowerCase().includes(q);
        return idMatch || nameMatch || cityMatch || dateMatch;
      }
      return true;
    }).sort((a, b) => {
      const numA = parseInt((a.id || '').toString().replace(/[^0-9]/g, ''), 10) || 0;
      const numB = parseInt((b.id || '').toString().replace(/[^0-9]/g, ''), 10) || 0;
      return numB - numA;
    });
  }, [invoices, statusFilter, searchTerm]);

  const counts = useMemo(() => {
    const total = invoices.length;
    const deleted = invoices.filter(i => i.isDeleted).length;
    const active = total - deleted;
    const totalRevenue = invoices.filter(i => !i.isDeleted).reduce((s, i) => s + (i.total || 0), 0);
    return { total, deleted, active, totalRevenue };
  }, [invoices]);

  const handlePermanentDelete = async (invoiceId: string) => {
    if (!window.confirm(`⚠️ PERMANENTLY DELETE Bill #${invoiceId} from "${businessName}"?\n\nWARNING: This will completely remove this bill, its items, and its entire revision history from the database.\n\nThis action CANNOT be undone. You will be able to reuse Bill #${invoiceId} if desired.\n\nAre you sure you want to proceed?`)) {
      return;
    }
    setActionLoadingId(invoiceId);
    try {
      const docRef = businessId === 'global' ? doc(db, 'invoices', invoiceId) : doc(db, 'users', businessId, 'invoices', invoiceId);
      await deleteDoc(docRef);
      alert(`Bill #${invoiceId} has been permanently deleted from database.`);
      if (viewingInvoice?.id === invoiceId) setViewingInvoice(null);
      if (auditTrailInvoice?.id === invoiceId) setAuditTrailInvoice(null);
    } catch (err: any) {
      alert("Failed to delete invoice: " + (err?.message || "Unknown error"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEmptyTrash = async () => {
    const trashed = invoices.filter(i => i.isDeleted);
    if (trashed.length === 0) {
      alert("Trash is already empty for this business.");
      return;
    }
    if (!window.confirm(`⚠️ PERMANENTLY DELETE ALL ${trashed.length} TRASHED BILLS for "${businessName}"?\n\nWARNING: This will permanently wipe all ${trashed.length} deleted bills from the database.\n\nThis action CANNOT be undone. Proceed?`)) {
      return;
    }
    setActionLoadingId('empty-trash');
    try {
      for (const inv of trashed) {
        const docRef = businessId === 'global' ? doc(db, 'invoices', inv.id) : doc(db, 'users', businessId, 'invoices', inv.id);
        await deleteDoc(docRef);
      }
      alert(`Successfully permanently deleted ${trashed.length} trashed invoices.`);
    } catch (err: any) {
      alert("Failed to empty trash: " + (err?.message || "Unknown error"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestore = async (invoiceId: string) => {
    setActionLoadingId(invoiceId);
    try {
      const docRef = businessId === 'global' ? doc(db, 'invoices', invoiceId) : doc(db, 'users', businessId, 'invoices', invoiceId);
      const current = invoices.find(i => i.id === invoiceId);
      const restEntry = {
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'restored' as const,
        timestamp: Date.now(),
        userId: 'main_admin',
        userName: 'Main Administrator',
        summary: `Bill #${invoiceId} restored from Trash by Main Administrator`
      };
      await updateDoc(docRef, {
        isDeleted: false,
        restoredAt: Date.now(),
        restoredByName: 'Main Administrator',
        auditTrail: [...(current?.auditTrail || []), restEntry]
      });
      alert(`Bill #${invoiceId} restored successfully.`);
    } catch (err: any) {
      alert("Failed to restore invoice: " + (err?.message || "Unknown error"));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Building size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">Invoices & Trash Management</h3>
                <span className="bg-indigo-500/30 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-400/30">
                  {businessName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Workspace ID: {businessId} • Admin Full Access</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0 text-center">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Bills</span>
            <p className="text-lg font-bold text-slate-800 mt-0.5">{counts.total}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-indigo-500 uppercase">Active Bills</span>
            <p className="text-lg font-bold text-indigo-600 mt-0.5">{counts.active}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-red-500 uppercase">In Trash</span>
            <p className="text-lg font-bold text-red-600 mt-0.5">{counts.deleted}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase">Active Revenue</span>
            <p className="text-lg font-bold text-emerald-700 mt-0.5">₹{formatBillNum(counts.totalRevenue)}</p>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 sm:px-5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              All Bills ({counts.total})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Active ({counts.active})
            </button>
            <button
              onClick={() => setStatusFilter('deleted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${statusFilter === 'deleted' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 hover:text-red-700'}`}
            >
              <Trash2 size={13} />
              <span>Trash ({counts.deleted})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[200px] max-w-xs">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search Bill #, Customer, Date..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              <Filter size={13} className="absolute left-2.5 top-2 text-slate-400" />
            </div>
          </div>

          {counts.deleted > 0 && statusFilter === 'deleted' && (
            <button
              onClick={handleEmptyTrash}
              disabled={actionLoadingId === 'empty-trash'}
              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
              title="Permanently wipe all trashed invoices from this workspace"
            >
              <Trash2 size={13} />
              <span>Empty Workspace Trash</span>
            </button>
          )}
        </div>

        {/* Invoices List Table */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="animate-spin" size={24} />
              <span>Loading workspace invoices...</span>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileText size={48} className="mx-auto mb-2 opacity-20" />
              <p className="font-semibold">No invoices found</p>
              <p className="text-xs text-slate-400 mt-1">No invoices match the current filter or search criteria.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Bill No</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Operator / Author</th>
                    <th className="p-3 text-right">Items</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className={`hover:bg-slate-50/80 transition-colors ${inv.isDeleted ? 'bg-red-50/30' : ''}`}>
                      <td className="p-3 font-bold text-slate-900">
                        #{inv.id}
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {inv.date}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        <div>{inv.customerName}</div>
                        {inv.customerCity && <div className="text-[10px] text-slate-400 font-normal">{inv.customerCity}</div>}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="font-medium">{inv.billedBy || inv.createdByName || 'System'}</div>
                        {inv.updatedByName && <div className="text-[9px] text-slate-400">Edit: {inv.updatedByName}</div>}
                      </td>
                      <td className="p-3 text-right text-slate-600 font-medium">
                        {inv.items?.length || 0} items
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        ₹{formatBillNum(inv.total)}
                      </td>
                      <td className="p-3 text-center">
                        {inv.isDeleted ? (
                          <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-200 uppercase">
                            TRASHED
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingInvoice(inv)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                            title="Preview Invoice Layout"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => setAuditTrailInvoice(inv)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                            title="View Audit Trail & Diffs"
                          >
                            <Clock size={14} />
                          </button>
                          {inv.isDeleted ? (
                            <>
                              <button
                                onClick={() => handleRestore(inv.id)}
                                disabled={actionLoadingId === inv.id}
                                className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors"
                                title="Restore Bill"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button
                                onClick={() => handlePermanentDelete(inv.id)}
                                disabled={actionLoadingId === inv.id}
                                className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-2xs"
                                title="Permanently Delete from Firestore (Cannot be undone)"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handlePermanentDelete(inv.id)}
                              disabled={actionLoadingId === inv.id}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                              title="Permanently Delete Bill"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-indigo-600" />
            <span>Main Administrator Master Authority</span>
          </div>
          <button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-1.5 rounded-lg transition-colors text-xs">
            Close
          </button>
        </div>
      </div>

      {/* Invoice Detail Preview Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white p-3.5 px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Bill #{viewingInvoice.id}</span>
                {viewingInvoice.isDeleted && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                    TRASHED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewingInvoice.isDeleted && (
                  <button
                    onClick={() => {
                      handlePermanentDelete(viewingInvoice.id);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <Trash2 size={13} /> Delete Permanently
                  </button>
                )}
                <button onClick={() => setViewingInvoice(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
              <div className="bg-white shadow-xl max-w-3xl w-full">
                <InvoiceTemplate
                  id="admin-workspace-preview"
                  billNo={viewingInvoice.id}
                  date={viewingInvoice.date}
                  customerName={viewingInvoice.customerName}
                  customerCity={viewingInvoice.customerCity}
                  customerMobile={viewingInvoice.customerMobile}
                  items={viewingInvoice.items || []}
                  settings={settings}
                  gstRate={viewingInvoice.gstRate}
                  payments={viewingInvoice.payments}
                  showUnitInItemsTable={viewingInvoice.showUnitInItemsTable}
                  customTotalQtyText={viewingInvoice.customTotalQtyText}
                  billedBy={viewingInvoice.billedBy || viewingInvoice.createdByName}
                  createdByName={viewingInvoice.createdByName}
                  isDeleted={viewingInvoice.isDeleted}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {auditTrailInvoice && (
        <InvoiceAuditTrailModal
          invoice={auditTrailInvoice}
          onClose={() => setAuditTrailInvoice(null)}
          isMainAdmin={true}
          onRestore={(id) => {
            handleRestore(id);
            setAuditTrailInvoice(null);
          }}
          onPermanentDelete={(id) => {
            handlePermanentDelete(id);
            setAuditTrailInvoice(null);
          }}
        />
      )}
    </div>
  );
};

// ---- Error Logs Tab ----
const ErrorLogsTabContent: React.FC<{ errors: Array<AppErrorLog & { userEmail: string }>; onRefresh: () => void }> = ({ errors, onRefresh }) => (
  <div className="p-4">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Bug size={16} className="text-red-500"/> All Error Logs <span className="text-xs text-slate-400 font-normal">({errors.length} entries)</span></h3>
      <button onClick={onRefresh} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"><RefreshCw size={12}/> Refresh</button>
    </div>
    {errors.length === 0 ? <div className="text-center py-12"><CheckCircle2 size={40} className="mx-auto mb-2 text-green-400 opacity-60"/><p className="text-slate-400">No errors recorded</p></div>
    : <div className="space-y-2">{errors.map((e, idx) => (
        <div key={idx} className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">{e.userEmail}</span>
            <span className="text-[10px] text-slate-400 shrink-0">{relativeTime(e.timestamp)}</span>
          </div>
          <p className="text-xs font-bold text-red-700">{e.message}</p>
          {e.route && <p className="text-[10px] text-red-400 mt-0.5">Tab: {e.route}</p>}
        </div>
      ))}</div>}
  </div>
);

// ---- Usage Tab Content ----
const UsageTabContent: React.FC<{
  profiles: UserProfile[];
  allInvoices: Array<{ id: string; date?: string; total?: number; customerName?: string; workspaceId: string; timestamp?: number }>;
  allActivityLogs: Array<UserActivityLog & { userEmail: string; userId: string }>;
  allErrors: Array<AppErrorLog & { userEmail: string }>;
}> = ({ profiles, allInvoices, allActivityLogs, allErrors }) => {
  const [selectedUserUid, setSelectedUserUid] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("7d");
  const [searchLogQuery, setSearchLogQuery] = useState<string>("");
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  const selectedProfile = useMemo(() => {
    if (selectedUserUid === "all") return undefined;
    return profiles.find(p => p.uid === selectedUserUid);
  }, [profiles, selectedUserUid]);

  // Filter logs based on user, time range, and search query
  const filteredLogs = useMemo(() => {
    let logs = allActivityLogs;
    if (selectedUserUid !== "all" && selectedProfile) {
      logs = logs.filter(l => l.userId === selectedUserUid || l.userEmail === selectedProfile.email);
    }
    const cutoff = timeRange === "7d" ? Date.now() - 7 * 86400000 : timeRange === "30d" ? Date.now() - 30 * 86400000 : 0;
    if (cutoff > 0) {
      logs = logs.filter(l => l.timestamp >= cutoff);
    }
    if (searchLogQuery.trim()) {
      const q = searchLogQuery.toLowerCase();
      logs = logs.filter(l =>
        l.action.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        l.userEmail.toLowerCase().includes(q)
      );
    }
    return logs;
  }, [allActivityLogs, selectedUserUid, selectedProfile, timeRange, searchLogQuery]);

  // Daily Trend Data Computation
  const dailyData = useMemo(() => {
    const daysCount = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 14;
    const result: Array<{ dayLabel: string; dateStr: string; invoicesCount: number; revenue: number; aiRequests: number; actionsCount: number }> = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
      const dayLabel = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      const ddStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }); // DD/MM/YYYY

      // Match invoices created on this date
      const dayInvoices = allInvoices.filter(inv => {
        if (selectedUserUid !== "all" && selectedProfile) {
          const uBId = selectedProfile.businessId || selectedProfile.uid;
          if (inv.workspaceId !== uBId && inv.workspaceId !== selectedProfile.uid) return false;
        }
        if (!inv.date) return false;
        return inv.date.includes(dateStr) || inv.date.includes(dayLabel) || inv.date.replace(/-/g, "/").includes(ddStr);
      });

      const dayRevenue = dayInvoices.reduce((s, inv) => s + (inv.total || 0), 0);

      // Match activity logs created on this date
      const dayLogs = allActivityLogs.filter(l => {
        if (selectedUserUid !== "all" && selectedProfile) {
          if (l.userId !== selectedUserUid && l.userEmail !== selectedProfile.email) return false;
        }
        const logDate = new Date(l.timestamp).toISOString().split("T")[0];
        return logDate === dateStr;
      });

      const dayAi = dayLogs.filter(l => l.category === "ai").length;

      result.push({
        dayLabel,
        dateStr,
        invoicesCount: dayInvoices.length,
        revenue: dayRevenue,
        aiRequests: dayAi,
        actionsCount: dayLogs.length
      });
    }

    return result;
  }, [allInvoices, allActivityLogs, selectedUserUid, selectedProfile, timeRange]);

  // Total Summary Metrics
  const targetProfiles = selectedUserUid === "all" ? profiles : (selectedProfile ? [selectedProfile] : profiles);
  const totalInvoices = selectedUserUid === "all"
    ? (allInvoices.length > 0 ? allInvoices.length : profiles.reduce((s, p) => s + (p.invoiceCount || 0), 0))
    : (selectedProfile?.invoiceCount || 0);

  const totalRevenue = allInvoices
    .filter(inv => selectedUserUid === "all" || (selectedProfile && (inv.workspaceId === (selectedProfile.businessId || selectedProfile.uid) || inv.workspaceId === selectedProfile.uid)))
    .reduce((s, inv) => s + (inv.total || 0), 0);

  const totalAiRequests = targetProfiles.reduce((s, p) => s + (p.aiRequestCount || 0), 0);
  const totalActionsCount = filteredLogs.length || targetProfiles.reduce((s, p) => s + (p.invoiceCount || 0) + (p.aiRequestCount || 0), 0);

  const activeDays = dailyData.filter(d => d.invoicesCount > 0 || d.actionsCount > 0).length || 1;
  const periodDays = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : activeDays;
  const avgDailyInvoices = (totalInvoices / periodDays).toFixed(1);
  const avgDailyRevenue = (totalRevenue / periodDays).toFixed(0);

  // Behavioral profile
  const behavior = useMemo(() => {
    const prof = selectedProfile || profiles[0] || ({ uid: "global", email: "global", invoiceCount: totalInvoices, aiRequestCount: totalAiRequests } as any);
    return computeUserBehavior(prof, allActivityLogs);
  }, [selectedProfile, profiles, allActivityLogs, totalInvoices, totalAiRequests]);

  const maxInvoicesBar = Math.max(...dailyData.map(d => d.invoicesCount), 1);
  const maxRevenueBar = Math.max(...dailyData.map(d => d.revenue), 1);

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6">
      {/* 1. Header Filters Toolbar */}
      <div className="bg-slate-900 text-white rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base sm:text-lg">App Usage & Behavior Analytics</h3>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            Monitor daily & total system usage trends and analyze user activity habits
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
          {/* User Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 sm:py-1.5 text-xs w-full sm:w-auto">
            <Users size={14} className="text-indigo-400 shrink-0" />
            <select
              value={selectedUserUid}
              onChange={(e) => setSelectedUserUid(e.target.value)}
              className="bg-transparent text-white font-semibold outline-none cursor-pointer w-full text-xs"
            >
              <option value="all" className="bg-slate-800 text-white">All Users ({profiles.length})</option>
              {profiles.map((p) => (
                <option key={p.uid} value={p.uid} className="bg-slate-800 text-white">
                  {p.displayName || p.email.split("@")[0]} ({p.email})
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Pills */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 justify-center">
            <button
              onClick={() => setTimeRange("7d")}
              className={`flex-1 sm:flex-none px-3 py-1.5 sm:py-1 text-xs font-bold rounded-lg transition-all ${
                timeRange === "7d" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange("30d")}
              className={`flex-1 sm:flex-none px-3 py-1.5 sm:py-1 text-xs font-bold rounded-lg transition-all ${
                timeRange === "30d" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`flex-1 sm:flex-none px-3 py-1.5 sm:py-1 text-xs font-bold rounded-lg transition-all ${
                timeRange === "all" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards (Total & Daily Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Total & Daily Invoices */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow min-w-0">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate">Invoices</span>
            <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><FileText size={14} className="sm:w-4 sm:h-4" /></div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">{totalInvoices}</div>
          <div className="flex items-center gap-1 mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 sm:py-1 rounded-lg w-fit max-w-full truncate">
            <TrendingUp size={11} className="shrink-0" />
            <span className="truncate">Avg ~{avgDailyInvoices}/day</span>
          </div>
        </div>

        {/* Total & Daily Revenue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow min-w-0">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate">Revenue</span>
            <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><DollarSign size={14} className="sm:w-4 sm:h-4" /></div>
          </div>
          <div className="text-base sm:text-xl md:text-2xl font-black text-slate-900 truncate tracking-tight" title={`₹${totalRevenue.toLocaleString("en-IN")}`}>
            ₹{totalRevenue.toLocaleString("en-IN")}
          </div>
          <div className="flex items-center gap-1 mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 sm:py-1 rounded-lg w-fit max-w-full truncate">
            <DollarSign size={11} className="shrink-0" />
            <span className="truncate">Avg ~₹{Number(avgDailyRevenue).toLocaleString("en-IN")}/day</span>
          </div>
        </div>

        {/* AI Assistant Usage */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow min-w-0">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate">AI Requests</span>
            <div className="p-1.5 sm:p-2 bg-violet-50 text-violet-600 rounded-xl shrink-0"><Sparkles size={14} className="sm:w-4 sm:h-4" /></div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">{totalAiRequests}</div>
          <div className="flex items-center gap-1 mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 sm:py-1 rounded-lg w-fit max-w-full truncate">
            <Sparkles size={11} className="shrink-0" />
            <span className="truncate">Prompts used</span>
          </div>
        </div>

        {/* Activity & Action Events */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow min-w-0">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate">User Actions</span>
            <div className="p-1.5 sm:p-2 bg-sky-50 text-sky-600 rounded-xl shrink-0"><Activity size={14} className="sm:w-4 sm:h-4" /></div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">{totalActionsCount}</div>
          <div className="flex items-center gap-1 mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 sm:py-1 rounded-lg w-fit max-w-full truncate">
            <Zap size={11} className="shrink-0" />
            <span className="truncate">Logged events</span>
          </div>
        </div>
      </div>

      {/* 3. Daily Usage Visualizer Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar size={16} className="text-indigo-600 shrink-0" />
              <span>Daily Usage & Activity Trend</span>
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Invoices & revenue breakdown ({timeRange === "7d" ? "Last 7 Days" : timeRange === "30d" ? "Last 30 Days" : "Recent Period"})
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] sm:text-xs font-bold shrink-0">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Invoices</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Revenue (₹)</span>
          </div>
        </div>

        {/* Live Hovered Day Summary Banner */}
        {(() => {
          const hDay = hoveredDayIndex !== null ? dailyData[hoveredDayIndex] : null;
          return (
            <div className="min-h-[36px] bg-slate-900 text-white rounded-xl px-3 py-2 text-xs flex items-center justify-between transition-all">
              {hDay ? (
                <div className="flex items-center gap-3 flex-wrap font-medium">
                  <span className="font-bold text-indigo-400 flex items-center gap-1">
                    <Calendar size={13} /> {hDay.dayLabel} ({hDay.dateStr})
                  </span>
                  <span className="text-slate-300">Invoices: <strong className="text-white font-bold">{hDay.invoicesCount}</strong></span>
                  <span className="text-slate-300">Revenue: <strong className="text-emerald-400 font-bold">₹{hDay.revenue.toLocaleString("en-IN")}</strong></span>
                  <span className="text-slate-300">AI Usage: <strong className="text-violet-300 font-bold">{hDay.aiRequests} reqs</strong></span>
                  <span className="text-slate-300">Actions: <strong className="text-sky-300 font-bold">{hDay.actionsCount}</strong></span>
                </div>
              ) : (
                <span className="text-slate-400 text-[10px] sm:text-[11px] flex items-center gap-1.5 font-medium">
                  <Eye size={13} className="text-indigo-400 shrink-0" /> Tap or hover any bar column below to view daily breakdown
                </span>
              )}
              {hDay && (
                <button onClick={() => setHoveredDayIndex(null)} className="text-slate-400 hover:text-white text-[11px] font-bold">
                  Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* Daily Bar Chart Container (pt-16 guarantees tooltip is never clipped) */}
        <div className="pt-16 pb-2 overflow-x-auto">
          <div className="h-44 flex items-end gap-2 md:gap-3 border-b border-slate-200 pb-2 min-w-max">
            {dailyData.map((d, idx) => {
              const invHeightPct = Math.round((d.invoicesCount / maxInvoicesBar) * 100);
              const revHeightPct = Math.round((d.revenue / maxRevenueBar) * 100);
              const isHovered = hoveredDayIndex === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredDayIndex(idx)}
                  onMouseLeave={() => setHoveredDayIndex(null)}
                  className="flex-1 min-w-[36px] flex flex-col items-center justify-end h-full group relative cursor-pointer"
                >
                  {/* Hover Tooltip (Positioned in pt-16 top area) */}
                  <div className={`absolute top-0 -translate-y-12 z-30 flex-col bg-slate-900 text-white text-[10px] p-2 rounded-xl shadow-2xl border border-slate-700 whitespace-nowrap transition-all pointer-events-none ${
                    isHovered ? "flex opacity-100 scale-100" : "hidden opacity-0"
                  }`}>
                    <span className="font-bold border-b border-slate-700 pb-1 mb-1 text-indigo-300">{d.dayLabel} ({d.dateStr})</span>
                    <span>Invoices: <strong className="text-white">{d.invoicesCount}</strong></span>
                    <span>Revenue: <strong className="text-emerald-400">₹{d.revenue.toLocaleString("en-IN")}</strong></span>
                    <span>AI Usage: <strong className="text-violet-300">{d.aiRequests}</strong></span>
                    <span>Total Actions: <strong className="text-sky-300">{d.actionsCount}</strong></span>
                  </div>

                  {/* Dual Bars */}
                  <div className="w-full flex items-end justify-center gap-1.5 h-28">
                    {/* Invoice Count Bar */}
                    <div
                      className={`w-1/2 max-w-[14px] rounded-t transition-all duration-300 relative ${
                        isHovered ? "bg-indigo-600 ring-2 ring-indigo-400" : "bg-indigo-500 hover:bg-indigo-600"
                      }`}
                      style={{ height: `${Math.max(invHeightPct, 6)}%` }}
                    >
                      {d.invoicesCount > 0 && (
                        <span className="text-[9px] font-bold text-indigo-700 absolute -top-4 left-1/2 -translate-x-1/2">
                          {d.invoicesCount}
                        </span>
                      )}
                    </div>

                    {/* Revenue Bar */}
                    <div
                      className={`w-1/2 max-w-[14px] rounded-t transition-all duration-300 ${
                        isHovered ? "bg-emerald-500 ring-2 ring-emerald-300" : "bg-emerald-400 hover:bg-emerald-500"
                      }`}
                      style={{ height: `${Math.max(revHeightPct, 6)}%` }}
                    />
                  </div>

                  <span className={`text-[10px] font-bold mt-2 truncate w-full text-center transition-colors ${
                    isHovered ? "text-indigo-600" : "text-slate-500"
                  }`}>
                    {d.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. User Behavior Analysis ("What He Often Does in the App") */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap size={18} className="text-amber-500 shrink-0" /> User Behavior & Habit Analysis ("What He Often Does")
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Behavioral persona classification, feature usage breakdown, and peak active times
              {selectedProfile ? ` for ${selectedProfile.displayName || selectedProfile.email}` : " across all users"}
            </p>
          </div>
          {selectedProfile && (
            <span className="text-[11px] sm:text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200 w-fit">
              👤 User: {selectedProfile.email}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Persona Card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 sm:p-8 opacity-10 pointer-events-none">
              <Award size={120} />
            </div>

            <div>
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-1.5 sm:mb-2 flex items-center gap-1">
                <Award size={12} /> Behavioral Profile Persona
              </div>

              <div className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-1 rounded-full text-indigo-200 text-[11px] sm:text-xs font-bold mb-2.5">
                {behavior.personaTitle}
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white mb-1.5">Primary App Activity Habit</h3>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed font-medium">
                {behavior.personaSummary}
              </p>
            </div>

            <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span>Peak Active Hours:</span>
              <span className="font-bold text-indigo-300">{behavior.peakTimeLabel}</span>
            </div>
          </div>

          {/* Feature Usage Breakdown Progress Bars */}
          <div className="lg:col-span-2 space-y-2.5 sm:space-y-3">
            <h5 className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
              <span>Feature Usage Distribution</span>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal">Based on {behavior.totalActions} logged events</span>
            </h5>

            <div className="space-y-2">
              {behavior.stats.map((s) => {
                const cfg = CATEGORY_CONFIG[s.category];
                return (
                  <div key={s.category} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:p-3 hover:bg-slate-100/80 transition-colors">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                        <span className={`p-1 rounded-md ${cfg.bg} shrink-0`}>{cfg.icon}</span>
                        <span className="truncate">{cfg.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-500 font-medium text-[10px] sm:text-xs">{s.count}</span>
                        <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px] sm:text-[11px]">
                          {s.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cfg.bg.replace("bg-", "bg-").replace("-50", "-500")} rounded-full transition-all duration-500`}
                        style={{ width: `${s.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Live Activity Logs Timeline Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock size={18} className="text-indigo-600 shrink-0" /> User Activity History Feed
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Detailed audit trail of user actions ({filteredLogs.length} events logged)
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs w-full sm:w-64">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search action or user..."
                value={searchLogQuery}
                onChange={(e) => setSearchLogQuery(e.target.value)}
                className="bg-transparent text-slate-800 outline-none w-full text-xs font-medium"
              />
              {searchLogQuery && (
                <button onClick={() => setSearchLogQuery("")} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 sm:py-10 text-slate-400">
            <Activity size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs sm:text-sm font-medium">No activity logs recorded for this selection.</p>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Actions performed by users (creating bills, AI prompts, product edits) will automatically appear here.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.map((log) => {
              const cfg = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG["invoice"];
              return (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-3 bg-slate-50 border border-slate-200/70 hover:border-indigo-200 rounded-xl p-2.5 sm:p-3 transition-colors">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${cfg.bg} border ${cfg.border} mt-0.5`}>
                      {cfg.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{log.action}</span>
                        <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          {cfg.name}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded truncate max-w-[160px] sm:max-w-none">
                          {log.userEmail}
                        </span>
                      </div>
                      {log.details && (
                        <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 font-medium truncate max-w-xs sm:max-w-xl">
                          {log.details}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold shrink-0 self-end sm:self-auto">
                    {relativeTime(log.timestamp)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
