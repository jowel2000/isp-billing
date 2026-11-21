'use client';

import { useEffect, useState } from 'react';
import { API_URL } from './api';
import type { Branding } from './live-api';

const CACHE_KEY = 'isp_branding';
const FALLBACK: Branding = { name: 'JR COMMUNICATION', logoDataUrl: null };

function readCache(): Branding | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string') {
      return { name: parsed.name, logoDataUrl: parsed.logoDataUrl ?? null };
    }
  } catch {
    return null;
  }
  return null;
}

export function cacheBranding(branding: Branding) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  window.dispatchEvent(new Event('branding-updated'));
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(() => readCache() ?? FALLBACK);

  useEffect(() => {
    let active = true;

    fetch(`${API_URL}/settings/branding/public`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.name) return;
        const next: Branding = {
          name: data.name,
          logoDataUrl: data.logoDataUrl ?? null,
        };
        setBranding(next);
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);

    const handler = () => {
      const cached = readCache();
      if (cached) setBranding(cached);
    };
    window.addEventListener('branding-updated', handler);

    return () => {
      active = false;
      window.removeEventListener('branding-updated', handler);
    };
  }, []);

  return branding;
}
