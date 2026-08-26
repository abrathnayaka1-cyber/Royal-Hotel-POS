import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenDashboard } from './KitchenDashboard.tsx';
import { KitchenIngredients } from './KitchenIngredients.tsx';
import { KitchenStock } from './KitchenStock.tsx';
import { KitchenRecipes } from './KitchenRecipes.tsx';
import { KitchenWastage } from './KitchenWastage.tsx';
import { KitchenPhysicalCount } from './KitchenPhysicalCount.tsx';
import { KitchenFoodCost } from './KitchenFoodCost.tsx';
import { KitchenReports } from './KitchenReports.tsx';
import { KitchenApprovals } from './KitchenApprovals.tsx';
import { BrandLogo } from '../BrandLogo.tsx';
import {
  LayoutDashboard,
  Carrot,
  Package,
  BookOpen,
  Trash2,
  ClipboardCheck,
  Calculator,
  BarChart3,
  Lock,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

/**
 * FOOD & KITCHEN suite — the restricted home for the KITCHEN_MANAGER role.
 * Uses the exact same sidebar/layout design as the Super Admin suite so it
 * feels like a native part of Royal PRO POS.
 *
 * When `isAdmin` is set (Super Admin viewing "Food & Kitchen" inside the Admin
 * suite) the Approvals section is included, giving Super Admin complete
 * control over the kitchen module.
 */
export const KitchenLayout: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const { user, logout } = useAuth();
  const { settings } = usePOS();
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const kitchenNavItems = [
    { id: 'dashboard', label: 'Kitchen Dashboard', icon: LayoutDashboard },
    { id: 'ingredients', label: 'Kitchen Ingredients', icon: Carrot },
    { id: 'stock', label: 'Kitchen Stock', icon: Package },
    { id: 'recipes', label: 'Recipes & Production', icon: BookOpen },
    { id: 'wastage', label: 'Wastage', icon: Trash2 },
    { id: 'count', label: 'Physical Stock Count', icon: ClipboardCheck },
    { id: 'food-cost', label: 'Food Cost', icon: Calculator },
    { id: 'reports', label: 'Kitchen Reports', icon: BarChart3 },
  ];

  // Super Admin-only area (adjustment approvals) — hidden for Kitchen Managers.
  const adminOnlyItems = [
    { id: 'approvals', label: 'Adjustment Approvals', icon: ShieldCheck },
  ];

  // Existing Super Admin sections the Kitchen Manager cannot open. Shown
  // LOCKED (consistent with the POS permission UX). The lock is NOT the
  // security — the backend rejects every restricted API call with 403.
  const lockedSections = [
    'POS Register',
    'Rooms & Bookings',
    'Products & Sizes',
    'Categories & Brands',
    'Inventory Control',
    'Daily Stock Sheet',
    'Bills & Invoices',
    'Reports & Analytics',
    'Cashiers & Staff',
    'Audit Logs',
    'System Settings',
  ];

  const navItems = isAdmin ? [...kitchenNavItems, ...adminOnlyItems] : kitchenNavItems;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100 dark:bg-slate-950">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
        <div>
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandLogo
                className="w-9 h-9"
                roundedClass="rounded-xl"
                imgClassName="shadow-md ring-1 ring-amber-500/30"
                alt="Royal Hotel POS"
              />
              <div>
                <h2 className="font-bold text-xs text-white uppercase tracking-tight leading-tight truncate">
                  {settings?.businessName || 'Royal Hotel POS'}
                </h2>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  {isAdmin ? 'Food & Kitchen (Admin)' : 'Kitchen Manager Suite'}
                </span>
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            <p className="px-3 pt-1 pb-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Food &amp; Kitchen
            </p>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`kitchen-nav-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer uppercase tracking-tight ${
                    isActive
                      ? item.id === 'approvals'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {!isAdmin && (
              <>
                <p className="px-3 pt-4 pb-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Access Restricted 🔒
                </p>
                {lockedSections.map(label => (
                  <div
                    key={label}
                    title="Access restricted to authorized users."
                    className="w-full px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-2.5 text-slate-600 cursor-not-allowed select-none"
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </>
            )}
          </nav>
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-800 text-amber-300 flex items-center justify-center font-bold text-xs">
              {user?.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-amber-400 font-semibold uppercase">
                {isAdmin ? 'Super Admin' : 'Kitchen Manager'}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <KitchenDashboard onNavigate={tab => setActiveTab(tab)} />}
        {activeTab === 'ingredients' && <KitchenIngredients />}
        {activeTab === 'stock' && <KitchenStock />}
        {activeTab === 'recipes' && <KitchenRecipes />}
        {activeTab === 'wastage' && <KitchenWastage />}
        {activeTab === 'count' && <KitchenPhysicalCount />}
        {activeTab === 'food-cost' && <KitchenFoodCost />}
        {activeTab === 'reports' && <KitchenReports />}
        {isAdmin && activeTab === 'approvals' && <KitchenApprovals />}
      </main>
    </div>
  );
};
