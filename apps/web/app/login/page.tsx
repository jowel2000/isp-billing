'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Icon } from '@/components/icon';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { fetchMe, getAccessToken, login, storeTokens } from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';

const REMEMBER_KEY = 'isp_remember_login_id';

export default function LoginPage() {
  const router = useRouter();
  const branding = useBranding();
  const { t } = useI18n();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setLoginId(saved);
      setRemember(true);
    }
    const token = getAccessToken();
    if (token) {
      fetchMe(token)
        .then((me) => router.replace(me.role === 'client' ? '/portal' : '/dashboard'))
        .catch(() => undefined);
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(loginId, password);
      storeTokens(result.accessToken, result.refreshToken);
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, loginId);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      router.replace(result.user.role === 'client' ? '/portal' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="brand-panel">
        <div>
          <div className="brand-mark">
            <BrandMark branding={branding} variant="login" />
            <span>{branding.name}</span>
          </div>

          <div className="brand-visual">
            <img
              src="/login-isp.svg"
              alt="আইএসপি নেটওয়ার্ক, রাউটার ও সংযুক্ত গ্রাহকদের Illustration"
            />
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <div className="phase-pill">Live · ISP Billing</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThemeSwitcher compact />
              <LanguageSwitcher compact />
            </div>
          </div>
          <h2>{t('auth.signIn')}</h2>
          <p className="muted small">{t('auth.signInHint')}</p>

          <form onSubmit={onSubmit} className="login-form">
            <label>
              <span>{t('auth.loginId')}</span>
              <input
                type="text"
                placeholder="যেমন superadmin"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoComplete="username"
                required
                minLength={3}
              />
            </label>

            <label>
              <span>{t('auth.password')}</span>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>{t('auth.remember')}</span>
            </label>

            {error ? <div className="error-box">{error}</div> : null}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? t('auth.signingIn') : t('auth.submit')}
            </button>
          </form>

          <div className="demo-divider">
            <span>অথবা</span>
          </div>

          <Link href="/demo/dashboard" className="demo-preview-link">
            <span className="demo-preview-icon">
              <Icon name="eye" size={17} />
            </span>
            <span className="demo-preview-copy">
              <strong>{t('auth.demo')}</strong>
              <small>{t('auth.demoHint')}</small>
            </span>
            <Icon name="arrow-right" size={16} />
          </Link>

          <p className="form-footer">
            প্রথমবার লগইনের পর পাসওয়ার্ড পরিবর্তন করুন। এই বিল্ডে কোনো আপস্ট্রিম
            পরিবর্তন করা হয় না।
          </p>
        </div>
      </section>
    </main>
  );
}
