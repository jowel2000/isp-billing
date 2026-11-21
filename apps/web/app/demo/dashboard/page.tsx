import Link from 'next/link';
import { RevenueChart, StatusDonut } from '@/components/demo-charts';
import { Icon, type IconName } from '@/components/icon';
import {
  areaCollections,
  clientStatus,
  dashboardStats,
  formatMoney,
  packages,
  pendingPayments,
  recentPayments,
  revenueSeries,
  statusLabel,
} from '@/lib/mock-data';

const paymentTone: Record<string, string> = {
  verified: 'green',
  pending: 'amber',
  rejected: 'red',
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function DemoDashboardPage() {
  const totalClients = clientStatus.reduce((sum, item) => sum + item.value, 0);
  const maxArea = Math.max(...areaCollections.map((area) => area.collected));
  const topPackages = packages
    .filter((item) => item.clients > 0)
    .sort((a, b) => b.clients - a.clients)
    .slice(0, 4);
  const maxPackage = Math.max(...topPackages.map((item) => item.clients));

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>ড্যাশবোর্ড</h2>
          <p className="demo-page-sub">
            আজকের নেটওয়ার্ক, কালেকশন ও পেমেন্টের সারসংক্ষেপ — নভেম্বর ২০২৬
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" title="Demo only">
            <Icon name="clock" size={15} />
            নভেম্বর ২০২৬
          </button>
          <button className="demo-btn primary" type="button" title="Demo only">
            <Icon name="plus" size={15} />
            নতুন ক্লায়েন্ট
          </button>
        </div>
      </div>

      <section className="demo-stat-grid">
        {dashboardStats.map((stat) => (
          <article className="demo-stat-card" key={stat.label}>
            <div className="demo-stat-top">
              <div className={`demo-stat-icon ${stat.tone}`}>
                <Icon name={stat.icon as IconName} size={19} />
              </div>
              <span className={`demo-trend ${stat.trend}`}>
                <Icon
                  name={
                    stat.trend === 'warn'
                      ? 'alert'
                      : stat.trend === 'up'
                        ? 'trend-up'
                        : 'trend-down'
                  }
                  size={13}
                />
                {stat.delta}
              </span>
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
              <h3>মাসিক কালেকশন</h3>
              <p>bKash + Cash · গত ৮ মাস</p>
            </div>
            <div className="demo-tabs">
              <button className="demo-tab active" type="button">
                ৮ মাস
              </button>
              <button className="demo-tab" type="button">
                ১২ মাস
              </button>
            </div>
          </div>
          <div className="demo-chart-total">
            <strong>{formatMoney(312400)}</strong>
            <span>এই মাসে সংগৃহীত</span>
          </div>
          <RevenueChart data={revenueSeries} />
          <div className="demo-chart-legend">
            <span>
              <i className="demo-legend-dot" style={{ background: '#f59e0b' }} />
              Collection
            </span>
            <span>
              <i className="demo-legend-dot" style={{ background: '#e2e8f0' }} />
              Target ৳ 3,50,000
            </span>
          </div>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>ক্লায়েন্ট স্ট্যাটাস</h3>
              <p>মোট ১২৮ জন ক্লায়েন্ট</p>
            </div>
            <Link href="/demo/clients" className="demo-card-link">
              সব দেখুন <Icon name="chevron-right" size={13} />
            </Link>
          </div>
          <StatusDonut slices={clientStatus} total={totalClients} label="Clients" />
          <div className="demo-note" style={{ marginTop: 16 }}>
            <strong>৯ জন expired</strong> — তাদের মধ্যে ৬ জনের due আছে। Due reminder
            পাঠানো হয়েছে।
          </div>
        </article>
      </section>

      <section className="demo-grid-2">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>সাম্প্রতিক পেমেন্ট</h3>
              <p>সর্বশেষ bKash ও ক্যাশ ট্রানজেকশন</p>
            </div>
            <Link href="/demo/payments" className="demo-card-link">
              সব পেমেন্ট <Icon name="chevron-right" size={13} />
            </Link>
          </div>
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>ক্লায়েন্ট</th>
                  <th>মেথড</th>
                  <th>Trx ID</th>
                  <th>পরিমাণ</th>
                  <th>স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <span className="demo-cell-main">{payment.client}</span>
                      <span className="demo-cell-sub">{payment.clientId}</span>
                    </td>
                    <td>
                      <span className="demo-badge gray">{payment.method}</span>
                    </td>
                    <td className="mono">{payment.trxId}</td>
                    <td className="amount">{formatMoney(payment.amount)}</td>
                    <td>
                      <span className={`demo-badge ${paymentTone[payment.status]}`}>
                        {statusLabel[payment.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>ভেরিফিকেশন অপেক্ষায়</h3>
              <p>{pendingPayments.length}টি bKash পেমেন্ট</p>
            </div>
            <span className="demo-badge amber">{pendingPayments.length} pending</span>
          </div>
          <ul className="demo-list">
            {pendingPayments.map((payment, index) => (
              <li className="demo-list-item" key={payment.id}>
                <span className={`demo-avatar-sm ${index === 0 ? 'orange' : ''}`}>
                  {initials(payment.client)}
                </span>
                <div>
                  <strong>{payment.client}</strong>
                  <small>
                    {payment.trxId} · {payment.submitted}
                  </small>
                </div>
                <span className="amount" style={{ marginLeft: 'auto', fontWeight: 750 }}>
                  {formatMoney(payment.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Link href="/demo/payments" className="demo-btn primary sm" style={{ flex: 1 }}>
              <Icon name="check" size={14} />
              ভেরিফিকেশন কিউ
            </Link>
            <button className="demo-btn ghost sm" type="button">
              <Icon name="eye" size={14} />
              বিস্তারিত
            </button>
          </div>
        </article>
      </section>

      <section className="demo-grid-3">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>এরিয়া কালেকশন</h3>
              <p>এই মাসের আদায়</p>
            </div>
            <Link href="/demo/reports" className="demo-card-link">
              রিপোর্ট
            </Link>
          </div>
          {areaCollections.map((area) => (
            <div className="demo-area-row" key={area.area}>
              <div className="demo-area-top">
                <strong>{area.area}</strong>
                <span>{formatMoney(area.collected)}</span>
              </div>
              <div className="demo-progress">
                <span style={{ width: `${Math.round((area.collected / maxArea) * 100)}%` }} />
              </div>
              <div className="demo-area-top">
                <span>{area.clients} ক্লায়েন্ট</span>
                <span>Due {formatMoney(area.due)}</span>
              </div>
            </div>
          ))}
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>প্যাকেজ মিক্স</h3>
              <p>সক্রিয় ক্লায়েন্ট অনুযায়ী</p>
            </div>
            <Link href="/demo/packages" className="demo-card-link">
              প্যাকেজ
            </Link>
          </div>
          {topPackages.map((item) => (
            <div className="demo-area-row" key={item.name}>
              <div className="demo-area-top">
                <strong>{item.name}</strong>
                <span>{item.clients} জন</span>
              </div>
              <div className="demo-progress">
                <span style={{ width: `${Math.round((item.clients / maxPackage) * 100)}%` }} />
              </div>
            </div>
          ))}
          <div className="demo-note" style={{ marginTop: 12 }}>
            সবচেয়ে জনপ্রিয়: <strong>25 Mbps</strong> — ৭২ জন ক্লায়েন্ট।
          </div>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>অ্যাক্টিভিটি</h3>
              <p>সাম্প্রতিক ঘটনা</p>
            </div>
          </div>
          <ul className="demo-list">
            {[
              {
                title: 'bKash পেমেন্ট verified',
                detail: 'Rahim Uddin · ৳250',
                time: '১০ মিনিট',
                tone: 'green',
                icon: 'check' as const,
              },
              {
                title: 'নতুন ক্লায়েন্ট যোগ',
                detail: 'Shahida Begum · 40 Mbps',
                time: '৩৫ মিনিট',
                tone: 'blue',
                icon: 'users' as const,
              },
              {
                title: 'প্যাকেজ পরিবর্তন',
                detail: 'Tanvir Ahmed · 50 Mbps',
                time: '১ ঘণ্টা',
                tone: 'orange',
                icon: 'package' as const,
              },
              {
                title: 'Due reminder',
                detail: '১৮ জন ক্লায়েন্ট',
                time: '২ ঘণ্টা',
                tone: '',
                icon: 'sms' as const,
              },
            ].map((item) => (
              <li className="demo-list-item" key={item.title}>
                <span className={`demo-avatar-sm ${item.tone}`}>
                  <Icon name={item.icon} size={14} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <span className="demo-list-time">{item.time}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}
