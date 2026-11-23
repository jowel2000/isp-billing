'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getSyncStatus, type SyncStatusResponse } from '@/lib/live-api';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import { Icon } from './icon';

const VISIBLE_ROLES = ['super_admin', 'admin', 'staff'];

const STEP_KEYS: Record<string, string> = {
  queued: 'sync.queued',
  sending_otp: 'sync.sendingOtp',
  waiting_otp: 'sync.waitingOtp',
  verifying_otp: 'sync.verifyingOtp',
  login_success: 'sync.loginSuccess',
  scraping: 'sync.scraping',
  uploading: 'sync.uploading',
  finished: 'sync.finished',
  failed: 'sync.failed',
};

function formatClock(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SyncStatusBar() {
  const { user } = useLiveAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);

  const allowed = user ? VISIBLE_ROLES.includes(user.role) : false;
  const isSuperAdmin = user?.role === 'super_admin';

  const load = useCallback(async () => {
    try {
      const next = await getSyncStatus();
      setStatus(next);
      setFailedToLoad(false);
      return next;
    } catch {
      setFailedToLoad(true);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const next = await load();
      if (!active) return;
      const delay = next?.run?.status === 'running' ? 2000 : 15000;
      timer = setTimeout(tick, delay);
    };

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [allowed, load]);

  if (!allowed) return null;

  const run = status?.run ?? null;
  const lockUntil = status?.lockUntil ?? null;
  const locked = Boolean(lockUntil && new Date(lockUntil).getTime() > Date.now());
  const step = run?.currentStep ?? 'idle';
  const failed = run?.status === 'failed' || step === 'failed' || failedToLoad;
  const success = step === 'finished' || step === 'login_success';

  const tone = locked || failed ? 'red' : success ? 'green' : run?.status === 'running' ? 'amber' : 'gray';
  const label = locked
    ? t('sync.locked')
    : run
      ? t(STEP_KEYS[step] ?? 'sync.queued')
      : t('sync.idle');

  const detail = locked
    ? `${t('sync.lockedHint')} ${formatClock(lockUntil)}`
    : run?.stepMessage || '';

  const lastSmsHint =
    step === 'waiting_otp' && status?.lastSmsAt
      ? `${t('sync.lastSms')} ${formatClock(status.lastSmsAt)}`
      : step === 'waiting_otp'
        ? t('sync.noSmsYet')
        : '';

  return (
    <div className={`sync-status-bar ${tone}`}>
      <span className="sync-status-dot" />
      <strong className="sync-status-label">{label}</strong>

      {detail ? <span className="sync-status-text">{detail}</span> : null}
      {lastSmsHint ? <span className="sync-status-text">{lastSmsHint}</span> : null}

      {run?.status === 'running' ? (
        <span className="sync-status-progress">{Math.round(run.progress ?? 0)}%</span>
      ) : null}

      <span className="sync-status-time">
        {locked
          ? ''
          : run
            ? `${formatClock(run.startedAt)}${run.finishedAt ? ` → ${formatClock(run.finishedAt)}` : ''}`
            : t('sync.noRun')}
      </span>

      {isSuperAdmin ? (
        <Link href="/errors" className="sync-status-errors" title={t('sync.openErrors')}>
          <Icon name="alert" size={13} />
          {t('sync.errors')}
          {status?.errorCount ? <b>{status.errorCount}</b> : null}
        </Link>
      ) : null}
    </div>
  );
}
