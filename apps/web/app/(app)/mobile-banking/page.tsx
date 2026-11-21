'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type { PaymentSettings } from '@/lib/live-api';
import { getPaymentSettings, updatePaymentSettings } from '@/lib/live-api';

const PROVIDERS = [
  { type: 'bkash', label: 'bKash' },
  { type: 'nagad', label: 'Nagad' },
  { type: 'rocket', label: 'Rocket' },
] as const;

type ProviderType = (typeof PROVIDERS)[number]['type'];

interface ProviderForm {
  id?: string;
  isActive: boolean;
  merchantNumber: string;
  merchantLabel: string;
  merchantInstructions: string;
  merchantActive: boolean;
  personalNumber: string;
  personalLabel: string;
  personalInstructions: string;
  personalActive: boolean;
}

function emptyForm(label: string): ProviderForm {
  return {
    isActive: false,
    merchantNumber: '',
    merchantLabel: `${label} Merchant`,
    merchantInstructions: 'Send Money / Payment করে reference submit করুন।',
    merchantActive: false,
    personalNumber: '',
    personalLabel: `${label} Personal`,
    personalInstructions: 'Send Money করে reference submit করুন।',
    personalActive: false,
  };
}

export default function MobileBankingPage() {
  const { user } = useLiveAuth();
  const [forms, setForms] = useState<Record<string, ProviderForm>>(() =>
    Object.fromEntries(PROVIDERS.map((provider) => [provider.type, emptyForm(provider.label)])),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canManage = user?.permissions.includes('settings.payment') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const gateways = await getPaymentSettings();
      setForms((current) => {
        const next = { ...current };
        for (const provider of PROVIDERS) {
          const found = gateways.find((gateway) => gateway.type === provider.type);
          if (found) next[provider.type] = fromGateway(found);
        }
        return next;
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'সেটিংস লোড করা যায়নি',
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateForm(type: string, patch: Partial<ProviderForm>) {
    setForms((current) => ({
      ...current,
      [type]: { ...current[type], ...patch },
    }));
  }

  async function save(type: ProviderType) {
    setSaving(type);
    try {
      const form = forms[type];
      const updated = await updatePaymentSettings({
        type,
        isActive: form.isActive,
        merchantNumber: form.merchantNumber,
        merchantLabel: form.merchantLabel,
        merchantInstructions: form.merchantInstructions,
        merchantActive: form.merchantActive,
        personalNumber: form.personalNumber,
        personalLabel: form.personalLabel,
        personalInstructions: form.personalInstructions,
        personalActive: form.personalActive,
      });
      setForms((current) => ({ ...current, [type]: fromGateway(updated) }));
      setToast({ message: `${labelOf(type)} সেটিংস সেভ হয়েছে।` });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'সেভ করা যায়নি',
        error: true,
      });
    } finally {
      setSaving('');
    }
  }

  if (!canManage) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Mobile Banking সেটিংস দেখতে Super Admin
        permission প্রয়োজন।
      </div>
    );
  }

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Mobile Banking</h2>
          <p className="demo-page-sub">
            bKash, Nagad, Rocket — Merchant ও Personal নম্বর, আলাদা ON/OFF
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      <div className="demo-note">
        <strong>নিয়ম:</strong> Merchant = API/অটো পেমেন্ট ও ম্যানুয়াল Payment। Personal
        = শুধু ম্যানুয়াল Send Money। Client portal-এ শুধু active ও নম্বর দেওয়া
        অ্যাকাউন্ট দেখাবে।
      </div>

      {loading ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            Mobile Banking সেটিংস লোড হচ্ছে…
          </div>
        </div>
      ) : (
        <section style={{ display: 'grid', gap: 14 }}>
          {PROVIDERS.map((provider) => {
            const form = forms[provider.type];
            return (
              <article className="demo-card" key={provider.type}>
                <div className="demo-card-head">
                  <div>
                    <h3>{provider.label}</h3>
                    <p>Merchant + Personal account configuration</p>
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: '#475569',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) =>
                        updateForm(provider.type, { isActive: event.target.checked })
                      }
                      style={{ width: 17, height: 17, accentColor: '#f59e0b' }}
                    />
                    Provider চালু
                  </label>
                </div>

                <div className="demo-grid-2 equal">
                  <div className="demo-form">
                    <div className="demo-card-head" style={{ marginBottom: 0 }}>
                      <div>
                        <h3 style={{ fontSize: '0.8rem' }}>Merchant</h3>
                        <p>API / অটো ও ম্যানুয়াল Payment</p>
                      </div>
                      <label style={{ fontSize: 11, color: '#64748b' }}>
                        <input
                          type="checkbox"
                          checked={form.merchantActive}
                          onChange={(event) =>
                            updateForm(provider.type, {
                              merchantActive: event.target.checked,
                            })
                          }
                          style={{ accentColor: '#f59e0b' }}
                        />{' '}
                        Active
                      </label>
                    </div>

                    <div className="live-field">
                      <label>Merchant Number</label>
                      <input
                        value={form.merchantNumber}
                        onChange={(event) =>
                          updateForm(provider.type, {
                            merchantNumber: event.target.value,
                          })
                        }
                        placeholder="01XXXXXXXXX"
                      />
                    </div>
                    <div className="live-field">
                      <label>Label</label>
                      <input
                        value={form.merchantLabel}
                        onChange={(event) =>
                          updateForm(provider.type, { merchantLabel: event.target.value })
                        }
                      />
                    </div>
                    <div className="live-field">
                      <label>Instructions</label>
                      <textarea
                        rows={2}
                        value={form.merchantInstructions}
                        onChange={(event) =>
                          updateForm(provider.type, {
                            merchantInstructions: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="demo-form">
                    <div className="demo-card-head" style={{ marginBottom: 0 }}>
                      <div>
                        <h3 style={{ fontSize: '0.8rem' }}>Personal</h3>
                        <p>Send Money (manual verification)</p>
                      </div>
                      <label style={{ fontSize: 11, color: '#64748b' }}>
                        <input
                          type="checkbox"
                          checked={form.personalActive}
                          onChange={(event) =>
                            updateForm(provider.type, {
                              personalActive: event.target.checked,
                            })
                          }
                          style={{ accentColor: '#f59e0b' }}
                        />{' '}
                        Active
                      </label>
                    </div>

                    <div className="live-field">
                      <label>Personal Number</label>
                      <input
                        value={form.personalNumber}
                        onChange={(event) =>
                          updateForm(provider.type, {
                            personalNumber: event.target.value,
                          })
                        }
                        placeholder="01XXXXXXXXX"
                      />
                    </div>
                    <div className="live-field">
                      <label>Label</label>
                      <input
                        value={form.personalLabel}
                        onChange={(event) =>
                          updateForm(provider.type, { personalLabel: event.target.value })
                        }
                      />
                    </div>
                    <div className="live-field">
                      <label>Instructions</label>
                      <textarea
                        rows={2}
                        value={form.personalInstructions}
                        onChange={(event) =>
                          updateForm(provider.type, {
                            personalInstructions: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="live-form-actions">
                  <button
                    className="demo-btn primary"
                    type="button"
                    onClick={() => save(provider.type)}
                    disabled={saving === provider.type}
                  >
                    <Icon name="check" size={14} />
                    {saving === provider.type ? 'সেভ হচ্ছে…' : `${provider.label} সেভ করুন`}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}

function labelOf(type: string) {
  return PROVIDERS.find((provider) => provider.type === type)?.label ?? type;
}

function fromGateway(gateway: PaymentSettings): ProviderForm {
  return {
    id: gateway.id,
    isActive: gateway.isActive,
    merchantNumber: gateway.merchantNumber ?? '',
    merchantLabel: gateway.label ?? '',
    merchantInstructions: gateway.instructions ?? '',
    merchantActive: gateway.merchantActive,
    personalNumber: gateway.personalNumber ?? '',
    personalLabel: gateway.personalLabel ?? '',
    personalInstructions: gateway.personalInstructions ?? '',
    personalActive: gateway.personalActive,
  };
}
