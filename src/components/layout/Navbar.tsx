import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { usePOS } from '../../context/POSContext.tsx';
import {
  LogOut,
  Shield,
  User as UserIcon,
  Maximize,
  Minimize,
  Moon,
  Sun,
  LayoutDashboard,
  Clock,
  Layers,
  ChefHat,
} from 'lucide-react';

interface NavbarProps {
  currentView: 'pos' | 'admin' | 'kitchen';
  onSwitchView: (view: 'pos' | 'admin' | 'kitchen') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onSwitchView }) => {
  const { user, logout } = useAuth();
  const { heldBills, setIsHeldBillsModalOpen, settings } = usePOS();
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      setCurrentTime(now.toLocaleString('en-US', options).replace(',', ' |'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
      localStorage.setItem('pos_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
      localStorage.setItem('pos_theme', 'dark');
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('pos_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <header
      id="pos-top-navbar"
      className="h-14 bg-slate-800 text-white border-b border-slate-700 px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none shadow-md"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md shadow-blue-600/20">
            RH
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-white">
            {settings?.businessName ? (
              <>
                {settings.businessName.split(' ')[0]}{' '}
                <span className="text-blue-400 font-extrabold">PRO POS</span>
              </>
            ) : (
              <>
                ROYAL HOTEL <span className="text-blue-400">PRO POS</span>
              </>
            )}
          </span>
        </div>

        <div className="hidden md:block h-6 w-px bg-slate-600 mx-1"></div>

        <div className="hidden md:flex flex-col">
          <span className="text-[10px] uppercase text-slate-400 leading-none font-semibold">Station</span>
          <span className="text-xs font-bold text-slate-200">HOTEL_01_FRONT</span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="hidden lg:flex flex-col text-right">
          <span className="text-[10px] text-slate-400 uppercase leading-none font-semibold">
            {user?.role === 'kitchen_manager' ? 'Kitchen Manager' : 'Cashier'}
          </span>
          <span className="text-xs font-bold text-white truncate max-w-[140px]">{user?.name}</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
            System Live
          </span>
        </div>

        <div className="hidden xl:block font-mono text-xs text-slate-300 tracking-tight">
          {currentTime}
        </div>

        {currentView === 'pos' && heldBills.length > 0 && (
          <button
            onClick={() => setIsHeldBillsModalOpen(true)}
            className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/30 transition-colors cursor-pointer"
            aria-label={`${heldBills.length} held bills`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{heldBills.length} Held Tab{heldBills.length > 1 ? 's' : ''}</span>
          </button>
        )}

        {user?.role === 'super_admin' && (
          <button
            id="toggle-admin-pos-view-btn"
            type="button"
            onClick={() => onSwitchView(currentView === 'pos' ? 'admin' : 'pos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              currentView === 'admin'
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'
            }`}
          >
            {currentView === 'pos' ? (
              <>
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-400" />
                <span>Admin Suite</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span>POS Register</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Toggle Theme"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-300" />}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden sm:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Toggle Fullscreen"
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
          <div className="flex items-center gap-1.5 bg-slate-700/80 py-1 px-2.5 rounded-lg">
            {user?.role === 'super_admin' ? (
              <Shield className="w-3.5 h-3.5 text-purple-400" />
            ) : user?.role === 'kitchen_manager' ? (
              <ChefHat className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <UserIcon className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="font-bold text-xs text-slate-200">
              {user?.name.split(' ')[0]}
            </span>
          </div>

          <button
            id="navbar-logout-btn"
            type="button"
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
