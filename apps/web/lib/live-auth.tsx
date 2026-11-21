'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { AuthUser } from './api';
import {
  clearTokens,
  fetchMe,
  getAccessToken,
  logout as apiLogout,
  refreshSession,
} from './api';

interface LiveAuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const LiveAuthContext = createContext<LiveAuthState | null>(null);

export function LiveAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      let token = getAccessToken();

      if (!token) {
        const refreshed = await refreshSession();
        token = refreshed?.accessToken ?? getAccessToken();
      }

      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        const me = await fetchMe(token);
        setUser(me);
      } catch {
        const refreshed = await refreshSession();
        if (!refreshed) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setUser(refreshed.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'client' && pathname !== '/portal') {
      router.replace('/portal');
    }
    if (user.role !== 'client' && pathname.startsWith('/portal')) {
      router.replace('/dashboard');
    }
  }, [user, pathname, router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, error, logout, reload: load }),
    [user, loading, error, logout, load],
  );

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f5f7fb',
          color: '#64748b',
          fontFamily: "'Segoe UI', 'Noto Sans Bengali', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 36,
              height: 36,
              margin: '0 auto 12px',
              borderRadius: '50%',
              border: '3px solid #fde3b4',
              borderTopColor: '#f59e0b',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ margin: 0, fontSize: 13 }}>সেশন লোড হচ্ছে…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: '#f5f7fb',
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              padding: 24,
              borderRadius: 16,
              border: '1px solid #e6eaf2',
              background: '#fff',
              color: '#0f172a',
              fontFamily: "'Segoe UI', 'Noto Sans Bengali', system-ui, sans-serif",
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>সেশন লোড করা যায়নি</h2>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
              {error}
            </p>
            <button
              onClick={() => router.replace('/login')}
              style={{
                padding: '9px 14px',
                border: 0,
                borderRadius: 9,
                background: '#f59e0b',
                color: '#211503',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              লগইনে ফিরে যান
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return <LiveAuthContext.Provider value={value}>{children}</LiveAuthContext.Provider>;
}

export function useLiveAuth(): LiveAuthState {
  const context = useContext(LiveAuthContext);
  if (!context) throw new Error('useLiveAuth must be used inside LiveAuthProvider');
  return context;
}
