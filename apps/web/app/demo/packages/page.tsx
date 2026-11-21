import { Icon } from '@/components/icon';
import { formatMoney, packages } from '@/lib/mock-data';

export default function DemoPackagesPage() {
  const maxClients = Math.max(...packages.map((item) => item.clients));
  const totalClients = packages.reduce((sum, item) => sum + item.clients, 0);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>প্যাকেজ</h2>
          <p className="demo-page-sub">
            Upstream প্যাকেজ, স্পিড, দাম, CBP ও সক্রিয় ক্লায়েন্ট
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button">
            <Icon name="download" size={15} />
            সিঙ্ক করুন
          </button>
          <button className="demo-btn primary" type="button">
            <Icon name="plus" size={15} />
            নতুন প্যাকেজ
          </button>
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
          <p className="demo-stat-hint">৫টি active · ১টি inactive</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="users" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Assigned Clients</p>
          <p className="demo-stat-value">{totalClients}</p>
          <p className="demo-stat-hint">সব প্যাকেজ মিলিয়ে</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="wallet" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Avg. Package Price</p>
          <p className="demo-stat-value">
            {formatMoney(
              Math.round(
                packages.reduce((sum, item) => sum + item.price, 0) / packages.length,
              ),
            )}
          </p>
          <p className="demo-stat-hint">Upstream cost আলাদা</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="trend-up" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Most Popular</p>
          <p className="demo-stat-value">25 Mbps</p>
          <p className="demo-stat-hint">৭২ জন ক্লায়েন্ট</p>
        </article>
      </section>

      <section className="demo-package-grid">
        {packages.map((item) => (
          <article className="demo-package-card" key={item.name}>
            <div className="demo-package-top">
              <div>
                <p className="demo-package-speed">
                  {item.name}
                  <small>speed</small>
                </p>
                <p className="demo-package-price">
                  <strong>{formatMoney(item.price)}</strong> / মাস
                </p>
              </div>
              <span
                className={`demo-badge ${item.status === 'active' ? 'green' : 'gray'}`}
              >
                {item.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="demo-package-meta">
              <span>সক্রিয় ক্লায়েন্ট</span>
              <strong style={{ color: '#0f172a' }}>{item.clients} জন</strong>
            </div>
            <div className="demo-progress">
              <span
                style={{
                  width: `${maxClients > 0 ? Math.round((item.clients / maxClients) * 100) : 0}%`,
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
                CBP {formatMoney(item.cbp)} · {item.speed} Mbps
              </span>
              <button className="demo-btn sm" type="button">
                Edit
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="demo-grid-3">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>Upstream সিঙ্ক</h3>
              <p>Upstream প্যানেল থেকে</p>
            </div>
            <span className="demo-badge green">Synced</span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem', lineHeight: 1.65 }}>
            প্যাকেজের নাম, স্পিড, upstream price ও CBP প্রতি ৬ ঘণ্টায় সিঙ্ক হবে।
            লোকাল markup আলাদা ফিল্ডে থাকবে।
          </p>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>লোকাল প্রাইসিং</h3>
              <p>মার্জিন কন্ট্রোল</p>
            </div>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem', lineHeight: 1.65 }}>
            Upstream দাম ৳250 হলে আপনি ক্লায়েন্টকে ৳300 বিল করতে পারবেন। লেজারে
            upstream cost ও revenue আলাদা দেখাবে।
          </p>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>CBP</h3>
              <p>Client Base Price</p>
            </div>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.7rem', lineHeight: 1.65 }}>
            Sub-PoP-এর জন্য প্যাকেজের আলাদা দাম। Super Admin চাইলে যেকোনো সময়
            CBP আপডেট করতে পারবে — effective date সহ।
          </p>
        </article>
      </section>
    </>
  );
}
