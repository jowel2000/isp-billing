'use client';

import { useTheme } from '@/lib/theme';
import { Icon } from './icon';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={dark ? 'Light mode' : 'Dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: compact ? 30 : 34,
        height: compact ? 30 : 34,
        borderRadius: 9,
        border: '1px solid var(--line)',
        background: 'var(--panel-2)',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={compact ? 15 : 17} />
    </button>
  );
}
