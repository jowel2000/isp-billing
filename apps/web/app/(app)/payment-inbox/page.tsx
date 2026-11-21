'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import {
  displayStatus,
  formatDateTime,
  formatPaisa,
  getSmsInbound,
  statusTone,
  type SmsInboundRecord,
} from '@/lib/live-api';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Verified', value: 'verified' },
  { label: 'Pending', value: 'pending' },
  { label: 'Unmatched', value: 'unmatched' },
  { label: 'OTP', value: 'otp' },
  { label: 'Ignored', value: 'ignored' },
  { label: 'Errors', value: 'error' },
];

export default function PaymentInboxPage() {
  const { user } = useLiveAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SmsInboundRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const canView = user?.permissions.includes('payments.reconcile') ?? false;

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getSmsInbound({ page, limit: 20, status });
      setRows(result.data);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMS inbox লোড করা যায়নি');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user || !canView) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Payment Inbox দেখতে payments.reconcile
        permission প্রয়োজন।
      </div>
    );
  }

  const verified = rows.filter((row) => row.status === 'verified').length;
  const matched = rows.filter((row) =>
    ['verified', 'pending'].includes(row.status),
  ).length;

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Payment Inbox</h2>
          <p className="demo-page-sub">
            ফোন থেকে আসা bKash / Nagad / Rocket SMS — parse + auto payment
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Total SMS</p>
          <p className="demo-stat-value">{total}</p>
          <p className="demo-stat-hint">filter অনুযায়ী</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">This Page Verified</p>
          <p className="demo-stat-value">{verified}</p>
          <p className="demo-stat-hint">auto payment সফল</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="users" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Matched Client</p>
          <p className="demo-stat-value">{matched}</p>
          <p className="demo-stat-hint">reference/number মিলেছে</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="shield" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Secret</p>
          <p className="demo-stat-value">On</p>
          <p className="demo-stat-hint">x-sms-secret required</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-tabs">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                className={`demo-tab ${status === item.value ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setStatus(item.value);
                  setPage(1);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            SMS inbox লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="live-empty">কোনো SMS পাওয়া যায়নি।</div>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Provider</th>
                    <th>Amount</th>
                    <th>Trx ID</th>
                    <th>Reference</th>
                    <th>Sender</th>
                    <th>Status</th>
                    <th>SMS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>{row.provider ?? '—'}</td>
                      <td className="amount">
                        {row.amountPaisa ? formatPaisa(row.amountPaisa) : '—'}
                      </td>
                      <td className="mono">{row.trxId ?? '—'}</td>
                      <td className="mono">{row.referenceCode ?? '—'}</td>
                      <td className="mono">{row.senderMobile ?? row.sender ?? '—'}</td>
                      <td>
                        <span className={`demo-badge ${statusTone(row.status)}`}>
                          {displayStatus(row.status)}
                        </span>
                        {row.error ? (
                          <span className="demo-cell-sub">{row.error}</span>
                        ) : null}
                      </td>
                      <td>
                        <button
                          className="demo-btn ghost"
                          type="button"
                          onClick={() =>
                            setExpanded(expanded === row.id ? null : row.id)
                          }
                        >
                          {expanded === row.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {expanded ? (
              <div className="demo-note">
                <strong>SMS:</strong>{' '}
                {rows.find((row) => row.id === expanded)?.body ?? ''}
              </div>
            ) : null}
            <div className="demo-pagination">
              <span>
                Page {page} of {totalPages} · {total} SMS
              </span>
              <div className="demo-pagination-actions">
                <button
                  className="demo-page-btn"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <button
                  className="demo-page-btn"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </article>

      <div className="demo-note">
        <strong>সেটআপ:</strong>.android app বা SMS forwarder এই URL-এ SMS পাঠাবে:
        <code> POST /api/v1/webhooks/sms </code>
        header <code>x-sms-secret</code> সহ। Reference মিললে payment auto-verified
        হবে; না মিললে Wrong Recharge-এ যাবে।
      </div>
    </>
  );
}
