'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type { AuditLogEntry, UserLoginLog } from '@/lib/live-api';
import {
  formatDateTime,
  getAuditLogs,
  getClientLogins,
  getUserLogins,
} from '@/lib/live-api';

type Tab = 'client' | 'user' | 'audit';

export default function ActivityLogsPage() {
  const { user } = useLiveAuth();
  const [tab, setTab] = useState<Tab>('client');
  const [rows, setRows] = useState<Array<UserLoginLog | AuditLogEntry>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const canClient = user?.permissions.includes('logs.client_login') ?? false;
  const canUser = user?.permissions.includes('logs.user_login') ?? false;
  const canAudit = user?.permissions.includes('logs.audit') ?? false;

  const tabs = useMemo(() => {
    const list: Array<{ key: Tab; label: string }> = [];
    if (canClient) list.push({ key: 'client', label: 'Client Portal Logins' });
    if (canUser) list.push({ key: 'user', label: 'User Logins' });
    if (canAudit) list.push({ key: 'audit', label: 'Change Audit' });
    return list;
  }, [canClient, canUser, canAudit]);

  useEffect(() => {
    if (tabs.length && !tabs.some((item) => item.key === tab)) {
      setTab(tabs[0].key);
    }
  }, [tabs, tab]);

  const load = useCallback(async () => {
    if (!tabs.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
    const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;

    try {
      if (tab === 'client') {
        const result = await getClientLogins({ page, limit: 20, from: fromIso, to: toIso });
        setRows(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(1, result.totalPages));
      } else if (tab === 'user') {
        const result = await getUserLogins({ page, limit: 20, from: fromIso, to: toIso });
        setRows(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(1, result.totalPages));
      } else {
        const result = await getAuditLogs({ page, limit: 20, from: fromIso, to: toIso });
        setRows(result.data);
        setTotal(result.total);
        setTotalPages(Math.max(1, result.totalPages));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লগ লোড করা যায়নি');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, page, from, to, tabs.length]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  if (!tabs.length) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Activity Logs দেখতে Super Admin/Admin
        permission প্রয়োজন।
      </div>
    );
  }

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Activity & Logs</h2>
          <p className="demo-page-sub">
            Portal login, user login ও কে কী পরিবর্তন করেছে — ১ বছর retention
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
        </div>
      </div>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <div className="live-field" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label htmlFor="log-from" style={{ fontSize: '0.65rem' }}>
                From
              </label>
              <input
                id="log-from"
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
              <label htmlFor="log-to" style={{ fontSize: '0.65rem' }}>
                To
              </label>
              <input
                id="log-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                style={{ padding: '6px 8px' }}
              />
            </div>
            {from || to ? (
              <button
                className="demo-btn ghost"
                type="button"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                <Icon name="x" size={14} />
                রিসেট
              </button>
            ) : null}
          </div>

          <div className="demo-tabs">
            {tabs.map((item) => (
              <button
                key={item.key}
                className={`demo-tab ${tab === item.key ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setTab(item.key);
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
            লগ লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="live-empty">কোনো লগ পাওয়া যায়নি।</div>
        ) : tab === 'audit' ? (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>IP</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as AuditLogEntry[]).map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>
                        <span className="demo-cell-main">
                          {entry.actor?.name ?? 'System'}
                        </span>
                        <span className="demo-cell-sub">
                          {entry.actor?.loginId ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className="demo-badge gray">
                          {entry.actor?.role?.name ?? 'system'}
                        </span>
                      </td>
                      <td className="mono">{entry.action}</td>
                      <td>{entry.entityType}</td>
                      <td className="mono">{entry.ip ?? '—'}</td>
                      <td>
                        <button
                          className="demo-btn sm"
                          type="button"
                          onClick={() => setSelected(entry)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onChange={setPage}
            />
          </>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Login ID</th>
                    <th>Role</th>
                    <th>IP</th>
                    <th>Device</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as UserLoginLog[]).map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td className="mono">{entry.loginId}</td>
                      <td>
                        <span className="demo-badge gray">{entry.role ?? 'unknown'}</span>
                      </td>
                      <td className="mono">{entry.ip ?? '—'}</td>
                      <td
                        style={{
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={entry.userAgent ?? ''}
                      >
                        {entry.userAgent ?? '—'}
                      </td>
                      <td>
                        <span className={`demo-badge ${entry.success ? 'green' : 'red'}`}>
                          {entry.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onChange={setPage}
            />
          </>
        )}
      </article>

      <div className="demo-note">
        <strong>Retention:</strong> ১ বছর (৩৬৫ দিন) পর পুরনো login/audit লগ
        স্বয়ংক্রিয়ভাবে ডিলিট হবে।
      </div>

      {selected ? (
        <div className="live-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div
            className="live-modal"
            style={{ maxWidth: 640 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>Audit Detail</h3>
                <p>{selected.action}</p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="demo-table-wrap">
              <table className="demo-table">
                <tbody>
                  <tr>
                    <td className="demo-cell-sub">Actor</td>
                    <td>
                      {selected.actor?.name ?? 'System'} ·{' '}
                      {selected.actor?.loginId ?? '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Role</td>
                    <td>{selected.actor?.role?.name ?? 'system'}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Entity</td>
                    <td>
                      {selected.entityType} · {selected.entityId ?? '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">Time</td>
                    <td>{formatDateTime(selected.createdAt)}</td>
                  </tr>
                  <tr>
                    <td className="demo-cell-sub">IP</td>
                    <td className="mono">{selected.ip ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12 }}>
              <p className="demo-cell-sub">Before</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#64748b' }}>
                {selected.before ?? '—'}
              </pre>
              <p className="demo-cell-sub">After</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#334155' }}>
                {selected.after ?? '—'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
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
