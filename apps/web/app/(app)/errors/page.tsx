'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import {
  formatDateTime,
  getSyncErrors,
  type SyncErrorRecord,
} from '@/lib/live-api';

const CODES = [
  { value: '', labelKey: 'errors.all' },
  { value: 'UPSTREAM_LOCKED', label: 'UPSTREAM_LOCKED' },
  { value: 'OTP_422', label: 'OTP_422' },
  { value: 'AUTH_401', label: 'AUTH_401' },
  { value: 'SESSION_EXPIRED', label: 'SESSION_EXPIRED' },
  { value: 'SCRAPE_PARTIAL', label: 'SCRAPE_PARTIAL' },
  { value: 'CLIENTS_SYNC', label: 'CLIENTS_SYNC' },
  { value: 'NETWORK_TIMEOUT', label: 'NETWORK_TIMEOUT' },
];

function buildCopyText(item: SyncErrorRecord) {
  return [
    `[${item.code}] ${item.createdAt}`,
    `Step: ${item.step}`,
    item.httpStatus ? `HTTP: ${item.httpStatus}` : null,
    `Message: ${item.message}`,
    item.detail ? `Detail: ${item.detail}` : null,
    item.runId ? `Run: ${item.runId}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export default function SyncErrorsPage() {
  const { user } = useLiveAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<SyncErrorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const load = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getSyncErrors({ page, limit: 20, code });
      setRows(result.data);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error লগ লোড করা যায়নি');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, page, code]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyError(item: SyncErrorRecord) {
    const text = buildCopyText(item);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(item.id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!user || !isSuperAdmin) {
    return (
      <div className="demo-note">
        <strong>Permission নেই:</strong> Error log শুধু Super Admin দেখতে পারবে।
      </div>
    );
  }

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>{t('page.errors')}</h2>
          <p className="demo-page-sub">{t('errors.subtitle')}</p>
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
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">{t('errors.total')}</p>
          <p className="demo-stat-value">{total}</p>
          <p className="demo-stat-hint">filter অনুযায়ী</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="shield" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Access</p>
          <p className="demo-stat-value">Super Admin</p>
          <p className="demo-stat-hint">শুধু আপনার জন্য</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>Sync Errors</h3>
            <p>কোড কপি করে AI-তে পেস্ট করলেই কারণ বোঝা যাবে</p>
          </div>
          <select
            className="demo-select"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setPage(1);
            }}
            aria-label="Error code filter"
          >
            {CODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.labelKey ? t(item.labelKey) : item.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            Error লগ লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="live-empty">{t('errors.empty')}</div>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>{t('errors.time')}</th>
                    <th>{t('errors.step')}</th>
                    <th>{t('errors.code')}</th>
                    <th>{t('errors.http')}</th>
                    <th>{t('errors.message')}</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td className="mono">{item.step}</td>
                      <td>
                        <span className="demo-badge red">{item.code}</span>
                      </td>
                      <td className="mono">{item.httpStatus ?? '—'}</td>
                      <td>{item.message}</td>
                      <td>
                        <div className="live-actions">
                          <button
                            className="demo-btn sm"
                            type="button"
                            onClick={() => copyError(item)}
                          >
                            <Icon name="download" size={13} />
                            {copied === item.id ? t('errors.copied') : t('errors.copy')}
                          </button>
                          <button
                            className="demo-btn ghost sm"
                            type="button"
                            onClick={() =>
                              setExpanded(expanded === item.id ? null : item.id)
                            }
                          >
                            {expanded === item.id ? 'Hide' : t('errors.detail')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expanded ? (
              <div className="demo-note">
                <strong>{t('errors.detail')}:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
                  {rows.find((item) => item.id === expanded)?.detail ?? '—'}
                </pre>
              </div>
            ) : null}

            <div className="demo-pagination">
              <span>
                Page {page} of {totalPages} · {total} errors
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
        <strong>নোট:</strong> প্রতিটি ব্যর্থ sync-এ code, step, message, HTTP status,
        upstream response ও সময় এখানে জমা থাকে (৯০ দিন)। Copy বাটনে চাপলে AI-তে
        পেস্ট করার মতো ফরম্যাটে কপি হবে।
      </div>
    </>
  );
}
