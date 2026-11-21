'use client';

import { useI18n } from '@/lib/i18n';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 9,
        border: '1px solid var(--line)',
        background: 'var(--panel-2)',
      }}
      title="Language / ভাষা"
    >
      {(['bn', 'en'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          style={{
            padding: compact ? '3px 7px' : '4px 9px',
            borderRadius: 7,
            border: 0,
            cursor: 'pointer',
            fontSize: '0.65rem',
            fontWeight: 700,
            background: language === item ? 'var(--text)' : 'transparent',
            color: language === item ? 'var(--bg)' : 'var(--muted)',
          }}
        >
          {item === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}
