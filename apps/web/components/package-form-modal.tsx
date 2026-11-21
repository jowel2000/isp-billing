'use client';

import { FormEvent, useState } from 'react';
import type { ApiPackage } from '@/lib/live-api';
import { createPackage, updatePackage } from '@/lib/live-api';
import { Icon } from './icon';

interface PackageFormModalProps {
  mode: 'add' | 'edit';
  pkg?: ApiPackage | null;
  canViewCost: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function PackageFormModal({
  mode,
  pkg,
  canViewCost,
  onClose,
  onSaved,
}: PackageFormModalProps) {
  const [form, setForm] = useState({
    name: pkg?.name ?? '',
    speedMbps: pkg?.speedMbps ? String(pkg.speedMbps) : '',
    localPriceTaka: pkg ? String(pkg.localPrice / 100) : '',
    upstreamPriceTaka: pkg?.upstreamPrice ? String(pkg.upstreamPrice / 100) : '',
    cbpTaka: pkg ? String(pkg.cbp / 100) : '',
    status: pkg?.status ?? 'active',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        status: form.status,
        localPricePaisa: Math.round(Number(form.localPriceTaka || 0) * 100),
        cbpPaisa: Math.round(Number(form.cbpTaka || 0) * 100),
      };

      if (canViewCost) {
        payload.upstreamPricePaisa = Math.round(
          Number(form.upstreamPriceTaka || 0) * 100,
        );
      }
      if (form.speedMbps) payload.speedMbps = Number(form.speedMbps);

      if (mode === 'add') {
        const created = await createPackage(payload);
        onSaved(`প্যাকেজ তৈরি হয়েছে — ${created.name}`);
      } else if (pkg) {
        const updated = await updatePackage(pkg.id, payload);
        onSaved(`প্যাকেজ আপডেট হয়েছে — ${updated.name}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সেভ করা যায়নি');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="live-modal-backdrop" onMouseDown={onClose}>
      <div className="live-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="live-modal-head">
          <div>
            <h3>{mode === 'add' ? 'নতুন প্যাকেজ' : 'প্যাকেজ এডিট'}</h3>
            <p>Upstream cost ও লোকাল বিক্রয়মূল্য আলাদা রাখুন — margin report-এ কাজে লাগবে।</p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="live-form-grid">
            <div className="live-field full">
              <label htmlFor="pkg-name">প্যাকেজের নাম *</label>
              <input
                id="pkg-name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="যেমন 25 Mbps"
                required
              />
            </div>

            <div className="live-field">
              <label htmlFor="pkg-speed">স্পিড (Mbps)</label>
              <input
                id="pkg-speed"
                type="number"
                min="1"
                value={form.speedMbps}
                onChange={(event) => update('speedMbps', event.target.value)}
                placeholder="25"
              />
            </div>

            <div className="live-field">
              <label htmlFor="pkg-status">স্ট্যাটাস</label>
              <select
                id="pkg-status"
                value={form.status}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="pkg-local">লোকাল মূল্য (৳) *</label>
              <input
                id="pkg-local"
                type="number"
                min="0"
                step="0.01"
                value={form.localPriceTaka}
                onChange={(event) => update('localPriceTaka', event.target.value)}
                placeholder="250"
                required
              />
              <small>ক্লায়েন্টকে এই দামে বিল হবে।</small>
            </div>

            {canViewCost ? (
              <div className="live-field">
                <label htmlFor="pkg-upstream">Upstream Cost (৳)</label>
                <input
                  id="pkg-upstream"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.upstreamPriceTaka}
                  onChange={(event) => update('upstreamPriceTaka', event.target.value)}
                  placeholder="200"
                />
                <small>Upstream প্যানেলের cost।</small>
              </div>
            ) : null}

            <div className="live-field">
              <label htmlFor="pkg-cbp">CBP (৳)</label>
              <input
                id="pkg-cbp"
                type="number"
                min="0"
                step="0.01"
                value={form.cbpTaka}
                onChange={(event) => update('cbpTaka', event.target.value)}
                placeholder="0"
              />
              <small>Sub-PoP base price (ঐচ্ছিক)।</small>
            </div>
          </div>

          {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="live-form-actions">
            <button className="demo-btn" type="button" onClick={onClose}>
              বাতিল
            </button>
            <button className="demo-btn primary" type="submit" disabled={submitting}>
              <Icon name="check" size={14} />
              {submitting ? 'সেভ হচ্ছে…' : mode === 'add' ? 'প্যাকেজ তৈরি করুন' : 'আপডেট করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
