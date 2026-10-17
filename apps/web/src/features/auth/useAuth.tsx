/**
 * features/auth/useAuth.tsx — authentication state management, login flows, and token persistence.
 * DOC3 §3.8.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Role } from '@messpulse/shared';
import { fetchApi, getStoredToken, setStoredToken } from '../../lib/http';
import { updateSocketAuth } from '../../lib/socket';

export interface AuthUser {
  id: string;
  email?: string;
  role: Role;
  name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<AuthUser>;
  loginStaff: (identifier: string, pin: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_KEY = 'mp_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const saveAuthSession = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    setStoredToken(newToken);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } catch {
      // ignore
    }
    updateSocketAuth(newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStoredToken(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    updateSocketAuth(null);
  }, []);

  // Verify stored session on boot
  useEffect(() => {
    let mounted = true;
    async function verifySession() {
      const existingToken = getStoredToken();
      if (!existingToken) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const res = await fetchApi<{ user: AuthUser }>('/api/v1/auth/me');
        if (mounted && res?.user) {
          setUser(res.user);
          try {
            localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          } catch {
            // ignore
          }
        }
      } catch {
        // Token expired or invalid
        if (mounted) logout();
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    verifySession();
    return () => {
      mounted = false;
    };
  }, [logout]);

  const requestOtp = async (email: string): Promise<void> => {
    await fetchApi('/api/v1/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  };

  const verifyOtp = async (email: string, code: string): Promise<AuthUser> => {
    const res = await fetchApi<{ token: string; user: AuthUser }>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
    });

    saveAuthSession(res.token, res.user);
    return res.user;
  };

  const loginStaff = async (identifier: string, pin: string): Promise<AuthUser> => {
    const res = await fetchApi<{ token: string; user: AuthUser }>('/api/v1/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), pin: pin.trim() }),
    });

    saveAuthSession(res.token, res.user);
    return res.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        requestOtp,
        verifyOtp,
        loginStaff,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
