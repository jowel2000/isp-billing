'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ClientFormModal } from '@/components/client-form-modal';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiArea, ApiClient, ApiPackage } from '@/lib/live-api';
import {
  displayStatus,
  formatDate,
  formatPaisa,
  getAreas,
  getClients,
  getCollectionReport,
  getDueReport,
  getPackages,
  revealClient,
  statusTone,
} from '@/lib/live-api';

const LIMIT = 10;
const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Free', value: 'free' },
];

interface Summary {
  total: number;
  active: number;
  due: number;
  collected: number;
}

interface RevealState {
  client: ApiClient;
  field: 'pppoe' | 'nid';
  value: string;
  loading: boolean;
  error: string;
  expired: boolean;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function LiveClientsPage() {
  const { user } = useLiveAuth();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [areaId, setAreaId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [areas, setAreas] = useState<ApiArea[]>([]);
  const [packages, setPackages] = useState<ApiPackage[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    due: 0,
    collected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ApiClient | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canCreate = user?.permissions.includes('clients.create') ?? false;
  const canEdit = user?.permissions.includes('clients.edit') ?? false;
  const canRevealPppoe =
    user?.permissions.includes('clients.reveal_credentials') ?? false;
  const canRevealNid = user?.permissions.includes('clients.view_nid') ?? false;

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
    Promise.allSettled([getAreas(), getPackages()]).then(([areaResult, packageResult]) => {
      if (areaResult.status === 'fulfilled') setAreas(areaResult.value);
      if (packageResult.status === 'fulfilled') setPackages(packageResult.value);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === '1' && canCreate) {
      setEditing(null);
      setFormMode('add');
      window.history.replaceState({}, '', '/clients');
    }
  }, [user, canCreate]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getClients({
        page,
        limit: LIMIT,
        status: status || undefined,
        areaId: areaId || undefined,
        search: debouncedSearch || undefined,
      });
      setClients(result.data);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ক্লায়েন্ট লিস্ট লোড করা যায়নি');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, areaId, debouncedSearch, reloadKey]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      getClients({ limit: 1 }),
      getClients({ status: 'active', limit: 1 }),
      getDueReport(),
      getCollectionReport(),
    ]).then((results) => {
      if (!active) return;
      const value = (index: number, fallback: any) => {
        const result = results[index];
        return result && result.status === 'fulfilled' ? result.value : fallback;
      };
      setSummary({
        total: value(0, { total: 0 }).total ?? 0,
        active: value(1, { total: 0 }).total ?? 0,
        due: value(2, { totalDuePaisa: 0 }).totalDuePaisa ?? 0,
        collected: value(3, { totalPaisa: 0 }).totalPaisa ?? 0,
      });
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!reveal || reveal.loading || reveal.error || reveal.expired || !reveal.value) return;
    const timer = setTimeout(() => {
      setReveal((current) =>
        current ? { ...current, value: '••••••••', expired: true } : null,
      );
    }, 30000);
    return () => clearTimeout(timer);
  }, [reveal]);

  function openAdd() {
    setEditing(null);
    setFormMode('add');
  }

  function openEdit(client: ApiClient) {
    setEditing(client);
    setFormMode('edit');
  }

  async function openReveal(client: ApiClient, field: 'pppoe' | 'nid') {
    setReveal({
      client,
      field,
      value: '',
      loading: true,
      error: '',
      expired: false,
    });

    try {
      const result = await revealClient(client.id, field);
      setReveal((current) =>
        current && current.client.id === client.id
          ? { ...current, value: result.value, loading: false }
          : current,
      );
    } catch (err) {
      setReveal((current) =>
        current && current.client.id === client.id
          ? {
              ...current,
              loading: false,
              error: err instanceof Error ? err.message : 'Reveal করা যায়নি',
            }
          : current,
      );
    }
  }

  async function copyReveal() {
    if (!reveal?.value || reveal.expired) return;
    try {
      await navigator.clipboard.writeText(reveal.value);
      setToast({ message: 'কপি হয়েছে' });
    } catch {
      setToast({ message: 'কপি করা যায়নি', error: true });
    }
  }

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>ক্লায়েন্ট</h2>
          <p className="demo-page-sub">
            লাইভ ক্লায়েন্ট, প্যাকেজ, এরিয়া ও বাকি — সরাসরি ডেটাবেস থেকে
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
            <button className="demo-btn primary" type="button" onClick={openAdd}>
              <Icon name="plus" size={15} />
              নতুন ক্লায়েন্ট
            </button>
          ) : null}
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="users" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Total Clients</p>
          <p className="demo-stat-value">{summary.total}</p>
          <p className="demo-stat-hint">ডেটাবেসে মোট</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="wifi" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Active</p>
          <p className="demo-stat-value">{summary.active}</p>
          <p className="demo-stat-hint">
            {summary.total > 0
              ? `${Math.round((summary.active / summary.total) * 100)}% of total`
              : 'কোনো ক্লায়েন্ট নেই'}
          </p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Outstanding Due</p>
          <p className="demo-stat-value">{formatPaisa(summary.due)}</p>
          <p className="demo-stat-hint">সব invoice মিলিয়ে</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Collected</p>
          <p className="demo-stat-value">{formatPaisa(summary.collected)}</p>
          <p className="demo-stat-hint">Verified payments</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <div className="demo-search-input">
              <Icon name="search" size={15} />
              <input
                placeholder="নাম, Client ID বা মোবাইল…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="demo-select"
              value={areaId}
              onChange={(event) => {
                setAreaId(event.target.value);
                setPage(1);
              }}
              aria-label="Area"
            >
              <option value="">সব এরিয়া</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            {search || areaId || status ? (
              <button
                className="demo-btn ghost"
                type="button"
                onClick={() => {
                  setSearch('');
                  setAreaId('');
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
            ক্লায়েন্ট লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : clients.length === 0 ? (
          <div className="live-empty">
            <p style={{ margin: '0 0 12px' }}>কোনো ক্লায়েন্ট পাওয়া যায়নি।</p>
            {canCreate ? (
              <button className="demo-btn primary" type="button" onClick={openAdd}>
                <Icon name="plus" size={14} /> প্রথম ক্লায়েন্ট যোগ করুন
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Area</th>
                    <th>Package</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Expiry</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const subscription = client.subscriptions?.[0];
                    return (
                      <tr key={client.id}>
                        <td>
                          <div className="live-client-name">
                            <span className="demo-avatar-sm">{initials(client.name)}</span>
                            <div>
                              <span className="demo-cell-main">{client.name}</span>
                              <span className="demo-cell-sub">
                                {client.publicId} · {client.mobile}
                                {client.paymentCode ? ` · ID ${client.paymentCode}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{client.area?.name ?? '—'}</td>
                        <td>{subscription?.package?.name ?? '—'}</td>
                        <td>
                          <span className={`demo-badge ${statusTone(client.status)}`}>
                            {displayStatus(client.status)}
                          </span>
                        </td>
                        <td className="amount">
                          {client.duePaisa > 0 ? formatPaisa(client.duePaisa) : '—'}
                        </td>
                        <td>{formatDate(subscription?.expireAt)}</td>
                        <td>
                          <div className="live-actions">
                            {canEdit ? (
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => openEdit(client)}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canRevealPppoe && client.hasPppoePassword ? (
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => openReveal(client, 'pppoe')}
                                title="PPPoE password reveal"
                              >
                                <Icon name="eye" size={13} />
                                PPPoE
                              </button>
                            ) : null}
                            {canRevealNid && client.hasNid ? (
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => openReveal(client, 'nid')}
                                title="NID reveal"
                              >
                                <Icon name="eye" size={13} />
                                NID
                              </button>
                            ) : null}
                            {!canEdit &&
                            !(canRevealPppoe && client.hasPppoePassword) &&
                            !(canRevealNid && client.hasNid) ? (
                              <span className="live-table-muted">—</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="demo-pagination">
              <span>
                Showing {start}–{end} of {total} clients
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
        <strong>নোট:</strong> Staff-এর কোনো area restriction নেই — সব এরিয়া দেখতে
        পারবে। PPPoE/NID reveal করলে প্রতিটি action audit log-এ যাবে এবং ৩০ সেকেন্ড
        পর auto-hide হবে।
      </div>

      {formMode ? (
        <ClientFormModal
          key={`${formMode}-${editing?.id ?? 'new'}`}
          mode={formMode}
          client={editing}
          areas={areas}
          packages={packages}
          onClose={() => {
            setFormMode(null);
            setEditing(null);
          }}
          onSaved={(message) => {
            setFormMode(null);
            setEditing(null);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {reveal ? (
        <div
          className="live-modal-backdrop"
          onMouseDown={() => setReveal(null)}
        >
          <div
            className="live-modal"
            style={{ maxWidth: 460 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>
                  {reveal.field === 'pppoe' ? 'PPPoE পাসওয়ার্ড' : 'NID নম্বর'}
                </h3>
                <p>
                  {reveal.client.name} · {reveal.client.publicId}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setReveal(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            {reveal.loading ? (
              <div className="live-loading" style={{ minHeight: 120 }}>
                <div className="live-spinner" />
                Reveal হচ্ছে…
              </div>
            ) : reveal.error ? (
              <div className="live-error">{reveal.error}</div>
            ) : (
              <>
                <div className="live-reveal-value">{reveal.value}</div>
                <p className="live-reveal-note">
                  {reveal.expired
                    ? '৩০ সেকেন্ড শেষ — আবার Reveal করুন।'
                    : '৩০ সেকেন্ড পর স্বয়ংক্রিয়ভাবে hide হবে। প্রতিটি reveal audit log-এ সংরক্ষিত হচ্ছে।'}
                </p>
                <div className="live-form-actions">
                  {!reveal.expired ? (
                    <button className="demo-btn" type="button" onClick={copyReveal}>
                      <Icon name="download" size={13} />
                      কপি
                    </button>
                  ) : null}
                  <button
                    className="demo-btn primary"
                    type="button"
                    onClick={() => setReveal(null)}
                  >
                    বন্ধ করুন
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
