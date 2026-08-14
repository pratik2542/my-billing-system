import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Package,
  PackagePlus,
  Users,
  UserPlus,
  Settings,
  LogOut,
  Menu,
  PlusCircle,
  Trash,
  Upload,
  X,
  Edit,
  Save,
  History,
  BarChart3,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Table,
  Search,
  User as UserIcon,
  MapPin,
  Phone,
  PhoneCall,
  Sparkles,
  Wallet
} from 'lucide-react';
import { InvoiceGenerator } from './components/InvoiceGenerator';
import { InvoiceHistory } from './components/InvoiceHistory';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { CustomerSpendingModal } from './components/CustomerSpendingModal';
import { ProductAnalysisModal } from './components/ProductAnalysisModal';
import { PaymentTrackerModal } from './components/PaymentTrackerModal';
import { PaymentManagement } from './components/PaymentManagement';
import { AdminPortal, parseDeviceInfo } from './components/AdminPortal';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Product,
  Customer,
  BusinessSettings,
  AppTab,
  Invoice,
  PaymentEntry,
  UserProfile,
  ActivityCategory
} from './types';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_PRODUCT_UNITS, DEFAULT_COLUMN_HEADERS } from './constants';

// Firebase Imports
import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  increment
} from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, updateEmail, type User } from 'firebase/auth';

const isMainAdminUser = (u: User | null) => {
  if (!u || !u.email) return false;
  return u.email.toLowerCase() === 'admin_billing@pratik.ca';
};

const isPlaceholderSetting = (s: BusinessSettings | null | undefined): boolean => {
  if (!s) return true;
  // If user has set any unique field, it is NOT a placeholder
  if (s.gstin || s.bankAccountNumber || s.upiId || s.logoUrl || s.signatureUrl || s.signatureName) {
    return false;
  }
  const name = (s.name || '').trim().toLowerCase();
  const subName = (s.subName || '').trim().toLowerCase();
  const address = (s.address || '').trim().toLowerCase();
  const mobile = (s.mobile || '').trim();

  const placeholderNames = ['print works', 'my business', '', 'billing', 'billing system'];
  const placeholderSubnames = ['quality goods provider', 'offset & screen printing offset process color print & packaging box', ''];
  const placeholderAddresses = ['123 business road, city', '123 business road, city, m.: 98765 43210', 'opposite ram temple, talaja road, palitana', ''];
  const placeholderMobiles = ['98765 43210', '9876543210', '94269 89569', '9426989569', ''];

  const isNamePlaceholder = placeholderNames.includes(name);
  const isSubPlaceholder = placeholderSubnames.includes(subName) || !subName;
  const isAddrPlaceholder = placeholderAddresses.some(p => address.includes(p)) || !address;
  const isMobPlaceholder = placeholderMobiles.includes(mobile) || !mobile;

  return isNamePlaceholder && isSubPlaceholder && isAddrPlaceholder && isMobPlaceholder;
};

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- Data State ---
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.CREATE_BILL);
  const [dataLoading, setDataLoading] = useState(false);

  // Real-time Data from Firestore
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  const hasUnsavedSettingsRef = useRef(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const setHasUnsavedSettingsWithRef = (val: boolean) => {
    hasUnsavedSettingsRef.current = val;
    setHasUnsavedSettings(val);
  };

  const getDefaultUnit = (s: BusinessSettings) => {
    if (s.customUnits && s.customUnits.length > 0) {
      return s.customUnits[0];
    }
    return DEFAULT_PRODUCT_UNITS[0] || 'Qty';
  };

  // --- Product Edit State ---
  const [prodForm, setProdForm] = useState({
    name: '',
    packing: '',
    rate: '',
    unit: 'Kg'
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const productFormRef = useRef<HTMLDivElement>(null);

  // Sync prodForm unit with configured customUnits when settings change
  useEffect(() => {
    if (!editingProductId && settings.customUnits && settings.customUnits.length > 0) {
      if (!settings.customUnits.includes(prodForm.unit)) {
        setProdForm(prev => ({ ...prev, unit: settings.customUnits![0] }));
      }
    }
  }, [settings.customUnits, editingProductId]);

  // --- Customer Edit State ---
  const [custForm, setCustForm] = useState({
    name: '',
    city: '',
    phone: ''
  });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerFormMobile, setShowCustomerFormMobile] = useState(false);
  const customerFormRef = useRef<HTMLDivElement>(null);

  // Filtered customer list based on search query
  const filteredCustomers = React.useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }, [customers, customerSearchQuery]);



  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Pending logo preview before save
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [pendingLogoWidth, setPendingLogoWidth] = useState<number | null>(null);
  const [isSavingSize, setIsSavingSize] = useState(false);

  // --- Settings Edit State ---
  const [tempSettings, setTempSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');
  const [settingsSubTab, setSettingsSubTab] = useState<'branding' | 'units' | 'billing' | 'tax_bank'>('branding');

  const handleAddCustomUnit = () => {
    const trimmed = newUnitInput.trim();
    if (!trimmed) return;
    const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
    if (current.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
      alert(`Unit "${trimmed}" is already in your unit list.`);
      return;
    }
    const updated = [...current, trimmed];
    handleTempSettingsChange({ ...tempSettings, customUnits: updated });
    setNewUnitInput('');
  };

  // --- Invoice Edit State ---
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // --- Customer Spending Modal State ---
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<Customer | null>(null);

  // --- Product Analysis Modal State ---
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);

  // --- Payment Tracker State ---
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  // --- User Profile State & Concurrent Session Control ---
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [hasConcurrentSession, setHasConcurrentSession] = useState(false);
  const [otherSessionInfo, setOtherSessionInfo] = useState<{ device?: string; time?: number }>({});
  const [isClaimingSession, setIsClaimingSession] = useState(false);

  const getOrInitSessionId = (): string => {
    let sid = sessionStorage.getItem('my_billing_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      sessionStorage.setItem('my_billing_session_id', sid);
    }
    return sid;
  };

  const migrationDoneRef = useRef(false);

  // --- Authentication Listener (Non-blocking Fast Startup) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        // Non-blocking profile tracking & block status check
        (async () => {
          try {
            // Debug: log auth token status to diagnose permission issues
            const token = await currentUser.getIdTokenResult();
            console.log('Auth token valid, uid:', currentUser.uid, 'expires:', token.expirationTime);

            const profileRef = doc(db, 'userProfiles', currentUser.uid);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists() && profileSnap.data().status === 'blocked') {
              await signOut(auth);
              setLoginError('Your account has been blocked. Please contact admin.');
              return;
            }

            const { device, browser } = parseDeviceInfo(navigator.userAgent);
            const deviceStr = `${device} (${browser})`;
            const now = Date.now();
            const sessionId = `${currentUser.uid}-${now}`;
            const currentSid = getOrInitSessionId();
            const defaultBizId = currentUser.uid;

            if (!profileSnap.exists()) {
              // Check if another profile was renamed to this email (e.g. Presha Flex workspace m7j5w1qzFVgDhMg0GjK9vWOpLFf1)
              let matchedBizId = defaultBizId;
              let matchedDisplayName = currentUser.email?.split('@')[0] || '';
              let matchedBizName = currentUser.email?.split('@')[0] || '';
              try {
                const allProfSnap = await getDocs(collection(db, 'userProfiles'));
                const existingMatch = allProfSnap.docs.find(d => d.id !== currentUser.uid && d.data().email?.toLowerCase() === currentUser.email?.toLowerCase());
                if (existingMatch) {
                  const matchData = existingMatch.data();
                  matchedBizId = matchData.businessId || existingMatch.id;
                  matchedDisplayName = matchData.displayName || matchedDisplayName;
                  matchedBizName = matchData.businessName || matchedBizName;
                }
              } catch { /* fallback to defaultBizId */ }

              await setDoc(profileRef, {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: matchedDisplayName,
                status: 'active',
                businessId: matchedBizId,
                businessName: matchedBizName,
                role: 'owner',
                maxAllowedSessions: 1,
                activeSessions: [{ id: currentSid, device: deviceStr, lastActive: now }],
                activeSessionId: currentSid,
                activeSessionDevice: deviceStr,
                createdAt: now,
                lastLogin: now,
                lastSeen: now,
                aiRequestCount: 0,
                errorCount: 0,
                invoiceCount: 0,
              });
            } else {
              const data = profileSnap.data() as UserProfile;
              const maxAllowed = data.maxAllowedSessions || 1;
              const currentActive = (data.activeSessions || []).filter(s => (now - s.lastActive) < 24 * 3600 * 1000);
              
              const exists = currentActive.some(s => s.id === currentSid);
              let updatedActive = [...currentActive];
              if (exists) {
                updatedActive = updatedActive.map(s => s.id === currentSid ? { ...s, lastActive: now, device: deviceStr } : s);
              } else if (updatedActive.length < maxAllowed) {
                updatedActive.push({ id: currentSid, device: deviceStr, lastActive: now });
              }

              const updates: any = {
                lastLogin: now,
                lastSeen: now,
                activeSessions: updatedActive,
                activeSessionId: currentSid,
                activeSessionDevice: deviceStr
              };
              if (data.businessId === 'global' || !data.businessId) {
                updates.businessId = currentUser.uid;
              }
              // Use setDoc merge instead of updateDoc — more resilient to edge cases
              await setDoc(profileRef, updates, { merge: true });
            }

            setDoc(doc(db, 'userProfiles', currentUser.uid, 'sessions', sessionId), {
              device, browser, loginAt: now, lastActive: now,
            }).catch(() => {});
          } catch (e) {
            console.warn('Background profile setup warning:', e);
          }
        })();
      }
    });
    return () => unsubscribe();
  }, []);

  const wasRegisteredRef = useRef(false);

  // --- User Profile & Real-Time Concurrent Session Listener ---
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setHasConcurrentSession(false);
      wasRegisteredRef.current = false;
      return;
    }
    const unsubProfile = onSnapshot(doc(db, 'userProfiles', user.uid), async (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        if (profileData.businessId === 'global' || !profileData.businessId) {
          profileData.businessId = user.uid;
          updateDoc(doc(db, 'userProfiles', user.uid), { businessId: user.uid }).catch(() => {});
        }
        setUserProfile(profileData);

        // If the snapshot came from local cache (not confirmed by server),
        // skip session enforcement — the cached activeSessions list may be stale.
        const fromCache = docSnap.metadata.fromCache;

        const currentSid = getOrInitSessionId();
        const maxAllowed = profileData.maxAllowedSessions || 1;
        const activeList = profileData.activeSessions || [];

        // Check if current tab's session token is registered in activeSessions list
        const isSessionRegistered = activeList.some(s => s.id === currentSid);
        
        if (isSessionRegistered) {
          wasRegisteredRef.current = true;
          setHasConcurrentSession(false);
        } else if (fromCache) {
          // Don't enforce session conflict from stale cached data — let the server confirm first
          setHasConcurrentSession(false);
        } else {
          // If this session was previously registered and active, but was evicted/removed:
          if (wasRegisteredRef.current) {
            wasRegisteredRef.current = false;
            setHasConcurrentSession(false);
            try {
              await signOut(auth);
            } catch { /* ignore */ }
            setUser(null);
            setUserProfile(null);
            setLoginError('You were logged out because your account logged in on another device.');
            return;
          }

          // New un-registered session attempt exceeding limit
          if (activeList.length >= maxAllowed) {
            setHasConcurrentSession(true);
            setOtherSessionInfo({
              device: activeList[0]?.device || profileData.activeSessionDevice || 'Another device/browser',
              time: activeList[0]?.lastActive || profileData.lastLogin
            });
          } else {
            // Automatically register current session if below max allowed limit
            const { device, browser } = parseDeviceInfo(navigator.userAgent);
            const deviceStr = `${device} (${browser})`;
            const now = Date.now();
            const updatedList = [...activeList, { id: currentSid, device: deviceStr, lastActive: now }];
            setDoc(doc(db, 'userProfiles', user.uid), { activeSessions: updatedList }, { merge: true }).catch(() => {});
            wasRegisteredRef.current = true;
            setHasConcurrentSession(false);
          }
        }
      }
    }, (err) => {
      console.warn('UserProfile snapshot listener error:', err.message);
      // If we can't reach Firestore (permissions / network), don't trap user in conflict screen
      setHasConcurrentSession(false);
    });
    return () => unsubProfile();
  }, [user]);

  // --- Firestore Data Listeners (Fast Single-Pass Fetching) ---
  // --- Firestore Data Listeners (Reactive Real-Time Fetching) ---
  useEffect(() => {
    if (!user) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setSettings(DEFAULT_BUSINESS_SETTINGS);
      setTempSettings(DEFAULT_BUSINESS_SETTINGS);
      setHasUnsavedSettingsWithRef(false);
      return;
    }

    const targetBizId = (userProfile?.businessId && userProfile.businessId !== 'global') ? userProfile.businessId : user.uid;
    if (!targetBizId) return;

    setDataLoading(true);

    const settingsRef = doc(db, 'users', targetBizId, 'settings', 'general');
    const productsQuery = query(collection(db, 'users', targetBizId, 'products'));
    const customersQuery = query(collection(db, 'users', targetBizId, 'customers'));
    const invoicesQuery = query(collection(db, 'users', targetBizId, 'invoices'), limit(1000));

    // 1. Settings Listener — purely reactive & preserves in-progress unsaved settings
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<BusinessSettings>;
        const loadedSettings: BusinessSettings = {
          ...DEFAULT_BUSINESS_SETTINGS,
          ...data,
          customUnits: Array.isArray(data.customUnits) ? data.customUnits : DEFAULT_BUSINESS_SETTINGS.customUnits,
          columnHeaders: {
            ...DEFAULT_COLUMN_HEADERS,
            ...(data.columnHeaders || {})
          },
          analyticsVisibility: {
            ...DEFAULT_BUSINESS_SETTINGS.analyticsVisibility,
            ...(data.analyticsVisibility || {})
          }
        };
        setSettings(loadedSettings);
        if (!hasUnsavedSettingsRef.current) {
          setTempSettings(loadedSettings);
        }
        setPermissionError(null);
      } else {
        setSettings(DEFAULT_BUSINESS_SETTINGS);
        if (!hasUnsavedSettingsRef.current) {
          setTempSettings(DEFAULT_BUSINESS_SETTINGS);
        }
      }
    }, (err) => {
      console.warn('Settings snapshot listener error:', err.message);
      if (err.message.includes('permissions') || err.code === 'permission-denied') {
        setPermissionError(`Your logged-in account (${user.email || user.uid}) lacks Firestore permissions.`);
      }
    });

    // 2. Products Listener
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
      setPermissionError(null);
    }, (err) => {
      console.warn('Products snapshot listener error:', err.message);
    });

    // 3. Customers Listener
    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      const custs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(custs);
      setPermissionError(null);
    }, (err) => {
      console.warn('Customers snapshot listener error:', err.message);
    });

    // 4. Invoices Listener
    const unsubInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      const invs = snapshot.docs.map(doc => ({ ...doc.data() } as Invoice));
      setInvoices(invs);
      setDataLoading(false);
      setPermissionError(null);
    }, (err) => {
      console.warn('Invoices snapshot listener error:', err.message);
      setDataLoading(false);
      if (err.message.includes('permissions') || err.code === 'permission-denied') {
        setPermissionError(`Firebase Security Rules are blocking access for logged-in user: ${user.email || user.uid}.`);
      }
    });

    return () => {
      unsubSettings();
      unsubProducts();
      unsubCustomers();
      unsubInvoices();
    };
  }, [user, userProfile?.businessId]);

  const handleClaimSession = async () => {
    if (!user) return;
    setIsClaimingSession(true);
    try {
      const currentSid = getOrInitSessionId();
      const { device, browser } = parseDeviceInfo(navigator.userAgent);
      const deviceStr = `${device} (${browser})`;
      const now = Date.now();

      // Revoke all other active sessions and set only this current session using setDoc merge
      await setDoc(doc(db, 'userProfiles', user.uid), {
        activeSessions: [{ id: currentSid, device: deviceStr, lastActive: now }],
        activeSessionId: currentSid,
        activeSessionDevice: deviceStr,
        lastLogin: now,
        lastSeen: now
      }, { merge: true });

      wasRegisteredRef.current = true;
      setHasConcurrentSession(false);
    } catch (e) {
      console.warn('Could not update remote session in Firestore, unlocking local session:', e);
      // Fallback: Clear local conflict state so user is never trapped in a lock loop on localhost
      wasRegisteredRef.current = true;
      setHasConcurrentSession(false);
    } finally {
      setIsClaimingSession(false);
    }
  };

  // --- Payment Tracking Feature Flag ---
  const isPaymentTrackingAllowed = !userProfile?.paymentTrackingBlocked;
  const isPaymentTrackingActive = isPaymentTrackingAllowed && (settings.enablePaymentTracking !== false);

  // --- Update Document Title and Favicon ---
  useEffect(() => {
    if (!user) {
      document.title = 'Billing System - Login';
      return;
    }

    // Update document title with business name
    document.title = `${settings.name || 'My Business'} - Billing System`;

    // Update favicon
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    if (settings.logoUrl) {
      // Use business logo as favicon
      link.href = settings.logoUrl;
    } else {
      // Generate favicon from logo initial and theme color
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Background circle with theme color
        ctx.fillStyle = settings.themeColor || '#dc2626';
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, 2 * Math.PI);
        ctx.fill();

        // White text with logo initial
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(settings.logoInitial || 'B', 32, 32);

        link.href = canvas.toDataURL();
      }
    }
  }, [user, settings.name, settings.logoUrl, settings.logoInitial, settings.themeColor]);

  // --- Navigation Guard ---
  const handleTabChange = (tab: AppTab) => {
    if (activeTab === AppTab.CREATE_BILL && (hasUnsavedChanges || editingInvoice) && tab !== AppTab.CREATE_BILL) {
      const message = editingInvoice 
        ? "You are currently editing an invoice. Are you sure you want to leave? Your changes will be lost."
        : "You have unsaved changes in your bill. Are you sure you want to leave? Your progress will be lost.";
      
      if (!window.confirm(message)) {
        return;
      }
      setHasUnsavedChanges(false);
      setEditingInvoice(null); // Clear editing state when navigating away
    }

    if (activeTab === AppTab.SETTINGS && hasUnsavedSettings && tab !== AppTab.SETTINGS) {
      if (!window.confirm("You have unsaved changes in Settings. Are you sure you want to leave? Your changes will be discarded.")) {
        return;
      }
      setTempSettings(settings);
      setHasUnsavedSettingsWithRef(false);
    }
    setActiveTab(tab);
  };

  // --- Handlers ---

  // --- Error Logger (writes errors to Firestore) ---
  const logAppError = async (message: string, route: string, stack?: string) => {
    if (!user) return;
    try {
      const errRef = doc(collection(db, 'userProfiles', user.uid, 'errorLogs'));
      await setDoc(errRef, { message, route, stack: stack || '', timestamp: Date.now() });
      await updateDoc(doc(db, 'userProfiles', user.uid), { errorCount: increment(1) });
    } catch { /* non-fatal */ }
  };

  // --- Activity Logger (writes activity logs to Firestore) ---
  const logUserActivity = async (category: ActivityCategory, action: string, details?: string) => {
    if (!user) return;
    try {
      const actRef = doc(collection(db, 'userProfiles', user.uid, 'activityLogs'));
      await setDoc(actRef, {
        id: actRef.id,
        category,
        action,
        details: details || '',
        timestamp: Date.now()
      });
    } catch { /* non-fatal */ }
  };

  // --- AI Usage Tracker ---
  const handleAiRequest = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'userProfiles', user.uid), { aiRequestCount: increment(1) });
      logUserActivity('ai', 'AI Request', 'Used AI smart assistant');
    } catch { /* non-fatal */ }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error(error);
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  const handleLogout = async () => {
    // Remove this session from the activeSessions list in Firestore before signing out.
    // Without this, the old session entry stays in the DB and causes a false
    // "Session Conflict Detected" on the very next login.
    if (user) {
      try {
        const currentSid = getOrInitSessionId();
        const profileRef = doc(db, 'userProfiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          const cleanedSessions = (data.activeSessions || []).filter((s: any) => s.id !== currentSid);
          await setDoc(profileRef, { activeSessions: cleanedSessions }, { merge: true });
        }
      } catch {
        // Non-fatal — proceed with sign-out regardless
      }
    }
    wasRegisteredRef.current = false;
    await signOut(auth);
    setEmail('');
    setPassword('');
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setSettings(DEFAULT_BUSINESS_SETTINGS);
    setTempSettings(DEFAULT_BUSINESS_SETTINGS);
    setHasUnsavedChanges(false);
    setHasUnsavedSettingsWithRef(false);
    setEditingInvoice(null);
    try {
      localStorage.removeItem('cached_products');
      localStorage.removeItem('cached_customers');
      localStorage.removeItem('cached_invoices');
      localStorage.removeItem('cached_settings');
    } catch {}
  };

  // --- Data Operations (Firestore) ---

  // Target Firestore Path Helpers (Uniform Per-User/Workspace Collections)
  const getWorkspaceId = () => {
    const bId = userProfile?.businessId;
    if (bId && bId !== 'global') return bId;
    return user?.uid || '';
  };

  const getSettingsRef = () => doc(db, 'users', getWorkspaceId(), 'settings', 'general');
  const getProductsCol = () => collection(db, 'users', getWorkspaceId(), 'products');
  const getCustomersCol = () => collection(db, 'users', getWorkspaceId(), 'customers');
  const getInvoicesCol = () => collection(db, 'users', getWorkspaceId(), 'invoices');

  // Helper: strip undefined values from objects before Firestore writes.
  // Firestore throws "Unsupported field value: undefined" if any field is undefined.
  const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    if (typeof obj === 'object' && !(obj instanceof Date)) {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = sanitizeForFirestore(value);
        }
      }
      return cleaned;
    }
    return obj;
  };

  const handleImportInvoices = async (importedInvoices: Invoice[]) => {
    if (!user) return;
    const invCol = getInvoicesCol();
    for (const inv of importedInvoices) {
      await setDoc(doc(invCol, inv.id), sanitizeForFirestore(inv));
    }
    updateDoc(doc(db, 'userProfiles', user.uid), { invoiceCount: increment(importedInvoices.length) }).catch(() => {});
    logUserActivity('invoice', 'Import Invoices', `Imported ${importedInvoices.length} invoices`);
  };

  const handleSaveInvoice = async (invoice: Invoice) => {
    if (!user) {
      alert("You must be logged in to save invoices.");
      return;
    }
    try {
      const isEditing = editingInvoice && editingInvoice.id === invoice.id;
      const invCol = getInvoicesCol();
      const settingsRef = getSettingsRef();

      if (!isEditing) {
        // Prevent duplicate Bill No collision and accidental overwriting of existing invoices
        const isDuplicate = invoices.some(inv => inv.id === invoice.id);
        if (isDuplicate) {
          let maxId = 0;
          invoices.forEach(inv => {
            const cleanStr = (inv.id || '').toString().replace(/[^0-9]/g, '');
            const num = parseInt(cleanStr, 10);
            if (!isNaN(num) && num > maxId) {
              maxId = num;
            }
          });
          const safeId = (maxId + 1).toString();
          console.warn(`Bill #${invoice.id} already exists! Reassigning to Bill #${safeId} to prevent overwriting.`);
          invoice.id = safeId;
        }
      }

      const cleanInvoice = sanitizeForFirestore(invoice);

      if (isEditing) {
        await setDoc(doc(invCol, invoice.id), cleanInvoice);
        logUserActivity('invoice', 'Edit Invoice', `Updated Bill #${invoice.id} (₹${invoice.total})`);
      } else {
        const numFromId = parseInt((invoice.id || '').toString().replace(/[^0-9]/g, ''), 10);
        const nextNo = Math.max((settings.nextInvoiceNumber || 0) + 1, !isNaN(numFromId) ? numFromId + 1 : 1);

        // Save the invoice document first
        await setDoc(doc(invCol, invoice.id), cleanInvoice);

        // Update settings counter & user profile count independently (non-blocking if permission restricted)
        updateDoc(settingsRef, { nextInvoiceNumber: nextNo }).catch(err => {
          console.warn("Could not update nextInvoiceNumber in settings document:", err);
        });

        updateDoc(doc(db, 'userProfiles', user.uid), { invoiceCount: increment(1) }).catch(() => {});
        logUserActivity('invoice', 'Create Invoice', `Generated Bill #${invoice.id} (₹${invoice.total}) for ${invoice.customerName}`);

        // Update local state optimistically
        setSettings(prev => ({ ...prev, nextInvoiceNumber: nextNo }));
      }
    } catch (e: any) {
      console.error("Error saving invoice: ", e);
      if (e?.code === 'permission-denied' || (e?.message && e.message.includes('permissions'))) {
        alert("Permission Error: Your Firebase Security Rules are blocking writes to Firestore. Please update your Security Rules in the Firebase Console.");
      } else {
        alert("Failed to save invoice: " + (e?.message || "Unknown error"));
      }
      throw e;
    }
  };

  const handleUpdateSettings = async (newSettings: BusinessSettings) => {
    if (!user) return;
    setSettings(newSettings);
    setTempSettings(newSettings);
    try {
      await setDoc(getSettingsRef(), newSettings);
      logUserActivity('settings', 'Update Settings', 'Updated business profile and configuration');
    } catch (e) {
      console.error("Error saving settings: ", e);
    }
  };

// Helper to compress base64 image data URLs for Firestore document size optimization
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
        if (!compressed.startsWith('data:image/webp')) {
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

  // Handle temporary settings changes (Smart comparison against saved settings)
  const handleTempSettingsChange = (newSettings: BusinessSettings) => {
    setTempSettings(newSettings);
    setHasUnsavedSettingsWithRef(!areSettingsEqual(newSettings, settings));
  };

  // Save settings with confirmation and automatic image compression
  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSavingSettings(true);
    try {
      let settingsToSave = { ...tempSettings };

      // Compress logo & signature to ensure total document size is well under 1MB Firestore limit
      if (settingsToSave.logoUrl && settingsToSave.logoUrl.length > 100000) {
        settingsToSave.logoUrl = await compressImageToMaxDataUrl(settingsToSave.logoUrl, 800, 400, 0.8);
      }
      if (settingsToSave.signatureUrl && settingsToSave.signatureUrl.length > 100000) {
        settingsToSave.signatureUrl = await compressImageToMaxDataUrl(settingsToSave.signatureUrl, 600, 300, 0.8);
      }

      const cleanSettings = sanitizeForFirestore(settingsToSave);

      // Save to primary target reference
      await setDoc(getSettingsRef(), cleanSettings);

      // Mirror to user's direct path to ensure schema resilience across updates
      if (user.uid) {
        await setDoc(doc(db, 'users', user.uid, 'settings', 'general'), cleanSettings, { merge: true }).catch(() => {});
        await updateDoc(doc(db, 'userProfiles', user.uid), { businessName: settingsToSave.name || '' }).catch(() => {});
      }

      setSettings(settingsToSave);
      setTempSettings(settingsToSave);
      setHasUnsavedSettingsWithRef(false);
      try {
        const wsId = getWorkspaceId();
        if (wsId) localStorage.setItem(`cached_settings_${wsId}`, JSON.stringify(settingsToSave));
      } catch {}
      alert('Settings saved successfully!');
    } catch (e) {
      console.error("Error saving settings: ", e);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // --- Product Handlers ---
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const prodCol = getProductsCol();
      if (editingProductId) {
        const productRef = doc(prodCol, editingProductId);
        await updateDoc(productRef, {
          name: prodForm.name,
          rate: Number(prodForm.rate),
          unit: prodForm.unit,
          packing: prodForm.packing
        });
        setEditingProductId(null);
      } else {
        await addDoc(prodCol, {
          name: prodForm.name,
          rate: Number(prodForm.rate),
          unit: prodForm.unit,
          packing: prodForm.packing,
        });
      }
      setProdForm({ name: '', packing: '', rate: '', unit: getDefaultUnit(settings) });
    } catch (e) {
      console.error("Error saving product: ", e);
      alert("Failed to save product.");
    }
  };

  const startEditProduct = (product: Product) => {
    setProdForm({
      name: product.name,
      packing: product.packing || '',
      rate: product.rate.toString(),
      unit: product.unit
    });
    setEditingProductId(product.id);
    setTimeout(() => {
      productFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const cancelEditProduct = () => {
    setProdForm({ name: '', packing: '', rate: '', unit: getDefaultUnit(settings) });
    setEditingProductId(null);
  };

  const deleteProduct = async (id: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteDoc(doc(getProductsCol(), id));
      if (editingProductId === id) cancelEditProduct();
    } catch (e) {
      console.error("Error deleting product:", e);
    }
  };

  // Quick Save Product from Past Invoice data
  const handleQuickSaveProduct = async (name: string, rate: number, unit: string, packing: string = '') => {
    if (!user || !name.trim()) return;
    try {
      const prodCol = getProductsCol();
      await addDoc(prodCol, {
        name: name.trim(),
        rate: Number(rate) || 0,
        unit: unit || getDefaultUnit(settings),
        packing: packing ? packing.trim() : ''
      });
      alert(`Product "${name.trim()}" saved to your product catalog!`);
    } catch (e) {
      console.error("Error quick-saving product:", e);
      alert(`Failed to save product "${name}". Please try again.`);
    }
  };

  // Unique products from past invoices that are not yet saved in the Products database
  const unsavedInvoiceProducts = React.useMemo(() => {
    const savedNames = new Set(products.map(p => p.name.trim().toLowerCase()));
    const map = new Map<string, { name: string; rate: number; unit: string; packing: string; count: number; totalQty: number; totalRevenue: number }>();

    invoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          if (item.name && item.name.trim()) {
            const normName = item.name.trim().toLowerCase();
            if (!savedNames.has(normName)) {
              const existing = map.get(normName);
              const qty = item.quantity || 0;
              const amt = item.amount ?? ((item.rate || 0) * qty);
              const rate = item.rate || 0;
              const unit = item.unit || getDefaultUnit(settings);
              const packing = item.packing || '';

              if (existing) {
                existing.count += 1;
                existing.totalQty += qty;
                existing.totalRevenue += amt;
                if (!existing.rate && rate) existing.rate = rate;
                if (!existing.unit && unit) existing.unit = unit;
                if (!existing.packing && packing) existing.packing = packing;
              } else {
                map.set(normName, {
                  name: item.name.trim(),
                  rate: rate,
                  unit: unit,
                  packing: packing,
                  count: 1,
                  totalQty: qty,
                  totalRevenue: amt
                });
              }
            }
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [products, invoices, settings]);

  // --- Customer Handlers ---
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !custForm.name.trim()) return;

    try {
      const custCol = getCustomersCol();
      if (editingCustomerId) {
        const custRef = doc(custCol, editingCustomerId);
        await updateDoc(custRef, {
          name: custForm.name,
          city: custForm.city,
          phone: custForm.phone
        });
        setEditingCustomerId(null);
      } else {
        await addDoc(custCol, {
          name: custForm.name,
          city: custForm.city,
          phone: custForm.phone,
        });
      }
      setCustForm({ name: '', city: '', phone: '' });
    } catch (e) {
      console.error("Error saving customer:", e);
    }
  };

  // Quick Save Customer from Past Invoice data
  const handleQuickSaveCustomer = async (name: string, city: string = '') => {
    if (!user || !name.trim()) return;
    try {
      const custCol = getCustomersCol();
      await addDoc(custCol, {
        name: name.trim(),
        city: city.trim(),
        phone: ''
      });
      alert(`Customer "${name.trim()}" saved to your customer directory!`);
    } catch (e) {
      console.error("Error quick-saving customer:", e);
      alert(`Failed to save customer "${name}". Please try again.`);
    }
  };

  // Unique customers from past invoices that are not yet saved in the Customers database
  const unsavedInvoiceCustomers = React.useMemo(() => {
    const savedNames = new Set(customers.map(c => c.name.trim().toLowerCase()));
    const map = new Map<string, { name: string; city: string; count: number; totalSpent: number }>();

    invoices.forEach(inv => {
      if (inv.customerName && inv.customerName.trim()) {
        const normName = inv.customerName.trim().toLowerCase();
        if (!savedNames.has(normName)) {
          const existing = map.get(normName);
          const amount = inv.total ?? (inv as any).totalAmount ?? 0;
          if (existing) {
            existing.count += 1;
            existing.totalSpent += amount;
            if (!existing.city && inv.customerCity) existing.city = inv.customerCity;
          } else {
            map.set(normName, {
              name: inv.customerName.trim(),
              city: inv.customerCity || '',
              count: 1,
              totalSpent: amount
            });
          }
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customers, invoices]);

  const startEditCustomer = (customer: Customer) => {
    setCustForm({
      name: customer.name,
      city: customer.city,
      phone: customer.phone || ''
    });
    setEditingCustomerId(customer.id);
    setTimeout(() => {
      customerFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const cancelEditCustomer = () => {
    setCustForm({ name: '', city: '', phone: '' });
    setEditingCustomerId(null);
  };

  const deleteCustomer = async (id: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    try {
      await deleteDoc(doc(getCustomersCol(), id));
      if (editingCustomerId === id) cancelEditCustomer();
    } catch (e) {
      console.error("Error deleting customer:", e);
    }
  };

  // --- Invoice Handlers ---
  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) return;
    try {
      await deleteDoc(doc(getInvoicesCol(), invoiceId));
      updateDoc(doc(db, 'userProfiles', user.uid), { invoiceCount: increment(-1) }).catch(() => {});
      logUserActivity('invoice', 'Delete Invoice', `Deleted Bill #${invoiceId}`);
      alert('Invoice deleted successfully!');
    } catch (e) {
      console.error("Error deleting invoice:", e);
      alert("Failed to delete invoice. Please try again.");
    }
  };

  const handleEditInvoice = (invoice: Invoice) => {
    // Set the invoice to edit and switch to create bill tab
    setEditingInvoice(invoice);
    setActiveTab(AppTab.CREATE_BILL);
  };

  // --- Payment Handlers ---
  const handleManagePayments = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
  };

  const handleAddPayment = async (invoiceId: string, payment: PaymentEntry) => {
    if (!user) return;
    const invCol = getInvoicesCol();
    const invRef = doc(invCol, invoiceId);
    // Get current invoice payments
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error('Invoice not found');
    const current = invSnap.data() as Invoice;
    const updatedPayments = [...(current.payments || []), payment];
    await updateDoc(invRef, { payments: updatedPayments });
    logUserActivity('payment', 'Record Payment', `Recorded ₹${payment.amount} (${payment.mode}) for Bill #${invoiceId}`);
    // Update local paymentInvoice state so modal reflects immediately
    setPaymentInvoice(prev => prev && prev.id === invoiceId ? { ...prev, payments: updatedPayments } : prev);
  };

  const handleDeletePayment = async (invoiceId: string, paymentId: string) => {
    if (!user) return;
    const invCol = getInvoicesCol();
    const invRef = doc(invCol, invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error('Invoice not found');
    const current = invSnap.data() as Invoice;
    const updatedPayments = (current.payments || []).filter(p => p.id !== paymentId);
    await updateDoc(invRef, { payments: updatedPayments });
    // Update local paymentInvoice state so modal reflects immediately
    setPaymentInvoice(prev => prev && prev.id === invoiceId ? { ...prev, payments: updatedPayments } : prev);
  };

  // --- Logo Handlers ---
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSize = 5 * 1024 * 1024; // 5MB limit
      if (file.size > maxSize) {
        alert(`File size must be less than 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawResult = reader.result as string;
        const compressed = await compressImageToMaxDataUrl(rawResult, 800, 400, 0.8);
        handleTempSettingsChange({ ...tempSettings, logoUrl: compressed });
      };
      reader.onerror = () => {
        alert("Error reading file. Please try again.");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    if (!tempSettings.logoUrl) return;
    handleTempSettingsChange({ ...tempSettings, logoUrl: '' });
  };

  // --- Signature Handlers ---
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSize = 5 * 1024 * 1024; // 5MB limit
      if (file.size > maxSize) {
        alert(`File size must be less than 5MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawResult = reader.result as string;
        const compressed = await compressImageToMaxDataUrl(rawResult, 600, 300, 0.8);
        handleTempSettingsChange({ ...tempSettings, signatureUrl: compressed });
      };
      reader.onerror = () => {
        alert("Error reading file. Please try again.");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSignature = () => {
    if (!tempSettings.signatureUrl) return;
    handleTempSettingsChange({ ...tempSettings, signatureUrl: '' });
  };



  // --- Render Auth Loading ---
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-400 w-8 h-8" />
      </div>
    );
  }

  // --- Render Login ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border-t-4 border-red-600">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold font-serif">B</div>
            <h1 className="text-2xl font-bold text-slate-800">Billing System</h1>
            <p className="text-slate-500">Sign in to manage invoices</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded focus:border-red-500 focus:ring-red-500 outline-none transition"
                placeholder="Enter your email"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded focus:border-red-500 focus:ring-red-500 outline-none transition"
                placeholder="Enter your password"
                required
              />
            </div>
            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded transition shadow-md">
              Access System
            </button>

            <div className="bg-slate-50 p-3 rounded text-xs text-slate-500 text-center mt-2">
              <p>Each user account has its own isolated environment for business settings, products, and invoices.</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Check user permissions for Analytics & AI features
  const hasAiAnalyticsPermission = (userProfile?.role === 'admin' || isMainAdminUser(user))
    ? (settings.analyticsVisibility?.showAiBusinessAnalyst !== false)
    : (userProfile?.analyticsPermissions?.showAiBusinessAnalyst !== false);

  const hasProductAnalysisPermission = (userProfile?.role === 'admin' || isMainAdminUser(user))
    ? (settings.analyticsVisibility?.showProductAnalysis !== false)
    : (userProfile?.analyticsPermissions?.showProductAnalysis !== false);

  const hasCustomerAnalysisPermission = (userProfile?.role === 'admin' || isMainAdminUser(user))
    ? (settings.analyticsVisibility?.showCustomerAnalysis !== false)
    : (userProfile?.analyticsPermissions?.showCustomerAnalysis !== false);

  const hasCustomerPurchaseDetailsPermission = (userProfile?.role === 'admin' || isMainAdminUser(user))
    ? (settings.analyticsVisibility?.showCustomerPurchaseDetails !== false)
    : (userProfile?.analyticsPermissions?.showCustomerPurchaseDetails !== false);

  const canViewCustomerSpending = hasCustomerAnalysisPermission && hasCustomerPurchaseDetailsPermission;

  const analyticsMenuTitle = hasAiAnalyticsPermission ? 'AI Analytics' : 'Analytics';

  // --- Render Main App ---
  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">

      {/* Sidebar - Hidden when printing */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden md:flex no-print">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          {settings.logoUrl ? (
            <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-slate-700">
              <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-lg shrink-0 shadow-sm">
              {(settings.name?.trim().charAt(0) || settings.logoInitial || 'B').toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-serif text-white font-bold tracking-wide truncate" title={settings.name}>
              {settings.name || 'BILLING'}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">v2.0 (Cloud)</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => handleTabChange(AppTab.CREATE_BILL)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.CREATE_BILL ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <FileText className="w-5 h-5" /> Create Bill
          </button>

          <button
            onClick={() => handleTabChange(AppTab.INVOICE_HISTORY)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.INVOICE_HISTORY ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <History className="w-5 h-5" /> Invoice History
          </button>

          {isPaymentTrackingActive && (
            <button
              onClick={() => handleTabChange(AppTab.PAYMENTS)}
              className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.PAYMENTS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <Wallet className="w-5 h-5" /> Payments
            </button>
          )}

          <button
            onClick={() => handleTabChange(AppTab.ANALYTICS)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ANALYTICS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <BarChart3 className="w-5 h-5" /> {analyticsMenuTitle}
          </button>

          <button
            onClick={() => handleTabChange(AppTab.PRODUCTS)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.PRODUCTS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Package className="w-5 h-5" /> Products
          </button>

          <button
            onClick={() => handleTabChange(AppTab.CUSTOMERS)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.CUSTOMERS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Users className="w-5 h-5" /> Customers
          </button>

          <button
            onClick={() => handleTabChange(AppTab.SETTINGS)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.SETTINGS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Settings className="w-5 h-5" /> Settings
          </button>

          {isMainAdminUser(user) && (
            <button
              onClick={() => handleTabChange(AppTab.ADMIN_PORTAL)}
              className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ADMIN_PORTAL ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <ShieldCheck className="w-5 h-5" /> Admin Portal
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-2 truncate px-2">{userProfile?.email || user.email}</div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile Header (Fixed at top) */}
      <div className="md:hidden no-print fixed top-0 left-0 w-full bg-slate-900 p-3 flex justify-between items-center z-50 shadow-md h-16">
        <div className="flex items-center gap-2.5 min-w-0">
          {settings.logoUrl ? (
            <div className="w-8 h-8 rounded-lg bg-white p-0.5 flex items-center justify-center overflow-hidden shrink-0 shadow-xs border border-slate-700">
              <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-base shrink-0 shadow-xs">
              {(settings.name?.trim().charAt(0) || settings.logoInitial || 'B').toUpperCase()}
            </div>
          )}
          <span className="font-serif font-bold text-white text-base sm:text-lg truncate max-w-[170px]" title={settings.name}>
            {settings.name || 'BILLING'}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setMobileMenuOpen(prev => !prev)} className="p-2 rounded text-slate-400">
            <Menu size={20} />
          </button>
          <div className="hidden sm:flex gap-2">
            <button onClick={() => handleTabChange(AppTab.CREATE_BILL)} className={`p-2 rounded ${activeTab === AppTab.CREATE_BILL ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><FileText size={20} /></button>
            <button onClick={() => handleTabChange(AppTab.INVOICE_HISTORY)} className={`p-2 rounded ${activeTab === AppTab.INVOICE_HISTORY ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><History size={20} /></button>
            {isPaymentTrackingActive && (
              <button onClick={() => handleTabChange(AppTab.PAYMENTS)} className={`p-2 rounded ${activeTab === AppTab.PAYMENTS ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><Wallet size={20} /></button>
            )}
            <button onClick={() => handleTabChange(AppTab.ANALYTICS)} className={`p-2 rounded ${activeTab === AppTab.ANALYTICS ? 'bg-slate-700 text-white' : 'text-slate-400'}`} title={analyticsMenuTitle}><BarChart3 size={20} /></button>
            <button onClick={() => handleTabChange(AppTab.SETTINGS)} className={`p-2 rounded ${activeTab === AppTab.SETTINGS ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><Settings size={20} /></button>
          </div>
        </div>
      </div>

      {/* Mobile full menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-16 left-0 w-full bg-white z-40 border-b shadow">
          <nav className="p-4 space-y-2">
            <button onClick={() => { handleTabChange(AppTab.CREATE_BILL); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.CREATE_BILL ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <FileText className="w-5 h-5" /> Create Bill
            </button>
            <button onClick={() => { handleTabChange(AppTab.INVOICE_HISTORY); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.INVOICE_HISTORY ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <History className="w-5 h-5" /> Invoice History
            </button>
            {isPaymentTrackingActive && (
              <button onClick={() => { handleTabChange(AppTab.PAYMENTS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.PAYMENTS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
                <Wallet className="w-5 h-5" /> Payments
              </button>
            )}
            <button onClick={() => { handleTabChange(AppTab.ANALYTICS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ANALYTICS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <BarChart3 className="w-5 h-5" /> {analyticsMenuTitle}
            </button>
            <button onClick={() => { handleTabChange(AppTab.PRODUCTS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.PRODUCTS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <Package className="w-5 h-5" /> Products
            </button>
            <button onClick={() => { handleTabChange(AppTab.CUSTOMERS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.CUSTOMERS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <Users className="w-5 h-5" /> Customers
            </button>
            <button onClick={() => { handleTabChange(AppTab.SETTINGS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.SETTINGS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <Settings className="w-5 h-5" /> Settings
            </button>
            {isMainAdminUser(user) && (
              <button onClick={() => { handleTabChange(AppTab.ADMIN_PORTAL); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ADMIN_PORTAL ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`}>
                <ShieldCheck className="w-5 h-5" /> Admin Portal
              </button>
            )}
            <div className="pt-2 border-t mt-2">
              <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="w-full flex items-center gap-2 bg-slate-200 text-slate-600 p-3 rounded hover:bg-slate-300 transition-colors">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 md:p-6 pt-20 md:pt-6 relative bg-slate-100 h-screen overflow-hidden">

        {/* Global Loading Overlay if initial data fetch is slow */}
        {dataLoading && (
          <div className="absolute top-0 left-0 w-full h-1 bg-red-200 overflow-hidden z-50">
            <div className="w-full h-full bg-red-600 animate-pulse"></div>
          </div>
        )}

        {/* Permission Error Notification Banner */}
        {permissionError && (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-xl shadow-md flex items-center justify-between gap-4 shrink-0 z-40">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div>
                <h4 className="font-bold text-red-900 text-sm">Firebase Permission Error</h4>
                <p className="text-xs text-red-700 mt-0.5">{permissionError}</p>
                <p className="text-[11px] text-red-500 mt-1">Please sign out and log in with your primary admin account, or update Security Rules in Firebase Console.</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
            >
              Sign Out & Switch Account
            </button>
          </div>
        )}

        {activeTab === AppTab.CREATE_BILL && (
          <div className="flex-1 min-h-0">
            <ErrorBoundary fallbackTitle="Error loading Bill Creator">
              <InvoiceGenerator
                products={products}
                customers={customers}
                invoices={invoices}
                settings={settings}
                enablePaymentTracking={isPaymentTrackingActive}
                onUpdateSettings={handleUpdateSettings}
                onSaveInvoice={handleSaveInvoice}
                onUnsavedChanges={(hasChanges) => setHasUnsavedChanges(hasChanges)}
                editingInvoice={editingInvoice}
                onClearEditingInvoice={() => setEditingInvoice(null)}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === AppTab.INVOICE_HISTORY && (
          <div className="h-full">
            <ErrorBoundary fallbackTitle="Error loading Invoice History">
              <InvoiceHistory
                invoices={invoices}
                customers={customers}
                settings={settings}
                onDeleteInvoice={handleDeleteInvoice}
                onEditInvoice={handleEditInvoice}
                onManagePayments={handleManagePayments}
                enablePaymentTracking={isPaymentTrackingActive}
                csvImportAllowed={!!userProfile?.csvImportAllowed}
                onImportInvoices={handleImportInvoices}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === AppTab.PAYMENTS && isPaymentTrackingActive && (
          <ErrorBoundary fallbackTitle="Error loading Payment Management">
            <PaymentManagement
              invoices={invoices}
              customers={customers}
              settings={settings}
              onManagePayments={handleManagePayments}
              onDeletePayment={handleDeletePayment}
            />
          </ErrorBoundary>
        )}

        {activeTab === AppTab.ANALYTICS && (
          <ErrorBoundary fallbackTitle="Error loading Analytics Dashboard">
            <AnalyticsDashboard
              invoices={invoices}
              products={products}
              customers={customers}
              settings={{
                ...settings,
                analyticsVisibility: {
                  showProductAnalysis: hasProductAnalysisPermission,
                  showCustomerAnalysis: hasCustomerAnalysisPermission,
                  showCustomerPurchaseDetails: hasCustomerPurchaseDetailsPermission,
                  showAiBusinessAnalyst: hasAiAnalyticsPermission,
                }
              }}
              onAiRequest={handleAiRequest}
              enablePaymentTracking={isPaymentTrackingActive}
            />
          </ErrorBoundary>
        )}

        {activeTab === AppTab.ADMIN_PORTAL && isMainAdminUser(user) && (
          <ErrorBoundary fallbackTitle="Error loading Admin Portal">
            <AdminPortal />
          </ErrorBoundary>
        )}

        {activeTab === AppTab.PRODUCTS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex justify-between items-center shrink-0 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">
                      Products
                    </h2>
                    <span className="sm:hidden bg-white px-2 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs shrink-0">
                      {products.length}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">Manage your product catalog</p>
                </div>
                <div className="hidden sm:block bg-white px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 text-center shrink-0">
                  <div className="text-xl md:text-2xl font-bold text-red-600 leading-none">{products.length}</div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">Items</div>
                </div>
              </div>

              {/* Add/Edit Form */}
              <div ref={productFormRef} className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
                <form onSubmit={handleProductSubmit} className="space-y-2 sm:space-y-3">
                  <div>
                    <input
                      name="name"
                      required
                      placeholder="Product Name"
                      value={prodForm.name}
                      onChange={e => setProdForm({ ...prodForm, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full">
                    <input
                      name="packing"
                      placeholder="Size (e.g. 1kg)"
                      value={prodForm.packing}
                      onChange={e => setProdForm({ ...prodForm, packing: e.target.value })}
                      className="flex-1 min-w-0 p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white"
                    />
                    <input
                      name="rate"
                      type="number"
                      required
                      placeholder="Rate"
                      value={prodForm.rate}
                      onChange={e => setProdForm({ ...prodForm, rate: e.target.value })}
                      className="w-20 sm:w-24 p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white shrink-0"
                    />
                    {(() => {
                      const activeUnits = (settings.customUnits && settings.customUnits.length > 0)
                        ? settings.customUnits
                        : DEFAULT_PRODUCT_UNITS.slice(0, 10);
                      const unitOptions = Array.from(new Set([...activeUnits, prodForm.unit].filter(Boolean)));
                      return (
                        <select
                          name="unit"
                          value={prodForm.unit}
                          onChange={e => setProdForm({ ...prodForm, unit: e.target.value })}
                          className="w-20 sm:w-24 p-2 border border-slate-300 rounded text-sm bg-white focus:ring-1 focus:ring-red-500 focus:outline-none shrink-0"
                        >
                          {unitOptions.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      );
                    })()}
                    {editingProductId ? (
                      <>
                        <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center shrink-0 min-w-[36px] h-[38px]" title="Update Product">
                          <Save size={18} />
                        </button>
                        <button type="button" onClick={cancelEditProduct} className="bg-slate-400 text-white p-2 rounded hover:bg-slate-500 flex items-center justify-center shrink-0 min-w-[36px] h-[38px]" title="Cancel Edit">
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <button type="submit" className="bg-red-600 text-white p-2 rounded hover:bg-red-700 flex items-center justify-center shrink-0 min-w-[36px] h-[38px]" title="Add Product">
                        <PlusCircle size={20} />
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Products List */}
              <div className="flex-1 overflow-y-auto">
                {/* Mobile Card View */}
                <div className="md:hidden p-3 space-y-3">
                  {products.map(p => (
                    <div key={p.id} className={`bg-white border-2 rounded-lg p-4 shadow-sm transition-all ${editingProductId === p.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-red-300'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-900 text-lg mb-1">{p.name}</h3>
                          <p className="text-sm text-slate-500">{p.packing || 'No packing info'}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-red-600">₹{p.rate}</div>
                          <span className="inline-block mt-1 px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-700">{p.unit}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        {hasProductAnalysisPermission && (
                          <button onClick={() => setSelectedProductForModal(p)} className="flex-1 border border-emerald-200 bg-emerald-50 text-emerald-700 py-2 px-3 rounded-lg hover:bg-emerald-100 flex items-center justify-center gap-1.5 font-bold text-[10px] uppercase tracking-wider transition-colors">
                            <BarChart3 size={14} /> Analytics
                          </button>
                        )}
                        <button onClick={() => startEditProduct(p)} className={`${hasProductAnalysisPermission ? '' : 'flex-1'} bg-blue-50 text-blue-600 py-2 px-3 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors`}>
                          <Edit size={15} /> Edit
                        </button>
                        <button onClick={() => deleteProduct(p.id)} className={`${hasProductAnalysisPermission ? '' : 'flex-1'} bg-red-50 text-red-600 py-2 px-3 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors`}>
                          <Trash size={15} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <div className="text-center py-12">
                      <Package className="w-16 h-16 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-400 font-medium">No products yet</p>
                      <p className="text-xs text-slate-400 mt-1">Add your first product above</p>
                    </div>
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0">
                      <tr>
                        <th className="p-4 whitespace-nowrap">Product Name</th>
                        <th className="p-4 whitespace-nowrap">Packing</th>
                        <th className="p-4 whitespace-nowrap">Rate</th>
                        <th className="p-4 whitespace-nowrap">Unit</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map(p => (
                        <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${editingProductId === p.id ? 'bg-blue-50' : ''}`}>
                          <td className="p-4 font-semibold text-slate-900">{p.name}</td>
                          <td className="p-4 text-slate-600">{p.packing || '-'}</td>
                          <td className="p-4 font-bold text-red-600">₹{p.rate}</td>
                          <td className="p-4"><span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">{p.unit}</span></td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {hasProductAnalysisPermission && (
                                <button onClick={() => setSelectedProductForModal(p)} className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-xs font-bold border border-emerald-200 shadow-sm" title="View Product Sales & Buying Analysis">
                                  <BarChart3 size={16} /> Sales & Analytics
                                </button>
                              )}
                              <button onClick={() => startEditProduct(p)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded transition-colors" title="Edit">
                                <Edit size={18} />
                              </button>
                              <button onClick={() => deleteProduct(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors" title="Delete">
                                <Trash size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {products.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center">
                            <Package className="w-16 h-16 mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-400 font-medium">No products in your catalog</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Unsaved Products from Past Invoices Banner */}
                {unsavedInvoiceProducts.length > 0 && (
                  <div className="p-4 bg-amber-50/80 border-t border-amber-200 mt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <PackagePlus className="w-5 h-5 text-amber-600" />
                        <div>
                          <h3 className="font-bold text-amber-900 text-sm">
                            Unsaved Products from Past Invoices ({unsavedInvoiceProducts.length})
                          </h3>
                          <p className="text-xs text-amber-700">
                            These products exist on past bills but are not yet saved in your permanent Product catalog.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {unsavedInvoiceProducts.map(u => (
                        <div key={u.name} className="bg-white p-3 rounded-lg border border-amber-200 shadow-sm flex items-center justify-between gap-2 hover:border-amber-300 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm truncate">{u.name}</div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                              {u.rate > 0 && <span className="font-semibold text-red-600">₹{u.rate}</span>}
                              {u.packing && <span className="text-slate-600">({u.packing})</span>}
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {u.count} bill{u.count > 1 ? 's' : ''} ({u.totalQty} {u.unit})
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleQuickSaveProduct(u.name, u.rate, u.unit, u.packing)}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-sm cursor-pointer"
                            title={`Save ${u.name} to permanent product catalog`}
                          >
                            <PackagePlus size={14} />
                            <span>Save Product</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === AppTab.CUSTOMERS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex justify-between items-center shrink-0 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">
                      Customers
                    </h2>
                    <span className="bg-white px-2 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs shrink-0">
                      {customers.length}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                    Manage your customer database & insights
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:block bg-white px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 text-center">
                    <div className="text-xl md:text-2xl font-bold text-red-600 leading-none">{customers.length}</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">Total</div>
                  </div>
                  {/* Mobile Toggle Button for Add Form */}
                  <button
                    type="button"
                    onClick={() => setShowCustomerFormMobile(prev => !prev)}
                    className="md:hidden bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus size={14} />
                    <span>{showCustomerFormMobile || editingCustomerId ? 'Close' : '+ Add'}</span>
                  </button>
                </div>
              </div>

              {/* Form Section - Single Row on Desktop, Compact/Collapsible on Mobile */}
              <div
                ref={customerFormRef}
                className={`${
                  showCustomerFormMobile || editingCustomerId ? 'block' : 'hidden md:block'
                } p-3 sm:p-4 border-b border-slate-200 bg-slate-50 shrink-0 transition-all`}
              >
                <form onSubmit={handleCustomerSubmit} className="space-y-2.5 md:space-y-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 items-center">
                    {/* Customer Name */}
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="name"
                        required
                        placeholder="Customer Name *"
                        value={custForm.name}
                        onChange={e => setCustForm({ ...custForm, name: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>

                    {/* City */}
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="city"
                        placeholder="City"
                        value={custForm.city}
                        onChange={e => setCustForm({ ...custForm, city: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>

                    {/* Phone Number */}
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="phone"
                        placeholder="Phone Number"
                        value={custForm.phone}
                        onChange={e => setCustForm({ ...custForm, phone: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>

                    {/* Form Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {editingCustomerId ? (
                        <>
                          <button
                            type="submit"
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                            title="Update Customer"
                          >
                            <Save size={15} />
                            <span>Update</span>
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditCustomer}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-1.5 sm:py-2 px-2.5 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            title="Cancel Edit"
                          >
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="submit"
                          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 sm:py-2 px-4 rounded-lg text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          title="Add Customer"
                        >
                          <UserPlus size={15} />
                          <span>Add Customer</span>
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {/* Search & Quick Filter Bar */}
              <div className="p-2.5 sm:p-3 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                  <input
                    type="text"
                    placeholder="Search by name, city, or phone..."
                    value={customerSearchQuery}
                    onChange={e => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white outline-none transition-all placeholder:text-slate-400"
                  />
                  {customerSearchQuery && (
                    <button
                      onClick={() => setCustomerSearchQuery('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {customerSearchQuery && (
                  <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap px-1">
                    <span className="font-bold text-slate-700">{filteredCustomers.length}</span>/{customers.length}
                  </div>
                )}
              </div>

              {/* Customers Scrollable Area */}
              <div className="flex-1 overflow-y-auto bg-slate-50/30">

                {/* Mobile Card View */}
                <div className="md:hidden p-3.5 space-y-3">
                  {filteredCustomers.map(c => {
                    const initials = c.name
                      ? c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                      : 'C';

                    return (
                      <div
                        key={c.id}
                        className={`bg-white border rounded-2xl p-4 shadow-xs transition-all ${
                          editingCustomerId === c.id
                            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30'
                            : 'border-slate-200/90 hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                        {/* Header Row: Initials Avatar + Info */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm shrink-0">
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                              {c.name}
                            </h3>

                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {c.city && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200/60">
                                  <MapPin size={12} className="text-slate-500" />
                                  {c.city}
                                </span>
                              )}

                              {c.phone && (
                                <a
                                  href={`tel:${c.phone}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium transition-colors border border-emerald-200/60"
                                  title={`Call ${c.phone}`}
                                >
                                  <PhoneCall size={12} className="text-emerald-600" />
                                  {c.phone}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Mobile Action Buttons */}
                        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                          {canViewCustomerSpending && (
                            <button
                              onClick={() => setSelectedCustomerForModal(c)}
                              className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs transition-colors border border-indigo-100 cursor-pointer"
                            >
                              <BarChart3 size={15} />
                              <span>Spending & Purchases</span>
                            </button>
                          )}
                          <button
                            onClick={() => startEditCustomer(c)}
                            className={`${canViewCustomerSpending ? '' : 'flex-1'} bg-blue-50 hover:bg-blue-100 text-blue-700 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1 font-semibold text-xs transition-colors border border-blue-100 cursor-pointer`}
                            title="Edit customer"
                          >
                            <Edit size={15} />
                            <span className="sr-only sm:not-sr-only">Edit</span>
                          </button>
                          <button
                            onClick={() => deleteCustomer(c.id)}
                            className={`${canViewCustomerSpending ? '' : 'flex-1'} bg-red-50 hover:bg-red-100 text-red-600 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1 font-semibold text-xs transition-colors border border-red-100 cursor-pointer`}
                            title="Delete customer"
                          >
                            <Trash size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filteredCustomers.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                      <Users className="w-14 h-14 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-600 font-semibold text-base">
                        {customerSearchQuery ? 'No matching customers found' : 'No customers in your database'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {customerSearchQuery ? 'Try adjusting your search query' : 'Add your first customer using the form above'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100/90 text-slate-600 text-xs uppercase font-bold sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200">
                      <tr>
                        <th className="p-4 whitespace-nowrap">Customer</th>
                        <th className="p-4 whitespace-nowrap">City</th>
                        <th className="p-4 whitespace-nowrap">Phone</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCustomers.map(c => {
                        const initials = c.name
                            ? c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                          : 'C';

                        return (
                          <tr
                            key={c.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              editingCustomerId === c.id ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                                  {initials}
                                </div>
                                <span className="font-semibold text-slate-900">{c.name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-600 text-sm">{c.city || '-'}</td>
                            <td className="p-4 text-slate-600 text-sm font-mono">{c.phone || '-'}</td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                {canViewCustomerSpending && (
                                  <button
                                    onClick={() => setSelectedCustomerForModal(c)}
                                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold border border-indigo-200 shadow-2xs cursor-pointer"
                                    title="View Customer Spending & Purchase Chart"
                                  >
                                    <BarChart3 size={15} /> Spending & Purchases
                                  </button>
                                )}
                                <button
                                  onClick={() => startEditCustomer(c)}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-xl transition-colors cursor-pointer"
                                  title="Edit"
                                >
                                  <Edit size={17} />
                                </button>
                                <button
                                  onClick={() => deleteCustomer(c.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-xl transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash size={17} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredCustomers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-12 text-center">
                            <Users className="w-16 h-16 mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-500 font-semibold text-base">
                              {customerSearchQuery ? 'No matching customers' : 'No customers in your database'}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Unsaved Customers from Past Invoices Banner */}
                {unsavedInvoiceCustomers.length > 0 && (
                  <div className="p-4 bg-amber-50/80 border-t border-amber-200 mt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <h3 className="font-bold text-amber-900 text-sm">
                            Unsaved Customers from Past Invoices ({unsavedInvoiceCustomers.length})
                          </h3>
                          <p className="text-xs text-amber-700">
                            These customers exist on past bills but are not yet saved in your permanent Customer directory.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {unsavedInvoiceCustomers.map(u => (
                        <div
                          key={u.name}
                          className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between gap-2 hover:border-amber-300 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm truncate">{u.name}</div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                              {u.city && <span className="font-medium text-slate-600">📍 {u.city}</span>}
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                {u.count} bill{u.count > 1 ? 's' : ''} (₹{u.totalSpent.toLocaleString('en-IN')})
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleQuickSaveCustomer(u.name, u.city)}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-2xs cursor-pointer"
                            title={`Save ${u.name} to permanent customer list`}
                          >
                            <UserPlus size={14} />
                            <span>Save</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === AppTab.SETTINGS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-4xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 shrink-0">
                <h2 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                  Business Settings
                </h2>
                <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">Configure branding, units, invoices & tax</p>
              </div>

              {/* Sub Navigation Tabs — equal width on mobile */}
              <div className="border-b border-slate-200 bg-slate-50 px-1.5 sm:px-4 md:px-6 pt-1.5 sm:pt-3 shrink-0">
                <div className="grid grid-cols-4 gap-0.5 sm:gap-1">
                  {[
                    { key: 'branding' as const, icon: <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />, label: 'Branding', fullLabel: 'Branding & Header' },
                    { key: 'units' as const, icon: <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600" />, label: 'Units', fullLabel: 'Product Units' },
                    { key: 'billing' as const, icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />, label: 'Invoice', fullLabel: 'Invoice & Signature' },
                    { key: 'tax_bank' as const, icon: <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />, label: 'Tax/Bank', fullLabel: 'Tax, Bank & UPI' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSettingsSubTab(tab.key)}
                      className={`py-2 sm:py-2.5 px-1 sm:px-4 rounded-t-lg font-bold text-[10px] sm:text-sm flex items-center justify-center gap-1 sm:gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                        settingsSubTab === tab.key
                          ? 'border-red-600 text-red-700 bg-white shadow-sm'
                          : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
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
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                <div className="space-y-4 sm:space-y-6">

                  {/* Account Profile Summary (Read-Only) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 truncate">Account Profile (Read Only)</h4>
                      </div>
                      <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ml-2">Read-Only</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">User Name / Display Name</label>
                        <input
                          type="text"
                          readOnly
                          value={userProfile?.displayName || user?.email?.split('@')[0] || 'N/A'}
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none cursor-default"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Account Email</label>
                        <input
                          type="text"
                          readOnly
                          value={userProfile?.email || user?.email || 'N/A'}
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none cursor-default"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SUB-TAB 1: Branding & Header */}
                  {settingsSubTab === 'branding' && (
                    <div className="space-y-6">
                      <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 border-b border-slate-100 pb-2">
                        <Settings className="w-5 h-5 text-purple-600" />
                        Branding, Logo & Header Configuration
                      </h3>

                      {/* Visual Settings */}
                      <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <label className="block text-sm font-bold text-slate-600 mb-2">Theme Color</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={tempSettings.themeColor || '#dc2626'}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, themeColor: e.target.value })}
                              className="h-10 w-20 p-1 border border-slate-300 rounded cursor-pointer"
                            />
                            <span className="text-sm text-slate-500 font-medium">{tempSettings.themeColor || '#dc2626'}</span>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <label className="block text-sm font-bold text-slate-600 mb-4">Business Logo</label>
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap gap-3 items-center">
                              <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 px-5 rounded-lg flex items-center gap-2 text-sm w-full md:w-auto justify-center transition-all shadow-sm">
                                <Upload size={18} />
                                <span className="font-bold">Upload Logo</span>
                                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleLogoUpload} className="hidden" />
                              </label>

                              {tempSettings.logoUrl && (
                                <button
                                  type="button"
                                  onClick={removeLogo}
                                  className="text-red-600 hover:text-white hover:bg-red-600 p-2.5 border border-red-200 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-bold"
                                >
                                  <X size={18} />
                                  <span>Remove Logo</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {tempSettings.logoUrl && (
                            <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner">
                              <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
                                <div className="flex items-center gap-3">
                                  <div className="bg-slate-200 px-3 py-1 rounded-full">
                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                      Logo Size: {tempSettings.logoWidth || 80}px
                                    </label>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-2/3">
                                  <input
                                    type="range"
                                    min="40"
                                    max="350"
                                    value={tempSettings.logoWidth || 80}
                                    onChange={(e) => handleTempSettingsChange({ ...tempSettings, logoWidth: parseInt(e.target.value) || 80 })}
                                    className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 shadow-inner"
                                  />
                                </div>
                              </div>

                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Live Header Preview (Actual Size)</div>
                              <div className="overflow-x-auto no-scrollbar border-2 bg-white shadow-lg rounded-xl" style={{ borderColor: tempSettings.themeColor || '#dc2626' }}>
                                <div className="min-w-[794px] border-b-2 p-4 font-serif-custom text-center relative" style={{ color: tempSettings.themeColor || '#dc2626', borderColor: tempSettings.themeColor || '#dc2626' }}>
                                  <img
                                    src={tempSettings.logoUrl}
                                    alt="Logo"
                                    className="absolute left-4 top-4 object-contain"
                                    style={{ width: `${tempSettings.logoWidth || 80}px`, maxHeight: '120px' }}
                                  />
                                  <div className="mt-2">
                                    <h1 className="text-5xl font-bold mb-1" style={{ color: tempSettings.themeColor || '#dc2626', letterSpacing: tempSettings.nameLetterSpacing || '0.05em' }}>{tempSettings.name || 'Business Name'}</h1>
                                    <h2 className="text-2xl font-bold" style={{ color: tempSettings.themeColor || '#dc2626' }}>{tempSettings.subName || ''}</h2>
                                    <p className="mt-1 text-sm" style={{ color: tempSettings.themeColor || '#dc2626' }}>{tempSettings.address} {tempSettings.mobile ? `M.: ${tempSettings.mobile}` : ''}</p>
                                  </div>
                                </div>
                              </div>
                              <p className="text-center text-slate-400 text-[10px] mt-4 font-medium italic">This preview matches exactly how your logo and header will appear on printed invoices (794px width, A4 size).</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">Business Name (Header)</label>
                        <input
                          value={tempSettings.name}
                          onChange={e => handleTempSettingsChange({ ...tempSettings, name: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        />

                        {/* Business Name Character Spacing Control */}
                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 mt-2.5">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Character Spacing (Letter Spacing)
                          </label>
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              value={tempSettings.nameLetterSpacing || '0.05em'}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, nameLetterSpacing: e.target.value })}
                              className="p-2 border border-slate-300 rounded-lg text-sm bg-white font-medium cursor-pointer"
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
                            <span className="text-xs text-slate-500 font-medium">
                              Adjust spacing between letters in your business title header.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">Subtitle / Full Name</label>
                        <input
                          value={tempSettings.subName}
                          onChange={e => handleTempSettingsChange({ ...tempSettings, subName: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-600 mb-1">Address</label>
                        <input
                          value={tempSettings.address}
                          onChange={e => handleTempSettingsChange({ ...tempSettings, address: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-600 mb-1">Mobile</label>
                          <input
                            value={tempSettings.mobile}
                            onChange={e => handleTempSettingsChange({ ...tempSettings, mobile: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-600 mb-1">Logo Initial (Fallback)</label>
                          <input
                            value={tempSettings.logoInitial}
                            onChange={e => handleTempSettingsChange({ ...tempSettings, logoInitial: e.target.value })}
                            maxLength={1}
                            className="w-20 p-2.5 border border-slate-300 rounded-lg text-center font-bold text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2: Product Units */}
                  {settingsSubTab === 'units' && (
                    <div className="space-y-4 sm:space-y-6">
                      <div className="bg-slate-50 p-3 sm:p-4 md:p-5 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-0.5 flex items-center gap-2">
                          <Package className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 shrink-0" />
                          Product Measurement Units
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 mb-3 sm:mb-4">
                          Select which units appear in your product dropdown, or add custom units.
                        </p>

                        {/* Active Selected Units */}
                        <div className="mb-3 sm:mb-4">
                          <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                            Active Units ({ (tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).length })
                          </label>
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {(tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).map((u) => (
                              <span
                                key={u}
                                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-sm"
                              >
                                {u}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
                                    const updated = current.filter(x => x !== u);
                                    handleTempSettingsChange({ ...tempSettings, customUnits: updated });
                                  }}
                                  className="hover:bg-indigo-200 rounded-full p-0.5 text-indigo-600 hover:text-indigo-900 transition-colors cursor-pointer"
                                  title={`Remove ${u}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Add Custom Unit Form */}
                        <div className="flex items-center gap-2 mb-3 sm:mb-4">
                          <input
                            type="text"
                            placeholder="e.g. Carton, Roll, Set..."
                            value={newUnitInput}
                            onChange={(e) => setNewUnitInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomUnit();
                              }
                            }}
                            className="flex-1 min-w-0 p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomUnit}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                          >
                            <PlusCircle size={14} />
                            <span>Add</span>
                          </button>
                        </div>

                        {/* Quick Add Available Presets */}
                        <div>
                          <label className="block text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Quick Add Preset Units
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {DEFAULT_PRODUCT_UNITS.filter(u => !(tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10)).includes(u)).map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  const current = tempSettings.customUnits || DEFAULT_PRODUCT_UNITS.slice(0, 10);
                                  handleTempSettingsChange({ ...tempSettings, customUnits: [...current, preset] });
                                }}
                                className="px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <PlusCircle size={11} className="text-slate-500" />
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
                    <div className="space-y-4 sm:space-y-6">
                      {/* Bill Table Column Headers & Merging Settings */}
                      <div className="bg-slate-50 p-3 sm:p-4 md:p-5 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-0.5 flex items-center gap-2">
                          <Table className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 shrink-0" />
                          Column Headers & Merging
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 mb-3 sm:mb-4">
                          Customize column headers or merge Packing and Qty into one column.
                        </p>

                        {/* Merge Packing & Qty Toggle */}
                        <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 mb-3 sm:mb-4">
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
                              className="w-4 h-4 sm:w-5 sm:h-5 accent-purple-600 cursor-pointer mt-0.5 shrink-0"
                            />
                            <div>
                              <span className="text-xs sm:text-sm font-bold text-slate-800 block">Merge Packing & Qty column</span>
                              <span className="text-[11px] sm:text-xs text-slate-500 mt-0.5 block">Combines both into one column (e.g., "50 kg (2 Pcs)").</span>
                            </div>
                          </label>
                        </div>

                        {/* Custom Column Header Names */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                          <div>
                            <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">No. Header</label>
                            <input
                              value={tempSettings.columnHeaders?.snHeader ?? 'No.'}
                              onChange={e => handleTempSettingsChange({
                                ...tempSettings,
                                columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, snHeader: e.target.value }
                              })}
                              placeholder="No."
                              className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Details</label>
                            <input
                              value={tempSettings.columnHeaders?.particularsHeader ?? 'Details'}
                              onChange={e => handleTempSettingsChange({
                                ...tempSettings,
                                columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, particularsHeader: e.target.value }
                              })}
                              placeholder="Details"
                              className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>

                          {tempSettings.columnHeaders?.mergePackingAndQty ? (
                            <div>
                              <label className="block text-[10px] sm:text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">Merged Header</label>
                              <input
                                value={tempSettings.columnHeaders?.mergedPackingQtyHeader ?? 'Packing / Qty'}
                                onChange={e => handleTempSettingsChange({
                                  ...tempSettings,
                                  columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, mergedPackingQtyHeader: e.target.value }
                                })}
                                placeholder="Packing / Qty"
                                className="w-full p-2 sm:p-2.5 border border-purple-300 rounded-lg text-sm bg-purple-50 font-bold"
                              />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Packing</label>
                                <input
                                  value={tempSettings.columnHeaders?.packingHeader ?? 'Packing'}
                                  onChange={e => handleTempSettingsChange({
                                    ...tempSettings,
                                    columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, packingHeader: e.target.value }
                                  })}
                                  placeholder="Packing"
                                  className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Qty</label>
                                <input
                                  value={tempSettings.columnHeaders?.qtyHeader ?? 'Qty'}
                                  onChange={e => handleTempSettingsChange({
                                    ...tempSettings,
                                    columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, qtyHeader: e.target.value }
                                  })}
                                  placeholder="Qty"
                                  className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                                />
                              </div>
                            </>
                          )}

                          <div>
                            <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Rate</label>
                            <input
                              value={tempSettings.columnHeaders?.rateHeader ?? 'Rate'}
                              onChange={e => handleTempSettingsChange({
                                ...tempSettings,
                                columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, rateHeader: e.target.value }
                              })}
                              placeholder="Rate"
                              className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Amount</label>
                            <input
                              value={tempSettings.columnHeaders?.amountHeader ?? 'Amount'}
                              onChange={e => handleTempSettingsChange({
                                ...tempSettings,
                                columnHeaders: { ...DEFAULT_COLUMN_HEADERS, ...tempSettings.columnHeaders, amountHeader: e.target.value }
                              })}
                              placeholder="Amount"
                              className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Invoice Sequence */}
                      <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-1 flex items-center gap-2">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
                          Invoice Auto-Increment
                        </h3>
                        <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-1">Next Invoice Number</label>
                        <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Manually update this only if you need to reset or skip invoice numbers.</p>
                        <input
                          type="number"
                          value={tempSettings.nextInvoiceNumber}
                          onChange={e => handleTempSettingsChange({ ...tempSettings, nextInvoiceNumber: parseInt(e.target.value) || 1 })}
                          className="w-full sm:w-36 p-2.5 sm:p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-bold"
                        />
                      </div>

                      {/* Signature Section */}
                      <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-3 flex items-center gap-2">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 shrink-0" />
                          Signature Settings
                        </h3>
                        <div className="space-y-3 sm:space-y-4">
                          <div>
                            <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-1">Signature Name (Optional)</label>
                            <input
                              value={tempSettings.signatureName || ''}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, signatureName: e.target.value })}
                              placeholder="e.g., S.J.B.G.U"
                              className="w-full p-2 sm:p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                            <p className="text-[11px] sm:text-xs text-slate-500 mt-1">Appears as "For, [Name]" on printed invoices.</p>
                          </div>

                          <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200">
                            <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-2 sm:mb-3">Signature Image (Optional)</label>
                            <div className="flex flex-col gap-2.5 sm:gap-3">
                              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                                <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 sm:py-2.5 px-4 sm:px-5 rounded-lg flex items-center gap-2 text-sm justify-center transition-all shadow-sm">
                                  <Upload size={16} />
                                  <span className="font-bold text-xs sm:text-sm">Upload Signature</span>
                                  <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleSignatureUpload} className="hidden" />
                                </label>

                                {tempSettings.signatureUrl && (
                                  <button
                                    type="button"
                                    onClick={removeSignature}
                                    className="text-red-600 hover:text-white hover:bg-red-600 py-2 sm:py-2.5 px-4 border border-red-200 rounded-lg transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-bold cursor-pointer"
                                  >
                                    <X size={16} />
                                    <span>Remove</span>
                                  </button>
                                )}
                              </div>

                              {tempSettings.signatureUrl && (
                                <div className="p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 mb-1.5">Preview:</p>
                                  <img
                                    src={tempSettings.signatureUrl}
                                    alt="Signature"
                                    className="max-h-16 sm:max-h-20 object-contain bg-white p-2 border border-slate-200 rounded filter contrast-[180%] brightness-[80%]"
                                  />
                                </div>
                              )}

                              <p className="text-[11px] sm:text-xs text-slate-500">Upload a transparent PNG for best results. Max 2MB.</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Invoice Declaration Customization */}
                      <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-1 flex items-center gap-2">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 shrink-0" />
                          Invoice Declaration
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-500 mb-3">
                          Customize or hide the legal declaration note printed at the bottom of your invoices.
                        </p>

                        <div className="space-y-3">
                          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200">
                            <label htmlFor="showDeclaration" className="flex items-start gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                id="showDeclaration"
                                checked={tempSettings.showDeclaration !== false}
                                onChange={e => handleTempSettingsChange({ ...tempSettings, showDeclaration: e.target.checked })}
                                className="w-4 h-4 sm:w-5 sm:h-5 accent-indigo-600 cursor-pointer mt-0.5 shrink-0"
                              />
                              <div>
                                <span className="text-xs sm:text-sm font-bold text-slate-800 block">Show Declaration on Invoice</span>
                                <span className="text-[11px] sm:text-xs text-slate-500 mt-0.5 block">Displays the declaration note in the footer of printed and shared bills.</span>
                              </div>
                            </label>
                          </div>

                          {tempSettings.showDeclaration !== false && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs sm:text-sm font-bold text-slate-600">Declaration Note</label>
                                <button
                                  type="button"
                                  onClick={() => handleTempSettingsChange({
                                    ...tempSettings,
                                    declarationText: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."
                                  })}
                                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
                                >
                                  Reset to Standard Default
                                </button>
                              </div>
                              <textarea
                                rows={3}
                                value={tempSettings.declarationText ?? "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}
                                onChange={e => handleTempSettingsChange({ ...tempSettings, declarationText: e.target.value })}
                                placeholder="Enter custom declaration text..."
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
                              />
                              <p className="text-[11px] text-slate-500 mt-1">This text appears right below the "Declaration:" label on printed bills.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Payment Tracking Feature Toggle */}
                      <div className="bg-purple-50 p-3 sm:p-4 rounded-xl border border-purple-200">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-2 sm:mb-3 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                          Payment Tracking
                        </h3>
                        <label htmlFor="enablePaymentTracking" className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            id="enablePaymentTracking"
                            disabled={!isPaymentTrackingAllowed}
                            checked={isPaymentTrackingAllowed ? (tempSettings.enablePaymentTracking !== false) : false}
                            onChange={e => handleTempSettingsChange({ ...tempSettings, enablePaymentTracking: e.target.checked })}
                            className="w-4 h-4 sm:w-5 sm:h-5 accent-purple-600 cursor-pointer disabled:cursor-not-allowed mt-0.5 shrink-0"
                          />
                          <div>
                            <span className={`text-xs sm:text-sm font-bold text-slate-700 block ${!isPaymentTrackingAllowed ? 'opacity-60' : ''}`}>
                              Enable Payment Tracking (Cash, UPI, Partial)
                            </span>
                            <span className="text-[11px] sm:text-xs text-slate-500 mt-0.5 block">
                              Track partial payments, balances, and payment modes. Turning off hides badges without deleting data.
                            </span>
                          </div>
                        </label>
                        {!isPaymentTrackingAllowed && (
                          <div className="mt-2.5 text-[11px] sm:text-xs font-bold text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>Payment tracking has been blocked by an administrator.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 4: Tax, Bank & UPI */}
                  {settingsSubTab === 'tax_bank' && (
                    <div className="space-y-6">
                      {/* GST Settings */}
                      <div>
                        <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-emerald-600" />
                          Tax & GST Settings
                        </h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-3 mb-4">
                            <input
                              type="checkbox"
                              id="enableGst"
                              checked={tempSettings.enableGst}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, enableGst: e.target.checked })}
                              className="w-5 h-5 accent-red-600 cursor-pointer"
                            />
                            <label htmlFor="enableGst" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Enable GST Calculation</label>
                          </div>

                          {tempSettings.enableGst && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                              <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">GSTIN (Optional)</label>
                                <input
                                  value={tempSettings.gstin || ''}
                                  onChange={e => handleTempSettingsChange({ ...tempSettings, gstin: e.target.value })}
                                  placeholder="e.g. 24ABCDE1234F1Z5"
                                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Default GST Rate (%)</label>
                                <input
                                  type="number"
                                  value={tempSettings.defaultGstRate || 0}
                                  onChange={e => handleTempSettingsChange({ ...tempSettings, defaultGstRate: parseFloat(e.target.value) })}
                                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bank Details Section */}
                      <div>
                        <h3 className="font-bold text-slate-800 text-base mb-2">Bank Details (Printed on Invoice)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-slate-200">
                          <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">Bank Name</label>
                            <input
                              value={tempSettings.bankName || ''}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, bankName: e.target.value })}
                              placeholder="e.g. Kotak Mahindra Bank"
                              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">Account Number</label>
                            <input
                              value={tempSettings.bankAccountNumber || ''}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, bankAccountNumber: e.target.value })}
                              placeholder="e.g. 1234567890"
                              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">IFSC Code</label>
                            <input
                              value={tempSettings.bankIfsc || ''}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, bankIfsc: e.target.value })}
                              placeholder="e.g. KKBK0001234"
                              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1">Branch</label>
                            <input
                              value={tempSettings.bankBranch || ''}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, bankBranch: e.target.value })}
                              placeholder="e.g. Main Branch"
                              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* UPI Settings Section */}
                      <div>
                        <h3 className="font-bold text-slate-800 text-base mb-2">UPI Payment & Dynamic QR Code</h3>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-3 mb-4">
                            <input
                              type="checkbox"
                              id="showUpiQr"
                              checked={tempSettings.showUpiQr}
                              onChange={e => handleTempSettingsChange({ ...tempSettings, showUpiQr: e.target.checked })}
                              className="w-5 h-5 accent-blue-600 cursor-pointer"
                            />
                            <label htmlFor="showUpiQr" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Show Dynamic UPI QR Code on Bill</label>
                          </div>

                          {tempSettings.showUpiQr && (
                            <div className="pl-8">
                              <label className="block text-sm font-bold text-slate-600 mb-1">UPI ID (VPA)</label>
                              <input
                                value={tempSettings.upiId || ''}
                                onChange={e => handleTempSettingsChange({ ...tempSettings, upiId: e.target.value })}
                                placeholder="e.g. yourname@okaxis or yournumber@upi"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-slate-500 mt-2 italic">A QR code will be dynamically generated for this UPI ID and displayed next to bank details on invoices.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save Button */}
                  {hasUnsavedSettings && (
                    <div className="sticky bottom-0 mt-4 sm:mt-6 p-3 sm:p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg shadow-lg">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-yellow-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="font-bold text-yellow-800 text-sm">You have unsaved changes</span>
                        </div>
                        <button
                          onClick={handleSaveSettings}
                          disabled={isSavingSettings}
                          className="bg-green-600 hover:bg-green-700 disabled:opacity-70 disabled:cursor-not-allowed text-white py-2.5 px-6 rounded-lg font-bold flex items-center justify-center gap-2 shadow-md transition-all w-full sm:w-auto shrink-0 cursor-pointer"
                        >
                          {isSavingSettings ? (
                            <>
                              <Loader2 className="animate-spin w-4 h-4" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save size={18} />
                              <span>Save Settings</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mobile Logout Button */}
                  <div className="md:hidden mt-6">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-600 p-3 rounded-lg hover:bg-slate-300 transition-colors font-medium">
                      <LogOut className="w-5 h-5" /> Logout from Session
                    </button>
                  </div>

                  {/* Notice */}
                  {!hasUnsavedSettings && (
                    <div className="mt-6 p-4 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 flex items-center gap-3">
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium">All changes saved</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Customer Spending & Purchase Details Modal */}
      {selectedCustomerForModal && canViewCustomerSpending && (
        <CustomerSpendingModal
          customer={selectedCustomerForModal}
          invoices={invoices}
          settings={settings}
          onClose={() => setSelectedCustomerForModal(null)}
        />
      )}

      {/* Product Sales & Customer Buying Details Modal */}
      {selectedProductForModal && hasProductAnalysisPermission && (
        <ProductAnalysisModal
          product={selectedProductForModal}
          invoices={invoices}
          customers={customers}
          settings={settings}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}

      {/* Payment Tracker Modal */}
      {paymentInvoice && (
        <PaymentTrackerModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onAddPayment={handleAddPayment}
          onDeletePayment={handleDeletePayment}
        />
      )}

      {/* Concurrent Session Modal Popup */}
      {hasConcurrentSession && (
        <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-center p-6 space-y-4">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Session Conflict Detected</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your account is currently logged in and active on another device or tab:
              </p>
              <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-900 font-medium">
                <div><span className="font-bold">Active Device:</span> {otherSessionInfo.device || 'Mobile / Desktop'}</div>
                {otherSessionInfo.time && <div><span className="font-bold">Login Time:</span> {new Date(otherSessionInfo.time).toLocaleString('en-IN')}</div>}
              </div>
              <p className="text-xs text-slate-600">
                Only 1 active session is allowed at a time for safety and data consistency.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={handleClaimSession}
                disabled={isClaimingSession}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                {isClaimingSession ? (
                  <><Loader2 size={16} className="animate-spin" /> Logging out other session...</>
                ) : (
                  <><LogOut size={16} /> Logout Everywhere Else & Use Here</>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs transition-colors"
              >
                Logout From This Device
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;