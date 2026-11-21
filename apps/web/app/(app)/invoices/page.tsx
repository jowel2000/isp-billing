'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreateInvoiceModal } from '@/components/create-invoice-modal';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiClient, ApiInvoice, InvoiceSummary } from '@/lib/live-api';
import {
  displayStatus,
  formatDate,
  formatPaisa,
  getClients,
  getInvoice,
  getInvoiceSummary,
  getInvoices,
  sendInvoice,
  statusTone,
  waiveInvoice,
} from '@/lib/live-api';

const LIMIT = 10;
const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Paid', value: 'paid' },
  { label: 'Due', value: 'due' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Draft', value: 'draft' },
];

const EMPTY_SUMMARY: InvoiceSummary = {
  totalInvoicedPaisa: 0,
  paidPaisa: 0,
  duePaisa: 0,
  overduePaisa: 0,
  invoiceCount: 0,
  byStatus: [],
};

export default function LiveInvoicesPage() {
  const { user } = useLiveAuth();
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<InvoiceSummary>(EMPTY_SUMMARY);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ApiInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canCreate = user?.permissions.includes('invoices.create') ?? false;
  const canWaive = user?.permissions.includes('invoices.waive') ?? false;
  const canSend = user?.permissions.includes('invoices.send') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
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

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getInvoices({
        page,
        limit: LIMIT,
        status: status || undefined,
        search: debouncedSearch || undefined,
      });
      setInvoices(result.data);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ইনভয়েস লোড করা যায়নি');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, reloadKey]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    let active = true;
    getInvoiceSummary()
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch(() => {
        if (active) setSummary(EMPTY_SUMMARY);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const invoice = await getInvoice(id);
      setDetail(invoice);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'ইনভয়েস লোড করা যায়নি',
        error: true,
      });
    } finally {
      setDetailLoading(false);
    }
  }

  async function onWaive() {
    if (!detail) return;
    if (detail.paidAmount > 0) {
      setToast({ message: 'পেমেন্ট হওয়া invoice waive করা যাবে না', error: true });
      return;
    }
    if (!window.confirm(`${detail.number} — পুরো invoice waive করবেন?`)) return;

    try {
      await waiveInvoice(detail.id, 'Waived by admin');
      setToast({ message: 'ইনভয়েস waive হয়েছে।' });
      setDetail(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Waive করা যায়নি',
        error: true,
      });
    }
  }

  async function onSend() {
    if (!detail) return;
    try {
      const result = await sendInvoice(detail.id);
      setToast({
        message: result.sent
          ? 'ইনভয়েস SMS-এ পাঠানো হয়েছে।'
          : result.reason || 'SMS গেটওয়ে এখনো configured নয়।',
        error: !result.sent,
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'পাঠানো যায়নি',
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
          <h2>ইনভয়েস</h2>
          <p className="demo-page-sub">
            লাইভ ইনভয়েস, VAT ৫% ও পেমেন্ট স্ট্যাটাস
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
          {canCreate ? (
            <button className="demo-btn primary" type="button" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={15} />
              নতুন ইনভয়েস
            </button>
          ) : null}
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="invoice" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Total Invoiced</p>
          <p className="demo-stat-value">{formatPaisa(summary.totalInvoicedPaisa)}</p>
          <p className="demo-stat-hint">{summary.invoiceCount} invoices</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="check" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Paid</p>
          <p className="demo-stat-value">{formatPaisa(summary.paidPaisa)}</p>
          <p className="demo-stat-hint">Verified payment মোট</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="clock" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Due</p>
          <p className="demo-stat-value">{formatPaisa(summary.duePaisa)}</p>
          <p className="demo-stat-hint">বাকি থাকা invoice</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Overdue</p>
          <p className="demo-stat-value">{formatPaisa(summary.overduePaisa)}</p>
          <p className="demo-stat-hint">Grace শেষ</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <div className="demo-search-input">
              <Icon name="search" size={15} />
              <input
                placeholder="Invoice No, Client Name বা ID…"
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
            ইনভয়েস লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : invoices.length === 0 ? (
          <div className="live-empty">কোনো ইনভয়েস পাওয়া যায়নি।</div>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>VAT 5%</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <span className="demo-cell-main mono">{invoice.number}</span>
                        <span className="demo-cell-sub">{formatDate(invoice.createdAt)}</span>
                      </td>
                      <td>
                        <span className="demo-cell-main">{invoice.client?.name ?? '—'}</span>
                        <span className="demo-cell-sub">{invoice.client?.publicId ?? '—'}</span>
                      </td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>{formatPaisa(invoice.subtotal)}</td>
                      <td>{formatPaisa(invoice.taxAmount)}</td>
                      <td className="amount">{formatPaisa(invoice.total)}</td>
                      <td>
                        <span className={`demo-badge ${statusTone(invoice.status)}`}>
                          {displayStatus(invoice.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="demo-btn sm"
                          type="button"
                          onClick={() => openDetail(invoice.id)}
                        >
                          <Icon name="eye" size={13} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="demo-pagination">
              <span>
                Showing {start}–{end} of {total} invoices
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
        <strong>VAT ৫%:</strong> চালু থাকলে invoice তৈরির সময় rate snapshot হয়। পরে
        rate বদলালেও পুরনো invoice অপরিবর্তিত থাকে।
      </div>

      {createOpen ? (
        <CreateInvoiceModal
          clients={clients}
          onClose={() => setCreateOpen(false)}
          onSaved={(message) => {
            setCreateOpen(false);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {detailLoading ? (
        <div className="live-modal-backdrop">
          <div className="live-modal" style={{ maxWidth: 420 }}>
            <div className="live-loading">
              <div className="live-spinner" />
              ইনভয়েস লোড হচ্ছে…
            </div>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="live-modal-backdrop" onMouseDown={() => setDetail(null)}>
          <div
            className="live-modal wide"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>{detail.number}</h3>
                <p>
                  {detail.client?.name ?? '—'} · {detail.client?.publicId ?? '—'}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setDetail(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <section className="demo-grid-2 equal" style={{ marginBottom: 16 }}>
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <tbody>
                    <tr>
                      <td className="demo-cell-sub">Status</td>
                      <td>
                        <span className={`demo-badge ${statusTone(detail.status)}`}>
                          {displayStatus(detail.status)}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Due Date</td>
                      <td>{formatDate(detail.dueDate)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Subtotal</td>
                      <td>{formatPaisa(detail.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Discount</td>
                      <td>{formatPaisa(detail.discount)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">VAT ({detail.taxRate / 100}%)</td>
                      <td>{formatPaisa(detail.taxAmount)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Total</td>
                      <td className="amount">{formatPaisa(detail.total)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Paid</td>
                      <td>{formatPaisa(detail.paidAmount)}</td>
                    </tr>
                    <tr>
                      <td className="demo-cell-sub">Due</td>
                      <td className="amount">{formatPaisa(detail.dueAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td className="amount">{formatPaisa(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.notes ? (
                  <p className="live-reveal-note">নোট: {detail.notes}</p>
                ) : null}
              </div>
            </section>

            <div className="live-form-actions">
              {canSend ? (
                <button className="demo-btn" type="button" onClick={onSend}>
                  <Icon name="sms" size={14} />
                  SMS পাঠান
                </button>
              ) : null}
              {canWaive ? (
                <button
                  className="demo-btn danger"
                  type="button"
                  onClick={onWaive}
                  disabled={detail.status === 'paid' || detail.status === 'waived'}
                >
                  Waive করুন
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
