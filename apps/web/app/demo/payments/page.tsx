import { Icon } from '@/components/icon';
import {
  formatMoney,
  pendingPayments,
  recentPayments,
  statusLabel,
} from '@/lib/mock-data';

const tone: Record<string, string> = {
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

export default function DemoPaymentsPage() {
  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>পেমেন্ট</h2>
          <p className="demo-page-sub">
            bKash ট্রানজেকশন, ক্যাশ কালেকশন ও ভেরিফিকেশন কিউ
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button">
            <Icon name="download" size={15} />
            এক্সপোর্ট
          </button>
          <button className="demo-btn primary" type="button">
            <Icon name="plus" size={15} />
            ক্যাশ পেমেন্ট
          </button>
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="clock" size={19} />
            </div>
            <span className="demo-trend up">Action needed</span>
          </div>
          <p className="demo-stat-label">Pending Verification</p>
          <p className="demo-stat-value">{pendingPayments.length}</p>
          <p className="demo-stat-hint">bKash Trx ID যাচাই করুন</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="check" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Verified Today</p>
          <p className="demo-stat-value">24</p>
          <p className="demo-stat-hint">৩ জন স্টাফ যুক্ত</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Collected Today</p>
          <p className="demo-stat-value">{formatMoney(18450)}</p>
          <p className="demo-stat-hint">bKash ৳ 14,200 · Cash ৳ 4,250</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Unmatched</p>
          <p className="demo-stat-value">2</p>
          <p className="demo-stat-hint">ভুল রেফারেন্স / অজানা Trx ID</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>পেমেন্ট লিস্ট</h3>
            <p>সর্বশেষ সাবমিশন অনুযায়ী</p>
          </div>
          <div className="demo-tabs">
            <button className="demo-tab active" type="button">
              All
            </button>
            <button className="demo-tab" type="button">
              Pending 3
            </button>
            <button className="demo-tab" type="button">
              Verified 24
            </button>
            <button className="demo-tab" type="button">
              Rejected 1
            </button>
          </div>
        </div>

        <div className="demo-table-wrap">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Trx ID</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Sender</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className="demo-avatar-sm">{initials(payment.client)}</span>
                      <div>
                        <span className="demo-cell-main">{payment.client}</span>
                        <span className="demo-cell-sub">{payment.clientId}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{payment.trxId}</td>
                  <td>
                    <span className="demo-badge gray">{payment.method}</span>
                  </td>
                  <td className="amount">{formatMoney(payment.amount)}</td>
                  <td>{payment.sender}</td>
                  <td>{payment.submitted}</td>
                  <td>
                    <span className={`demo-badge ${tone[payment.status]}`}>
                      {statusLabel[payment.status]}
                    </span>
                  </td>
                  <td>
                    {payment.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="demo-btn primary sm" type="button">
                          <Icon name="check" size={12} />
                          Verify
                        </button>
                        <button className="demo-btn danger sm" type="button">
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    ) : (
                      <button className="demo-btn sm" type="button">
                        <Icon name="eye" size={13} />
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="demo-pagination">
          <span>Showing 1–6 of 29 payments</span>
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
              Next
            </button>
          </div>
        </div>
      </article>

      <section className="demo-grid-3">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>bKash Merchant</h3>
              <p>পেমেন্ট গ্রহণের নম্বর</p>
            </div>
            <span className="demo-badge green">Active</span>
          </div>
          <p style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 800 }}>
            01700-000000
          </p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.68rem' }}>
            Merchant · JR COMMUNICATION
          </p>
          <div className="demo-note" style={{ marginTop: 12 }}>
            ক্লায়েন্ট পেমেন্টের সময় <strong>Client ID / Invoice No</strong> রেফারেন্স
            হিসেবে দেবে।
          </div>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>ভেরিফিকেশন নীতি</h3>
              <p>কে approve করতে পারে</p>
            </div>
          </div>
          <ul className="demo-list">
            <li className="demo-list-item">
              <span className="demo-badge green">Super Admin</span>
              <span className="demo-list-time">সব পেমেন্ট</span>
            </li>
            <li className="demo-list-item">
              <span className="demo-badge blue">Admin</span>
              <span className="demo-list-time">সব এরিয়া</span>
            </li>
            <li className="demo-list-item">
              <span className="demo-badge amber">Staff</span>
              <span className="demo-list-time">সব এরিয়া</span>
            </li>
          </ul>
          <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: '0.64rem' }}>
            Super Admin চাইলে যেকোনো ইউজারের permission বন্ধ করতে পারবে।
          </p>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>অটো রিচার্জ</h3>
              <p>পেমেন্ট verify হলে</p>
            </div>
            <span className="demo-switch on" aria-hidden="true">
              <span />
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem', lineHeight: 1.65 }}>
            Verify হলে সাথে সাথে upstream প্যানেলে recharge হবে। ব্যর্থ হলে
            <strong> NEEDS_MANUAL</strong> কিউতে যাবে এবং অ্যাডমিন অ্যালার্ট পাবে।
          </p>
          <div className="demo-note" style={{ marginTop: 12 }}>
            <strong>Kill switch:</strong> Super Admin যেকোনো সময় বন্ধ করতে পারবে।
          </div>
        </article>
      </section>
    </>
  );
}
