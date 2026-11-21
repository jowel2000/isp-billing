'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useLiveAuth } from '@/lib/live-auth';
import type {
  CollectionReport,
  DueReport,
  MonthlyCollection,
  ProfitReport,
} from '@/lib/live-api';
import {
  formatDate,
  formatPaisa,
  getCollectionReport,
  getDueReport,
  getMonthlyCollection,
  getProfitReport,
} from '@/lib/live-api';

export default function LiveReportsPage() {
  const { user } = useLiveAuth();
  const [collection, setCollection] = useState<CollectionReport | null>(null);
  const [due, setDue] = useState<DueReport | null>(null);
  const [monthly, setMonthly] = useState<MonthlyCollection | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [profitRange, setProfitRange] = useState<'today' | 'week' | '15d' | 'month'>(
    'month',
  );

  const canViewFinancial = user?.permissions.includes('reports.financial') ?? false;
  const canViewProfit = user?.permissions.includes('reports.profit') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const requests: Array<Promise<any>> = [
      getCollectionReport(),
      getDueReport(),
      getMonthlyCollection(),
    ];
    if (canViewProfit) {
      const now = new Date();
      const from = new Date(now);
      if (profitRange === 'today') from.setHours(0, 0, 0, 0);
      if (profitRange === 'week') from.setDate(now.getDate() - 7);
      if (profitRange === '15d') from.setDate(now.getDate() - 15);
      if (profitRange === 'month') from.setDate(1);
      requests.push(getProfitReport(from.toISOString(), now.toISOString()));
    }

    const results = await Promise.allSettled(requests);
    const value = (index: number, fallback: any) => {
      const result = results[index];
      return result && result.status === 'fulfilled' ? result.value : fallback;
    };

    setCollection(value(0, null));
    setDue(value(1, null));
    setMonthly(value(2, null));
    setProfit(canViewProfit ? value(3, null) : null);

    if (results.every((result) => result.status === 'rejected')) {
      setError('রিপোর্ট লোড করা যায়নি');
    }
    setLoading(false);
  }, [canViewProfit, reloadKey, profitRange]);

  useEffect(() => {
    load();
  }, [load]);

  const monthlyData = monthly?.data ?? [];
  const maxMonthly = Math.max(...monthlyData.map((point) => point.totalPaisa / 100), 1);
  const methodRows = collection?.byMethod ?? [];
  const maxMethod = Math.max(...methodRows.map((row) => row.totalPaisa), 1);
  const topDue = (due?.top ?? []).slice(0, 8);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>রিপোর্ট</h2>
          <p className="demo-page-sub">
            কালেকশন, Due, VAT ও margin — লাইভ ডেটা
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
            রিপোর্ট লোড হচ্ছে…
          </div>
        </div>
      ) : error ? (
        <div className="live-error">{error}</div>
      ) : (
        <>
          <section className="demo-stat-grid">
            <article className="demo-stat-card">
              <div className="demo-stat-top">
                <div className="demo-stat-icon green">
                  <Icon name="wallet" size={19} />
                </div>
              </div>
              <p className="demo-stat-label">Collected</p>
              <p className="demo-stat-value">{formatPaisa(collection?.totalPaisa ?? 0)}</p>
              <p className="demo-stat-hint">{collection?.count ?? 0} verified payments</p>
            </article>
            <article className="demo-stat-card">
              <div className="demo-stat-top">
                <div className="demo-stat-icon red">
                  <Icon name="clock" size={19} />
                </div>
              </div>
              <p className="demo-stat-label">Outstanding Due</p>
              <p className="demo-stat-value">{formatPaisa(due?.totalDuePaisa ?? 0)}</p>
              <p className="demo-stat-hint">{due?.count ?? 0} invoices</p>
            </article>
            <article className="demo-stat-card">
              <div className="demo-stat-top">
                <div className="demo-stat-icon blue">
                  <Icon name="invoice" size={19} />
                </div>
              </div>
              <p className="demo-stat-label">VAT Collected</p>
              <p className="demo-stat-value">
                {canViewFinancial && profit ? formatPaisa(profit.vatPaisa) : '—'}
              </p>
              <p className="demo-stat-hint">
                {canViewFinancial ? '5% VAT snapshot' : 'reports.financial permission নেই'}
              </p>
            </article>
            <article className="demo-stat-card">
              <div className="demo-stat-top">
                <div className="demo-stat-icon orange">
                  <Icon name="trend-up" size={19} />
                </div>
              </div>
              <p className="demo-stat-label">Gross Margin</p>
              <p className="demo-stat-value">
                {canViewProfit && profit ? formatPaisa(profit.grossMarginPaisa) : '—'}
              </p>
              <p className="demo-stat-hint">
                {canViewProfit ? 'Revenue − upstream cost' : 'শুধু Super Admin'}
              </p>
            </article>
          </section>

          <section className="demo-grid-2">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>মাসিক কালেকশন</h3>
                  <p>শেষ ৮ মাস</p>
                </div>
                <span className="demo-badge green">Live</span>
              </div>
              {monthlyData.length === 0 ? (
                <div className="live-empty">এখনো কোনো কালেকশন নেই।</div>
              ) : (
                <div className="demo-bars">
                  {monthlyData.map((point, index) => (
                    <div className="demo-bar-col" key={point.month}>
                      <div
                        className={`demo-bar ${index % 3 === 2 ? 'alt' : ''}`}
                        style={{
                          height: `${Math.round(
                            (point.totalPaisa / 100 / maxMonthly) * 100,
                          )}%`,
                        }}
                        title={formatPaisa(point.totalPaisa)}
                      />
                      <span>{point.month}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>মেথড অনুযায়ী</h3>
                  <p>Verified collection</p>
                </div>
              </div>
              {methodRows.length === 0 ? (
                <div className="live-empty">কোনো verified payment নেই।</div>
              ) : (
                methodRows.map((row) => (
                  <div className="demo-area-row" key={row.method}>
                    <div className="demo-area-top">
                      <strong>{row.method === 'bkash' ? 'bKash' : 'Cash'}</strong>
                      <span>{formatPaisa(row.totalPaisa)}</span>
                    </div>
                    <div className="demo-progress">
                      <span
                        style={{
                          width: `${Math.round((row.totalPaisa / maxMethod) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="demo-area-top">
                      <span>{row.count} payments</span>
                    </div>
                  </div>
                ))
              )}
            </article>
          </section>

          <section className="demo-grid-2 equal">
            <article className="demo-card">
              <div className="demo-card-head">
                <div>
                  <h3>Top Due</h3>
                  <p>সবচেয়ে বেশি বাকি</p>
                </div>
                <span className="demo-badge red">{due?.count ?? 0}</span>
              </div>
              {topDue.length === 0 ? (
                <div className="live-empty">কোনো due নেই ✅</div>
              ) : (
                <div className="demo-table-wrap">
                  <table className="demo-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Invoice</th>
                        <th>Due</th>
                        <th>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDue.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="demo-cell-main">{item.client?.name ?? '—'}</span>
                            <span className="demo-cell-sub">
                              {item.client?.publicId ?? '—'}
                            </span>
                          </td>
                          <td className="mono">{item.number}</td>
                          <td className="amount">{formatPaisa(item.dueAmount)}</td>
                          <td>{formatDate(item.dueDate)}</td>
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
                  <h3>VAT ও Margin</h3>
                  <p>Financial snapshot</p>
                </div>
                {canViewProfit ? (
                  <div className="demo-tabs">
                    {[
                      { key: 'today', label: 'আজ' },
                      { key: 'week', label: 'সপ্তাহ' },
                      { key: '15d', label: '১৫ দিন' },
                      { key: 'month', label: 'মাস' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        className={`demo-tab ${
                          profitRange === item.key ? 'active' : ''
                        }`}
                        type="button"
                        onClick={() =>
                          setProfitRange(
                            item.key as 'today' | 'week' | '15d' | 'month',
                          )
                        }
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {!canViewProfit || !profit ? (
                <div className="live-empty">
                  Profit রিপোর্ট শুধু <strong>Super Admin</strong> দেখতে পারবে।
                </div>
              ) : (
                <>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>Collected</strong>
                      <span>{formatPaisa(profit.collectedPaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>VAT</strong>
                      <span>{formatPaisa(profit.vatPaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>Revenue (excl. VAT)</strong>
                      <span>{formatPaisa(profit.revenuePaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>Upstream cost</strong>
                      <span>{formatPaisa(profit.upstreamCostPaisa)}</span>
                    </div>
                  </div>
                  <div className="demo-area-row">
                    <div className="demo-area-top">
                      <strong>Gross margin</strong>
                      <span>{formatPaisa(profit.grossMarginPaisa)}</span>
                    </div>
                  </div>
                </>
              )}
            </article>
          </section>

          <div className="demo-note">
            <strong>নোট:</strong> VAT snapshot invoice তৈরির সময় সংরক্ষিত হয়, তাই পরে
            rate বদলালেও পুরনো রিপোর্ট বদলাবে না।
          </div>
        </>
      )}
    </>
  );
}
