import React, { useState, Component, ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { POSProvider } from './context/POSContext.tsx';
import { LoginScreen } from './components/auth/LoginScreen.tsx';
import { Navbar } from './components/layout/Navbar.tsx';
import { POSScreen } from './components/pos/POSScreen.tsx';
import { AdminLayout } from './components/admin/AdminLayout.tsx';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold">Something went wrong</h2>
            <p className="text-sm text-slate-400">
              {this.state.error?.message || 'An unexpected error occurred in the POS system.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Try to continue
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<'pos' | 'admin'>('pos');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-semibold tracking-wide">Starting Royal Hotel POS System...</span>
          <span className="text-xs text-slate-500">Loading secure session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const isSuperAdmin = user.role === 'super_admin';
  const effectiveView = isSuperAdmin ? currentView : 'pos';

  return (
    <POSProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans">
        <Navbar
          currentView={effectiveView}
          onSwitchView={view => setCurrentView(view)}
        />
        <div className="flex-1 flex overflow-hidden">
          {effectiveView === 'pos' ? (
            <POSScreen />
          ) : (
            <AdminLayout onSwitchToPOS={() => setCurrentView('pos')} />
          )}
        </div>
      </div>
    </POSProvider>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
