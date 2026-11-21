'use client';

import { FormEvent, useState } from 'react';
import type { ApiArea, ApiClient, ApiPackage } from '@/lib/live-api';
import { createClient, formatPaisa, updateClient } from '@/lib/live-api';
import { Icon } from './icon';

interface ClientFormModalProps {
  mode: 'add' | 'edit';
  client?: ApiClient | null;
  areas: ApiArea[];
  packages: ApiPackage[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ClientFormModal({
  mode,
  client,
  areas,
  packages,
  onClose,
  onSaved,
}: ClientFormModalProps) {
  const initialMonthly =
    client?.billingProfile?.monthlyAmountOverride ??
    client?.subscriptions?.[0]?.package?.localPrice ??
    0;

  const [form, setForm] = useState({
    name: client?.name ?? '',
    mobile: client?.mobile ?? '',
    areaId: client?.area?.id ?? '',
    packageId: client?.subscriptions?.[0]?.package?.id ?? '',
    billingType: client?.billingType ?? 'prepaid',
    status: client?.status ?? 'active',
    monthlyAmountTaka: initialMonthly ? String(initialMonthly / 100) : '',
    dueDay: String(client?.billingProfile?.dueDay ?? 1),
    graceDays: String(client?.billingProfile?.graceDays ?? 3),
    pppoeUsername: client?.pppoeUsername ?? '',
    pppoePassword: '',
    nidNumber: '',
    autoRecharge: client?.billingProfile?.autoRecharge ?? false,
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
        mobile: form.mobile.trim(),
        billingType: form.billingType,
        dueDay: Number(form.dueDay) || 1,
        graceDays: Number(form.graceDays) || 3,
        autoRecharge: form.autoRecharge,
      };

      if (form.areaId) payload.areaId = form.areaId;
      if (mode === 'edit' && !form.areaId) payload.areaId = '';
      if (form.packageId) payload.packageId = form.packageId;
      if (form.pppoeUsername.trim()) payload.pppoeUsername = form.pppoeUsername.trim();
      if (form.pppoePassword) payload.pppoePassword = form.pppoePassword;
      if (form.nidNumber.trim()) payload.nidNumber = form.nidNumber.trim();
      if (form.monthlyAmountTaka) {
        payload.monthlyAmountPaisa = Math.round(Number(form.monthlyAmountTaka) * 100);
      }
      if (mode === 'edit') payload.status = form.status;

      if (mode === 'add') {
        const created = await createClient(payload);
        onSaved(`ক্লায়েন্ট তৈরি হয়েছে — ${created.publicId}`);
      } else if (client) {
        const updated = await updateClient(client.id, payload);
        onSaved(`ক্লায়েন্ট আপডেট হয়েছে — ${updated.publicId}`);
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
            <h3>{mode === 'add' ? 'নতুন ক্লায়েন্ট' : 'ক্লায়েন্ট এডিট'}</h3>
            <p>
              {mode === 'add'
                ? 'Client ID স্বয়ংক্রিয়ভাবে তৈরি হবে। PPPoE/NID এনক্রিপ্ট করে সেভ হবে।'
                : `${client?.publicId ?? ''} · খালি রাখলে পুরনো মান অপরিবর্তিত থাকবে।`}
            </p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="live-form-grid">
            <div className="live-field">
              <label htmlFor="name">নাম *</label>
              <input
                id="name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                required
                minLength={2}
              />
            </div>

            <div className="live-field">
              <label htmlFor="mobile">মোবাইল *</label>
              <input
                id="mobile"
                type="tel"
                value={form.mobile}
                onChange={(event) => update('mobile', event.target.value)}
                required
                pattern="01[0-9]{9}"
                placeholder="01XXXXXXXXX"
              />
            </div>

            <div className="live-field">
              <label htmlFor="area">এরিয়া</label>
              <select
                id="area"
                value={form.areaId}
                onChange={(event) => update('areaId', event.target.value)}
              >
                <option value="">— এরিয়া নির্বাচন করুন —</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="package">প্যাকেজ</label>
              <select
                id="package"
                value={form.packageId}
                onChange={(event) => update('packageId', event.target.value)}
              >
                <option value="">— প্যাকেজ নির্বাচন করুন —</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} · ৳{Math.round(pkg.localPrice / 100)}
                  </option>
                ))}
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="billingType">বিলিং টাইপ</label>
              <select
                id="billingType"
                value={form.billingType}
                onChange={(event) => update('billingType', event.target.value)}
              >
                <option value="prepaid">Prepaid</option>
                <option value="postpaid">Postpaid</option>
              </select>
            </div>

            {mode === 'edit' ? (
              <div className="live-field">
                <label htmlFor="status">স্ট্যাটাস</label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(event) => update('status', event.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="expired">Expired</option>
                  <option value="free">Free</option>
                  <option value="removed">Removed</option>
                </select>
              </div>
            ) : null}

            <div className="live-field">
              <label htmlFor="monthly">মাসিক বিল (৳)</label>
              <input
                id="monthly"
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyAmountTaka}
                onChange={(event) => update('monthlyAmountTaka', event.target.value)}
                placeholder="যেমন 250"
              />
              <small>খালি রাখলে প্যাকেজের দাম ব্যবহার হবে।</small>
              {form.monthlyAmountTaka ? (
                <small style={{ color: '#b45309' }}>
                  Daily rate ≈{' '}
                  {formatPaisa(
                    Math.ceil((Number(form.monthlyAmountTaka) * 100) / 30),
                  )}{' '}
                  · payment হলে দিন = ceil(amount ÷ daily rate)
                </small>
              ) : null}
            </div>

            <div className="live-field">
              <label htmlFor="pppoeUser">PPPoE Username</label>
              <input
                id="pppoeUser"
                value={form.pppoeUsername}
                onChange={(event) => update('pppoeUsername', event.target.value)}
                placeholder="user@isp"
              />
            </div>

            <div className="live-field">
              <label htmlFor="pppoePass">PPPoE Password</label>
              <input
                id="pppoePass"
                type="password"
                value={form.pppoePassword}
                onChange={(event) => update('pppoePassword', event.target.value)}
                placeholder={mode === 'edit' ? 'পরিবর্তন না করলে খালি' : 'পাসওয়ার্ড'}
              />
            </div>

            <div className="live-field">
              <label htmlFor="nid">NID নম্বর</label>
              <input
                id="nid"
                value={form.nidNumber}
                onChange={(event) => update('nidNumber', event.target.value)}
                placeholder={mode === 'edit' ? 'পরিবর্তন না করলে খালি' : 'NID নম্বর'}
              />
            </div>

            <div className="live-field">
              <label htmlFor="dueDay">Due Day</label>
              <input
                id="dueDay"
                type="number"
                min="1"
                max="28"
                value={form.dueDay}
                onChange={(event) => update('dueDay', event.target.value)}
              />
            </div>

            <div className="live-field">
              <label htmlFor="graceDays">Grace Days</label>
              <input
                id="graceDays"
                type="number"
                min="0"
                value={form.graceDays}
                onChange={(event) => update('graceDays', event.target.value)}
              />
            </div>

            <div className="live-field full">
              <label
                htmlFor="autoRecharge"
                style={{ display: 'flex', alignItems: 'center', gap: 9 }}
              >
                <input
                  id="autoRecharge"
                  type="checkbox"
                  checked={form.autoRecharge}
                  onChange={(event) => update('autoRecharge', event.target.checked)}
                  style={{ width: 'auto' }}
                />
                পেমেন্ট verify হলে অটো-রিচার্জ চালু
              </label>
              <small>
                Super Admin-এর global auto-recharge চালু থাকলেই কাজ করবে।
              </small>
            </div>
          </div>

          {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="live-form-actions">
            <button className="demo-btn" type="button" onClick={onClose}>
              বাতিল
            </button>
            <button className="demo-btn primary" type="submit" disabled={submitting}>
              <Icon name="check" size={14} />
              {submitting ? 'সেভ হচ্ছে…' : mode === 'add' ? 'ক্লায়েন্ট তৈরি করুন' : 'আপডেট করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
