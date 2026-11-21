'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useBranding } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';
import { BrandMark } from './brand-mark';
import { Icon, IconName } from './icon';
import { LanguageSwitcher } from './language-switcher';
import { ThemeSwitcher } from './theme-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'MAIN',
    items: [
      { href: '/demo/dashboard', label: 'nav.dashboard', icon: 'grid' },
      { href: '/demo/clients', label: 'nav.clients', icon: 'users' },
      { href: '/demo/payments', label: 'nav.payments', icon: 'wallet', badge: '3' },
      { href: '/demo/invoices', label: 'nav.invoices', icon: 'invoice' },
    ],
  },
  {
    label: 'NETWORK',
    items: [
      { href: '/demo/packages', label: 'nav.packages', icon: 'package' },
      { href: '/demo/reports', label: 'nav.reports', icon: 'chart' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ href: '/demo/settings', label: 'nav.settings', icon: 'settings' }],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/demo/dashboard': 'page.dashboard',
  '/demo/clients': 'page.clients',
  '/demo/payments': 'page.payments',
  '/demo/invoices': 'page.invoices',
  '/demo/packages': 'page.packages',
  '/demo/reports': 'page.reports',
  '/demo/settings': 'page.settings',
};

export function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const branding = useBranding();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const title = t(PAGE_TITLES[pathname] || 'page.dashboard');

  return (
    <div className="demo-root">
      <div className={`demo-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`demo-sidebar ${open ? 'open' : ''}`}>
        <div className="demo-brand">
          <BrandMark branding={branding} />
          <div>
            <strong>{branding.name}</strong>
            <small>LISP Billing Demo</small>
          </div>
          <button className="demo-sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="demo-nav">
          {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`demo-nav-item ${active ? 'active' : ''}`}
              >
                <span className="demo-nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>{t(item.label)}</span>
                {item.badge ? <span className="demo-nav-badge">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="demo-side-card">
          <div className="demo-side-card-top">
            <span className="demo-live-dot" />
            <strong>Demo mode</strong>
          </div>
          <p>মক ডেটা দিয়ে ডিজাইন প্রিভিউ। আপস্ট্রিম প্যানেলে কোনো পরিবর্তন হয় না।</p>
          <Link href="/login" className="demo-side-link">
            আসল লগইনে যান <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </aside>

      <div className="demo-main">
        <header className="demo-topbar">
          <div className="demo-topbar-left">
            <button
              className="demo-menu-btn"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
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
            <span className="demo-chip">Demo data</span>
            <button className="demo-icon-btn" aria-label="Notifications">
              <Icon name="bell" size={18} />
              <span className="demo-notify-dot" />
            </button>
            <div className="demo-user">
              <span className="demo-avatar">SA</span>
              <div>
                <strong>Super Admin</strong>
                <small>TRG Tenant</small>
              </div>
            </div>
          </div>
        </header>

        <main className="demo-content">{children}</main>
      </div>
    </div>
  );
}
