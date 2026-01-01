import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Package,
  Users,
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
  Loader2
} from 'lucide-react';
import { InvoiceGenerator } from './components/InvoiceGenerator';
import { InvoiceHistory } from './components/InvoiceHistory';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import {
  Product,
  Customer,
  BusinessSettings,
  AppTab,
  Invoice
} from './types';
import { DEFAULT_BUSINESS_SETTINGS } from './constants';

// Firebase Imports
import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from 'firebase/auth';

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

  // --- Product Edit State ---
  const [prodForm, setProdForm] = useState({
    name: '',
    packing: '',
    rate: '',
    unit: 'Kg'
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const productFormRef = useRef<HTMLDivElement>(null);

  // --- Customer Edit State ---
  const [custForm, setCustForm] = useState({
    name: '',
    city: '',
    phone: ''
  });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const customerFormRef = useRef<HTMLDivElement>(null);



  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Pending logo preview before save
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [pendingLogoWidth, setPendingLogoWidth] = useState<number | null>(null);
  const [isSavingSize, setIsSavingSize] = useState(false);

  // --- Authentication Listener ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Listeners (Real-time Data) ---
  useEffect(() => {
    if (!user) return;

    setDataLoading(true);

    // 1. Settings Listener
    const settingsRef = doc(db, 'settings', 'general'); // Single doc for business settings
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ ...DEFAULT_BUSINESS_SETTINGS, ...docSnap.data() } as BusinessSettings);
      } else {
        // Initialize if doesn't exist
        setDoc(settingsRef, DEFAULT_BUSINESS_SETTINGS);
      }
    });

    // 2. Products Listener
    const productsQuery = query(collection(db, 'products'), orderBy('name'));
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    });

    // 3. Customers Listener
    const customersQuery = query(collection(db, 'customers'), orderBy('name'));
    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      const custs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(custs);
    });

    // 4. Invoices Listener
    const invoicesQuery = query(collection(db, 'invoices'), orderBy('id', 'desc')); // Assuming ID is roughly chronological or numeric
    const unsubInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      const invs = snapshot.docs.map(doc => ({ ...doc.data() } as Invoice)); // ID is part of data for Invoice
      setInvoices(invs);
      setDataLoading(false);
    });

    return () => {
      unsubSettings();
      unsubProducts();
      unsubCustomers();
      unsubInvoices();
    };
  }, [user]);

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
    if (activeTab === AppTab.CREATE_BILL && hasUnsavedChanges && tab !== AppTab.CREATE_BILL) {
      if (!window.confirm("You have unsaved changes in your bill. Are you sure you want to leave? Your progress will be lost.")) {
        return;
      }
      setHasUnsavedChanges(false);
    }
    setActiveTab(tab);
  };

  // --- Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error(error);
      setLoginError('Invalid credentials. Please try again.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setEmail('');
    setPassword('');
  };

  // --- Data Operations (Firestore) ---

  const handleSaveInvoice = async (invoice: Invoice) => {
    try {
      // Save invoice document
      await setDoc(doc(db, 'invoices', invoice.id), invoice);

      // After successful save, increment next invoice number in settings
      const nextNo = (settings.nextInvoiceNumber || 0) + 1;
      await handleUpdateSettings({ ...settings, nextInvoiceNumber: nextNo });
    } catch (e) {
      console.error("Error saving invoice: ", e);
      alert("Failed to save invoice to database.");
      throw e; // rethrow so callers know it failed
    }
  };

  const handleUpdateSettings = async (newSettings: BusinessSettings) => {
    // Optimistic update for UI
    setSettings(newSettings);
    try {
      await setDoc(doc(db, 'settings', 'general'), newSettings);
    } catch (e) {
      console.error("Error saving settings: ", e);
    }
  };

  // --- Product Handlers ---
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingProductId) {
        // Update
        const productRef = doc(db, 'products', editingProductId);
        await updateDoc(productRef, {
          name: prodForm.name,
          rate: Number(prodForm.rate),
          unit: prodForm.unit,
          packing: prodForm.packing
        });
        setEditingProductId(null);
      } else {
        // Add
        await addDoc(collection(db, 'products'), {
          name: prodForm.name,
          rate: Number(prodForm.rate),
          unit: prodForm.unit,
          packing: prodForm.packing,
        });
      }
      // Reset Form
      setProdForm({ name: '', packing: '', rate: '', unit: 'Kg' });
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
    setProdForm({ name: '', packing: '', rate: '', unit: 'Kg' });
    setEditingProductId(null);
  };

  const deleteProduct = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      if (editingProductId === id) cancelEditProduct();
    } catch (e) {
      console.error("Error deleting product:", e);
    }
  };

  // --- Customer Handlers ---
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name.trim()) return;

    try {
      if (editingCustomerId) {
        // Update
        const custRef = doc(db, 'customers', editingCustomerId);
        await updateDoc(custRef, {
          name: custForm.name,
          city: custForm.city,
          phone: custForm.phone
        });
        setEditingCustomerId(null);
      } else {
        // Add
        await addDoc(collection(db, 'customers'), {
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
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
      if (editingCustomerId === id) cancelEditCustomer();
    } catch (e) {
      console.error("Error deleting customer:", e);
    }
  };

  // --- Logo Handlers ---
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 2MB)
      const maxSize = 2 * 1024 * 1024; // 2MB in bytes
      if (file.size > maxSize) {
        alert(`File size must be less than 2MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const sizeInBytes = file.size;
        const oneMB = 1024 * 1024;

        // If size is between 1MB and 2MB, compress it
        if (sizeInBytes > oneMB && sizeInBytes <= maxSize) {
          const img = new Image();
          img.src = result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Calculate new dimensions (maintain aspect ratio)
            // We'll scale down to 70% to reduce size
            const scaleFactor = 0.7;
            canvas.width = img.width * scaleFactor;
            canvas.height = img.height * scaleFactor;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Compress to JPEG with 0.7 quality
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

            // Check if compressed size is under 1MB (approx)
            // Base64 string length * 0.75 is approx byte size
            const compressedSize = compressedDataUrl.length * 0.75;

            if (compressedSize > oneMB) {
              alert("Image is too complex to compress under 1MB. Please try a smaller image.");
              return;
            }

            // Store compressed preview and wait for explicit Save
            setPendingLogo(compressedDataUrl);
          };
        } else {
          // Under 1MB, keep as pending preview until user saves
          setPendingLogo(result);
        }
      };
      reader.onerror = () => {
        alert("Error reading file. Please try again.");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    // If a pending preview exists, just clear it without prompting
    if (pendingLogo) {
      setPendingLogo(null);
      return;
    }

    // Confirm before removing saved logo
    if (!window.confirm('Remove saved logo? This will delete the current logo.')) return;
    const newSettings = { ...settings, logoUrl: '' };
    setPendingLogo(null);
    handleUpdateSettings(newSettings);
  };

  const savePendingLogo = async () => {
    if (!pendingLogo) return;
    setIsSavingLogo(true);
    try {
      await handleUpdateSettings({ ...settings, logoUrl: pendingLogo });
      setPendingLogo(null);
    } catch (e) {
      console.error('Error saving logo:', e);
      alert('Failed to save logo. Please try again.');
    } finally {
      setIsSavingLogo(false);
    }
  };

  // --- Signature Handlers ---
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [isSavingSignature, setIsSavingSignature] = useState(false);

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSize) {
        alert(`File size must be less than 2MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const sizeInBytes = file.size;
        const oneMB = 1024 * 1024;

        if (sizeInBytes > oneMB && sizeInBytes <= maxSize) {
          const img = new Image();
          img.src = result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const scaleFactor = 0.7;
            canvas.width = img.width * scaleFactor;
            canvas.height = img.height * scaleFactor;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const compressedSize = compressedDataUrl.length * 0.75;

            if (compressedSize > oneMB) {
              alert("Image is too complex to compress under 1MB. Please try a smaller image.");
              return;
            }
            setPendingSignature(compressedDataUrl);
          };
        } else {
          setPendingSignature(result);
        }
      };
      reader.onerror = () => {
        alert("Error reading file. Please try again.");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSignature = () => {
    if (pendingSignature) {
      setPendingSignature(null);
      return;
    }
    if (!window.confirm('Remove saved signature?')) return;
    setPendingSignature(null);
    handleUpdateSettings({ ...settings, signatureUrl: '' });
  };

  const savePendingSignature = async () => {
    if (!pendingSignature) return;
    setIsSavingSignature(true);
    try {
      await handleUpdateSettings({ ...settings, signatureUrl: pendingSignature });
      setPendingSignature(null);
    } catch (e) {
      console.error('Error saving signature:', e);
      alert('Failed to save signature. Please try again.');
    } finally {
      setIsSavingSignature(false);
    }
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
            <div className="bg-slate-50 p-3 rounded text-xs text-slate-500 text-center">
              <p>Note: Ensure your Firebase config is set up in firebase.ts</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- Render Main App ---
  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">

      {/* Sidebar - Hidden when printing */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden md:flex no-print">
        <div className="p-6 border-b border-slate-800">
          {/* Dynamic Name based on Settings */}
          <h1 className="text-2xl font-serif text-white font-bold tracking-wide truncate" title={settings.name}>
            {settings.name || 'BILLING'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">v2.0 (Cloud)</p>
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

          <button
            onClick={() => handleTabChange(AppTab.ANALYTICS)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ANALYTICS ? 'bg-red-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <BarChart3 className="w-5 h-5" /> AI Analytics
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
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-2 truncate px-2">{user.email}</div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile Header (Fixed at top) */}
      <div className="md:hidden no-print fixed top-0 left-0 w-full bg-slate-900 p-3 flex justify-between items-center z-50 shadow-md h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center text-white font-serif font-bold">
            {settings.logoInitial || 'B'}
          </div>
          <span className="font-serif font-bold text-white text-lg truncate max-w-[150px]">
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
            <button onClick={() => handleTabChange(AppTab.ANALYTICS)} className={`p-2 rounded ${activeTab === AppTab.ANALYTICS ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><BarChart3 size={20} /></button>
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
            <button onClick={() => { handleTabChange(AppTab.ANALYTICS); setMobileMenuOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${activeTab === AppTab.ANALYTICS ? 'bg-red-600 text-white' : 'hover:bg-slate-100'}`}>
              <BarChart3 className="w-5 h-5" /> AI Analytics
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

        {activeTab === AppTab.CREATE_BILL && (
          <div className="flex-1 min-h-0">
            <InvoiceGenerator
              products={products}
              customers={customers}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onSaveInvoice={handleSaveInvoice}
              onUnsavedChanges={(hasChanges) => setHasUnsavedChanges(hasChanges)}
            />
          </div>
        )}

        {activeTab === AppTab.INVOICE_HISTORY && (
          <div className="h-full">
            <InvoiceHistory
              invoices={invoices}
              settings={settings}
            />
          </div>
        )}

        {activeTab === AppTab.ANALYTICS && (
          <AnalyticsDashboard
            invoices={invoices}
            products={products}
            customers={customers}
          />
        )}

        {activeTab === AppTab.PRODUCTS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Package className="w-6 h-6 text-red-600" />
                    Products
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Manage your product catalog</p>
                </div>
                <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
                  <div className="text-2xl font-bold text-red-600">{products.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Items</div>
                </div>
              </div>

              {/* Add/Edit Form */}
              <div ref={productFormRef} className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
                <form onSubmit={handleProductSubmit} className="space-y-3">
                  <div className="flex-1">
                    <input
                      name="name"
                      required
                      placeholder="Product Name"
                      value={prodForm.name}
                      onChange={e => setProdForm({ ...prodForm, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-sm"
                    />
                  </div>
                  <div className="w-24 md:w-32">
                    <input
                      name="packing"
                      placeholder="Size (e.g. 1kg)"
                      value={prodForm.packing}
                      onChange={e => setProdForm({ ...prodForm, packing: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      name="rate"
                      type="number"
                      required
                      placeholder="Rate"
                      value={prodForm.rate}
                      onChange={e => setProdForm({ ...prodForm, rate: e.target.value })}
                      className="w-20 md:w-24 p-2 border border-slate-300 rounded text-sm"
                    />
                    <select
                      name="unit"
                      value={prodForm.unit}
                      onChange={e => setProdForm({ ...prodForm, unit: e.target.value })}
                      className="w-20 md:w-24 p-2 border border-slate-300 rounded text-sm"
                    >
                      <option>Kg</option>
                      <option>Gm</option>
                      <option>Pkt</option>
                      <option>Ltr</option>
                    </select>

                    {editingProductId ? (
                      <>
                        <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center min-w-[40px]" title="Update Product">
                          <Save size={20} />
                        </button>
                        <button type="button" onClick={cancelEditProduct} className="bg-slate-400 text-white p-2 rounded hover:bg-slate-500 flex items-center justify-center min-w-[40px]" title="Cancel Edit">
                          <X size={20} />
                        </button>
                      </>
                    ) : (
                      <button type="submit" className="bg-red-600 text-white p-2 rounded hover:bg-red-700 flex items-center justify-center min-w-[40px]" title="Add Product">
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
                        <button onClick={() => startEditProduct(p)} className="flex-1 bg-blue-50 text-blue-600 py-2 px-3 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2 font-medium text-sm transition-colors">
                          <Edit size={16} /> Edit
                        </button>
                        <button onClick={() => deleteProduct(p.id)} className="flex-1 bg-red-50 text-red-600 py-2 px-3 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 font-medium text-sm transition-colors">
                          <Trash size={16} /> Delete
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
              </div>
            </div>
          </div>
        )}

        {activeTab === AppTab.CUSTOMERS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-600" />
                    Customers
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Manage your customer database</p>
                </div>
                <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
                  <div className="text-2xl font-bold text-blue-600">{customers.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Customers</div>
                </div>
              </div>

              <div ref={customerFormRef} className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
                <form onSubmit={handleCustomerSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      name="name"
                      required
                      placeholder="Customer Name *"
                      value={custForm.name}
                      onChange={e => setCustForm({ ...custForm, name: e.target.value })}
                      className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <input
                      name="city"
                      required
                      placeholder="City *"
                      value={custForm.city}
                      onChange={e => setCustForm({ ...custForm, city: e.target.value })}
                      className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      name="phone"
                      placeholder="Phone Number"
                      value={custForm.phone}
                      onChange={e => setCustForm({ ...custForm, phone: e.target.value })}
                      className="flex-1 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />

                    {editingCustomerId ? (
                      <>
                        <button type="submit" className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium text-sm transition-colors shadow-sm" title="Update Customer">
                          <Save size={18} /> <span className="hidden sm:inline">Update</span>
                        </button>
                        <button type="button" onClick={cancelEditCustomer} className="bg-slate-400 text-white px-4 py-3 rounded-lg hover:bg-slate-500 flex items-center justify-center transition-colors" title="Cancel Edit">
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <button type="submit" className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium text-sm transition-colors shadow-sm" title="Add Customer">
                        <PlusCircle size={18} /> <span className="hidden sm:inline">Add</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Customers List */}
              <div className="flex-1 overflow-y-auto">
                {/* Mobile Card View */}
                <div className="md:hidden p-3 space-y-3">
                  {customers.map(c => (
                    <div key={c.id} className={`bg-white border-2 rounded-lg p-4 shadow-sm transition-all ${editingCustomerId === c.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}>
                      <div className="mb-3">
                        <h3 className="font-bold text-slate-900 text-lg mb-1">{c.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {c.city}
                          </span>
                          {c.phone && (
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <button onClick={() => startEditCustomer(c)} className="flex-1 bg-blue-50 text-blue-600 py-2 px-3 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2 font-medium text-sm transition-colors">
                          <Edit size={16} /> Edit
                        </button>
                        <button onClick={() => deleteCustomer(c.id)} className="flex-1 bg-red-50 text-red-600 py-2 px-3 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 font-medium text-sm transition-colors">
                          <Trash size={16} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {customers.length === 0 && (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-400 font-medium">No customers yet</p>
                      <p className="text-xs text-slate-400 mt-1">Add your first customer above</p>
                    </div>
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0">
                      <tr>
                        <th className="p-4 whitespace-nowrap">Customer Name</th>
                        <th className="p-4 whitespace-nowrap">City</th>
                        <th className="p-4 whitespace-nowrap">Phone</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customers.map(c => (
                        <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${editingCustomerId === c.id ? 'bg-blue-50' : ''}`}>
                          <td className="p-4 font-semibold text-slate-900">{c.name}</td>
                          <td className="p-4 text-slate-600">{c.city}</td>
                          <td className="p-4 text-slate-500">{c.phone || '-'}</td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => startEditCustomer(c)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded transition-colors" title="Edit">
                                <Edit size={18} />
                              </button>
                              <button onClick={() => deleteCustomer(c.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors" title="Delete">
                                <Trash size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-12 text-center">
                            <Users className="w-16 h-16 mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-400 font-medium">No customers in your database</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === AppTab.SETTINGS && (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="max-w-4xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50 shrink-0">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-6 h-6 text-purple-600" />
                  Business Settings
                </h2>
                <p className="text-xs text-slate-500 mt-1">Configure your business information</p>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="space-y-6">
                  {/* Visual Settings */}
                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <label className="block text-sm font-bold text-slate-600 mb-2">Theme Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={settings.themeColor || '#dc2626'}
                          onChange={e => handleUpdateSettings({ ...settings, themeColor: e.target.value })}
                          className="h-10 w-20 p-1 border border-slate-300 rounded cursor-pointer"
                        />
                        <span className="text-sm text-slate-500 font-medium">{settings.themeColor || '#dc2626'}</span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <label className="block text-sm font-bold text-slate-600 mb-4">Business Logo</label>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-3 items-center">
                          <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 px-5 rounded-lg flex items-center gap-2 text-sm w-full md:w-auto justify-center transition-all shadow-sm">
                            <Upload size={18} />
                            <span className="font-bold">Upload</span>
                            <input type="file" accept="image/png,image:jpeg,image/jpg,image/webp" onChange={handleLogoUpload} className="hidden" />
                          </label>



                          {(settings.logoUrl || pendingLogo) && (
                            <div className="flex items-center gap-3 w-full md:w-auto">
                              <button
                                onClick={() => { if (pendingLogo) { setPendingLogo(null); } else { removeLogo(); } }}
                                className="flex-1 md:flex-initial text-red-600 hover:text-white hover:bg-red-600 p-2.5 border border-red-200 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-bold"
                              >
                                <X size={18} />
                                <span>Remove</span>
                              </button>

                              {pendingLogo && (
                                <button
                                  onClick={savePendingLogo}
                                  disabled={isSavingLogo}
                                  className="flex-1 md:flex-initial bg-green-600 disabled:opacity-70 disabled:cursor-not-allowed text-white py-2.5 px-5 rounded-lg hover:bg-green-700 text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all"
                                >
                                  {isSavingLogo ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                                  <span>{isSavingLogo ? 'Saving...' : 'Confirm Save'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>


                      </div>

                      {(settings.logoUrl || pendingLogo) && (
                        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner">
                          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6">
                            <div className="flex items-center gap-3">
                              <div className="bg-slate-200 px-3 py-1 rounded-full">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Logo Size: {pendingLogoWidth ?? settings.logoWidth ?? 80}px</label>
                              </div>
                              {pendingLogo && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold uppercase border border-yellow-200">Unsaved Changes</span>}
                            </div>

                            <div className="flex items-center gap-4 w-full md:w-2/3">
                              <input
                                type="range"
                                min="40"
                                max="350"
                                value={pendingLogoWidth ?? (settings.logoWidth || 80)}
                                onChange={(e) => setPendingLogoWidth(parseInt(e.target.value))}
                                className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 shadow-inner"
                              />

                              {(pendingLogoWidth !== null && pendingLogoWidth !== (settings.logoWidth || 80)) && (
                                <button
                                  onClick={async () => {
                                    const sizeToSave = pendingLogoWidth;
                                    setIsSavingSize(true);
                                    try {
                                      await handleUpdateSettings({ ...settings, logoWidth: sizeToSave });
                                    } catch (e) {
                                      console.error('Error saving logo size:', e);
                                      alert('Failed to save logo size.');
                                    } finally {
                                      setIsSavingSize(false);
                                      setPendingLogoWidth(null);
                                    }
                                  }}
                                  disabled={isSavingSize}
                                  className="bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all min-w-[110px]"
                                >
                                  {isSavingSize ? <><Loader2 className="animate-spin w-4 h-4" /><span>Saving...</span></> : <><Save size={16} /><span>Save Size</span></>}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Live Header Preview (Actual Size)</div>
                          <div className="overflow-x-auto no-scrollbar border-2 bg-white shadow-lg rounded-xl" style={{ borderColor: settings.themeColor || '#dc2626' }}>
                            <div className="min-w-[794px] border-b-2 p-4 font-serif-custom text-center relative" style={{ color: settings.themeColor || '#dc2626', borderColor: settings.themeColor || '#dc2626' }}>
                              <img
                                src={pendingLogo || settings.logoUrl}
                                alt="Logo"
                                className="absolute left-4 top-4 object-contain"
                                style={{ width: `${pendingLogoWidth ?? (settings.logoWidth || 80)}px`, maxHeight: '120px' }}
                              />
                              <div className="mt-2">
                                <h1 className="text-5xl font-bold tracking-wider mb-1" style={{ color: settings.themeColor || '#dc2626' }}>{settings.name}</h1>
                                <h2 className="text-2xl font-bold" style={{ color: settings.themeColor || '#dc2626' }}>{settings.subName}</h2>
                                <p className="mt-1 text-sm" style={{ color: settings.themeColor || '#dc2626' }}>{settings.address} M.: {settings.mobile}</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-center text-slate-400 text-[10px] mt-4 font-medium italic">This preview matches exactly how your logo will appear on printed invoices (794px width, A4 size).</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-4"></div>

                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Business Name (Header)</label>
                    <input
                      value={settings.name}
                      onChange={e => handleUpdateSettings({ ...settings, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Subtitle / Full Name</label>
                    <input
                      value={settings.subName}
                      onChange={e => handleUpdateSettings({ ...settings, subName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Address</label>
                    <input
                      value={settings.address}
                      onChange={e => handleUpdateSettings({ ...settings, address: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Mobile</label>
                    <input
                      value={settings.mobile}
                      onChange={e => handleUpdateSettings({ ...settings, mobile: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Logo Initial (Fallback)</label>
                    <input
                      value={settings.logoInitial}
                      onChange={e => handleUpdateSettings({ ...settings, logoInitial: e.target.value })}
                      maxLength={1}
                      className="w-16 p-2 border border-slate-300 rounded text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Signature Name (Optional)</label>
                    <input
                      value={settings.signatureName || ''}
                      onChange={e => handleUpdateSettings({ ...settings, signatureName: e.target.value })}
                      placeholder="e.g., S.J.B.G.U (defaults to Business Name if empty)"
                      className="w-full p-2 border border-slate-300 rounded"
                    />
                    <p className="text-xs text-slate-500 mt-1">This will appear as "For, [Signature Name]" at the bottom of the invoice. Leave empty to use Business Name.</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200">
                    <label className="block text-sm font-bold text-slate-600 mb-3">Signature Image (Optional)</label>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-3 items-center">
                        <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 px-5 rounded-lg flex items-center gap-2 text-sm w-full md:w-auto justify-center transition-all shadow-sm">
                          <Upload size={18} />
                          <span className="font-bold">Upload Signature</span>
                          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleSignatureUpload} className="hidden" />
                        </label>

                        {(settings.signatureUrl || pendingSignature) && (
                          <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                              onClick={() => { if (pendingSignature) { setPendingSignature(null); } else { removeSignature(); } }}
                              className="flex-1 md:flex-initial text-red-600 hover:text-white hover:bg-red-600 p-2.5 border border-red-200 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-bold"
                            >
                              <X size={18} />
                              <span>Remove</span>
                            </button>

                            {pendingSignature && (
                              <button
                                onClick={savePendingSignature}
                                disabled={isSavingSignature}
                                className="flex-1 md:flex-initial bg-green-600 disabled:opacity-70 disabled:cursor-not-allowed text-white py-2.5 px-5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all"
                              >
                                {isSavingSignature ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={18} />}
                                <span>Save</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {(pendingSignature || settings.signatureUrl) && (
                        <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
                          <p className="text-xs font-bold text-slate-500 mb-2">Preview:</p>
                          <img
                            src={pendingSignature || settings.signatureUrl}
                            alt="Signature"
                            className="max-h-20 object-contain bg-white p-2 border border-slate-200 rounded"
                          />
                        </div>
                      )}

                      <p className="text-xs text-slate-500">Upload a transparent PNG signature for best results. Max 2MB.</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-4"></div>

                  {/* GST Settings */}
                  <h3 className="font-bold text-slate-800">Tax Settings</h3>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        id="enableGst"
                        checked={settings.enableGst}
                        onChange={e => handleUpdateSettings({ ...settings, enableGst: e.target.checked })}
                        className="w-5 h-5 accent-red-600"
                      />
                      <label htmlFor="enableGst" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Enable GST Calculation</label>
                    </div>

                    {settings.enableGst && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                        <div>
                          <label className="block text-sm font-bold text-slate-600 mb-1">GSTIN (Optional)</label>
                          <input
                            value={settings.gstin || ''}
                            onChange={e => handleUpdateSettings({ ...settings, gstin: e.target.value })}
                            placeholder="e.g. 24ABCDE1234F1Z5"
                            className="w-full p-2 border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-600 mb-1">Default GST Rate (%)</label>
                          <input
                            type="number"
                            value={settings.defaultGstRate || 0}
                            onChange={e => handleUpdateSettings({ ...settings, defaultGstRate: parseFloat(e.target.value) })}
                            className="w-full p-2 border border-slate-300 rounded"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 my-4"></div>

                  {/* Bank Details Section */}
                  <h3 className="font-bold text-slate-800">Bank Details (Printed on Bill)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-600 mb-1">Bank Name</label>
                      <input
                        value={settings.bankName || ''}
                        onChange={e => handleUpdateSettings({ ...settings, bankName: e.target.value })}
                        placeholder="e.g. Kotak Mahindra Bank"
                        className="w-full p-2 border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-600 mb-1">Account Number</label>
                      <input
                        value={settings.bankAccountNumber || ''}
                        onChange={e => handleUpdateSettings({ ...settings, bankAccountNumber: e.target.value })}
                        placeholder="e.g. 1234567890"
                        className="w-full p-2 border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-600 mb-1">IFSC Code</label>
                      <input
                        value={settings.bankIfsc || ''}
                        onChange={e => handleUpdateSettings({ ...settings, bankIfsc: e.target.value })}
                        placeholder="e.g. KKBK0001234"
                        className="w-full p-2 border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-600 mb-1">Branch</label>
                      <input
                        value={settings.bankBranch || ''}
                        onChange={e => handleUpdateSettings({ ...settings, bankBranch: e.target.value })}
                        placeholder="e.g. Main Branch"
                        className="w-full p-2 border border-slate-300 rounded"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-4"></div>

                  {/* UPI Settings Section */}
                  <h3 className="font-bold text-slate-800">UPI Payment Settings</h3>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        id="showUpiQr"
                        checked={settings.showUpiQr}
                        onChange={e => handleUpdateSettings({ ...settings, showUpiQr: e.target.checked })}
                        className="w-5 h-5 accent-blue-600"
                      />
                      <label htmlFor="showUpiQr" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Show UPI QR Code on Bill</label>
                    </div>

                    {settings.showUpiQr && (
                      <div className="pl-8">
                        <label className="block text-sm font-bold text-slate-600 mb-1">UPI ID (VPA)</label>
                        <input
                          value={settings.upiId || ''}
                          onChange={e => handleUpdateSettings({ ...settings, upiId: e.target.value })}
                          placeholder="e.g. yourname@okaxis or yournumber@upi"
                          className="w-full p-2 border border-slate-300 rounded"
                        />
                        <p className="text-xs text-slate-500 mt-2 italic">A QR code will be dynamically generated for this UPI ID and displayed next to bank details.</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 my-6"></div>

                  {/* Invoice Sequence */}
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-3">Invoice Settings</h3>
                    <label className="block text-sm font-bold text-slate-600 mb-1">Next Invoice Number (Auto-Increment)</label>
                    <p className="text-xs text-slate-500 mb-3">Manually update this only if you need to reset or skip numbers.</p>
                    <input
                      type="number"
                      value={settings.nextInvoiceNumber}
                      onChange={e => handleUpdateSettings({ ...settings, nextInvoiceNumber: parseInt(e.target.value) || 1 })}
                      className="w-full md:w-32 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                  </div>

                  {/* Mobile Logout Button */}
                  <div className="md:hidden mt-6">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-600 p-3 rounded-lg hover:bg-slate-300 transition-colors font-medium">
                      <LogOut className="w-5 h-5" /> Logout from Session
                    </button>
                  </div>

                  {/* Auto-Save Notice */}
                  <div className="mt-6 p-4 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Changes are automatically synced to the cloud</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;