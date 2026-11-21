'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { ApiClient, ApiInvoice } from '@/lib/live-api';
import { createPayment, formatPaisa, getInvoices } from '@/lib/live-api';
import { Icon } from './icon';

interface ManualPaymentModalProps {
  clients: ApiClient[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ManualPaymentModal({ clients, onClose, onSaved }: ManualPaymentModalProps) {
  const [clientId, setClientId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [method, setMethod] = useState<'cash' | 'bkash'>('cash');
  const [amountTaka, setAmountTaka] = useState('');
  const [trxId, setTrxId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setInvoices([]);
      setInvoiceId('');
      return;
    }

    let active = true;
    setLoadingInvoices(true);
    getInvoices({ clientId, status: 'due', limit: 50 })
      .then((result) => {
        if (active) setInvoices(result.data);
      })
      .catch(() => {
        if (active) setInvoices([]);
      })
      .finally(() => {
        if (active) setLoadingInvoices(false);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  function onInvoiceChange(value: string) {
    setInvoiceId(value);
    const invoice = invoices.find((item) => item.id === value);
    if (invoice) setAmountTaka(String(invoice.dueAmount / 100));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const amountPaisa = Math.round(Number(amountTaka) * 100);
      if (!clientId) throw new Error('ক্লায়েন্ট নির্বাচন করুন');
      if (!amountPaisa || amountPaisa <= 0) throw new Error('সঠিক পরিমাণ দিন');

      const finalTrxId =
        trxId.trim() || (method === 'cash' ? `CASH-${Date.now().toString().slice(-8)}` : '');
      if (!finalTrxId) throw new Error('bKash Trx ID দিন');

      await createPayment({
        clientId,
        ...(invoiceId ? { invoiceId } : {}),
        method,
        amountPaisa,
        trxId: finalTrxId,
        ...(senderNumber ? { senderNumber } : {}),
        paidAt: new Date().toISOString(),
      });

      onSaved('পেমেন্ট রেকর্ড হয়েছে — এখন verification-এ আছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'পেমেন্ট রেকর্ড করা যায়নি');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="live-modal-backdrop" onMouseDown={onClose}>
      <div className="live-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="live-modal-head">
          <div>
            <h3>ক্যাশ / ম্যানুয়াল পেমেন্ট</h3>
            <p>পেমেন্ট pending হিসেবে সেভ হবে; এরপর verify করতে হবে।</p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="live-form-grid">
            <div className="live-field full">
              <label htmlFor="pay-client">ক্লায়েন্ট *</label>
              <select
                id="pay-client"
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setInvoiceId('');
                  setAmountTaka('');
                }}
                required
              >
                <option value="">— ক্লায়েন্ট নির্বাচন করুন —</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.publicId} · {client.mobile}
                  </option>
                ))}
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="pay-method">মেথড</label>
              <select
                id="pay-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as 'cash' | 'bkash')}
              >
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="pay-invoice">ইনভয়েস (ঐচ্ছিক)</label>
              <select
                id="pay-invoice"
                value={invoiceId}
                onChange={(event) => onInvoiceChange(event.target.value)}
                disabled={!clientId || loadingInvoices}
              >
                <option value="">
                  {loadingInvoices ? 'লোড হচ্ছে…' : '— কোনো invoice নেই —'}
                </option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} · {formatPaisa(invoice.dueAmount)} due
                  </option>
                ))}
              </select>
            </div>

            <div className="live-field">
              <label htmlFor="pay-amount">পরিমাণ (৳) *</label>
              <input
                id="pay-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amountTaka}
                onChange={(event) => setAmountTaka(event.target.value)}
                required
              />
            </div>

            <div className="live-field">
              <label htmlFor="pay-trx">Trx ID {method === 'bkash' ? '*' : ''}</label>
              <input
                id="pay-trx"
                value={trxId}
                onChange={(event) => setTrxId(event.target.value)}
                placeholder={method === 'cash' ? 'খালি রাখলে auto-generate হবে' : 'bKash Trx ID'}
                required={method === 'bkash'}
              />
            </div>

            <div className="live-field">
              <label htmlFor="pay-sender">Sender Number</label>
              <input
                id="pay-sender"
                value={senderNumber}
                onChange={(event) => setSenderNumber(event.target.value)}
                placeholder="01XXXXXXXXX"
              />
            </div>
          </div>

          {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="live-form-actions">
            <button className="demo-btn" type="button" onClick={onClose}>
              বাতিল
            </button>
            <button className="demo-btn primary" type="submit" disabled={submitting}>
              <Icon name="check" size={14} />
              {submitting ? 'সেভ হচ্ছে…' : 'পেমেন্ট রেকর্ড করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
