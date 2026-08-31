import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Hotel } from '../types.ts';
import { fetchApi } from '../lib/api.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  hotelId: string | null;
  hotel: Hotel | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isCashier: boolean;
  isKitchenManager: boolean;
  login: (
    credentialsOrUsername: string | { username?: string; password?: string; pin?: string; hotelId?: string },
    passwordArg?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setHotel: (hotel: Hotel) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'pos_auth_token';
const USER_KEY = 'pos_user';
const HOTEL_ID_KEY = 'pos_hotel_id';
const HOTEL_KEY = 'pos_hotel';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? (JSON.parse(saved) as User) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [hotelId, setHotelId] = useState<string | null>(() => localStorage.getItem(HOTEL_ID_KEY));
  const [hotel, updateHotelState] = useState<Hotel | null>(() => {
    try {
      const saved = localStorage.getItem(HOTEL_KEY);
      return saved ? (JSON.parse(saved) as Hotel) : null;
    } catch {
      localStorage.removeItem(HOTEL_KEY);
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    setHotelId(null);
    updateHotelState(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(HOTEL_ID_KEY);
    localStorage.removeItem(HOTEL_KEY);
    localStorage.removeItem('pos_token');
    sessionStorage.removeItem('pos_token');
  }, []);

  const setHotel = useCallback((h: Hotel) => {
    updateHotelState(h);
    setHotelId(h.id);
    localStorage.setItem(HOTEL_ID_KEY, h.id);
    localStorage.setItem(HOTEL_KEY, JSON.stringify(h));
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuth();
    };
    window.addEventListener('pos_auth_expired', handleAuthExpired);

    const verifySession = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchApi<{ user: User; hotelId?: string }>('/auth/me');
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        if (data.hotelId) {
          setHotelId(data.hotelId);
          localStorage.setItem(HOTEL_ID_KEY, data.hotelId);
        }
      } catch {
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();

    return () => {
      window.removeEventListener('pos_auth_expired', handleAuthExpired);
    };
  }, [token, clearAuth]);

  const login = async (
    credentialsOrUsername: string | { username?: string; password?: string; pin?: string; hotelId?: string },
    passwordArg?: string
  ) => {
    setIsLoading(true);
    try {
      let payload: { username?: string; password?: string; pin?: string; hotelId?: string };
      if (typeof credentialsOrUsername === 'string') {
        payload = {
          username: credentialsOrUsername.trim(),
          password: passwordArg || '',
        };
      } else {
        payload = {
          username: credentialsOrUsername.username?.trim(),
          password: credentialsOrUsername.password,
          pin: credentialsOrUsername.pin?.trim(),
          hotelId: credentialsOrUsername.hotelId?.trim(),
        };
      }

      if (!payload.username && !payload.pin) {
        throw new Error('Username or PIN is required');
      }

      if (payload.hotelId) {
        localStorage.setItem(HOTEL_ID_KEY, payload.hotelId);
      }

      const data = await fetchApi<{ token: string; user: User; hotelId?: string; hotel?: Hotel }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!data.token || !data.user) {
        throw new Error('Invalid server response');
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      const resolvedHotelId = data.hotelId || payload.hotelId || data.user.hotelId;
      if (resolvedHotelId) {
        setHotelId(resolvedHotelId);
        localStorage.setItem(HOTEL_ID_KEY, resolvedHotelId);
      }
      if (data.hotel) {
        setHotel(data.hotel);
        localStorage.setItem(HOTEL_KEY, JSON.stringify(data.hotel));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
      }
    } finally {
      clearAuth();
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const data = await fetchApi<{ user: User; hotelId?: string }>('/auth/me');
      setUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      if (data.hotelId) {
        setHotelId(data.hotelId);
        localStorage.setItem(HOTEL_ID_KEY, data.hotelId);
      }
    } catch {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        hotelId,
        hotel,
        isLoading,
        isSuperAdmin: user?.role === 'super_admin',
        isCashier: user?.role === 'cashier',
        isKitchenManager: user?.role === 'kitchen_manager',
        login,
        logout,
        refreshUser,
        setHotel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
