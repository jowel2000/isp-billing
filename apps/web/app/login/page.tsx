'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Icon } from '@/components/icon';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeSwitcher } from '@/components/theme-switcher';
import {
  fetchMe,
  forgotPasswordRequest,
  forgotPasswordReset,
  forgotPasswordVerify,
  getAccessToken,
  login,
  storeTokens,
} from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';

const REMEMBER_KEY = 'isp_remember_login_id';

type ForgotStep = 'idle' | 'request' | 'verify' | 'reset';

export default function LoginPage() {
  const router = useRouter();
  const branding = useBranding();
  const { t } = useI18n();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [fpOpen, setFpOpen] = useState(false);
  const [fpStep, setFpStep] = useState<ForgotStep>('request');
  const [fpIdentifier, setFpIdentifier] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpDevOtp, setFpDevOtp] = useState('');
  const [fpResetToken, setFpResetToken] = useState('');
  const [fpLoginId, setFpLoginId] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [fpShowNew, setFpShowNew] = useState(false);
  const [fpShowConfirm, setFpShowConfirm] = useState(false);
  const [fpBusy, setFpBusy] = useState(false);
  const [fpError, setFpError] = useState('');
  const [fpSuccess, setFpSuccess] = useState('');

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
    setNotice('');
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

  function openForgot() {
    setFpOpen(true);
    setFpStep('request');
    setFpIdentifier('');
    setFpOtp('');
    setFpDevOtp('');
    setFpResetToken('');
    setFpLoginId('');
    setFpNewPassword('');
    setFpConfirmPassword('');
    setFpError('');
    setFpSuccess('');
  }

  function closeForgot() {
    setFpOpen(false);
    setFpError('');
    setFpSuccess('');
  }

  // Step 1 — request OTP
  async function onForgotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFpError('');
    setFpBusy(true);
    try {
      const result = await forgotPasswordRequest(fpIdentifier);
      setFpDevOtp(result.devOtp ?? '');
      setFpStep('verify');
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'OTP পাঠানো যায়নি');
    } finally {
      setFpBusy(false);
    }
  }

  // Step 2 — verify OTP
  async function onForgotVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFpError('');
    setFpBusy(true);
    try {
      const result = await forgotPasswordVerify(fpIdentifier, fpOtp);
      setFpResetToken(result.resetToken);
      setFpLoginId(fpIdentifier);
      setFpStep('reset');
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'OTP যাচাই করা যায়নি');
    } finally {
      setFpBusy(false);
    }
  }

  // Step 3 — save new password
  async function onForgotReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFpError('');
    if (fpNewPassword.length < 6) {
      setFpError(t('auth.passShort'));
      return;
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setFpError(t('auth.passMismatch'));
      return;
    }

    setFpBusy(true);
    try {
      await forgotPasswordReset(fpResetToken, fpNewPassword, fpLoginId || undefined);
      setFpSuccess(t('auth.resetSuccess'));
      setFpResetToken('');
      setTimeout(() => {
        closeForgot();
        setNotice(t('auth.resetSuccess'));
        setLoginId(fpLoginId || fpIdentifier);
        setPassword('');
      }, 1200);
    } catch (err) {
      setFpError(err instanceof Error ? err.message : 'পাসওয়ার্ড বদলানো যায়নি');
    } finally {
      setFpBusy(false);
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
                  className="eye-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
                </button>
              </div>
            </label>

            <div className="login-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>{t('auth.remember')}</span>
              </label>
              <button
                type="button"
                className="forgot-link"
                onClick={openForgot}
              >
                {t('auth.forgot')}
              </button>
            </div>

            {error ? <div className="error-box">{error}</div> : null}
            {notice ? <div className="notice-box">{notice}</div> : null}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? t('auth.signingIn') : t('auth.submit')}
            </button>
          </form>
        </div>
      </section>

      {fpOpen ? (
        <div className="fp-backdrop" onMouseDown={closeForgot}>
          <div className="fp-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="fp-head">
              <div>
                <h3>{t('auth.forgotTitle')}</h3>
                <p>{t('auth.forgotHint')}</p>
              </div>
              <button
                type="button"
                className="fp-close"
                onClick={closeForgot}
                aria-label="Close"
              >
                <Icon name="x" size={15} />
              </button>
            </div>

            {fpStep === 'request' ? (
              <form onSubmit={onForgotRequest} className="fp-form">
                <label>
                  <span>{t('auth.loginId')} / {t('auth.mobile')}</span>
                  <input
                    type="text"
                    value={fpIdentifier}
                    onChange={(event) => setFpIdentifier(event.target.value)}
                    placeholder="superadmin / 017XXXXXXXX"
                    required
                    minLength={3}
                  />
                </label>
                {fpError ? <div className="fp-error">{fpError}</div> : null}
                <div className="fp-actions">
                  <button type="button" className="fp-btn ghost" onClick={closeForgot}>
                    {t('auth.cancel')}
                  </button>
                  <button type="submit" className="fp-btn primary" disabled={fpBusy}>
                    {fpBusy ? t('auth.signingIn') : t('auth.sendOtp')}
                  </button>
                </div>
              </form>
            ) : null}

            {fpStep === 'verify' ? (
              <form onSubmit={onForgotVerify} className="fp-form">
                {fpDevOtp ? (
                  <div className="fp-demo-otp">
                    {t('auth.demoOtp')} <strong>{fpDevOtp}</strong>
                  </div>
                ) : null}
                <label>
                  <span>{t('auth.otpLabel')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={fpOtp}
                    onChange={(event) => setFpOtp(event.target.value)}
                    placeholder="123456"
                    required
                  />
                </label>
                {fpError ? <div className="fp-error">{fpError}</div> : null}
                <div className="fp-actions">
                  <button
                    type="button"
                    className="fp-btn ghost"
                    onClick={() => setFpStep('request')}
                  >
                    {t('auth.back')}
                  </button>
                  <button type="submit" className="fp-btn primary" disabled={fpBusy}>
                    {fpBusy ? t('auth.signingIn') : t('auth.verifyOtp')}
                  </button>
                </div>
              </form>
            ) : null}

            {fpStep === 'reset' ? (
              <form onSubmit={onForgotReset} className="fp-form">
                <label>
                  <span>{t('auth.loginId')}</span>
                  <input
                    type="text"
                    value={fpLoginId}
                    onChange={(event) => setFpLoginId(event.target.value)}
                    required
                    minLength={3}
                  />
                </label>

                <label>
                  <span>{t('auth.newPassword')}</span>
                  <div className="password-field">
                    <input
                      type={fpShowNew ? 'text' : 'password'}
                      value={fpNewPassword}
                      onChange={(event) => setFpNewPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="eye-toggle"
                      onClick={() => setFpShowNew((value) => !value)}
                      aria-label={fpShowNew ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={fpShowNew ? 'eye-off' : 'eye'} size={17} />
                    </button>
                  </div>
                </label>

                <label>
                  <span>{t('auth.confirmPassword')}</span>
                  <div className="password-field">
                    <input
                      type={fpShowConfirm ? 'text' : 'password'}
                      value={fpConfirmPassword}
                      onChange={(event) => setFpConfirmPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="eye-toggle"
                      onClick={() => setFpShowConfirm((value) => !value)}
                      aria-label={fpShowConfirm ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={fpShowConfirm ? 'eye-off' : 'eye'} size={17} />
                    </button>
                  </div>
                </label>

                {fpError ? <div className="fp-error">{fpError}</div> : null}
                {fpSuccess ? <div className="fp-success">{fpSuccess}</div> : null}

                <div className="fp-actions">
                  <button type="button" className="fp-btn ghost" onClick={closeForgot}>
                    {t('auth.cancel')}
                  </button>
                  <button type="submit" className="fp-btn primary" disabled={fpBusy}>
                    {fpBusy ? t('auth.signingIn') : t('auth.resetSave')}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
