'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RevenueChart, StatusDonut } from '@/components/demo-charts';
import { Icon, type IconName } from '@/components/icon';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import type {
  ApiPackage,
  ApiPayment,
  CollectionReport,
  DueReport,
  MonthlyCollection,
  ProfitReport,
} from '@/lib/live-api';
import {
  displayStatus,
  formatDate,
  formatPaisa,
  getClients,
  getCollectionReport,
  getDueReport,
  getMonthlyCollection,
  getPackages,
  getPayments,
  getProfitReport,
  statusTone,
  verifyPayment,
} from '@/lib/live-api';

interface DashboardData {
  totalClients: number;
  activeClients: number;
  status: {
    active: number;
    expired: number;
    inactive: number;
    free: number;
  };
  collection: CollectionReport | null;
  due: DueReport | null;
  monthly: MonthlyCollection | null;
  recent: ApiPayment[];
  pending: ApiPayment[];
  packages: ApiPackage[];
  profit: ProfitReport | null;
}

const STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  Expired: '#ef4444',
  Inactive: '#f59e0b',
  Free: '#3b82f6',
};

export default function LiveDashboardPage() {
  const { user } = useLiveAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const showToast = (message: string, isError = false) => setToast({ message, error: isError });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    const includeProfit = user.permissions.includes('reports.profit');
    const requests: Array<Promise<any>> = [
      getClients({ limit: 1 }),
      getClients({ status: 'active', limit: 1 }),
      getClients({ status: 'expired', limit: 1 }),
      getClients({ status: 'inactive', limit: 1 }),
      getClients({ status: 'free', limit: 1 }),
      getCollectionReport(),
      getDueReport(),
      getMonthlyCollection(),
      getPayments({ limit: 6 }),
      getPayments({ status: 'pending', limit: 5 }),
      getPackages(),
    ];
    if (includeProfit) requests.push(getProfitReport());

    const results = await Promise.allSettled(requests);
    const value = (index: number, fallback: any) => {
      const result = results[index];
      return result && result.status === 'fulfilled' ? result.value : fallback;
    };

    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed === results.length) {
      setError('ড্যাশবোর্ড ডেটা লোড করা যায়নি। API সার্ভার চালু আছে কি না দেখুন।');
    }

    setData({
      totalClients: value(0, { total: 0 }).total ?? 0,
      activeClients: value(1, { total: 0 }).total ?? 0,
      status: {
        active: value(1, { total: 0 }).total ?? 0,
        expired: value(2, { total: 0 }).total ?? 0,
        inactive: value(3, { total: 0 }).total ?? 0,
        free: value(4, { total: 0 }).total ?? 0,
      },
      collection: value(5, null),
      due: value(6, null),
      monthly: value(7, null),
      recent: value(8, { data: [] }).data ?? [],
      pending: value(9, { data: [] }).data ?? [],
      packages: value(10, []),
      profit: includeProfit ? value(11, null) : null,
    });

    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const canCreate = user?.permissions.includes('clients.create') ?? false;
  const canVerify = user?.permissions.includes('payments.verify') ?? false;

  const monthlyData = useMemo(
    () =>
      (data?.monthly?.data ?? []).map((point) => ({
        month: point.month,
        value: point.totalPaisa / 100,
      })),
    [data],
  );

  const statusSlices = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Active', value: data.status.active, color: STATUS_COLORS.Active },
      { label: 'Expired', value: data.status.expired, color: STATUS_COLORS.Expired },
      { label: 'Inactive', value: data.status.inactive, color: STATUS_COLORS.Inactive },
      { label: 'Free', value: data.status.free, color: STATUS_COLORS.Free },
    ].filter((slice) => slice.value > 0);
  }, [data]);

  const statusTotal = statusSlices.reduce((sum, slice) => sum + slice.value, 0);

  const stats: Array<{
    label: string;
    value: string;
    hint: string;
    icon: IconName;
    tone: string;
  }> = [
    {
      label: 'Total Clients',
      value: String(data?.totalClients ?? 0),
      hint: `${data?.activeClients ?? 0} active`,
      icon: 'users',
      tone: 'orange',
    },
    {
      label: 'Active Clients',
      value: String(data?.activeClients ?? 0),
      hint:
        data && data.totalClients > 0
          ? `${Math.round((data.activeClients / data.totalClients) * 100)}% of total`
          : 'কোনো ক্লায়েন্ট নেই',
      icon: 'wifi',
      tone: 'green',
    },
    {
      label: 'Due Amount',
      value: formatPaisa(data?.due?.totalDuePaisa ?? 0),
      hint: `${data?.due?.count ?? 0} invoice pending`,
      icon: 'wallet',
      tone: 'red',
    },
    {
      label: 'Collected',
      value: formatPaisa(data?.collection?.totalPaisa ?? 0),
      hint: `${data?.collection?.count ?? 0} verified payments`,
      icon: 'trend-up',
      tone: 'blue',
    },
  ];

  async function onVerify(paymentId: string) {
    setVerifying(paymentId);
    try {
      await verifyPayment(paymentId);
      showToast('পেমেন্ট verified হয়েছে — invoice আপডেট হয়েছে।');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Verify করা যায়নি', true);
    } finally {
      setVerifying(null);
    }
  }

  const topDue = (data?.due?.top ?? []).slice(0, 4);
  const maxDue = Math.max(...topDue.map((item) => Number(item.dueAmount)), 1);

  const topPackages = (data?.packages ?? [])
    .filter((pkg) => (pkg._count?.subscriptions ?? 0) > 0)
    .sort((a, b) => (b._count?.subscriptions ?? 0) - (a._count?.subscriptions ?? 0))
    .slice(0, 4);
  const maxPackage = Math.max(...topPackages.map((pkg) => pkg._count?.subscriptions ?? 0), 1);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>{t('nav.dashboard')}</h2>
          <p className="demo-page-sub">
            {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} ·{' '}
            {t('dash.liveDb')}
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" onClick={load}>
            <Icon name="trend-up" size={15} />
            {t('dash.refresh')}
          </button>
          {canCreate ? (
            <Link href="/clients?add=1" className="demo-btn primary">
              <Icon name="plus" size={15} />
              {t('dash.addClient')}
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="live-error">
          {error}{' '}
          <button
            type="button"
            onClick={load}
            style={{
              border: 0,
              background: 'transparent',
              color: '#be123c',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            {t('dash.loading')}
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="demo-stat-grid">
            {stats.map((stat) => (
              <article className="demo-stat-card" key={stat.label}>
                <div className="demo-stat-top">
                  <div className={`demo-stat-icon ${stat.tone}`}>
                    <Icon name={stat.icon} size={19} />
                  </div>
                  <span className="demo-badge green">Live</span>
                </div>
                <p className="demo-stat-label">{stat.label}</p>
                <p className="demo-stat-value">{stat.value}</p>
                <p className="demo-stat-hint">{stat.hint}</p>
              </article>
            ))}
          </section>

          <section className="demo-grid-2">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{t('dash.monthlyCollection')}</h3>
                  <p>{t('dash.last8Months')}</p>
                </div>
                <span className="demo-badge green">Live</span>
              </div>
              <div className="demo-chart-total">
                <strong>{formatPaisa(data.collection?.totalPaisa ?? 0)}</strong>
                <span>{t('dash.totalCollected')}</span>
              </div>
              {monthlyData.length > 0 ? (
                <RevenueChart
                  data={monthlyData}
                  labelFormatter={(amount) => `৳${Math.round(amount).toLocaleString()}`}
                />
              ) : (
                <div className="live-empty">{t('dash.noVerified')}</div>
              )}
              <div className="demo-chart-legend">
                <span>
                  <i className="demo-legend-dot" style={{ background: '#f59e0b' }} />
                  bKash + Cash
                </span>
                <span>
                  <i className="demo-legend-dot" style={{ background: '#e2e8f0' }} />
                  Live database
                </span>
              </div>
            </article>

            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{t('dash.clientStatus')}</h3>
                  <p>{t('dash.clientsCount').replace('{n}', String(data.totalClients))}</p>
                </div>
                <Link href="/clients" className="demo-card-link">
                  {t('dash.viewAll')} <Icon name="chevron-right" size={13} />
                </Link>
              </div>
              {statusTotal > 0 ? (
                <StatusDonut slices={statusSlices} total={statusTotal} label={t('nav.clients')} />
              ) : (
                <div className="live-empty">{t('dash.noClients')}</div>
              )}
              <div className="demo-note" style={{ marginTop: 16 }}>
                <strong>{data.status.expired} expired</strong> · {data.status.inactive}{' '}
                inactive · {data.status.free} free। Due reminder শীঘ্রই SMS-এ যাবে।
              </div>
            </article>
          </section>

          <section className="demo-grid-2">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{t('dash.recentPayments')}</h3>
                  <p>{t('dash.latestTx')}</p>
                </div>
                <span className="demo-badge gray">{data.recent.length} shown</span>
              </div>
              {data.recent.length === 0 ? (
                <div className="live-empty">{t('dash.noPayments')}</div>
              ) : (
                <div className="demo-table-wrap">
                  <table className="demo-table">
                    <thead>
                      <tr>
                        <th>{t('nav.clients')}</th>
                        <th>{t('dash.method')}</th>
                        <th>Trx ID</th>
                        <th>{t('dash.amount')}</th>
                        <th>{t('dash.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <span className="demo-cell-main">
                              {payment.client?.name ?? '—'}
                            </span>
                            <span className="demo-cell-sub">
                              {payment.client?.publicId ?? payment.referenceCode ?? '—'}
                            </span>
                          </td>
                          <td>
                            <span className="demo-badge gray">{payment.method}</span>
                          </td>
                          <td className="mono">{payment.trxId ?? '—'}</td>
                          <td className="amount">{formatPaisa(payment.amount)}</td>
                          <td>
                            <span className={`demo-badge ${statusTone(payment.status)}`}>
                              {displayStatus(payment.status)}
                            </span>
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
                  <h3>{t('dash.pendingVerification')}</h3>
                  <p>{t('dash.paymentsCount').replace('{n}', String(data.pending.length))}</p>
                </div>
                <span className="demo-badge amber">{data.pending.length} pending</span>
              </div>
              {data.pending.length === 0 ? (
                <div className="live-empty">{t('dash.allVerified')}</div>
              ) : (
                <ul className="demo-list">
                  {data.pending.map((payment, index) => (
                    <li className="demo-list-item" key={payment.id}>
                      <span className={`demo-avatar-sm ${index === 0 ? 'orange' : ''}`}>
                        {(payment.client?.name ?? 'U')
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      <div>
                        <strong>{payment.client?.name ?? 'Unknown'}</strong>
                        <small>
                          {payment.trxId} · {formatDate(payment.createdAt)}
                        </small>
                      </div>
                      <span className="amount" style={{ marginLeft: 'auto', fontWeight: 750 }}>
                        {formatPaisa(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {data.pending[0] && canVerify ? (
                  <button
                    className="demo-btn primary sm"
                    type="button"
                    style={{ flex: 1 }}
                    disabled={verifying === data.pending[0].id}
                    onClick={() => onVerify(data.pending[0].id)}
                  >
                    <Icon name="check" size={14} />
                    {verifying === data.pending[0].id ? t('dash.verifying') : t('dash.verifyFirst')}
                  </button>
                ) : (
                  <span className="demo-badge gray">{t('dash.noPermVerify')}</span>
                )}
              </div>
              <p className="live-perm-note">{t('dash.verifyNote')}</p>
            </article>
          </section>

          <section className="demo-grid-3">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{t('dash.topDue')}</h3>
                  <p>{t('dash.topDueSub')}</p>
                </div>
                <span className="demo-badge red">{data.due?.count ?? 0}</span>
              </div>
              {topDue.length === 0 ? (
                <div className="live-empty">{t('dash.noDue')}</div>
              ) : (
                topDue.map((item) => (
                  <div className="demo-area-row" key={item.id}>
                    <div className="demo-area-top">
                      <strong>{item.client?.name ?? '—'}</strong>
                      <span>{formatPaisa(Number(item.dueAmount))}</span>
                    </div>
                    <div className="demo-progress">
                      <span
                        style={{
                          width: `${Math.round((Number(item.dueAmount) / maxDue) * 100)}%`,
                          background: 'linear-gradient(90deg, #fb7185, #e11d48)',
                        }}
                      />
                    </div>
                    <div className="demo-area-top">
                      <span>{item.client?.publicId ?? '—'}</span>
                      <span>{t('dash.dueOn').replace('{date}', formatDate(item.dueDate))}</span>
                    </div>
                  </div>
                ))
              )}
            </article>

            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{t('dash.packageMix')}</h3>
                  <p>{t('dash.byActiveClients')}</p>
                </div>
                <span className="demo-badge blue">{data.packages.length}</span>
              </div>
              {topPackages.length === 0 ? (
                <div className="live-empty">{t('dash.noPackages')}</div>
              ) : (
                topPackages.map((pkg) => (
                  <div className="demo-area-row" key={pkg.id}>
                    <div className="demo-area-top">
                      <strong>{pkg.name}</strong>
                      <span>
                        {pkg._count?.subscriptions ?? 0} {t('dash.subs')}
                      </span>
                    </div>
                    <div className="demo-progress">
                      <span
                        style={{
                          width: `${Math.round(
                            ((pkg._count?.subscriptions ?? 0) / maxPackage) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </article>

            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>{data.profit ? t('dash.profitTitle') : t('dash.quickActions')}</h3>
                  <p>{data.profit ? t('dash.vatExcluded') : t('dash.nextSteps')}</p>
                </div>
              </div>
              {data.profit ? (
                <>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>{t('dash.revenue')}</strong>
                      <span>{formatPaisa(data.profit.revenuePaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>{t('dash.upstreamCost')}</strong>
                      <span>{formatPaisa(data.profit.upstreamCostPaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>{t('dash.margin')}</strong>
                      <span>{formatPaisa(data.profit.grossMarginPaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-note" style={{ marginTop: 12 }}>
                    {t('dash.vatNote')} <strong>{formatPaisa(data.profit.vatPaisa)}</strong> —{' '}
                    {t('dash.vatNoteTail')}
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Link href="/clients?add=1" className="demo-btn primary">
                    <Icon name="plus" size={14} /> {t('dash.addClient')}
                  </Link>
                  <Link href="/clients" className="demo-btn">
                    <Icon name="users" size={14} /> {t('dash.clientList')}
                  </Link>
                </div>
              )}
            </article>
          </section>

          {data.totalClients === 0 ? (
            <div className="demo-note">
              <strong>{t('dash.getStarted')}</strong> {t('dash.noClients')}{' '}
              <Link href="/clients?add=1" className="demo-card-link">
                {t('dash.firstClient')} <Icon name="chevron-right" size={12} />
              </Link>
            </div>
          ) : null}
        </>
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
