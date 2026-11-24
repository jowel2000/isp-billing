'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useBranding } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import { getSyncStatus, liveFetch } from '@/lib/live-api';
import { BrandMark } from './brand-mark';
import { Icon, IconName } from './icon';
import { LanguageSwitcher } from './language-switcher';
import { SyncStatusBar } from './sync-status-bar';
import { ThemeSwitcher } from './theme-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  soon?: boolean;
  permission?: string;
  anyPermissions?: string[];
  roles?: string[];
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'MAIN',
    items: [
      { href: '/dashboard', label: 'nav.dashboard', icon: 'grid' },
      {
        href: '/users?role=admin',
        label: 'nav.admin',
        icon: 'shield',
        permission: 'admins.manage',
      },
      {
        href: '/users?role=staff',
        label: 'nav.staff',
        icon: 'users',
        permission: 'users.manage',
      },
      {
        href: '/mobile-banking',
        label: 'nav.mobileBanking',
        icon: 'wallet',
        permission: 'settings.payment',
      },
      { href: '/clients', label: 'nav.clients', icon: 'users' },
      { href: '/payments', label: 'nav.payments', icon: 'wallet' },
      { href: '/invoices', label: 'nav.invoices', icon: 'invoice' },
      {
        href: '/recharge-history',
        label: 'nav.rechargeHistory',
        icon: 'wallet',
        permission: 'reports.recharge',
      },
      {
        href: '/payment-inbox',
        label: 'nav.paymentInbox',
        icon: 'wallet',
        permission: 'payments.reconcile',
      },
      {
        href: '/wrong-recharge',
        label: 'nav.wrongRecharge',
        icon: 'alert',
        permission: 'payments.reconcile',
      },
      { href: '/packages', label: 'nav.packages', icon: 'package' },
      { href: '/reports', label: 'nav.reports', icon: 'chart' },
      {
        href: '/activity-logs',
        label: 'nav.activityLogs',
        icon: 'chart',
        anyPermissions: ['logs.client_login', 'logs.user_login', 'logs.audit'],
      },
      {
        href: '/errors',
        label: 'nav.errors',
        icon: 'alert',
        roles: ['super_admin'],
      },
      {
        href: '/branding',
        label: 'nav.branding',
        icon: 'image',
        permission: 'settings.branding',
      },
      { href: '/settings', label: 'nav.settings', icon: 'settings' },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'page.dashboard',
  '/clients': 'page.clients',
  '/payments': 'page.payments',
  '/invoices': 'page.invoices',
  '/recharge-history': 'page.rechargeHistory',
  '/payment-inbox': 'page.paymentInbox',
  '/wrong-recharge': 'page.wrongRecharge',
  '/packages': 'page.packages',
  '/reports': 'page.reports',
  '/users': 'page.users',
  '/activity-logs': 'page.activityLogs',
  '/errors': 'page.errors',
  '/mobile-banking': 'page.mobileBanking',
  '/branding': 'page.branding',
  '/settings': 'page.settings',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  staff: 'Staff',
  client: 'Client',
};

// Only these roles may see and use the Refresh (upstream sync) button.
const REFRESH_ROLES = ['super_admin', 'admin', 'staff'];

interface RefreshResult {
  status: string;
  lastUpdatedAt?: string | null;
  errors?: string[];
  retryAfterSeconds?: number;
}

function formatCooldown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function LiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const branding = useBranding();
  const { t } = useI18n();
  const { user, logout } = useLiveAuth();
  const [open, setOpen] = useState(false);
  const [refreshState, setRefreshState] = useState<
    'idle' | 'refreshing' | 'done' | 'otp' | 'error'
  >('idle');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Strict role check (frontend): Super Admin / Admin / Staff only.
  const canRefresh = user ? REFRESH_ROLES.includes(user.role) : false;

  async function onUpstreamRefresh() {
    if (!canRefresh || refreshState === 'refreshing') return;
    setRefreshState('refreshing');
    try {
      const result = await liveFetch<RefreshResult>('/upstream/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (result.status === 'cooldown') {
        setCooldownSeconds(result.retryAfterSeconds ?? 0);
      }
      setRefreshState(
        result.status === 'otp_required' ||
          result.status === 'busy' ||
          result.status === 'cooldown'
          ? 'otp'
          : result.status === 'completed'
            ? 'done'
            : 'error',
      );
    } catch {
      setRefreshState('error');
    }
    setTimeout(() => setRefreshState('idle'), 5000);
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Poll the cooldown so the top Refresh button can be replaced by a
  // countdown while a fresh OTP request is rate-limited.
  useEffect(() => {
    if (!canRefresh) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let delay = 15000;
      try {
        const status = await getSyncStatus();
        if (!active) return;
        const remaining = status.cooldownSecondsRemaining ?? 0;
        setCooldownSeconds(remaining);
        // Smooth countdown while cooling down; idle polling otherwise.
        delay = remaining > 0 ? 1000 : 15000;
      } catch {
        // Ignore transient status failures; the Refresh button still works.
      }
      if (active) timer = setTimeout(tick, delay);
    };

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [canRefresh]);

  if (!user) return null;

  const title = t(PAGE_TITLES[pathname] || 'page.dashboard');
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const navItems = NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) =>
      (!item.permission || user.permissions.includes(item.permission)) &&
      (!item.anyPermissions ||
        item.anyPermissions.some((permission) =>
          user.permissions.includes(permission),
        )) &&
      (!item.roles || item.roles.includes(user.role)),
  );

  return (
    <div className="demo-root">
      <SyncStatusBar />
      <div className={`demo-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`demo-sidebar ${open ? 'open' : ''}`}>
        <div className="demo-brand">
          <BrandMark branding={branding} />
          <div>
            <strong>{branding.name}</strong>
            <small>{t('app.ispBillingPanel')}</small>
          </div>
          <button className="demo-sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="demo-nav">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const content = (
              <>
                <span className="demo-nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>{t(item.label)}</span>
                {item.soon ? <span className="soon">soon</span> : null}
              </>
            );

            return item.soon ? (
              <span
                key={item.href}
                className="demo-nav-item"
                style={{ opacity: 0.55, cursor: 'not-allowed' }}
                title={`${item.label} — next step`}
              >
                {content}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`demo-nav-item ${active ? 'active' : ''}`}
              >
                {content}
              </Link>
            );
          })}
        </nav>

        <div className="demo-side-card">
          <div className="demo-side-card-top">
            <span className="demo-live-dot" />
            <strong>{t('app.liveMode')}</strong>
          </div>
          <p>{t('app.liveNote')}</p>
          <button className="demo-side-link" onClick={() => logout()} type="button">
            {t('app.logout')} <Icon name="logout" size={13} />
          </button>
        </div>
      </aside>

      <div className="demo-main">
        <header className="demo-topbar">
          <div className="demo-topbar-left">
            <button className="demo-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
              <Icon name="menu" size={20} />
            </button>
            <div>
              <p className="demo-topbar-eyebrow">{branding.name}</p>
              <h1>{title}</h1>
            </div>
          </div>

          <div className="demo-search">
            <Icon name="search" size={16} />
            <input placeholder="ক্লায়েন্ট, ইনভয়েস বা Trx ID খুঁজুন…" />
            <kbd>⌘K</kbd>
          </div>

          <div className="demo-top-actions">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <span className="live-chip">{t('app.liveData')}</span>
            {canRefresh ? (
              cooldownSeconds > 0 ? (
                <span
                  className="demo-btn sm demo-cooldown"
                  title={t('app.refreshCooldownTitle')}
                >
                  <Icon name="clock" size={14} />
                  {t('app.refreshCooldown')} {formatCooldown(cooldownSeconds)}
                </span>
              ) : (
                <button
                  className={`demo-btn sm ${refreshState === 'error' ? 'danger' : refreshState === 'done' ? 'primary' : ''}`}
                  type="button"
                  onClick={onUpstreamRefresh}
                  title={t('app.refreshTitle')}
                >
                  <Icon name="trend-up" size={14} />
                  {refreshState === 'refreshing'
                    ? t('app.refreshSyncing')
                    : refreshState === 'done'
                      ? t('app.refreshDone')
                      : refreshState === 'otp'
                        ? t('app.refreshOtp')
                        : refreshState === 'error'
                          ? t('app.refreshError')
                          : t('app.refreshNow')}
                </button>
              )
            ) : null}
            <button className="demo-icon-btn" aria-label="Notifications">
              <Icon name="bell" size={18} />
              <span className="demo-notify-dot" />
            </button>
            <div className="demo-user">
              <span className="demo-avatar">{initials || 'U'}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{roleLabel}</small>
              </div>
            </div>
            <button className="demo-icon-btn" onClick={() => logout()} title="Logout">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>

        <main className="demo-content">{children}</main>
      </div>
    </div>
  );
}
