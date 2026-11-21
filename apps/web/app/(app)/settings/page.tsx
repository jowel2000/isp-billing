'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type {
  AutoRechargeSettings,
  PaymentSettings,
  SmsSettings,
  TaxSettings,
} from '@/lib/live-api';
import {
  getAutoRechargeSettings,
  getPaymentSettings,
  getSmsSettings,
  getTaxSettings,
  updateAutoRechargeSettings,
  updatePaymentSettings,
  updateSmsSettings,
  updateTaxSettings,
} from '@/lib/live-api';

export default function LiveSettingsPage() {
  const { user } = useLiveAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const [tax, setTax] = useState<TaxSettings | null>(null);
  const [payment, setPayment] = useState<PaymentSettings | null>(null);
  const [sms, setSms] = useState<SmsSettings | null>(null);
  const [auto, setAuto] = useState<AutoRechargeSettings | null>(null);

  const [taxForm, setTaxForm] = useState({
    enabled: false,
    rate: '5',
    inclusive: false,
    label: 'VAT',
  });
  const [payForm, setPayForm] = useState({
    merchantNumber: '',
    label: 'bKash Merchant',
    instructions: '',
    isActive: false,
  });
  const [smsForm, setSmsForm] = useState({
    provider: '',
    apiEndpoint: '',
    apiKey: '',
    senderId: '',
    isActive: false,
  });
  const [autoForm, setAutoForm] = useState({
    enabled: false,
    thresholdTaka: '0',
  });

  const canTax = user?.permissions.includes('settings.tax') ?? false;
  const canPayment = user?.permissions.includes('settings.payment') ?? false;
  const canSms = user?.permissions.includes('settings.sms') ?? false;
  const canAuto = user?.permissions.includes('auto_recharge.toggle') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      canTax ? getTaxSettings() : Promise.resolve(null),
      canPayment ? getPaymentSettings() : Promise.resolve([]),
      canSms ? getSmsSettings() : Promise.resolve([]),
      canAuto ? getAutoRechargeSettings() : Promise.resolve(null),
    ]);

    if (results[0].status === 'fulfilled' && results[0].value) {
      const data = results[0].value as TaxSettings;
      setTax(data);
      setTaxForm({
        enabled: data.enabled,
        rate: String(data.rateBps / 100),
        inclusive: data.inclusive,
        label: data.label,
      });
    }

    if (results[1].status === 'fulfilled') {
      const list = results[1].value as PaymentSettings[];
      const bkash = list.find((item) => item.type === 'bkash') ?? list[0] ?? null;
      setPayment(bkash);
      if (bkash) {
        setPayForm({
          merchantNumber: bkash.merchantNumber ?? '',
          label: bkash.label ?? 'bKash Merchant',
          instructions: bkash.instructions ?? '',
          isActive: bkash.isActive,
        });
      }
    }

    if (results[2].status === 'fulfilled') {
      const list = results[2].value as SmsSettings[];
      const first = list[0] ?? null;
      setSms(first);
      if (first) {
        setSmsForm({
          provider: first.provider,
          apiEndpoint: first.apiEndpoint ?? '',
          apiKey: '',
          senderId: first.senderId ?? '',
          isActive: first.isActive,
        });
      }
    }

    if (results[3].status === 'fulfilled' && results[3].value) {
      const data = results[3].value as AutoRechargeSettings;
      setAuto(data);
      setAutoForm({
        enabled: data.enabled,
        thresholdTaka: String(data.approvalThresholdPaisa / 100),
      });
    }

    setLoading(false);
  }, [canTax, canPayment, canSms, canAuto]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTax() {
    setSaving('tax');
    try {
      const updated = await updateTaxSettings({
        enabled: taxForm.enabled,
        rateBps: Math.round(Number(taxForm.rate || 0) * 100),
        inclusive: taxForm.inclusive,
        label: taxForm.label || 'VAT',
      });
      setTax(updated);
      setToast({ message: 'VAT সেটিংস সেভ হয়েছে।' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'সেভ হয়নি', error: true });
    } finally {
      setSaving('');
    }
  }

  async function savePayment() {
    setSaving('payment');
    try {
      const updated = await updatePaymentSettings({
        ...(payForm.merchantNumber ? { merchantNumber: payForm.merchantNumber } : {}),
        label: payForm.label,
        instructions: payForm.instructions,
        isActive: payForm.isActive,
      });
      setPayment(updated);
      setToast({ message: 'bKash সেটিংস সেভ হয়েছে।' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'সেভ হয়নি', error: true });
    } finally {
      setSaving('');
    }
  }

  async function saveSms() {
    setSaving('sms');
    try {
      const updated = await updateSmsSettings({
        provider: smsForm.provider || 'BulkSMS',
        ...(smsForm.apiEndpoint ? { apiEndpoint: smsForm.apiEndpoint } : {}),
        ...(smsForm.apiKey ? { apiKey: smsForm.apiKey } : {}),
        ...(smsForm.senderId ? { senderId: smsForm.senderId } : {}),
        isActive: smsForm.isActive,
      });
      setSms(updated);
      setSmsForm((current) => ({ ...current, apiKey: '' }));
      setToast({ message: 'SMS সেটিংস সেভ হয়েছে।' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'সেভ হয়নি', error: true });
    } finally {
      setSaving('');
    }
  }

  async function saveAuto() {
    setSaving('auto');
    try {
      const updated = await updateAutoRechargeSettings({
        enabled: autoForm.enabled,
        approvalThresholdPaisa: Math.round(Number(autoForm.thresholdTaka || 0) * 100),
      });
      setAuto(updated);
      setToast({ message: 'Auto-recharge সেটিংস সেভ হয়েছে।' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'সেভ হয়নি', error: true });
    } finally {
      setSaving('');
    }
  }

  const noPermission = !canTax && !canPayment && !canSms && !canAuto;

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>সেটিংস</h2>
          <p className="demo-page-sub">
            bKash, VAT, SMS ও auto-recharge — শুধু Super Admin
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      {noPermission ? (
        <div className="demo-note">
          <strong>Permission নেই:</strong> এই সেটিংস দেখতে Super Admin permission
          প্রয়োজন।
        </div>
      ) : null}

      {loading ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            সেটিংস লোড হচ্ছে…
          </div>
        </div>
      ) : (
        <section className="demo-settings-grid">
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            {canTax ? (
              <article className="demo-card">
                <div className="demo-card-head">
                  <div>
                    <h3>VAT / ট্যাক্স</h3>
                    <p>ইনভয়েসে {taxForm.rate}% VAT</p>
                  </div>
                  <span className={`demo-badge ${taxForm.enabled ? 'green' : 'gray'}`}>
                    {taxForm.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div className="demo-form">
                  <label className="demo-toggle-row">
                    <div>
                      <strong>VAT চালু</strong>
                      <small>বন্ধ থাকলে invoice-এ VAT লাইন দেখাবে না।</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={taxForm.enabled}
                      onChange={(event) =>
                        setTaxForm((current) => ({ ...current, enabled: event.target.checked }))
                      }
                      style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
                    />
                  </label>

                  <div className="live-form-grid">
                    <div className="live-field">
                      <label htmlFor="tax-rate">Rate (%)</label>
                      <input
                        id="tax-rate"
                        type="number"
                        min="0"
                        step="0.01"
                        value={taxForm.rate}
                        onChange={(event) =>
                          setTaxForm((current) => ({ ...current, rate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="live-field">
                      <label htmlFor="tax-type">Calculation</label>
                      <select
                        id="tax-type"
                        value={taxForm.inclusive ? 'inclusive' : 'exclusive'}
                        onChange={(event) =>
                          setTaxForm((current) => ({
                            ...current,
                            inclusive: event.target.value === 'inclusive',
                          }))
                        }
                      >
                        <option value="exclusive">Exclusive</option>
                        <option value="inclusive">Inclusive</option>
                      </select>
                    </div>
                    <div className="live-field">
                      <label htmlFor="tax-label">Label</label>
                      <input
                        id="tax-label"
                        value={taxForm.label}
                        onChange={(event) =>
                          setTaxForm((current) => ({ ...current, label: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="live-form-actions">
                    <button
                      className="demo-btn primary"
                      type="button"
                      onClick={saveTax}
                      disabled={saving === 'tax'}
                    >
                      <Icon name="check" size={14} />
                      {saving === 'tax' ? 'সেভ হচ্ছে…' : 'VAT সেভ করুন'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            {canPayment ? (
              <article className="demo-card">
                <div className="demo-card-head">
                  <div>
                    <h3>পেমেন্ট গেটওয়ে</h3>
                    <p>bKash merchant number</p>
                  </div>
                  <span className={`demo-badge ${payForm.isActive ? 'green' : 'gray'}`}>
                    {payForm.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="demo-form">
                  <div className="live-field">
                    <label htmlFor="pay-merchant">bKash Merchant Number</label>
                    <input
                      id="pay-merchant"
                      value={payForm.merchantNumber}
                      onChange={(event) =>
                        setPayForm((current) => ({
                          ...current,
                          merchantNumber: event.target.value,
                        }))
                      }
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <div className="live-field">
                    <label htmlFor="pay-label">Display Label</label>
                    <input
                      id="pay-label"
                      value={payForm.label}
                      onChange={(event) =>
                        setPayForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </div>
                  <div className="live-field">
                    <label htmlFor="pay-instructions">Instructions</label>
                    <textarea
                      id="pay-instructions"
                      rows={3}
                      value={payForm.instructions}
                      onChange={(event) =>
                        setPayForm((current) => ({
                          ...current,
                          instructions: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <label className="demo-toggle-row">
                    <div>
                      <strong>গেটওয়ে চালু</strong>
                      <small>বন্ধ থাকলে ক্লায়েন্ট portal-এ bKash অপশন দেখাবে না।</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={payForm.isActive}
                      onChange={(event) =>
                        setPayForm((current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                      style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
                    />
                  </label>
                  <div className="live-form-actions">
                    <button
                      className="demo-btn primary"
                      type="button"
                      onClick={savePayment}
                      disabled={saving === 'payment'}
                    >
                      <Icon name="check" size={14} />
                      {saving === 'payment' ? 'সেভ হচ্ছে…' : 'bKash সেভ করুন'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            {canAuto ? (
              <article className="demo-card">
                <div className="demo-card-head">
                  <div>
                    <h3>অটো রিচার্জ</h3>
                    <p>Payment verify হলে upstream recharge</p>
                  </div>
                  <span className={`demo-badge ${autoForm.enabled ? 'green' : 'gray'}`}>
                    {autoForm.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div className="demo-form">
                  <label className="demo-toggle-row">
                    <div>
                      <strong>Global Auto-recharge</strong>
                      <small>Super Admin kill switch — যেকোনো সময় বন্ধ করা যাবে।</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoForm.enabled}
                      onChange={(event) =>
                        setAutoForm((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                      style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
                    />
                  </label>
                  <div className="live-field">
                    <label htmlFor="auto-threshold">Approval Threshold (৳)</label>
                    <input
                      id="auto-threshold"
                      type="number"
                      min="0"
                      step="0.01"
                      value={autoForm.thresholdTaka}
                      onChange={(event) =>
                        setAutoForm((current) => ({
                          ...current,
                          thresholdTaka: event.target.value,
                        }))
                      }
                    />
                    <small>০ = সব পেমেন্ট অটো। বেশি হলে approval লাগবে (ভবিষ্যতে)।</small>
                  </div>
                  <div className="live-form-actions">
                    <button
                      className="demo-btn primary"
                      type="button"
                      onClick={saveAuto}
                      disabled={saving === 'auto'}
                    >
                      <Icon name="check" size={14} />
                      {saving === 'auto' ? 'সেভ হচ্ছে…' : 'Auto-recharge সেভ করুন'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            {canSms ? (
              <article className="demo-card">
                <div className="demo-card-head">
                  <div>
                    <h3>SMS গেটওয়ে</h3>
                    <p>{sms?.hasApiKey ? 'API key সংরক্ষিত' : 'এখনো configure হয়নি'}</p>
                  </div>
                  <span className={`demo-badge ${smsForm.isActive ? 'green' : 'gray'}`}>
                    {smsForm.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="demo-form">
                  <div className="live-field">
                    <label htmlFor="sms-provider">Provider *</label>
                    <input
                      id="sms-provider"
                      value={smsForm.provider}
                      onChange={(event) =>
                        setSmsForm((current) => ({
                          ...current,
                          provider: event.target.value,
                        }))
                      }
                      placeholder="BulkSMSBD / SSLWireless"
                    />
                  </div>
                  <div className="live-field">
                    <label htmlFor="sms-endpoint">API Endpoint</label>
                    <input
                      id="sms-endpoint"
                      value={smsForm.apiEndpoint}
                      onChange={(event) =>
                        setSmsForm((current) => ({
                          ...current,
                          apiEndpoint: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div className="live-field">
                    <label htmlFor="sms-key">API Key</label>
                    <input
                      id="sms-key"
                      type="password"
                      value={smsForm.apiKey}
                      onChange={(event) =>
                        setSmsForm((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                      placeholder={sms?.hasApiKey ? 'পরিবর্তন না করলে খালি' : 'API key'}
                    />
                  </div>
                  <div className="live-field">
                    <label htmlFor="sms-sender">Sender ID</label>
                    <input
                      id="sms-sender"
                      value={smsForm.senderId}
                      onChange={(event) =>
                        setSmsForm((current) => ({
                          ...current,
                          senderId: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <label className="demo-toggle-row">
                    <div>
                      <strong>SMS চালু</strong>
                      <small>Invoice ও due reminder পাঠানোর জন্য।</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={smsForm.isActive}
                      onChange={(event) =>
                        setSmsForm((current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                      style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
                    />
                  </label>
                  <div className="live-form-actions">
                    <button
                      className="demo-btn primary"
                      type="button"
                      onClick={saveSms}
                      disabled={saving === 'sms'}
                    >
                      <Icon name="check" size={14} />
                      {saving === 'sms' ? 'সেভ হচ্ছে…' : 'SMS সেভ করুন'}
                    </button>
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      )}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
