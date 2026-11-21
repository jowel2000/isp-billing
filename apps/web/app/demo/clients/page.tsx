import Link from 'next/link';
import { Icon } from '@/components/icon';
import { clients, formatMoney, statusLabel } from '@/lib/mock-data';

const statusTone: Record<string, string> = {
  active: 'green',
  expired: 'red',
  inactive: 'amber',
  free: 'blue',
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

const areaOptions = ['সব এরিয়া', 'Muradnagar', 'Bhabanipur', 'Mochagora', 'Jatrapur'];

export default function DemoClientsPage() {
  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>ক্লায়েন্ট</h2>
          <p className="demo-page-sub">গ্রাহক, প্যাকেজ, এরিয়া ও ডিউ — এক জায়গায়</p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button" title="Demo only">
            <Icon name="download" size={15} />
            এক্সপোর্ট
          </button>
          <button className="demo-btn primary" type="button" title="Demo only">
            <Icon name="plus" size={15} />
            নতুন ক্লায়েন্ট
          </button>
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
          <p className="demo-stat-value">128</p>
          <p className="demo-stat-hint">+8 this month</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="wifi" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Active</p>
          <p className="demo-stat-value">112</p>
          <p className="demo-stat-hint">87.5% online healthy</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Outstanding Due</p>
          <p className="demo-stat-value">{formatMoney(84500)}</p>
          <p className="demo-stat-hint">18 clients pending · 3 overdue</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Collected (Nov)</p>
          <p className="demo-stat-value">৳ 3,12,400</p>
          <p className="demo-stat-hint">+12.4% vs October</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div className="demo-toolbar">
            <div className="demo-search-input">
              <Icon name="search" size={15} />
              <input placeholder="নাম, Client ID বা মোবাইল…" />
            </div>
            <select className="demo-select" defaultValue="সব এরিয়া" aria-label="Area">
              {areaOptions.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
            <button className="demo-btn ghost" type="button">
              <Icon name="filter" size={15} />
              ফিল্টার
            </button>
          </div>
          <div className="demo-tabs">
            <button className="demo-tab active" type="button">
              All
            </button>
            <button className="demo-tab" type="button">
              Active
            </button>
            <button className="demo-tab" type="button">
              Expired
            </button>
            <button className="demo-tab" type="button">
              Inactive
            </button>
          </div>
        </div>

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
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className="demo-avatar-sm">{initials(client.name)}</span>
                      <div>
                        <span className="demo-cell-main">{client.name}</span>
                        <span className="demo-cell-sub">
                          {client.id} · {client.phone}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{client.area}</td>
                  <td>{client.package}</td>
                  <td>
                    <span className={`demo-badge ${statusTone[client.status]}`}>
                      {statusLabel[client.status]}
                    </span>
                  </td>
                  <td className="amount">
                    {client.due > 0 ? formatMoney(client.due) : '—'}
                  </td>
                  <td>{client.expiry}</td>
                  <td>
                    <button className="demo-btn sm" type="button" title="Demo only">
                      <Icon name="eye" size={13} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="demo-pagination">
          <span>Showing 1–10 of 128 clients</span>
          <div className="demo-pagination-actions">
            <button className="demo-page-btn" type="button">
              Previous
            </button>
            <button className="demo-page-btn active" type="button">
              1
            </button>
            <button className="demo-page-btn" type="button">
              2
            </button>
            <button className="demo-page-btn" type="button">
              3
            </button>
            <button className="demo-page-btn" type="button">
              Next
            </button>
          </div>
        </div>
      </article>

      <div className="demo-note">
        <strong>ডেমো:</strong> এখানে মক ক্লায়েন্ট দেখানো হচ্ছে। আসল সিঙ্ক হলে Upstream
        প্যানেলের Client ID, PPPoE username, IP, MAC, লগইন হিস্ট্রি এখানে আসবে।
        <Link href="/demo/payments" className="demo-card-link" style={{ marginLeft: 8 }}>
          পেমেন্ট দেখুন <Icon name="chevron-right" size={12} />
        </Link>
      </div>
    </>
  );
}
