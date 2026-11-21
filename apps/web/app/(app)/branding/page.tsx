'use client';

import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Icon } from '@/components/icon';
import { cacheBranding, useBranding } from '@/lib/branding';
import { useLiveAuth } from '@/lib/live-auth';
import { getBranding, updateBranding } from '@/lib/live-api';

// Keep logos small: a huge base64 blob can exhaust memory on low-RAM servers
// and slows every page load. Resize + WebP in the browser before uploading.
async function prepareLogo(file: File): Promise<string> {
  if (file.size > 1_000_000) {
    throw new Error('লোগো ফাইল ১ MB-এর কম হতে হবে');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ফাইল পড়া যায়নি'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('ছবি পড়া যায়নি'));
      image.onload = () => {
        let maxSide = 360;
        const encode = () => {
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('ক্যানভাস তৈরি করা যায়নি'));
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          const webp = canvas.toDataURL('image/webp', 0.8);
          const supportsWebp = webp.startsWith('data:image/webp');
          let data = supportsWebp
            ? canvas.toDataURL('image/webp', 0.82)
            : canvas.toDataURL('image/jpeg', 0.82);

          if (data.length > 180_000 && maxSide > 160) {
            maxSide = Math.round(maxSide * 0.75);
            encode();
            return;
          }
          resolve(data);
        };
        encode();
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function BrandingPage() {
  const { user } = useLiveAuth();
  const current = useBranding();
  const [name, setName] = useState(current.name);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(current.logoDataUrl);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canManage = user?.permissions.includes('settings.branding') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBranding();
      setName(data.name);
      setLogoDataUrl(data.logoDataUrl);
      cacheBranding(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Branding লোড করা যায়নি');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
    else setLoading(false);
  }, [canManage, load]);

  async function onLogoChange(event: ChangeEvent<HTMLInputElement>) {
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const prepared = await prepareLogo(file);
      setLogoDataUrl(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লোগো প্রস্তুত করা যায়নি');
    } finally {
      event.target.value = '';
    }
  }

  async function onSave() {
    setError('');
    setSaving(true);

    try {
      const updated = await updateBranding({
        name: name.trim(),
        logoDataUrl: logoDataUrl ?? '',
      });
      cacheBranding(updated);
      setName(updated.name);
      setLogoDataUrl(updated.logoDataUrl);
      setToast({ message: 'Branding সেভ হয়েছে ।' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Branding সেভ করা যায়নি');
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Branding সেটিংস দেখতে Super Admin permission
        প্রয়োজন।
      </div>
    );
  }

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Branding</h2>
          <p className="demo-page-sub">
            সফটওয়্যারের নাম ও লোগো — Super Admin নিজেই বদলাতে পারবেন
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      {loading ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            Branding লোড হচ্ছে…
          </div>
        </div>
      ) : (
        <section className="demo-settings-grid">
          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>Software Name</h3>
                <p>Login, sidebar, portal — সব জায়গায় দেখাবে</p>
              </div>
            </div>

            <div className="demo-form">
              <div className="live-field">
                <label htmlFor="brand-name">Name *</label>
                <input
                  id="brand-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="JR COMMUNICATION"
                />
              </div>

              <div className="live-field">
                <label htmlFor="brand-logo">Logo (PNG / JPG / SVG)</label>
                <input
                  id="brand-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={onLogoChange}
                />
                <small>সর্বোচ্চ ১ MB। লোগো ডেটাবেসে সংরক্ষিত হবে।</small>
              </div>

              {error ? <div className="live-error">{error}</div> : null}

              <div className="live-form-actions">
                {logoDataUrl ? (
                  <button
                    className="demo-btn danger"
                    type="button"
                    onClick={() => setLogoDataUrl(null)}
                  >
                    লোগো মুছুন
                  </button>
                ) : null}
                <button
                  className="demo-btn primary"
                  type="button"
                  onClick={onSave}
                  disabled={saving || name.trim().length < 2}
                >
                  <Icon name="check" size={14} />
                  {saving ? 'সেভ হচ্ছে…' : 'Branding সেভ করুন'}
                </button>
              </div>
            </div>
          </article>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>Preview</h3>
                <p>কেমন দেখাবে</p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                gap: 12,
                padding: '28px 16px',
                border: '1px dashed #e6eaf2',
                borderRadius: 14,
                background: '#fbfcff',
              }}
            >
              <BrandMark
                branding={{ name, logoDataUrl }}
                variant="app"
              />
              <strong style={{ fontSize: '0.9rem', letterSpacing: '0.08em' }}>
                {name || 'JR COMMUNICATION'}
              </strong>
              <small style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                ISP Billing Panel
              </small>
            </div>

            <div className="demo-note" style={{ marginTop: 14 }}>
              <strong>টিপস:</strong> স্কয়ার বা ট্রান্সপারেন্ট PNG লোগো সবচেয়ে ভালো
              দেখায়। সেভ করার পর সাথে সাথে সব পেজে আপডেট হবে।
            </div>
          </article>
        </section>
      )}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
