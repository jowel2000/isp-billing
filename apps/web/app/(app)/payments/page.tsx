'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { ManualPaymentModal } from '@/components/manual-payment-modal';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiClient, ApiPayment } from '@/lib/live-api';
import {
  displayStatus,
  formatDateTime,
  formatPaisa,
  getClients,
  getCollectionReport,
  getPayments,
  refundPayment,
  rejectPayment,
  statusTone,
  verifyPayment,
} from '@/lib/live-api';

const LIMIT = 10;
const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
];

interface Summary {
  pending: number;
  verified: number;
  collected: number;
  rejected: number;
}

export default function LivePaymentsPage() {
  const { user } = useLiveAuth();
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<Summary>({
    pending: 0,
    verified: 0,
    collected: 0,
    rejected: 0,
  });
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiPayment | null>(null);
  const [rejecting, setRejecting] = useState<ApiPayment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canVerify = user?.permissions.includes('payments.verify') ?? false;
  const canReject = user?.permissions.includes('payments.reject') ?? false;
  const canRefund = user?.permissions.includes('payments.refund') ?? false;
  const canCollect = user?.permissions.includes('payments.collect') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    getClients({ limit: 100 })
      .then((result) => setClients(result.data))
      .catch(() => setClients([]));
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getPayments({
        page,
        limit: LIMIT,
        status: status || undefined,
        search: debouncedSearch || undefined,
      });
      setPayments(result.data);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'পেমেন্ট লিস্ট লোড করা যায়নি');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, reloadKey]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getPayments({ status: 'pending', limit: 1 }),
      getPayments({ status: 'verified', limit: 1 }),
      getCollectionReport(),
      getPayments({ status: 'rejected', limit: 1 }),
    ]).then((results) => {
      if (!active) return;
      const value = (index: number, fallback: any) => {
        const result = results[index];
        return result && result.status === 'fulfilled' ? result.value : fallback;
      };
      setSummary({
        pending: value(0, { total: 0 }).total ?? 0,
        verified: value(1, { total: 0 }).total ?? 0,
        collected: value(2, { totalPaisa: 0 }).totalPaisa ?? 0,
        rejected: value(3, { total: 0 }).total ?? 0,
      });
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function onVerify(payment: ApiPayment) {
    setVerifyingId(payment.id);
    try {
      await verifyPayment(payment.id);
      setToast({ message: 'পেমেন্ট verified — invoice ও ledger আপডেট হয়েছে।' });
      setDetail(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Verify করা যায়নি',
        error: true,
      });
    } finally {
      setVerifyingId(null);
    }
  }

  async function onReject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) return;
    setRejectSubmitting(true);
    try {
      await rejectPayment(rejecting.id, rejectReason.trim());
      setToast({ message: 'পেমেন্ট rejected হয়েছে।' });
      setRejecting(null);
      setRejectReason('');
      setDetail(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Reject করা যায়নি',
        error: true,
      });
    } finally {
      setRejectSubmitting(false);
    }
  }

  async function onRefund(payment: ApiPayment) {
    if (!window.confirm(`Refund ${formatPaisa(payment.amount)} — নিশ্চিত?`)) return;
    try {
      await refundPayment(payment.id);
      setToast({ message: 'পেমেন্ট refunded হয়েছে।' });
      setDetail(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Refund করা যায়নি',
        error: true,
      });
    }
  }

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>পেমেন্ট</h2>
          <p className="demo-page-sub">
            bKash Trx ID, ক্যাশ কালেকশন ও ভেরিফিকেশন — লাইভ ডেটা
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
          {canCollect ? (
            <button className="demo-btn primary" type="button" onClick={() => setManualOpen(true)}>
              <Icon name="plus" size={15} />
              ক্যাশ পেমেন্ট
            </button>
          ) : null}
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="clock" size={19} />
            </div>
            <span className="demo-badge amber">Action</span>
          </div>
          <p className="demo-stat-label">Pending Verification</p>
          <p className="demo-stat-value">{summary.pending}</p>
          <p className="demo-stat-hint">bKash Trx ID যাচাই করুন</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="check" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Verified</p>
          <p className="demo-stat-value">{summary.verified}</p>
          <p className="demo-stat-hint">সব সময়ের verified</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Collected</p>
          <p className="demo-stat-value">{formatPaisa(summary.collected)}</p>
          <p className="demo-stat-hint">Verified payments</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Rejected</p>
          <p className="demo-stat-value">{summary.rejected}</p>
          <p className="demo-stat-hint">আবার submit করা যাবে</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <div className="demo-search-input">
              <Icon name="search" size={15} />
              <input
                placeholder="Trx ID, Client ID বা মোবাইল…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {search || status ? (
              <button
                className="demo-btn ghost"
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setPage(1);
                }}
              >
                <Icon name="x" size={14} />
                রিসেট
              </button>
            ) : null}
          </div>
          <div className="demo-tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                className={`demo-tab ${status === tab.value ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            পেমেন্ট লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : payments.length === 0 ? (
          <div className="live-empty">কোনো পেমেন্ট পাওয়া যায়নি।</div>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Trx ID</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Sender</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <span className="demo-cell-main">
                          {payment.client?.name ?? '—'}
                        </span>
                        <span className="demo-cell-sub">
                          {payment.client?.publicId ?? payment.referenceCode ?? '—'}
                        </span>
                      </td>
                      <td className="mono">{payment.trxId ?? '—'}</td>
                      <td>
                        <span className="demo-badge gray">{payment.method}</span>
                      </td>
                      <td className="amount">{formatPaisa(payment.amount)}</td>
                      <td>{payment.senderNumber ?? '—'}</td>
                      <td>{formatDateTime(payment.createdAt)}</td>
                      <td>
                        <span className={`demo-badge ${statusTone(payment.status)}`}>
                          {displayStatus(payment.status)}
                        </span>
                      </td>
                      <td>
                        <div className="live-actions">
                          {payment.status === 'pending' && canVerify ? (
                            <button
                              className="demo-btn primary sm"
                              type="button"
                              disabled={verifyingId === payment.id}
                              onClick={() => onVerify(payment)}
                            >
                              <Icon name="check" size={12} />
                              {verifyingId === payment.id ? '…' : 'Verify'}
                            </button>
                          ) : null}
                          {payment.status === 'pending' && canReject ? (
                            <button
                              className="demo-btn danger sm"
                              type="button"
                              onClick={() => {
                                setRejecting(payment);
                                setRejectReason('');
                              }}
                            >
                              <Icon name="x" size={12} />
                            </button>
                          ) : null}
                          {payment.status === 'verified' && canRefund ? (
                            <button
                              className="demo-btn sm"
                              type="button"
                              onClick={() => onRefund(payment)}
                            >
                              Refund
                            </button>
                          ) : null}
                          <button
                            className="demo-btn sm"
                            type="button"
                            onClick={() => setDetail(payment)}
                          >
                            <Icon name="eye" size={13} />
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="demo-pagination">
              <span>
                Showing {start}–{end} of {total} payments
              </span>
              <div className="demo-pagination-actions">
                <button
                  className="demo-page-btn"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span className="demo-page-btn active">
                  {page} / {totalPages}
                </span>
                <button
                  className="demo-page-btn"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </article>

      <div className="demo-note">
        <strong>নিয়ম:</strong> Verify করলে invoice paid হবে, ledger entry তৈরি হবে এবং
        auto-recharge চালু থাকলে recharge job queue হবে। ভুল Trx হলে Reject করে কারণ
        লিখুন — ক্লায়েন্ট আবার submit করতে পারবে।
      </div>

      {manualOpen ? (
        <ManualPaymentModal
          clients={clients}
          onClose={() => setManualOpen(false)}
          onSaved={(message) => {
            setManualOpen(false);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {rejecting ? (
        <div className="live-modal-backdrop" onMouseDown={() => setRejecting(null)}>
          <div
            className="live-modal"
            style={{ maxWidth: 460 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>পেমেন্ট Reject</h3>
                <p>
                  {rejecting.client?.name ?? '—'} · {rejecting.trxId}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setRejecting(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <div className="live-field">
              <label htmlFor="reject-reason">কারণ *</label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="যেমন: Trx ID মেলেনি / ভুল অ্যামাউন্ট"
              />
            </div>
            <div className="live-form-actions">
              <button className="demo-btn" type="button" onClick={() => setRejecting(null)}>
                বাতিল
              </button>
              <button
                className="demo-btn danger"
                type="button"
                disabled={rejectSubmitting || !rejectReason.trim()}
                onClick={onReject}
              >
                {rejectSubmitting ? 'Reject হচ্ছে…' : 'Reject করুন'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="live-modal-backdrop" onMouseDown={() => setDetail(null)}>
          <div
            className="live-modal"
            style={{ maxWidth: 520 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>পেমেন্ট ডিটেইল</h3>
                <p>{detail.trxId ?? '—'}</p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setDetail(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="demo-table-wrap">
              <table className="demo-table">
                <tbody>
                  <tr>
                    <td className="demo-cell-sub">Client</td>
                    <td>{detail.client?.name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Client ID</td>
                    <td className="mono">{detail.client?.publicId ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Method</td>
                    <td>{detail.method}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Amount</td>
                    <td className="amount">{formatPaisa(detail.amount)}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Sender</td>
                    <td>{detail.senderNumber ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Status</td>
                    <td>
                      <span className={`demo-badge ${statusTone(detail.status)}`}>
                        {displayStatus(detail.status)}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Submitted</td>
                    <td>{formatDateTime(detail.createdAt)}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Invoice</td>
                    <td>{detail.invoice?.number ?? '—'}</td>
                  </tr>
                  {detail.rejectReason ? (
                    <tr>
                      <td className="demo-cell-sub">Reject reason</td>
                      <td>{detail.rejectReason}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="live-form-actions">
              {detail.status === 'pending' && canVerify ? (
                <button
                  className="demo-btn primary"
                  type="button"
                  onClick={() => onVerify(detail)}
                  disabled={verifyingId === detail.id}
                >
                  <Icon name="check" size={14} />
                  {verifyingId === detail.id ? 'Verifying…' : 'Verify করুন'}
                </button>
              ) : null}
              <button className="demo-btn" type="button" onClick={() => setDetail(null)}>
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
