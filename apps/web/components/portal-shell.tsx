'use client';

import { useBranding } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import { BrandMark } from './brand-mark';
import { Icon } from './icon';
import { LanguageSwitcher } from './language-switcher';
import { ThemeSwitcher } from './theme-switcher';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const branding = useBranding();
  const { t } = useI18n();
  const { user, logout } = useLiveAuth();

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="demo-root" style={{ display: 'block' }}>
      <header className="demo-topbar">
        <div className="demo-topbar-left">
          <BrandMark branding={branding} />
          <div>
            <p className="demo-topbar-eyebrow">{branding.name} · CLIENT</p>
            <h1>{t('page.portal')}</h1>
          </div>
        </div>

        <div className="demo-top-actions">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <span className="live-chip">Client</span>
          <div className="demo-user">
            <span className="demo-avatar">{initials || 'C'}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.mobile}</small>
            </div>
          </div>
          <button className="demo-icon-btn" onClick={() => logout()} title="Logout">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <main className="demo-content">{children}</main>
    </div>
  );
}
