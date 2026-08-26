import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { usePOS } from '../../context/POSContext.tsx';
import { AdminDashboard } from './AdminDashboard.tsx';
import { ProductManagement } from './ProductManagement.tsx';
import { CategoryCompanyManagement } from './CategoryCompanyManagement.tsx';
import { InventoryManagement } from './InventoryManagement.tsx';
import { DailyStockSheet } from './DailyStockSheet.tsx';
import { StockMovements } from './StockMovements.tsx';
import { KOTManager } from './KOTManager.tsx';
import { BillsInvoicesView } from './BillsInvoicesView.tsx';
import { ReportsView } from './ReportsView.tsx';
import { UserManagement } from './UserManagement.tsx';
import { AuditLogsView } from './AuditLogsView.tsx';
import { SystemSettingsView } from './SystemSettingsView.tsx';
import { RoomManagement } from './RoomManagement.tsx';
import { KitchenLayout } from '../kitchen/KitchenLayout.tsx';
import { BrandLogo } from '../BrandLogo.tsx';
import {
  LayoutDashboard,
  Wine,
  Layers,
  Package,
  FileSpreadsheet,
  History,
  UtensilsCrossed,
  Receipt,
  BarChart3,
  Users,
  ShieldCheck,
  Settings,
  ArrowLeft,
  LogOut,
  BedDouble,
  ChefHat
} from 'lucide-react';

interface AdminLayoutProps {
  onSwitchToPOS: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onSwitchToPOS }) => {
  const { user, logout } = useAuth();
  const { settings, categories, refreshProducts } = usePOS();
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const handleSettingsUpdated = () => {
    refreshProducts().catch(() => {});
    window.location.reload();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'rooms', label: 'Rooms & Bookings', icon: BedDouble },
    { id: 'products', label: 'Products & Sizes', icon: Wine },
    { id: 'categories', label: 'Categories & Brands', icon: Layers },
    { id: 'inventory', label: 'Inventory Control', icon: Package },
    { id: 'daily-sheet', label: 'Daily Stock Sheet', icon: FileSpreadsheet, badge: 'REGISTER' },
    { id: 'movements', label: 'Stock Movements', icon: History },
    { id: 'kitchen', label: 'Food & Kitchen', icon: ChefHat },
    { id: 'kot', label: 'Kitchen KOT / KDS', icon: UtensilsCrossed },
    { id: 'bills', label: 'Bills & Invoices', icon: Receipt },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'users', label: 'Cashiers & Staff', icon: Users },
    { id: 'audit', label: 'Audit Logs', icon: ShieldCheck },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100 dark:bg-slate-950">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
        <div>
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandLogo
                className="w-9 h-9"
                roundedClass="rounded-xl"
                imgClassName="shadow-md ring-1 ring-white/10"
                alt="Royal Hotel POS"
              />
              <div>
                <h2 className="font-bold text-xs text-white uppercase tracking-tight leading-tight truncate">
                  {settings?.businessName || 'Royal Hotel POS'}
                </h2>
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  Super Admin Suite
                </span>
              </div>
            </div>

            <button
              id="switch-to-pos-btn"
              onClick={onSwitchToPOS}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to POS Register</span>
            </button>
          </div>

          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`admin-nav-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer uppercase tracking-tight ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-950 border border-blue-800 text-blue-300 flex items-center justify-center font-bold text-xs">
              {user?.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-blue-400 font-semibold uppercase">Super Admin</div>
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
        {activeTab === 'dashboard' && (
          <AdminDashboard settings={settings} onNavigate={tab => setActiveTab(tab)} />
        )}
        {activeTab === 'rooms' && <RoomManagement />}
        {activeTab === 'products' && <ProductManagement settings={settings} />}
        {activeTab === 'categories' && <CategoryCompanyManagement />}
        {activeTab === 'inventory' && <InventoryManagement settings={settings} />}
        {activeTab === 'daily-sheet' && <DailyStockSheet categories={categories} />}
        {activeTab === 'movements' && <StockMovements />}
        {activeTab === 'kitchen' && <KitchenLayout isAdmin />}
        {activeTab === 'kot' && <KOTManager />}
        {activeTab === 'bills' && <BillsInvoicesView settings={settings} />}
        {activeTab === 'reports' && <ReportsView settings={settings} />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'audit' && <AuditLogsView />}
        {activeTab === 'settings' && (
          <SystemSettingsView settings={settings} onSettingsUpdated={handleSettingsUpdated} />
        )}
      </main>
    </div>
  );
};
