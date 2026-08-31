import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Hotel as HotelIcon, User, KeyRound, AlertCircle, ArrowRight, Eye, EyeOff, Lock, Building2 } from 'lucide-react';
import { ApiException, fetchApi } from '../../lib/api.ts';
import { Hotel } from '../../types.ts';
import { BrandLogo } from '../BrandLogo.tsx';

export const LoginScreen: React.FC = () => {
  const { login, hotel } = useAuth();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>(hotel?.id || '');
  const [loadingHotels, setLoadingHotels] = useState<boolean>(true);

  useEffect(() => {
    fetchApi<{ hotels: Hotel[]; defaultHotelId?: string }>('/hotels')
      .then(data => {
        const list = data?.hotels || [];
        setHotels(list);
        if (!selectedHotelId && list.length > 0) {
          setSelectedHotelId((data.defaultHotelId && list.some(h => h.id === data.defaultHotelId) ? data.defaultHotelId : list[0].id) as string);
        }
      })
      .catch(err => {
        setErrorMsg(err?.message || 'Unable to load hotel list.');
      })
      .finally(() => setLoadingHotels(false));
  }, [selectedHotelId]);

  const selectedHotel = hotels.find(h => h.id === selectedHotelId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHotelId) {
      setErrorMsg('Please select a hotel to continue.');
      return;
    }
    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await login({
        username: username.trim(),
        password,
        hotelId: selectedHotelId,
      });
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err?.message || 'Invalid username or password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-8 select-none relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-slate-900 to-slate-900" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />

      <div className="flex items-center justify-between max-w-5xl mx-auto w-full z-10 relative">
        <div className="flex items-center gap-3">
          <BrandLogo
            className="w-10 h-10"
            roundedClass="rounded-xl"
            imgClassName="shadow-lg shadow-blue-600/20 ring-1 ring-white/10"
            alt="Hotel POS"
          />
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white uppercase">
              Ape Hotels POS
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Multi-Hotel Bar, Restaurant & Hotel Management
            </p>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
          Secure • Fast • Reliable
        </div>
      </div>

      <div className="max-w-md w-full mx-auto my-auto z-10 py-6 relative">
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Sign In</h2>
            <p className="text-xs text-slate-400 font-medium">
              Select your hotel and enter your credentials
            </p>
            <p className="text-[10px] text-slate-500 mt-2">
              Every hotel has its own login, users and business data
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-hotel" className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Hotel
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  id="login-hotel"
                  value={selectedHotelId}
                  onChange={e => setSelectedHotelId(e.target.value)}
                  disabled={loadingHotels || hotels.length === 0}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50"
                  aria-label="Hotel"
                >
                  {loadingHotels && <option value="">Loading hotels...</option>}
                  {!loadingHotels && hotels.length === 0 && <option value="">No hotels available</option>}
                  {hotels.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedHotel && (
                <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <HotelIcon className="w-3 h-3" />
                  {selectedHotel.tagline} • {selectedHotel.address}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="login-username" className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  aria-label="Username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded-md hover:bg-slate-800 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={isSubmitting || !selectedHotelId || loadingHotels}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 border-t border-slate-700/50">
            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              Secure authentication with HMAC-signed tokens • 30-day session • Brute-force protection enabled
            </p>
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] uppercase font-bold tracking-widest text-slate-500 z-10 relative">
        Ape Hotels • Multi-Hotel Commercial POS & Inventory Control • v1.5.0
      </div>
    </div>
  );
};
