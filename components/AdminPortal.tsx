import React, { useState, useEffect, useCallback, useMemo } from "react";
import { db, firebaseConfig } from "../firebase";
import { collection, collectionGroup, doc, getDocs, setDoc, updateDoc, onSnapshot, query, orderBy, limit, deleteDoc } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { UserProfile, UserSession, AppErrorLog, UserActivityLog, ActivityCategory } from "../types";
import {
  Users, ShieldCheck, Activity, AlertTriangle, UserPlus, Lock, Unlock, RefreshCw, Loader2, X,
  Smartphone, Monitor, Tablet, Clock, Sparkles, Bug, BarChart3, CheckCircle2, Eye, Building,
  Upload, Download, KeyRound, Edit, Mail, Calendar, TrendingUp, DollarSign, PieChart, Layers,
  Zap, Award, UserCheck, Filter, ArrowUpRight, FileText, Package, CreditCard, Trash2
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

        await setDoc(doc(db, "userProfiles", newUid), {
          uid: newUid,
          email,
          displayName: displayName.trim() || email.split("@")[0],
          status: "active",
          businessId: finalBusinessId,
          businessName: businessName,
          role: targetBusinessId === "new" ? "owner" : "member",
          maxAllowedSessions: maxSessions,
          activeSessions: [],
          createdAt: Date.now(),
          lastLogin: 0,
          lastSeen: 0,
          aiRequestCount: 0,
          errorCount: 0,
          invoiceCount: 0,
          csvImportAllowed: false,
          paymentTrackingBlocked: false
        } as UserProfile);

        await fbSignOut(secondaryAuth);
      } else {
        const generatedUid = `user-${Date.now()}`;
        await setDoc(doc(db, "userProfiles", generatedUid), {
          uid: generatedUid,
          email: email.trim().toLowerCase(),
          displayName: displayName.trim() || email.split("@")[0],
          status: "active",
          businessId: generatedUid,
          businessName: displayName.trim() || email.split("@")[0],
          role: "owner",
          maxAllowedSessions: maxSessions,
          activeSessions: [],
          createdAt: Date.now(),
          lastLogin: 0,
          lastSeen: 0,
          aiRequestCount: 0,
          errorCount: 0,
          invoiceCount: 0,
          csvImportAllowed: false,
          paymentTrackingBlocked: false
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
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const isMainAdmin = profile.email?.toLowerCase() === "admin_billing@pratik.ca";
  const [analyticsPermissions, setAnalyticsPermissions] = useState({
    showProductAnalysis: profile.analyticsPermissions?.showProductAnalysis !== false,
    showCustomerAnalysis: profile.analyticsPermissions?.showCustomerAnalysis !== false,
    showCustomerPurchaseDetails: profile.analyticsPermissions?.showCustomerPurchaseDetails !== false,
    showAiBusinessAnalyst: profile.analyticsPermissions?.showAiBusinessAnalyst !== false,
  });

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
        analyticsPermissions,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit size={20} className="text-indigo-400" />
            <h2 className="font-bold text-lg">Edit User Details</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
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
                  💡 <strong>Note:</strong> Updates account details in Firestore database. To change the login credentials in Firebase Auth, update the user in <span className="font-semibold text-indigo-600">Firebase Console &gt; Authentication &gt; Users</span>.
                </p>
              </div>
            )}
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

// ---- Main AdminPortal ----
type AdminTab = "users" | "businesses" | "errors" | "usage";

export const AdminPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [allErrors, setAllErrors] = useState<Array<AppErrorLog & { userEmail: string }>>([]);
  const [allInvoices, setAllInvoices] = useState<Array<{ id: string; date?: string; total?: number; customerName?: string; workspaceId: string; timestamp?: number }>>([]);
  const [allActivityLogs, setAllActivityLogs] = useState<Array<UserActivityLog & { userEmail: string; userId: string }>>([]);
  const [workspaceInvoiceCounts, setWorkspaceInvoiceCounts] = useState<Record<string, number>>({});
  const [totalInvoicesCount, setTotalInvoicesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingPaymentId, setTogglingPaymentId] = useState<string | null>(null);
  const [togglingCsvId, setTogglingCsvId] = useState<string | null>(null);
  const [updatingMaxSessionsId, setUpdatingMaxSessionsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [preselectedBusinessId, setPreselectedBusinessId] = useState<string | undefined>(undefined);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // 1. Live User Profiles Listener
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "userProfiles"), orderBy("createdAt", "desc")),
      (snap) => { setProfiles(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile))); setLoading(false); },
      (err) => { console.warn("Admin profiles listener error:", err.message); setLoading(false); }
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

  const toggleBlockUser = async (profile: UserProfile) => {
    const newStatus: "active" | "blocked" = profile.status === "active" ? "blocked" : "active";
    if (!window.confirm(`Are you sure you want to ${newStatus === "blocked" ? "deactivate / block" : "activate / unblock"} ${profile.email}?`)) return;
    setTogglingId(profile.uid);
    try { await updateDoc(doc(db, "userProfiles", profile.uid), { status: newStatus }); }
    catch { alert("Failed to update user status."); }
    finally { setTogglingId(null); }
  };

  const togglePaymentBlockUser = async (profile: UserProfile) => {
    const isBlocked = !!profile.paymentTrackingBlocked;
    const action = isBlocked ? "allow payment tracking for" : "block payment tracking for";
    if (!window.confirm(`Are you sure you want to ${action} ${profile.email}?`)) return;
    setTogglingPaymentId(profile.uid);
    try { await updateDoc(doc(db, "userProfiles", profile.uid), { paymentTrackingBlocked: !isBlocked }); }
    catch { alert("Failed to update payment tracking permission."); }
    finally { setTogglingPaymentId(null); }
  };

  const toggleCsvImportUser = async (profile: UserProfile) => {
    const isAllowed = !!profile.csvImportAllowed;
    const action = isAllowed ? "block CSV import for" : "allow CSV import for";
    if (!window.confirm(`Are you sure you want to ${action} ${profile.email}?`)) return;
    setTogglingCsvId(profile.uid);
    try { await updateDoc(doc(db, "userProfiles", profile.uid), { csvImportAllowed: !isAllowed }); }
    catch { alert("Failed to update CSV import permission."); }
    finally { setTogglingCsvId(null); }
  };

  const updateMaxSessions = async (profile: UserProfile, maxSessions: number) => {
    setUpdatingMaxSessionsId(profile.uid);
    try {
      await updateDoc(doc(db, "userProfiles", profile.uid), { maxAllowedSessions: maxSessions });
    } catch {
      alert("Failed to update max allowed logins.");
    } finally {
      setUpdatingMaxSessionsId(null);
    }
  };

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-3.5 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400"/>Admin Portal</h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Manage users, login limits, activate/deactivate accounts, monitor health</p>
          </div>
          <button onClick={() => { setPreselectedBusinessId(undefined); setShowAddUser(true); }} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors">
            <UserPlus size={16}/> Add / Sync User
          </button>
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
        <div className="grid grid-cols-4 border-b border-slate-200 shrink-0 w-full bg-slate-50/50">
          <button className={tabCls("users")} onClick={() => setActiveTab("users")}>
            <Users size={14} className="shrink-0"/>
            <span className="truncate">Users<span className="hidden sm:inline"> ({enrichedProfiles.length})</span></span>
          </button>
          <button className={tabCls("businesses")} onClick={() => setActiveTab("businesses")}>
            <Building size={14} className="shrink-0"/>
            <span className="truncate">Businesses</span>
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
              togglingId={togglingId}
              togglingPaymentId={togglingPaymentId}
              togglingCsvId={togglingCsvId}
              updatingMaxSessionsId={updatingMaxSessionsId}
              deletingId={deletingId}
              onToggleBlock={toggleBlockUser}
              onTogglePaymentBlock={togglePaymentBlockUser}
              onToggleCsvImport={toggleCsvImportUser}
              onUpdateMaxSessions={updateMaxSessions}
              onDeleteUser={handleDeleteUser}
              onViewUser={setSelectedUser}
              onEditUser={setEditingUser}
            />
          )
          : activeTab === "businesses" ? <BusinessesTabContent profiles={enrichedProfiles} onAddMember={openAddUserForBusiness}/>
          : activeTab === "errors" ? <ErrorLogsTabContent errors={allErrors} onRefresh={loadAllErrors}/>
          : <UsageTabContent profiles={enrichedProfiles} allInvoices={allInvoices} allActivityLogs={allActivityLogs} allErrors={allErrors}/>}
        </div>
      </div>
      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onCreated={() => setShowAddUser(false)} profiles={enrichedProfiles} preselectedBusinessId={preselectedBusinessId}/>}
      {selectedUser && <UserDetailDrawer profile={selectedUser} activityLogs={allActivityLogs} onClose={() => setSelectedUser(null)}/>}
      {editingUser && <EditUserModal profile={editingUser} onClose={() => setEditingUser(null)} onUpdated={() => setEditingUser(null)} />}
    </div>
  );
};

// ---- Users Tab Content ----
const UsersTabContent: React.FC<{
  profiles: UserProfile[];
  togglingId: string | null;
  togglingPaymentId: string | null;
  togglingCsvId: string | null;
  updatingMaxSessionsId: string | null;
  deletingId: string | null;
  onToggleBlock: (p: UserProfile) => void;
  onTogglePaymentBlock: (p: UserProfile) => void;
  onToggleCsvImport: (p: UserProfile) => void;
  onUpdateMaxSessions: (p: UserProfile, max: number) => void;
  onDeleteUser: (p: UserProfile) => void;
  onViewUser: (p: UserProfile) => void;
  onEditUser: (p: UserProfile) => void;
}> = ({ profiles, togglingId, togglingPaymentId, togglingCsvId, updatingMaxSessionsId, deletingId, onToggleBlock, onTogglePaymentBlock, onToggleCsvImport, onUpdateMaxSessions, onDeleteUser, onViewUser, onEditUser }) => (
  <div>
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0 z-10">
          <tr>
            <th className="p-4">User / Email</th>
            <th className="p-4 text-center">Status</th>
            <th className="p-4 text-center">Max Logins</th>
            <th className="p-4 text-center">Payments</th>
            <th className="p-4 text-center">CSV Import</th>
            <th className="p-4 text-center">Last Login</th>
            <th className="p-4 text-center">Invoices</th>
            <th className="p-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {profiles.map((p) => (
            <tr key={p.uid} className="hover:bg-slate-50 transition-colors">
              <td className="p-4">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <span>{p.displayName || p.email.split("@")[0]}</span>
                  <button
                    onClick={() => onEditUser(p)}
                    className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded hover:bg-indigo-50 transition-colors"
                    title="Edit User Details (Name & Email)"
                  >
                    <Edit size={12} />
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  <span>{p.email}</span>
                </div>
                {p.businessName && <div className="text-[10px] text-indigo-600 font-bold mt-0.5">🏢 {p.businessName}</div>}
              </td>
              <td className="p-4 text-center"><StatusBadge status={p.status}/></td>
              <td className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <select
                    value={p.maxAllowedSessions || 1}
                    disabled={updatingMaxSessionsId === p.uid}
                    onChange={(e) => onUpdateMaxSessions(p, parseInt(e.target.value))}
                    className="px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={1}>1 Login</option>
                    <option value={2}>2 Logins</option>
                    <option value={3}>3 Logins</option>
                    <option value={5}>5 Logins</option>
                    <option value={10}>10 Logins</option>
                  </select>
                </div>
              </td>
              <td className="p-4 text-center">
                {p.paymentTrackingBlocked ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">Blocked</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Allowed</span>
                )}
              </td>
              <td className="p-4 text-center">
                {p.csvImportAllowed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Allowed</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Blocked</span>
                )}
              </td>
              <td className="p-4 text-center text-xs text-slate-500"><div>{p.lastLogin ? relativeTime(p.lastLogin) : "Never"}</div><div className="text-[10px] text-slate-400">{p.lastLogin ? formatTs(p.lastLogin) : ""}</div></td>
              <td className="p-4 text-center font-bold text-slate-700">{p.invoiceCount || 0}</td>
              <td className="p-4 text-center"><div className="flex items-center justify-center gap-1.5">
                <button onClick={() => onViewUser(p)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full" title="View Details"><Eye size={14}/></button>
                <button
                  onClick={() => onEditUser(p)}
                  title="Edit User Details (Name & Email)"
                  className="p-2 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                >
                  <Edit size={14} />
                </button>
                <button onClick={() => onToggleCsvImport(p)} disabled={togglingCsvId === p.uid} title={p.csvImportAllowed ? "Block CSV Import" : "Allow CSV Import"}
                  className={`p-2 rounded-full disabled:opacity-50 ${p.csvImportAllowed ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-700" : "bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700"}`}>
                  {togglingCsvId === p.uid ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                </button>
                <button onClick={() => onTogglePaymentBlock(p)} disabled={togglingPaymentId === p.uid} title={p.paymentTrackingBlocked ? "Allow Payment Tracking" : "Block Payment Tracking"}
                  className={`p-2 rounded-full disabled:opacity-50 ${p.paymentTrackingBlocked ? "bg-purple-100 hover:bg-purple-200 text-purple-700" : "bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700"}`}>
                  {togglingPaymentId === p.uid ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                </button>
                <button onClick={() => onToggleBlock(p)} disabled={togglingId === p.uid} title={p.status === "active" ? "Deactivate / Block User" : "Activate / Unblock User"}
                  className={`p-2 rounded-full disabled:opacity-50 ${p.status === "active" ? "bg-red-100 hover:bg-red-200 text-red-700" : "bg-green-100 hover:bg-green-200 text-green-700"}`}>
                  {togglingId === p.uid ? <Loader2 size={14} className="animate-spin"/> : p.status === "active" ? <Lock size={14}/> : <Unlock size={14}/>}
                </button>
                {p.email?.toLowerCase() !== "admin_billing@pratik.ca" && (
                  <button
                    onClick={() => onDeleteUser(p)}
                    disabled={deletingId === p.uid}
                    title="Remove User Profile from Firestore"
                    className="p-2 rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {deletingId === p.uid ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div></td>
            </tr>
          ))}
          {profiles.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No users found</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="md:hidden p-3 space-y-3">
      {profiles.map((p) => (
        <div key={p.uid} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-1 font-bold text-slate-800">
                <span>{p.displayName || p.email.split("@")[0]}</span>
                <button onClick={() => onEditUser(p)} className="text-indigo-600 hover:text-indigo-800 p-0.5">
                  <Edit size={12} />
                </button>
              </div>
              <div className="text-xs text-slate-400">
                <span>{p.email}</span>
              </div>
              {p.businessName && <div className="text-[10px] text-indigo-600 font-bold mt-0.5">🏢 {p.businessName}</div>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={p.status}/>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">Max Logins: {p.maxAllowedSessions || 1}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mb-3 flex items-center justify-between">
            <span><Clock size={11} className="inline mr-1"/> Last: {p.lastLogin ? relativeTime(p.lastLogin) : "Never"}</span>
            <select
              value={p.maxAllowedSessions || 1}
              onChange={(e) => onUpdateMaxSessions(p, parseInt(e.target.value))}
              className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-700"
            >
              <option value={1}>1 Login</option>
              <option value={2}>2 Logins</option>
              <option value={3}>3 Logins</option>
              <option value={5}>5 Logins</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onViewUser(p)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"><Eye size={12} className="inline mr-1"/> Details</button>
            <button
              onClick={() => onEditUser(p)}
              className="flex-1 py-2 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              <Edit size={12} className="inline mr-1" /> Edit
            </button>
            <button onClick={() => onToggleCsvImport(p)} disabled={togglingCsvId === p.uid} className={`flex-1 py-2 rounded-lg text-xs font-bold ${p.csvImportAllowed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {togglingCsvId === p.uid ? <Loader2 size={12} className="animate-spin"/> : p.csvImportAllowed ? "Block CSV" : "Allow CSV"}
            </button>
            <button onClick={() => onToggleBlock(p)} disabled={togglingId === p.uid} className={`flex-1 py-2 rounded-lg text-xs font-bold ${p.status === "active" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {togglingId === p.uid ? <Loader2 size={12} className="animate-spin"/> : p.status === "active" ? "Deactivate" : "Activate"}
            </button>
            {p.email?.toLowerCase() !== "admin_billing@pratik.ca" && (
              <button
                onClick={() => onDeleteUser(p)}
                disabled={deletingId === p.uid}
                className="py-2 px-2.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Remove Profile"
              >
                {deletingId === p.uid ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
const BusinessesTabContent: React.FC<{ profiles: UserProfile[]; onAddMember: (bId: string) => void }> = ({ profiles, onAddMember }) => {
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
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Building size={18} className="text-indigo-600 shrink-0" /> {b.businessName}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Workspace ID: {b.businessId}</p>
                </div>
                <button
                  onClick={() => onAddMember(b.businessId)}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                >
                  <UserPlus size={14} /> Add User
                </button>
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
