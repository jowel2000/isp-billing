import type { Branding } from '@/lib/live-api';

export function BrandMark({
  branding,
  variant = 'app',
}: {
  branding: Branding;
  variant?: 'app' | 'login';
}) {
  const className = variant === 'login' ? 'brand-glyph' : 'demo-brand-logo';

  return (
    <span
      className={className}
      style={
        branding.logoDataUrl
          ? { background: '#fff', padding: 3, overflow: 'hidden' }
          : undefined
      }
    >
      {branding.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoDataUrl}
          alt={branding.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        'JR'
      )}
    </span>
  );
}
