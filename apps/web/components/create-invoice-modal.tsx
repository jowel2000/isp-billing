'use client';

import { FormEvent, useState } from 'react';
import type { ApiClient } from '@/lib/live-api';
import { createInvoice } from '@/lib/live-api';
import { Icon } from './icon';

interface CreateInvoiceModalProps {
  clients: ApiClient[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString().slice(0, 10);
}

export function CreateInvoiceModal({ clients, onClose, onSaved }: CreateInvoiceModalProps) {
  const [clientId, setClientId] = useState('');
  const [amountTaka, setAmountTaka] = useState('');
  const [discountTaka, setDiscountTaka] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (!clientId) throw new Error('ক্লায়েন্ট নির্বাচন করুন');

      const payload: Record<string, unknown> = {
        clientId,
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        notes: notes.trim() || undefined,
      };

      if (amountTaka) {
        const unitPricePaisa = Math.round(Number(amountTaka) * 100);
        if (!unitPricePaisa || unitPricePaisa <= 0) {
          throw new Error('সঠিক বিলের পরিমাণ দিন');
        }
        payload.items = [
          {
            description: 'Manual invoice',
            quantity: 1,
            unitPricePaisa,
          },
        ];
      }

      if (discountTaka) {
        payload.discountPaisa = Math.round(Number(discountTaka) * 100);
      }

      const invoice = await createInvoice(payload);
      onSaved(`ইনভয়েস ${invoice.number} তৈরি হয়েছে।`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ইনভয়েস তৈরি করা যায়নি');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="live-modal-backdrop" onMouseDown={onClose}>
      <div className="live-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="live-modal-head">
          <div>
            <h3>নতুন ইনভয়েস</h3>
            <p>
              পরিমাণ খালি রাখলে ক্লায়েন্টের monthly amount বা active package-এর দাম
              ব্যবহার হবে।
            </p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="live-form-grid">
            <div className="live-field full">
              <label htmlFor="inv-client">ক্লায়েন্ট *</label>
              <select
                id="inv-client"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
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
              <label htmlFor="inv-amount">বিলের পরিমাণ (৳)</label>
              <input
                id="inv-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountTaka}
                onChange={(event) => setAmountTaka(event.target.value)}
                placeholder="যেমন 250"
              />
              <small>খালি = package/monthly amount</small>
            </div>

            <div className="live-field">
              <label htmlFor="inv-discount">ডিসকাউন্ট (৳)</label>
              <input
                id="inv-discount"
                type="number"
                min="0"
                step="0.01"
                value={discountTaka}
                onChange={(event) => setDiscountTaka(event.target.value)}
                placeholder="0"
              />
            </div>

            <div className="live-field">
              <label htmlFor="inv-due">Due Date</label>
              <input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </div>

            <div className="live-field">
              <label htmlFor="inv-notes">নোট</label>
              <input
                id="inv-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ঐচ্ছিক"
              />
            </div>
          </div>

          <div className="demo-note" style={{ marginTop: 14 }}>
            VAT ৫% চালু থাকলে invoice-এ স্বয়ংক্রিয়ভাবে যোগ হবে। Rate invoice তৈরির সময়
            snapshot হবে।
          </div>

          {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="live-form-actions">
            <button className="demo-btn" type="button" onClick={onClose}>
              বাতিল
            </button>
            <button className="demo-btn primary" type="submit" disabled={submitting}>
              <Icon name="check" size={14} />
              {submitting ? 'তৈরি হচ্ছে…' : 'ইনভয়েস তৈরি করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
