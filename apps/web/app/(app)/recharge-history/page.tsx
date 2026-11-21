'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiClient, LedgerEntryRecord, RechargeJobRecord } from '@/lib/live-api';
import {
  displayStatus,
  formatDate,
  formatDateTime,
  formatPaisa,
  getClients,
  getLedgerHistory,
  getRechargeHistory,
  statusTone,
} from '@/lib/live-api';

type Tab = 'recharge' | 'ledger';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Queued', value: 'queued' },
  { label: 'Activated', value: 'activated' },
  { label: 'Failed', value: 'failed' },
  { label: 'Manual', value: 'needs_manual' },
];

export default function RechargeHistoryPage() {
  const { user } = useLiveAuth();
  const [tab, setTab] = useState<Tab>('recharge');
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Array<RechargeJobRecord | LedgerEntryRecord>>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canRecharge = user?.permissions.includes('reports.recharge') ?? false;
  const canLedger = user?.permissions.includes('reports.ledger') ?? false;

  useEffect(() => {
    getClients({ limit: 100 })
      .then((result) => setClients(result.data))
      .catch(() => setClients([]));
  }, []);

  const load = useCallback(async () => {
    if (!canRecharge && !canLedger) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
    const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;

    try {
      if (tab === 'recharge') {
        const result = await getRechargeHistory({
          page,
          limit: 20,
          clientId: clientId || undefined,
          status: status || undefined,
          from: fromIso,
          to: toIso,
        });
        setRows(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(1, result.totalPages));
      } else {
        const result = await getLedgerHistory({
          page,
          limit: 20,
          clientId: clientId || undefined,
          from: fromIso,
          to: toIso,
        });
        setRows(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(1, result.totalPages));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'হিস্ট্রি লোড করা যায়নি');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, page, clientId, status, from, to, canRecharge, canLedger]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user || (!canRecharge && !canLedger)) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Recharge History দেখতে Admin/Super Admin
        permission প্রয়োজন।
      </div>
    );
  }

  const rechargeRows = rows as RechargeJobRecord[];
  const ledgerRows = rows as LedgerEntryRecord[];
  const pageAmount = rechargeRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const pageCost = rechargeRows.reduce(
    (sum, row) => sum + Number(row.upstreamCostPaisa),
    0,
  );

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Recharge History</h2>
          <p className="demo-page-sub">
            সব recharge ও debit/credit হিসাব — client filter সহ
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
          <p className="demo-stat-label">Total Entries</p>
          <p className="demo-stat-value">{total}</p>
          <p className="demo-stat-hint">filter অনুযায়ী</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Page Amount</p>
          <p className="demo-stat-value">{formatPaisa(pageAmount)}</p>
          <p className="demo-stat-hint">এই পেজের recharge</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="package" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Page Upstream Cost</p>
          <p className="demo-stat-value">{formatPaisa(pageCost)}</p>
          <p className="demo-stat-hint">এই পেজের cost</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="shield" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Access</p>
          <p className="demo-stat-value">Admin / Super</p>
          <p className="demo-stat-hint">Staff দেখতে পারবে না</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <select
              className="demo-select"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setPage(1);
              }}
              aria-label="Client filter"
            >
              <option value="">সব ক্লায়েন্ট</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.paymentCode ?? client.publicId}
                </option>
              ))}
            </select>

            <div className="live-field" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label htmlFor="hist-from" style={{ fontSize: '0.65rem' }}>
                From
              </label>
              <input
                id="hist-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                style={{ padding: '6px 8px' }}
              />
            </div>
            <div className="live-field" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label htmlFor="hist-to" style={{ fontSize: '0.65rem' }}>
                To
              </label>
              <input
                id="hist-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                style={{ padding: '6px 8px' }}
              />
            </div>

            {clientId || from || to || status ? (
              <button
                className="demo-btn ghost"
                type="button"
                onClick={() => {
                  setClientId('');
                  setFrom('');
                  setTo('');
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
            {canRecharge ? (
              <button
                className={`demo-tab ${tab === 'recharge' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setTab('recharge');
                  setPage(1);
                }}
              >
                Recharge
              </button>
            ) : null}
            {canLedger ? (
              <button
                className={`demo-tab ${tab === 'ledger' ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setTab('ledger');
                  setPage(1);
                }}
              >
                Debit / Credit
              </button>
            ) : null}
          </div>
        </div>

        {tab === 'recharge' ? (
          <div className="demo-tabs" style={{ marginBottom: 12 }}>
            {STATUS_TABS.map((item) => (
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
        ) : null}

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            হিস্ট্রি লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="live-empty">কোনো এন্ট্রি পাওয়া যায়নি।</div>
        ) : tab === 'recharge' ? (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Invoice</th>
                    <th>Days</th>
                    <th>Amount</th>
                    <th>Upstream Cost</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {rechargeRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>
                        <span className="demo-cell-main">
                          {row.client?.name ?? '—'}
                        </span>
                        <span className="demo-cell-sub">
                          {row.client?.paymentCode ?? '—'}
                        </span>
                      </td>
                      <td className="mono">{row.invoice?.number ?? '—'}</td>
                      <td>{row.durationDays ?? '—'}</td>
                      <td className="amount">{formatPaisa(row.amount)}</td>
                      <td>{formatPaisa(row.upstreamCostPaisa)}</td>
                      <td>
                        {row.payment
                          ? `${row.payment.provider} / ${row.payment.accountType}`
                          : '—'}
                      </td>
                      <td>
                        <span className={`demo-badge ${statusTone(row.status)}`}>
                          {displayStatus(row.status)}
                        </span>
                      </td>
                      <td className="mono">
                        {row.payment?.trxId ?? row.payment?.referenceCode ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Account</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Transaction</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>
                        <span className="demo-cell-main">
                          {row.client?.name ?? '—'}
                        </span>
                        <span className="demo-cell-sub">
                          {row.client?.paymentCode ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className="demo-cell-main">{row.account.code}</span>
                        <span className="demo-cell-sub">{row.account.name}</span>
                      </td>
                      <td>{Number(row.debit) > 0 ? formatPaisa(row.debit) : '—'}</td>
                      <td className="amount">
                        {Number(row.credit) > 0 ? formatPaisa(row.credit) : '—'}
                      </td>
                      <td className="mono">{row.transactionId}</td>
                      <td>{row.refType ?? '—'}</td>
                      <td>{row.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        )}
      </article>

      <div className="demo-note">
        <strong>নোট:</strong> Recharge-এ দিন, upstream cost ও payment reference সংরক্ষিত
        হয়। Debit/Credit ledger সরাসরি হিসাব দেখায় — super admin profit এখান থেকে হিসাব
        করে।
      </div>
    </>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="demo-pagination">
      <span>
        Page {page} of {totalPages} · {total} entries
      </span>
      <div className="demo-pagination-actions">
        <button
          className="demo-page-btn"
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <button
          className="demo-page-btn"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
