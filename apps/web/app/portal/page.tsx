'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type {
  ApiInvoice,
  ApiPayment,
  PortalPaymentAccount,
  PortalPaymentMethods,
  PortalSummary,
} from '@/lib/live-api';
import {
  displayStatus,
  formatDate,
  formatDateTime,
  formatPaisa,
  getPortalInvoices,
  getPortalPaymentMethods,
  getPortalPayments,
  getPortalSummary,
  statusTone,
  submitPortalPayment,
} from '@/lib/live-api';

export default function ClientPortalPage() {
  const { user } = useLiveAuth();
  const [summary, setSummary] = useState<PortalSummary | null>(null);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [methods, setMethods] = useState<PortalPaymentMethods | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [payInvoice, setPayInvoice] = useState<ApiInvoice | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [sender, setSender] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      getPortalSummary(),
      getPortalInvoices(),
      getPortalPayments(),
      getPortalPaymentMethods(),
    ]);

    if (results[0].status === 'fulfilled') {
      setSummary(results[0].value);
    } else {
      const reason =
        results[0].reason instanceof Error
          ? results[0].reason.message
          : 'এই অ্যাকাউন্টের সাথে কোনো ক্লায়েন্ট প্রোফাইল যুক্ত নেই।';
      setError(reason);
    }

    if (results[1].status === 'fulfilled') setInvoices(results[1].value);
    if (results[2].status === 'fulfilled') setPayments(results[2].value);
    if (results[3].status === 'fulfilled') setMethods(results[3].value);

    setLoading(false);
  }, [reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmitPayment() {
    if (!payInvoice) return;
    setPayError('');
    setPaying(true);

    try {
      const accounts = methods?.accounts ?? [];
      const account =
        accounts.find(
          (item) => `${item.provider}:${item.accountType}` === selectedAccount,
        ) ?? accounts[0];

      if (!account) throw new Error('কোনো active payment account নেই');

      await submitPortalPayment({
        invoiceId: payInvoice.id,
        amountPaisa: payInvoice.dueAmount,
        provider: account.provider,
        accountType: account.accountType,
        referenceCode: referenceCode.trim(),
        ...(sender.trim() ? { senderNumber: sender.trim() } : {}),
        paidAt: new Date().toISOString(),
      });

      setToast({
        message: 'পেমেন্ট জমা হয়েছে — Staff verify করার পর invoice paid হবে।',
      });
      setPayInvoice(null);
      setSender('');
      setReferenceCode('');
      setReloadKey((key) => key + 1);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'পেমেন্ট জমা করা যায়নি');
    } finally {
      setPaying(false);
    }
  }

  const client = summary?.client;
  const subscription = client?.subscriptions?.[0];
  const totalDue = summary?.totalDuePaisa ?? 0;
  const accounts = (methods?.accounts ?? []) as PortalPaymentAccount[];
  const available = accounts.length > 0;

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>আমার অ্যাকাউন্ট</h2>
          <p className="demo-page-sub">
            Due, invoice ও bKash পেমেন্ট — {user?.name ?? 'Client'}
          </p>
        </div>
        <div className="demo-actions">
          <button
            className="demo-btn ghost"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      {loading ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            আপনার তথ্য লোড হচ্ছে…
          </div>
        </div>
      ) : error ? (
        <div className="live-error">{error}</div>
      ) : client ? (
        <>
          <section className="demo-grid-2">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>Client Profile</h3>
                  <p>{client.publicId}</p>
                </div>
                <span className={`demo-badge ${statusTone(client.status)}`}>
                  {displayStatus(client.status)}
                </span>
              </div>
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <tbody>
                    <tr>
                      <td className="demo-cell-sub">Name</td>
                      <td className="demo-cell-main">{client.name}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">User ID (Reference)</td>
                      <td className="mono">{client.paymentCode ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Mobile</td>
                      <td>{client.mobile}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Area</td>
                      <td>{client.area?.name ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Package</td>
                      <td>{subscription?.package?.name ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Expiry</td>
                      <td>{formatDate(subscription?.expireAt)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">PPPoE Username</td>
                      <td className="mono">{client.pppoeUsername ?? '—'}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">IP Address</td>
                      <td className="mono">{client.ipAddress ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <article className="demo-card">
                <div className="demo-stat-top">
                  <div className="demo-stat-icon red">
                    <Icon name="wallet" size={19} />
                  </div>
                  <span className="demo-badge amber">Due</span>
                </div>
                <p className="demo-stat-label">Total Due</p>
                <p className="demo-stat-value">{formatPaisa(totalDue)}</p>
                <p className="demo-stat-hint">
                  {totalDue > 0 ? 'নিচের invoice থেকে পেমেন্ট করুন' : 'কোনো বাকি নেই ✅'}
                </p>
              </article>

              <article className="demo-card">
                <div className="demo-card-head">
                  <div>
                    <h3>bKash পেমেন্ট</h3>
                    <p>{available ? 'Merchant number' : 'এখনো চালু হয়নি'}</p>
                  </div>
                  <span className={`demo-badge ${available ? 'green' : 'gray'}`}>
                    {available ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {available ? (
                  <>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {accounts.map((account) => (
                        <div
                          key={`${account.provider}:${account.accountType}`}
                          style={{
                            padding: '8px 10px',
                            border: '1px solid #e6eaf2',
                            borderRadius: 9,
                            background: '#fbfcff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                              {account.provider} · {account.accountType}
                            </strong>
                            <span className="mono" style={{ fontSize: '0.7rem' }}>
                              {account.number}
                            </span>
                          </div>
                          {account.instructions ? (
                            <small style={{ color: '#94a3b8', fontSize: '0.6rem' }}>
                              {account.instructions}
                            </small>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="demo-note" style={{ marginTop: 10 }}>
                      Reference: <strong>{client.paymentCode ?? client.publicId}</strong>
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem' }}>
                    অ্যাডমিন এখনো bKash merchant number সেট করেনি।
                  </p>
                )}
              </article>
            </div>
          </section>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>আমার ইনভয়েস</h3>
                <p>{invoices.length} invoices</p>
              </div>
            </div>
            {invoices.length === 0 ? (
              <div className="live-empty">কোনো ইনভয়েস নেই।</div>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Due Date</th>
                      <th>Total</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="mono">{invoice.number}</td>
                        <td>{formatDate(invoice.dueDate)}</td>
                        <td>{formatPaisa(invoice.total)}</td>
                        <td className="amount">{formatPaisa(invoice.dueAmount)}</td>
                        <td>
                          <span className={`demo-badge ${statusTone(invoice.status)}`}>
                            {displayStatus(invoice.status)}
                          </span>
                        </td>
                        <td>
                          {invoice.dueAmount > 0 ? (
                            <button
                              className="demo-btn primary sm"
                              type="button"
                              disabled={!available}
                              onClick={() => {
                                setPayInvoice(invoice);
                                setSelectedAccount(
                                  accounts[0]
                                    ? `${accounts[0].provider}:${accounts[0].accountType}`
                                    : '',
                                );
                                setReferenceCode(client.paymentCode ?? '');
                                setSender('');
                                setPayError('');
                              }}
                            >
                              <Icon name="wallet" size={13} />
                              Pay
                            </button>
                          ) : (
                            <span className="live-table-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>পেমেন্ট হিস্ট্রি</h3>
                <p>সর্বশেষ {payments.length}টি</p>
              </div>
            </div>
            {payments.length === 0 ? (
              <div className="live-empty">এখনো কোনো পেমেন্ট নেই।</div>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Trx ID</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="mono">
                          {payment.trxId ?? payment.referenceCode ?? '—'}
                        </td>
                        <td>
                          <span className="demo-badge gray">
                            {payment.provider} · {payment.accountType}
                          </span>
                        </td>
                        <td className="amount">{formatPaisa(payment.amount)}</td>
                        <td>
                          <span className={`demo-badge ${statusTone(payment.status)}`}>
                            {displayStatus(payment.status)}
                          </span>
                        </td>
                        <td>{formatDateTime(payment.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      ) : null}

      {payInvoice ? (
        <div className="live-modal-backdrop" onMouseDown={() => setPayInvoice(null)}>
          <div
            className="live-modal"
            style={{ maxWidth: 520 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>bKash পেমেন্ট</h3>
                <p>{payInvoice.number} · Due {formatPaisa(payInvoice.dueAmount)}</p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setPayInvoice(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="live-form-grid">
              <div className="live-field full">
                <label htmlFor="portal-account">Payment Account</label>
                <select
                  id="portal-account"
                  value={selectedAccount}
                  onChange={(event) => setSelectedAccount(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option
                      key={`${account.provider}:${account.accountType}`}
                      value={`${account.provider}:${account.accountType}`}
                    >
                      {account.provider} · {account.accountType} · {account.number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="live-field full">
                <label htmlFor="portal-reference">Reference (আপনার ৪-ডিজিট User ID)</label>
                <input
                  id="portal-reference"
                  value={referenceCode}
                  onChange={(event) => setReferenceCode(event.target.value)}
                  placeholder="যেমন 1234"
                />
                <small>ভুল reference দিলে পেমেন্ট Review-এ যাবে।</small>
              </div>
              <div className="live-field">
                <label htmlFor="portal-amount">পরিমাণ (৳)</label>
                <input
                  id="portal-amount"
                  value={formatPaisa(payInvoice.dueAmount, false)}
                  readOnly
                />
              </div>
              <div className="live-field">
                <label htmlFor="portal-sender">Sender Number</label>
                <input
                  id="portal-sender"
                  value={sender}
                  onChange={(event) => setSender(event.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
            </div>

            <div className="demo-note" style={{ marginTop: 12 }}>
              <strong>Trx ID লাগবে না।</strong> উপরের নম্বরে Send Money করে শুধু
              reference (৪-ডিজিট User ID) ও sender number দিন। Invoice: {payInvoice.number}
            </div>

            {payError ? <div className="live-error" style={{ marginTop: 14 }}>{payError}</div> : null}

            <div className="live-form-actions">
              <button className="demo-btn" type="button" onClick={() => setPayInvoice(null)}>
                বাতিল
              </button>
              <button
                className="demo-btn primary"
                type="button"
                onClick={onSubmitPayment}
                disabled={paying || !available}
              >
                <Icon name="check" size={14} />
                {paying ? 'জমা হচ্ছে…' : 'পেমেন্ট জমা দিন'}
              </button>
            </div>
            <p className="live-reveal-note">
              পেমেন্ট pending থাকবে যতক্ষণ Staff Trx ID verify না করে। ভুল Trx দিলে
              Reject হবে এবং আবার submit করা যাবে।
            </p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
