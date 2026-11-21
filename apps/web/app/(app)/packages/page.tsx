'use client';

import { useCallback, useEffect, useState } from 'react';
import { AreaFormModal } from '@/components/area-form-modal';
import { Icon } from '@/components/icon';
import { PackageFormModal } from '@/components/package-form-modal';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiArea, ApiPackage } from '@/lib/live-api';
import { formatPaisa, getAreas, getPackages } from '@/lib/live-api';

export default function LivePackagesPage() {
  const { user } = useLiveAuth();
  const [packages, setPackages] = useState<ApiPackage[]>([]);
  const [areas, setAreas] = useState<ApiArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [packageModal, setPackageModal] = useState<{
    mode: 'add' | 'edit';
    pkg?: ApiPackage | null;
  } | null>(null);
  const [areaModal, setAreaModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const canEditPackage = user?.permissions.includes('packages.edit') ?? false;
  const canEditArea = user?.permissions.includes('areas.edit') ?? false;
  const canViewCost = user?.permissions.includes('packages.view_cost') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([getPackages(), getAreas()]);
    if (results[0].status === 'fulfilled') setPackages(results[0].value);
    if (results[1].status === 'fulfilled') setAreas(results[1].value);
    if (results.every((result) => result.status === 'rejected')) {
      setError('প্যাকেজ/এরিয়া লোড করা যায়নি');
    }
    setLoading(false);
  }, [reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  const activePackages = packages.filter((pkg) => pkg.status === 'active').length;
  const totalSubscriptions = packages.reduce(
    (sum, pkg) => sum + (pkg._count?.subscriptions ?? 0),
    0,
  );
  const maxClients = Math.max(
    ...packages.map((pkg) => pkg._count?.subscriptions ?? 0),
    1,
  );

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>প্যাকেজ ও এরিয়া</h2>
          <p className="demo-page-sub">
            স্পিড, দাম, upstream cost, CBP এবং সার্ভিস এরিয়া
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
          {canEditArea ? (
            <button className="demo-btn" type="button" onClick={() => setAreaModal(true)}>
              <Icon name="plus" size={15} />
              নতুন এরিয়া
            </button>
          ) : null}
          {canEditPackage ? (
            <button
              className="demo-btn primary"
              type="button"
              onClick={() => setPackageModal({ mode: 'add' })}
            >
              <Icon name="plus" size={15} />
              নতুন প্যাকেজ
            </button>
          ) : null}
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="package" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Total Packages</p>
          <p className="demo-stat-value">{packages.length}</p>
          <p className="demo-stat-hint">{activePackages} active</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="users" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Assigned Clients</p>
          <p className="demo-stat-value">{totalSubscriptions}</p>
          <p className="demo-stat-hint">সব প্যাকেজ মিলিয়ে</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="home" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Service Areas</p>
          <p className="demo-stat-value">{areas.length}</p>
          <p className="demo-stat-hint">সক্রিয় এরিয়া</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Most Popular</p>
          <p className="demo-stat-value">
            {[...packages].sort(
              (a, b) => (b._count?.subscriptions ?? 0) - (a._count?.subscriptions ?? 0),
            )[0]?.name ?? '—'}
          </p>
          <p className="demo-stat-hint">
            {[...packages].sort(
              (a, b) => (b._count?.subscriptions ?? 0) - (a._count?.subscriptions ?? 0),
            )[0]?._count?.subscriptions ?? 0}{' '}
            জন
          </p>
        </article>
      </section>

      {loading ? (
        <div className="demo-card">
          <div className="live-loading">
            <div className="live-spinner" />
            লোড হচ্ছে…
          </div>
        </div>
      ) : error ? (
        <div className="live-error">{error}</div>
      ) : (
        <>
          <section className="demo-package-grid">
            {packages.length === 0 ? (
              <div className="demo-card live-empty">কোনো প্যাকেজ নেই।</div>
            ) : (
              packages.map((pkg) => (
                <article className="demo-package-card" key={pkg.id}>
                  <div className="demo-package-top">
                    <div>
                      <p className="demo-package-speed">
                        {pkg.name}
                        <small>{pkg.speedMbps ? `${pkg.speedMbps} Mbps` : 'speed'}</small>
                      </p>
                      <p className="demo-package-price">
                        <strong>{formatPaisa(pkg.localPrice)}</strong> / মাস
                      </p>
                    </div>
                    <span
                      className={`demo-badge ${pkg.status === 'active' ? 'green' : 'gray'}`}
                    >
                      {pkg.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="demo-package-meta">
                    <span>সক্রিয় ক্লায়েন্ট</span>
                    <strong style={{ color: '#0f172a' }}>
                      {pkg._count?.subscriptions ?? 0} জন
                    </strong>
                  </div>
                  <div className="demo-progress">
                    <span
                      style={{
                        width: `${Math.round(
                          ((pkg._count?.subscriptions ?? 0) / maxClients) * 100,
                        )}%`,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 14,
                      gap: 8,
                    }}
                  >
                    <span style={{ color: '#94a3b8', fontSize: '0.64rem' }}>
                      {canViewCost && pkg.upstreamPrice !== null
                        ? `Cost ${formatPaisa(pkg.upstreamPrice)} · `
                        : ''}
                      CBP {formatPaisa(pkg.cbp)}
                    </span>
                    {canEditPackage ? (
                      <button
                        className="demo-btn sm"
                        type="button"
                        onClick={() => setPackageModal({ mode: 'edit', pkg })}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>সার্ভিস এরিয়া</h3>
                <p>এরিয়া অনুযায়ী ক্লায়েন্ট সংখ্যা</p>
              </div>
              <span className="demo-badge blue">{areas.length}</span>
            </div>
            {areas.length === 0 ? (
              <div className="live-empty">কোনো এরিয়া নেই।</div>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>District</th>
                      <th>Thana</th>
                      <th>Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((area) => (
                      <tr key={area.id}>
                        <td>
                          <span className="demo-cell-main">{area.name}</span>
                        </td>
                        <td>{area.district || '—'}</td>
                        <td>{area.thana || '—'}</td>
                        <td className="amount">{area._count?.clients ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      )}

      <div className="demo-note">
        <strong>মার্জিন:</strong> লোকাল মূল্য − upstream cost = gross margin। CBP শুধু
        Sub-PoP-এর জন্য ব্যবহৃত হবে।
      </div>

      {packageModal ? (
        <PackageFormModal
          key={`${packageModal.mode}-${packageModal.pkg?.id ?? 'new'}`}
          mode={packageModal.mode}
          pkg={packageModal.pkg}
          canViewCost={canViewCost}
          onClose={() => setPackageModal(null)}
          onSaved={(message) => {
            setPackageModal(null);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {areaModal ? (
        <AreaFormModal
          onClose={() => setAreaModal(false)}
          onSaved={(message) => {
            setAreaModal(false);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
