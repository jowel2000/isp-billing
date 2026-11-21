import { Icon } from '@/components/icon';

const roleRows = [
  { role: 'Super Admin', permissions: 41, scope: 'সব এরিয়া', tone: 'orange' },

  { role: 'Admin', permissions: 32, scope: 'সব এরিয়া', tone: 'blue' },
  { role: 'Staff', permissions: 15, scope: 'সব এরিয়া', tone: 'green' },
  { role: 'Client', permissions: 4, scope: 'নিজের অ্যাকাউন্ট', tone: 'gray' },
];

export default function DemoSettingsPage() {
  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>সেটিংস</h2>
          <p className="demo-page-sub">
            bKash, VAT, SMS গেটওয়ে ও পারমিশন কনফিগারেশন
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button">
            রিসেট
          </button>
          <button className="demo-btn primary" type="button">
            <Icon name="check" size={15} />
            Save Changes
          </button>
        </div>
      </div>

      <div className="demo-note">
        <strong>ডেমো মোড:</strong> এই পেজে কোনো পরিবর্তন সেভ হবে না। আসল অ্যাপে শুধু
        Super Admin এই সেটিংস বদলাতে পারবে, আর প্রতিটি পরিবর্তন audit log-এ যাবে।
      </div>

      <section className="demo-settings-grid">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>পেমেন্ট গেটওয়ে</h3>
              <p>bKash merchant number ও নির্দেশনা</p>
            </div>
            <span className="demo-badge green">Active</span>
          </div>

          <div className="demo-form">
            <div className="demo-field">
              <label htmlFor="merchant">bKash Merchant Number</label>
              <input id="merchant" defaultValue="01700-000000" />
              <small>ক্লায়েন্ট এই নম্বরে Send Money করবে।</small>
            </div>

            <div className="demo-field">
              <label htmlFor="label">Display Label</label>
              <input id="label" defaultValue="JR COMMUNICATION · bKash" />
            </div>

            <div className="demo-field">
              <label htmlFor="instructions">Payment Instructions</label>
              <textarea
                id="instructions"
                defaultValue="bKash Merchant-এ Send Money করে Trx ID ও Sender Number পোর্টালে submit করুন। Reference-এ আপনার Client ID লিখুন।"
              />
            </div>

            <div className="demo-toggle-row">
              <div>
                <strong>গেটওয়ে চালু</strong>
                <small>বন্ধ থাকলে ক্লায়েন্ট পোর্টালে bKash অপশন দেখাবে না।</small>
              </div>
              <span className="demo-switch on" aria-hidden="true">
                <span />
              </span>
            </div>

            <div className="demo-toggle-row">
              <div>
                <strong>ম্যানুয়াল ভেরিফিকেশন</strong>
                <small>Staff Trx ID যাচাই করার পর পেমেন্ট approve হবে।</small>
              </div>
              <span className="demo-switch on" aria-hidden="true">
                <span />
              </span>
            </div>
          </div>
        </article>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>VAT / ট্যাক্স</h3>
                <p>ইনভয়েসে ৫% VAT</p>
              </div>
              <span className="demo-switch on" aria-hidden="true">
                <span />
              </span>
            </div>

            <div className="demo-form">
              <div className="demo-field">
                <label htmlFor="vat">VAT Rate (%)</label>
                <input id="vat" defaultValue="5" />
              </div>
              <div className="demo-field">
                <label htmlFor="vat-type">Calculation</label>
                <select id="vat-type" defaultValue="exclusive">
                  <option value="exclusive">Exclusive — বিলের উপর যোগ হবে</option>
                  <option value="inclusive">Inclusive — বিলের ভেতরে ধরা হবে</option>
                </select>
              </div>
              <div className="demo-field">
                <label htmlFor="vat-label">Label</label>
                <input id="vat-label" defaultValue="VAT" />
              </div>
            </div>

            <div className="demo-note" style={{ marginTop: 12 }}>
              <strong>Snapshot:</strong> ইনভয়েস তৈরির সময় rate সেভ হয়। পরে বদলালেও
              পুরনো ইনভয়েস বদলাবে না।
            </div>
          </article>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>SMS গেটওয়ে</h3>
                <p>ইনভয়েস ও reminder</p>
              </div>
              <span className="demo-badge gray">Not configured</span>
            </div>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.7rem', lineHeight: 1.65 }}>
              পরে যেকোনো লোকাল SMS প্রোভাইডার যোগ করা যাবে। API Key, Sender ID ও
              Test SMS অপশন থাকবে।
            </p>
            <button className="demo-btn" type="button">
              <Icon name="plus" size={14} />
              Add Provider
            </button>
          </article>

          <article className="demo-card">
            <div className="demo-card-head">
              <div>
                <h3>Sensitive Data Access</h3>
                <p>PPPoE ও NID</p>
              </div>
              <span className="demo-badge amber">Staff defaults</span>
            </div>

            <div className="demo-toggle-row">
              <div>
                <strong>PPPoE পাসওয়ার্ড</strong>
                <small>Staff-এ ডিফল্ট ON · Admin চাইলে off করতে পারবে</small>
              </div>
              <span className="demo-switch on" aria-hidden="true">
                <span />
              </span>
            </div>

            <div className="demo-toggle-row">
              <div>
                <strong>NID নম্বর ও ছবি</strong>
                <small>Staff-এ ডিফল্ট OFF · Admin চাইলে permission দিতে পারবে</small>
              </div>
              <span className="demo-switch" aria-hidden="true">
                <span />
              </span>
            </div>

            <div className="demo-note" style={{ marginTop: 12 }}>
              প্রতিটি reveal <strong>audit log</strong>-এ যাবে, এবং ৩০ সেকেন্ড পর
              আবার mask হয়ে যাবে।
            </div>
          </article>
        </div>
      </section>

      <section className="demo-grid-2 equal">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>রোল ও পারমিশন</h3>
              <p>Super Admin → Admin → Staff → Client</p>
            </div>
            <button className="demo-btn sm" type="button">
              Manage
            </button>
          </div>
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Scope</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map((row) => (
                  <tr key={row.role}>
                    <td>
                      <span className={`demo-badge ${row.tone}`}>{row.role}</span>
                    </td>
                    <td>{row.permissions}</td>
                    <td>{row.scope}</td>
                    <td>
                      <button className="demo-btn sm" type="button">
                        Edit
                      </button>
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
              <h3>সিস্টেম স্ট্যাটাস</h3>
              <p>ইন্টিগ্রেশন ও সার্ভিস</p>
            </div>
          </div>
          <ul className="demo-list">
            <li className="demo-list-item">
              <span className="demo-avatar-sm green">
                <Icon name="check" size={14} />
              </span>
              <div>
                <strong>API Server</strong>
                <small>localhost:3001 · Phase 0</small>
              </div>
              <span className="demo-badge green">Online</span>
            </li>
            <li className="demo-list-item">
              <span className="demo-avatar-sm blue">
                <Icon name="grid" size={14} />
              </span>
              <div>
                <strong>Database</strong>
                <small>SQLite · PostgreSQL-ready</small>
              </div>
              <span className="demo-badge green">Healthy</span>
            </li>
            <li className="demo-list-item">
              <span className="demo-avatar-sm orange">
                <Icon name="wifi" size={14} />
              </span>
              <div>
                <strong>Upstream Panel</strong>
                <small>Session + OTP relay</small>
              </div>
              <span className="demo-badge amber">Pending</span>
            </li>
            <li className="demo-list-item">
              <span className="demo-avatar-sm">
                <Icon name="shield" size={14} />
              </span>
              <div>
                <strong>Auto-recharge</strong>
                <small>Super Admin kill switch</small>
              </div>
              <span className="demo-badge green">ON</span>
            </li>
          </ul>
        </article>
      </section>
    </>
  );
}
