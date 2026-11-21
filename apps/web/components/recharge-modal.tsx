'use client';

import { useEffect, useState } from 'react';
import type { ApiClient, ApiInvoice, ApiPayment } from '@/lib/live-api';
import {
  createPayment,
  formatPaisa,
  getClients,
  getInvoices,
  matchPayment,
  verifyPayment,
} from '@/lib/live-api';
import { Icon } from './icon';

interface RechargeModalProps {
  client?: ApiClient | null;
  payment?: ApiPayment | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function RechargeModal({ client, payment, onClose, onSaved }: RechargeModalProps) {
  const [selectedClient, setSelectedClient] = useState<ApiClient | null>(client ?? null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ApiClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [invoiceId, setInvoiceId] = useState(payment?.invoiceId ?? '');
  const [amountTaka, setAmountTaka] = useState(
    payment ? String(payment.amount / 100) : '',
  );
  const [method, setMethod] = useState<'cash' | 'bkash'>('cash');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedClient) {
      setInvoices([]);
      return;
    }

    let active = true;
    getInvoices({ clientId: selectedClient.id, status: 'due', limit: 20 })
      .then((result) => {
        if (!active) return;
        setInvoices(result.data);
        if (!payment) {
          const first = result.data[0];
          if (first) {
            setInvoiceId(first.id);
            setAmountTaka(String(first.dueAmount / 100));
          } else {
            const fallback =
              selectedClient.billingProfile?.monthlyAmountOverride ??
              selectedClient.subscriptions?.[0]?.package?.localPrice ??
              0;
            setAmountTaka(fallback ? String(fallback / 100) : '');
          }
        } else if (payment.invoiceId) {
          setInvoiceId(payment.invoiceId);
        }
      })
      .catch(() => {
        if (active) setInvoices([]);
      });

    return () => {
      active = false;
    };
  }, [selectedClient, payment]);

  async function searchClients() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const result = await getClients({ search: search.trim(), limit: 20 });
      setResults(result.data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pickClient(value: ApiClient) {
    setSelectedClient(value);
    setResults([]);
    setSearch('');
    setError('');
  }

  function onInvoiceChange(value: string) {
    setInvoiceId(value);
    if (!payment) {
      const invoice = invoices.find((item) => item.id === value);
      if (invoice) setAmountTaka(String(invoice.dueAmount / 100));
    }
  }

  async function onConfirm() {
    if (!selectedClient) {
      setError('আগে ক্লায়েন্ট নির্বাচন করুন');
      return;
    }

    const amountPaisa = Math.round(Number(amountTaka || 0) * 100);
    if (!amountPaisa || amountPaisa <= 0) {
      setError('সঠিক recharge amount দিন');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (payment) {
        await matchPayment(payment.id, invoiceId || undefined, selectedClient.id);
        await verifyPayment(payment.id);
        onSaved(
          `${selectedClient.name}-এর wrong-reference payment match ও recharge হয়েছে।`,
        );
      } else {
        const created = await createPayment({
          clientId: selectedClient.id,
          ...(invoiceId ? { invoiceId } : {}),
          method,
          amountPaisa,
          referenceCode: selectedClient.paymentCode ?? selectedClient.publicId,
        });
        await verifyPayment(created.id);
        onSaved(`${selectedClient.name}-এর manual recharge সম্পন্ন হয়েছে।`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recharge করা যায়নি');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="live-modal-backdrop" onMouseDown={onClose}>
      <div className="live-modal wide" onMouseDown={(event) => event.stopPropagation()}>
        <div className="live-modal-head">
          <div>
            <h3>Recharge</h3>
            <p>
              {payment
                ? 'Wrong-reference payment সঠিক ক্লায়েন্টে apply করুন'
                : 'ক্লায়েন্ট সার্চ করে manual recharge করুন'}
            </p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        {payment ? (
          <div className="demo-note" style={{ marginBottom: 14 }}>
            <strong>Wrong-reference payment:</strong> {formatPaisa(payment.amount)} ·{' '}
            {payment.provider} / {payment.accountType} · Ref {payment.referenceCode ?? '—'}{' '}
            · Sender {payment.senderNumber ?? '—'}
          </div>
        ) : null}

        {!selectedClient ? (
          <div style={{ marginBottom: 14 }}>
            <div className="live-form-grid">
              <div className="live-field full">
                <label htmlFor="recharge-search">
                  ক্লায়েন্ট সার্চ (নাম / মোবাইল / ৪-ডিজিট User ID)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="recharge-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') searchClients();
                    }}
                    placeholder="যেমন Rahim / 017... / 1234"
                  />
                  <button
                    className="demo-btn"
                    type="button"
                    onClick={searchClients}
                    disabled={searching}
                  >
                    <Icon name="search" size={14} />
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            {results.length > 0 ? (
              <div className="demo-table-wrap" style={{ marginTop: 10 }}>
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>User ID</th>
                      <th>Area</th>
                      <th>Package</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="demo-cell-main">{item.name}</span>
                          <span className="demo-cell-sub">{item.mobile}</span>
                        </td>
                        <td className="mono">{item.paymentCode ?? '—'}</td>
                        <td>{item.area?.name ?? '—'}</td>
                        <td>{item.subscriptions?.[0]?.package?.name ?? '—'}</td>
                        <td>
                          <button
                            className="demo-btn primary sm"
                            type="button"
                            onClick={() => pickClient(item)}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className="demo-note"
              style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}
            >
              <span>
                <strong>{selectedClient.name}</strong> · {selectedClient.publicId} · User ID{' '}
                {selectedClient.paymentCode ?? '—'}
              </span>
              {!client ? (
                <button
                  className="demo-btn sm"
                  type="button"
                  onClick={() => setSelectedClient(null)}
                >
                  Change
                </button>
              ) : null}
            </div>

            <div className="live-form-grid">
              <div className="live-field">
                <label htmlFor="recharge-invoice">Invoice (ঐচ্ছিক)</label>
                <select
                  id="recharge-invoice"
                  value={invoiceId}
                  onChange={(event) => onInvoiceChange(event.target.value)}
                >
                  <option value="">— invoice নেই / advance —</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} · {formatPaisa(invoice.dueAmount)} due
                    </option>
                  ))}
                </select>
              </div>

              <div className="live-field">
                <label htmlFor="recharge-amount">Amount (৳)</label>
                <input
                  id="recharge-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountTaka}
                  onChange={(event) => setAmountTaka(event.target.value)}
                  readOnly={Boolean(payment)}
                />
                {payment ? <small>Wrong-reference payment-এর amount fixed</small> : null}
              </div>

              {!payment ? (
                <div className="live-field">
                  <label htmlFor="recharge-method">Payment Method</label>
                  <select
                    id="recharge-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value as 'cash' | 'bkash')}
                  >
                    <option value="cash">Cash</option>
                    <option value="bkash">bKash</option>
                  </select>
                </div>
              ) : null}
            </div>
          </>
        )}

        {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

        <div className="live-form-actions">
          <button className="demo-btn" type="button" onClick={onClose}>
            বাতিল
          </button>
          <button
            className="demo-btn primary"
            type="button"
            onClick={onConfirm}
            disabled={saving || !selectedClient}
          >
            <Icon name="check" size={14} />
            {saving ? 'Recharge হচ্ছে…' : 'Confirm Recharge'}
          </button>
        </div>
      </div>
    </div>
  );
}
