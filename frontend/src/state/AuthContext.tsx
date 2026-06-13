import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { User } from '../types';

interface AuthContextValue {
  user?: User;
  token?: string;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | undefined>();
  const [token, setToken] = useState<string | undefined>(() => localStorage.getItem('jungle-token') ?? undefined);

  useEffect(() => {
    if (!token) return;
    api
      .get<User>('/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => {
        localStorage.removeItem('jungle-token');
        setToken(undefined);
        setUser(undefined);
      });
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      async login(email, password) {
        const response = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
        localStorage.setItem('jungle-token', response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
      },
      async signup(email, password, nickname) {
        const response = await api.post<{ token: string; user: User }>('/auth/signup', { email, password, nickname });
        localStorage.setItem('jungle-token', response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
      },
      logout() {
        localStorage.removeItem('jungle-token');
        setToken(undefined);
        setUser(undefined);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}

