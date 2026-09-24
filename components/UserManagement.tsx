import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserPlus, Shield, ShieldAlert, Key, Edit, Trash2, CheckCircle2,
  XCircle, Clock, Search, RefreshCw, Eye, EyeOff, Lock, UserCheck, AlertTriangle
} from 'lucide-react';
import {
  LocalUser, userList, userCreate, userUpdate, userDelete, userGetActivityLogs
} from '../electron-api';

interface UserManagementProps {
  currentUser: LocalUser;
  onUserUpdated?: (user: LocalUser) => void;
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'user';
  permissions: {
    canViewSettings: boolean;
    canDeleteBills: boolean;
    canViewAnalytics: boolean;
    canManageProducts: boolean;
    canManageCustomers: boolean;
    canManagePayments: boolean;
  };
  is_active: boolean;
}

const getInitialFormData = (): UserFormData => ({
  name: '',
  email: '',
  password: '',
  role: 'user',
  permissions: {
    canViewSettings: false,
    canDeleteBills: false,
    canViewAnalytics: false,
    canManageProducts: true,
    canManageCustomers: true,
    canManagePayments: true,
  },
  is_active: true,
});

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, onUserUpdated }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<LocalUser | null>(null);
  const [formData, setFormData] = useState<UserFormData>(getInitialFormData());
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Activity logs
  const [activities, setActivities] = useState<any[]>([]);
  const [activityFilterUser, setActivityFilterUser] = useState<string>('');
  const [activityLoading, setActivityLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await userList();
      setUsers(list || []);
    } catch (e: any) {
      console.error('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    setActivityLoading(true);
    try {
      const logs = await userGetActivityLogs(activityFilterUser ? { userId: activityFilterUser } : undefined);
      setActivities(logs || []);
    } catch (e: any) {
      console.error('Failed to load activity logs:', e);
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs();
    }
  }, [activeTab, activityFilterUser]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(getInitialFormData());
    setFormError(null);
    setShowPassword(false);
    setShowModal(true);
  };

  const handleOpenEdit = (user: LocalUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      permissions: {
        canViewSettings: !!user.permissions?.canViewSettings,
        canDeleteBills: !!user.permissions?.canDeleteBills,
        canViewAnalytics: !!user.permissions?.canViewAnalytics,
        canManageProducts: user.permissions?.canManageProducts !== false,
        canManageCustomers: user.permissions?.canManageCustomers !== false,
        canManagePayments: user.permissions?.canManagePayments !== false,
      },
      is_active: user.is_active,
    });
    setFormError(null);
    setShowPassword(false);
    setShowModal(true);
  };

  const handleApplyRolePreset = (role: 'admin' | 'manager' | 'user') => {
    if (role === 'admin') {
      setFormData(prev => ({
        ...prev,
        role,
        permissions: {
          canViewSettings: true,
          canDeleteBills: true,
          canViewAnalytics: true,
          canManageProducts: true,
          canManageCustomers: true,
          canManagePayments: true,
        },
      }));
    } else if (role === 'manager') {
      setFormData(prev => ({
        ...prev,
        role,
        permissions: {
          canViewSettings: true,
          canDeleteBills: false,
          canViewAnalytics: true,
          canManageProducts: true,
          canManageCustomers: true,
          canManagePayments: true,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        role,
        permissions: {
          canViewSettings: false,
          canDeleteBills: false,
          canViewAnalytics: false,
          canManageProducts: true,
          canManageCustomers: true,
          canManagePayments: true,
        },
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Email is required');
      return;
    }

    if (!editingUser) {
      if (!formData.password || formData.password.length < 4) {
        setFormError('Password must be at least 4 characters');
        return;
      }
    } else if (formData.password && formData.password.length < 4) {
      setFormError('New password must be at least 4 characters');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        const payload: any = {
          name: formData.name.trim(),
          role: formData.role,
          permissions: formData.permissions,
          is_active: formData.is_active,
        };
        if (formData.password.trim()) {
          payload.password = formData.password.trim();
        }
        const res = await userUpdate(editingUser.id, payload);
        if (!res.success) {
          setFormError(res.error || 'Failed to update user');
          setSubmitting(false);
          return;
        }
        if (editingUser.id === currentUser.id && onUserUpdated && res.user) {
          onUserUpdated(res.user);
        }
      } else {
        const res = await userCreate({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password.trim(),
          role: formData.role,
          permissions: formData.permissions,
          is_active: formData.is_active,
        });
        if (!res.success) {
          setFormError(res.error || 'Failed to create user');
          setSubmitting(false);
          return;
        }
      }

      setShowModal(false);
      await loadUsers();
    } catch (e: any) {
      setFormError(e.message || 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: LocalUser) => {
    if (user.id === currentUser.id) {
      alert('You cannot delete your own logged-in account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user "${user.name}" (${user.email})? This action cannot be undone.`)) {
      return;
    }

    const res = await userDelete(user.id);
    if (!res.success) {
      alert(res.error || 'Failed to delete user');
      return;
    }
    await loadUsers();
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap justify-between items-center gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <Users className="w-6 h-6 text-blue-400" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Team & User Management</h1>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {users.length} {users.length === 1 ? 'User' : 'Users'}
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Admin console to create colleague accounts, configure granular permissions, and review audit trails.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Colleagues
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'activity' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Audit Log
              </button>
            </div>

            {activeTab === 'users' && (
              <button
                onClick={handleOpenCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-bold px-3.5 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <UserPlus size={16} /> Add Colleague
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Users */}
        {activeTab === 'users' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search toolbar */}
            <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="Search colleagues by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                />
              </div>
              <button
                onClick={loadUsers}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Refresh users"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Users list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-12 text-center text-slate-400 text-sm">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Users className="mx-auto w-12 h-12 text-slate-300 mb-2" />
                  <p className="text-sm font-medium">No colleagues found</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-bold sticky top-0 border-b border-slate-200 z-10">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Permissions</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Last Login</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredUsers.map(user => {
                      const isSelf = user.id === currentUser.id;
                      const roleColors: Record<string, string> = {
                        admin: 'bg-purple-100 text-purple-700 border-purple-200',
                        manager: 'bg-blue-100 text-blue-700 border-blue-200',
                        user: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                      };

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                {user.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {user.name}
                                  {isSelf && (
                                    <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">{user.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${roleColors[user.role] || roleColors.user}`}>
                              <Shield size={12} /> {user.role}
                            </span>
                          </td>

                          <td className="p-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {user.role === 'admin' ? (
                                <span className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded font-medium">
                                  Full Access
                                </span>
                              ) : (
                                <>
                                  {user.permissions?.canViewSettings && (
                                    <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded">Settings</span>
                                  )}
                                  {user.permissions?.canDeleteBills && (
                                    <span className="bg-red-50 text-red-600 text-[10px] px-1.5 py-0.5 rounded font-semibold">Delete Bills</span>
                                  )}
                                  {user.permissions?.canViewAnalytics && (
                                    <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded">Analytics</span>
                                  )}
                                  {user.permissions?.canManageProducts && (
                                    <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">Products</span>
                                  )}
                                  {user.permissions?.canManageCustomers && (
                                    <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">Customers</span>
                                  )}
                                  {user.permissions?.canManagePayments && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded">Payments</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          <td className="p-4">
                            {user.is_active ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                <CheckCircle2 size={14} /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-semibold">
                                <XCircle size={14} /> Inactive
                              </span>
                            )}
                          </td>

                          <td className="p-4 text-xs text-slate-500 font-mono">
                            {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never logged in'}
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleOpenEdit(user)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit user & permissions"
                              >
                                <Edit size={16} />
                              </button>
                              {!isSelf && (
                                <button
                                  onClick={() => handleDelete(user)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete user"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Activity Audit Log */}
        {activeTab === 'activity' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter toolbar */}
            <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600">Filter by Colleague:</span>
                <select
                  value={activityFilterUser}
                  onChange={e => setActivityFilterUser(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Users</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <button
                onClick={loadActivityLogs}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Refresh audit log"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Audit list */}
            <div className="flex-1 overflow-y-auto">
              {activityLoading ? (
                <div className="p-12 text-center text-slate-400 text-sm">Loading activity logs...</div>
              ) : activities.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">No activity recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activities.map(act => {
                    const isDelete = act.action?.toLowerCase().includes('delete') || act.action === 'DELETE_PAYMENT';
                    return (
                      <div key={act.id} className={`p-4 flex items-start justify-between gap-4 transition-colors ${isDelete ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isDelete ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Clock size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-sm ${isDelete ? 'text-rose-900' : 'text-slate-900'}`}>
                                {act.action}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-bold ${
                                isDelete ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-slate-200/70 text-slate-700'
                              }`}>
                                {act.category}
                              </span>
                            </div>
                            {act.details && (
                              <p className="text-xs text-slate-600 mt-1">{act.details}</p>
                            )}
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                              <span>User: <strong>{act.userEmail || act.userId || 'System'}</strong></span>
                              <span>•</span>
                              <span>{new Date(act.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[99999]" style={{ pointerEvents: 'auto' }}>
          <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base md:text-lg">
                  {editingUser ? `Edit Colleague: ${editingUser.name}` : 'Add Colleague Account'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Ramesh Patel"
                  value={formData.name || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, name: val }));
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  placeholder="colleague@company.com"
                  value={formData.email || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, email: val }));
                  }}
                  className={`w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
                    editingUser ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'
                  }`}
                  style={{ color: editingUser ? '#64748b' : '#0f172a', backgroundColor: editingUser ? '#f1f5f9' : '#ffffff' }}
                />
                {editingUser && (
                  <p className="text-[11px] text-slate-400 mt-0.5">Email address cannot be changed.</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {editingUser ? 'Reset Password (leave blank to keep current)' : 'Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!editingUser}
                    placeholder={editingUser ? 'Enter new password to reset...' : 'Minimum 4 characters...'}
                    value={formData.password || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, password: val }));
                    }}
                    className="w-full p-2.5 pr-10 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Role Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['user', 'manager', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleApplyRolePreset(role)}
                      className={`p-2.5 rounded-lg border text-xs font-bold capitalize transition-all cursor-pointer ${
                        formData.role === role
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Permissions */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Granular Permissions
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canViewSettings}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canViewSettings: checked }
                        }));
                      }}
                      className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">Business Settings</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canDeleteBills}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canDeleteBills: checked }
                        }));
                      }}
                      className="accent-red-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-red-700 font-bold">Delete / Void Invoices</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canViewAnalytics}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canViewAnalytics: checked }
                        }));
                      }}
                      className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">Analytics & Reports</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canManageProducts}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canManageProducts: checked }
                        }));
                      }}
                      className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">Manage Products</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canManageCustomers}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canManageCustomers: checked }
                        }));
                      }}
                      className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">Manage Customers</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canManagePayments}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: { ...prev.permissions, canManagePayments: checked }
                        }));
                      }}
                      className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-slate-700 font-medium">Manage Payments</span>
                  </label>
                </div>
              </div>

              {/* Active Status */}
              {editingUser && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold text-slate-700">Account Active</span>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => {
                      const checked = e.target.checked;
                      setFormData(prev => ({ ...prev, is_active: checked }));
                    }}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingUser ? 'Update Colleague' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
