'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { RechargeModal } from '@/components/recharge-modal';
import { useLiveAuth } from '@/lib/live-auth';
import type { ApiClient, ApiPayment, SmsInboundRecord } from '@/lib/live-api';
import {
  displayStatus,
  formatDateTime,
  formatPaisa,
  getClients,
  getSmsInbound,
  getUnmatchedPayments,
  matchSmsPayment,
  statusTone,
} from '@/lib/live-api';

interface RechargeState {
  client?: ApiClient | null;
  payment?: ApiPayment | null;
}

export default function WrongRechargePage() {
  const { user } = useLiveAuth();
  const [unmatched, setUnmatched] = useState<ApiPayment[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ApiClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [recharge, setRecharge] = useState<RechargeState | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [smsUnmatched, setSmsUnmatched] = useState<SmsInboundRecord[]>([]);
  const [smsMatch, setSmsMatch] = useState<SmsInboundRecord | null>(null);
  const [smsSearch, setSmsSearch] = useState('');
  const [smsResults, setSmsResults] = useState<ApiClient[]>([]);
  const [smsSearching, setSmsSearching] = useState(false);
  const [smsSaving, setSmsSaving] = useState(false);

  const canSearch = user?.permissions.includes('clients.view') ?? false;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payments = await getUnmatchedPayments();
      setUnmatched(payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review queue লোড করা যায়নি');
      setUnmatched([]);
    }

    try {
      const sms = await getSmsInbound({ status: 'unmatched', limit: 50 });
      setSmsUnmatched(sms.data);
    } catch {
      setSmsUnmatched([]);
    }

    setLoading(false);
  }, [reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function searchClients() {
    if (!search.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const result = await getClients({ search: search.trim(), limit: 20 });
      setResults(result.data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'সার্চ করা যায়নি',
        error: true,
      });
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function searchSmsClients() {
    if (!smsSearch.trim()) return;
    setSmsSearching(true);
    try {
      const result = await getClients({ search: smsSearch.trim(), limit: 20 });
      setSmsResults(result.data);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'সার্চ করা যায়নি',
        error: true,
      });
      setSmsResults([]);
    } finally {
      setSmsSearching(false);
    }
  }

  async function resolveSmsToClient(client: ApiClient) {
    if (!smsMatch) return;
    setSmsSaving(true);
    try {
      const result = await matchSmsPayment(smsMatch.id, client.id);
      setToast({
        message: `${client.name}-এ match হয়েছে · ${result.status}`,
      });
      setSmsMatch(null);
      setSmsSearch('');
      setSmsResults([]);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Match করা যায়নি',
        error: true,
      });
    } finally {
      setSmsSaving(false);
    }
  }

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>Wrong Recharge</h2>
          <p className="demo-page-sub">
            ভুল reference পেমেন্ট মিলিয়ে recharge — Super Admin, Admin, Staff
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

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
            <span className="demo-badge amber">Review</span>
          </div>
          <p className="demo-stat-label">Unmatched Payments</p>
          <p className="demo-stat-value">{unmatched.length}</p>
          <p className="demo-stat-hint">ভুল reference / invoice ছাড়া</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Pending Amount</p>
          <p className="demo-stat-value">
            {formatPaisa(
              unmatched.reduce((sum, payment) => sum + Number(payment.amount), 0),
            )}
          </p>
          <p className="demo-stat-hint">এখনো verify হয়নি</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="users" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Search & Recharge</p>
          <p className="demo-stat-value">৪-ডিজিট</p>
          <p className="demo-stat-hint">User ID / মোবাইল / নাম</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="check" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Access</p>
          <p className="demo-stat-value">3 Roles</p>
          <p className="demo-stat-hint">Super Admin / Admin / Staff</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>ক্লায়েন্ট সার্চ করে Recharge</h3>
            <p>নাম, মোবাইল বা ৪-ডিজিট User ID দিয়ে খুঁজুন</p>
          </div>
        </div>

        {canSearch ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="demo-search-input" style={{ flex: 1 }}>
                <Icon name="search" size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') searchClients();
                  }}
                  placeholder="যেমন Rahim / 017... / 1234"
                />
              </div>
              <button
                className="demo-btn primary"
                type="button"
                onClick={searchClients}
                disabled={searching || !search.trim()}
              >
                <Icon name="search" size={14} />
                {searching ? 'খুঁজছে…' : 'Search'}
              </button>
            </div>

            {searched && !searching && results.length === 0 ? (
              <div className="live-empty">এই সার্চে কোনো ক্লায়েন্ট পাওয়া যায়নি।</div>
            ) : null}

            {results.length > 0 ? (
              <div className="demo-table-wrap" style={{ marginTop: 14 }}>
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>User ID</th>
                      <th>Area</th>
                      <th>Package</th>
                      <th>Due</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((client) => (
                      <tr key={client.id}>
                        <td>
                          <span className="demo-cell-main">{client.name}</span>
                          <span className="demo-cell-sub">{client.mobile}</span>
                        </td>
                        <td className="mono">{client.paymentCode ?? '—'}</td>
                        <td>{client.area?.name ?? '—'}</td>
                        <td>{client.subscriptions?.[0]?.package?.name ?? '—'}</td>
                        <td className="amount">
                          {client.duePaisa > 0 ? formatPaisa(client.duePaisa) : '—'}
                        </td>
                        <td>
                          <button
                            className="demo-btn primary sm"
                            type="button"
                            onClick={() => setRecharge({ client, payment: null })}
                          >
                            <Icon name="wallet" size={13} />
                            Recharge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <div className="live-empty">ক্লায়েন্ট সার্চের permission নেই।</div>
        )}
      </article>

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>Unmatched Payments</h3>
            <p>ভুল reference বা invoice ছাড়া পেমেন্ট</p>
          </div>
          <span className="demo-badge red">{unmatched.length}</span>
        </div>

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            Review queue লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : unmatched.length === 0 ? (
          <div className="live-empty">কোনো unmatched payment নেই ✅</div>
        ) : (
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Provider</th>
                  <th>Sender</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <span className="demo-cell-main">
                        {payment.client?.name ?? 'Unknown'}
                      </span>
                      <span className="demo-cell-sub">
                        {payment.client?.publicId ?? '—'}
                      </span>
                    </td>
                    <td className="amount">{formatPaisa(payment.amount)}</td>
                    <td className="mono">{payment.referenceCode ?? '—'}</td>
                    <td>
                      <span className="demo-badge gray">
                        {payment.provider} / {payment.accountType}
                      </span>
                    </td>
                    <td>{payment.senderNumber ?? '—'}</td>
                    <td>{formatDateTime(payment.createdAt)}</td>
                    <td>
                      <span className={`demo-badge ${statusTone(payment.status)}`}>
                        {displayStatus(payment.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="demo-btn primary sm"
                        type="button"
                        onClick={() => setRecharge({ payment, client: null })}
                      >
                        Resolve
                      </button>
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
            <h3>SMS Payments — Reference নেই</h3>
            <p>
              Personal নম্বরে Reference ছাড়া টাকা এলে এখানে রিভিউ করুন — sender
              number দেখে সঠিক ক্লায়েন্ট বেছে নিন
            </p>
          </div>
          <span className="demo-badge red">{smsUnmatched.length}</span>
        </div>

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            SMS queue লোড হচ্ছে…
          </div>
        ) : smsUnmatched.length === 0 ? (
          <div className="live-empty">Reference-ছাড়া কোনো SMS নেই ✅</div>
        ) : (
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Trx ID</th>
                  <th>Sender</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {smsUnmatched.map((sms) => (
                  <tr key={sms.id}>
                    <td>{formatDateTime(sms.createdAt)}</td>
                    <td className="amount">
                      {sms.amountPaisa ? formatPaisa(sms.amountPaisa) : '—'}
                    </td>
                    <td className="mono">{sms.trxId ?? '—'}</td>
                    <td className="mono">{sms.senderMobile ?? sms.sender ?? '—'}</td>
                    <td>{sms.provider ?? '—'}</td>
                    <td>
                      <span className={`demo-badge ${statusTone(sms.status)}`}>
                        {displayStatus(sms.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="demo-btn primary sm"
                        type="button"
                        onClick={() => {
                          setSmsMatch(sms);
                          setSmsSearch('');
                          setSmsResults([]);
                        }}
                      >
                        Match Client
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="demo-note">
        <strong>নিয়ম:</strong> Reference থাকলে সেটাই একমাত্র ম্যাচিং কী — ভুল হলে
        Wrong Recharge-এ রিভিউ। Personal নম্বরে Reference না থাকলে sender number দেখে
        এখান থেকে ম্যানুয়ালি match করতে হবে; কোনো অনুমানমূলক auto-payment হবে না।
      </div>

      {recharge ? (
        <RechargeModal
          client={recharge.client}
          payment={recharge.payment}
          onClose={() => setRecharge(null)}
          onSaved={(message) => {
            setRecharge(null);
            setToast({ message });
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {smsMatch ? (
        <div className="live-modal-backdrop" onMouseDown={() => setSmsMatch(null)}>
          <div
            className="live-modal wide"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>Reference-ছাড়া SMS Match</h3>
                <p>
                  {smsMatch.amountPaisa ? formatPaisa(smsMatch.amountPaisa) : '—'} ·{' '}
                  {smsMatch.trxId ?? 'Trx নেই'} · {smsMatch.senderMobile ?? 'sender নেই'}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setSmsMatch(null)}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
              <div className="demo-search-input" style={{ flex: 1 }}>
                <Icon name="search" size={15} />
                <input
                  value={smsSearch}
                  onChange={(event) => setSmsSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') searchSmsClients();
                  }}
                  placeholder="নাম / মোবাইল / ৪-ডিজিট ID"
                />
              </div>
              <button
                className="demo-btn primary"
                type="button"
                onClick={searchSmsClients}
                disabled={smsSearching || !smsSearch.trim()}
              >
                <Icon name="search" size={14} />
                {smsSearching ? 'খুঁজছে…' : 'Search'}
              </button>
            </div>

            {smsResults.length === 0 ? (
              <div className="live-empty">
                ক্লায়েন্ট খুঁজে বেছে নিন — match করলে payment verify হবে।
              </div>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>User ID</th>
                      <th>Mobile</th>
                      <th>Area</th>
                      <th>Due</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smsResults.map((client) => (
                      <tr key={client.id}>
                        <td>{client.name}</td>
                        <td className="mono">{client.paymentCode ?? '—'}</td>
                        <td className="mono">{client.mobile}</td>
                        <td>{client.area?.name ?? '—'}</td>
                        <td className="amount">
                          {client.duePaisa > 0 ? formatPaisa(client.duePaisa) : '—'}
                        </td>
                        <td>
                          <button
                            className="demo-btn primary sm"
                            type="button"
                            disabled={smsSaving}
                            onClick={() => resolveSmsToClient(client)}
                          >
                            {smsSaving ? 'Matching…' : 'Match'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
