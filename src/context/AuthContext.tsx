import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types.ts';
import { fetchApi } from '../lib/api.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isCashier: boolean;
  login: (
    credentialsOrUsername: string | { username?: string; password?: string; pin?: string },
    passwordArg?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'pos_auth_token';
const USER_KEY = 'pos_user';

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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('pos_token');
    sessionStorage.removeItem('pos_token');
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
        const data = await fetchApi<{ user: User }>('/auth/me');
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
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
    credentialsOrUsername: string | { username?: string; password?: string; pin?: string },
    passwordArg?: string
  ) => {
    setIsLoading(true);
    try {
      let payload: { username?: string; password?: string; pin?: string };
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
        };
      }

      if (!payload.username && !payload.pin) {
        throw new Error('Username or PIN is required');
      }

      const data = await fetchApi<{ token: string; user: User }>('/auth/login', {
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
      const data = await fetchApi<{ user: User }>('/auth/me');
      setUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isSuperAdmin: user?.role === 'super_admin',
        isCashier: user?.role === 'cashier',
        login,
        logout,
        refreshUser,
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
