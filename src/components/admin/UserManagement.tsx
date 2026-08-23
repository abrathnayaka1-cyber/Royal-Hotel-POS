import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { User, UserRole } from '../../types.ts';
import {
  Plus,
  Edit2,
  Shield,
  User as UserIcon,
  Lock,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  Ban,
  Phone,
  Mail,
  BadgeCheck,
  UserCheck
} from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // User Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  // Form states
  const [formName, setFormName] = useState<string>('');
  const [formUsername, setFormUsername] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPin, setFormPin] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('');
  const [formConfirmPassword, setFormConfirmPassword] = useState<string>('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Reset password states
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<User[]>('/users');
      setUsers(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setTargetUser(null);
    setFormName('');
    setFormUsername('');
    setFormEmail('');
    setFormPin('');
    setFormPassword('');
    setFormConfirmPassword('');
    setFormRole('cashier');
    setFormIsActive(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setTargetUser(user);
    setFormName(user.name);
    setFormUsername(user.username);
    setFormEmail(user.email || '');
    setFormPin(user.pin || '');
    setFormPassword('');
    setFormConfirmPassword('');
    setFormRole(user.role);
    setFormIsActive(user.isActive);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const openResetPasswordModal = (user: User) => {
    setTargetUser(user);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsResetPasswordModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const name = formName.trim();
    const username = formUsername.trim().toLowerCase();

    if (!name || !username) {
      setErrorMsg('Full Name and Username are required.');
      return;
    }

    if (!targetUser) {
      // New account creation
      if (!formPassword) {
        setErrorMsg('Password is required for new accounts.');
        return;
      }
      if (formPassword.length < 4) {
        setErrorMsg('Password must be at least 4 characters long.');
        return;
      }
      if (formPassword !== formConfirmPassword) {
        setErrorMsg('Password and Confirm Password do not match.');
        return;
      }
    } else {
      // Editing existing account
      if (formPassword) {
        if (formPassword.length < 4) {
          setErrorMsg('New password must be at least 4 characters long.');
          return;
        }
        if (formPassword !== formConfirmPassword) {
          setErrorMsg('Password and Confirm Password do not match.');
          return;
        }
      }
    }

    try {
      const payload: any = {
        name,
        username,
        email: formEmail.trim() || `${username}@pos.local`,
        role: formRole,
        pin: formPin.trim() || undefined,
        isActive: formIsActive,
      };
      if (formPassword) {
        payload.password = formPassword;
      }

      if (targetUser) {
        await fetchApi(`/users/${targetUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save account.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;
    setErrorMsg(null);

    if (!resetNewPassword || resetNewPassword.length < 4) {
      setErrorMsg('New password must be at least 4 characters long.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMsg('Password and Confirm Password do not match.');
      return;
    }

    try {
      await fetchApi(`/users/${targetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetNewPassword }),
      });
      setIsResetPasswordModalOpen(false);
      setSuccessMsg(`Password successfully updated for ${targetUser.name}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset password.');
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setErrorMsg(null);
      await fetchApi(`/users/${user.id}/toggle`, { method: 'PATCH' });
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle user status.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <span>Cashier & Staff Accounts</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
              {users.length} Users
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Super Admin dashboard for managing cashier terminal logins, access credentials, and account activation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="add-cashier-btn"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add Cashier Account
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Username (Login ID)</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        user.role === 'super_admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{user.name}</span>
                          {user.role === 'super_admin' && (
                            <Shield className="w-3 h-3 text-purple-600 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {user.email || 'No email registered'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                    @{user.username}
                  </td>

                  <td className="py-3.5 px-4">
                    {user.role === 'super_admin' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 flex items-center gap-1 w-fit">
                        <Shield className="w-3 h-3" />
                        Super Admin
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1 w-fit">
                        <UserIcon className="w-3 h-3" />
                        Cashier
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-[10px] rounded-md uppercase">
                        <Check className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-extrabold text-[10px] rounded-md uppercase">
                        <Ban className="w-3 h-3" />
                        Disabled
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                    {user.lastLoginAt || user.lastLogin
                      ? new Date(user.lastLoginAt || user.lastLogin!).toLocaleString()
                      : 'Never logged in'}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openResetPasswordModal(user)}
                        className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                        title="Reset Account Password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => openEditModal(user)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Account Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {user.role !== 'super_admin' && (
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            user.isActive
                              ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                          }`}
                          title={user.isActive ? 'Deactivate Account' : 'Activate Account'}
                        >
                          {user.isActive ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  {targetUser ? `Edit Account: ${targetUser.name}` : 'Create New Cashier Account'}
                </h3>
                <p className="text-xs text-slate-500">
                  {targetUser ? 'Update staff member profile & credentials' : 'Add new cashier credentials for POS terminal access'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunil Fernando"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Username (Terminal Login ID) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cashier_sunil"
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Email / Contact (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="sunil@bar.com"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Terminal PIN (Optional)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="4-6 digit PIN"
                    value={formPin}
                    onChange={e => setFormPin(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  System Role *
                </label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value as UserRole)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                >
                  <option value="cashier">Cashier (Bar POS & Billing Operations Only)</option>
                  <option value="super_admin">Super Admin (Full Management, Inventory & Financial Reports)</option>
                </select>
              </div>

              {/* Password Fields */}
              <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {targetUser ? 'Change Password (leave blank to keep unchanged)' : 'Password *'}
                  </label>
                  <input
                    type="password"
                    placeholder={targetUser ? '••••••••' : 'Enter secure password'}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {(formPassword || !targetUser) && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      placeholder="Repeat password"
                      value={formConfirmPassword}
                      onChange={e => setFormConfirmPassword(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={e => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Account is Active and permitted to log in</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  {targetUser ? 'Save Changes' : 'Create Cashier Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {isResetPasswordModalOpen && targetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">
                    Reset Password
                  </h3>
                  <p className="text-xs text-slate-500">
                    For {targetUser.name} (@{targetUser.username})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={resetConfirmPassword}
                  onChange={e => setResetConfirmPassword(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

