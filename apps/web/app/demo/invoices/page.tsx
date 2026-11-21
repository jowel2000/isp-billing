import { Icon } from '@/components/icon';
import { formatMoney, invoices, statusLabel } from '@/lib/mock-data';

const tone: Record<string, string> = {
  paid: 'green',
  due: 'amber',
  overdue: 'red',
  draft: 'gray',
};

export default function DemoInvoicesPage() {
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paid = invoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const due = invoices
    .filter((invoice) => invoice.status === 'due')
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const overdue = invoices
    .filter((invoice) => invoice.status === 'overdue')
    .reduce((sum, invoice) => sum + invoice.total, 0);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>ইনভয়েস</h2>
          <p className="demo-page-sub">
            মাসিক বিল, VAT ৫% ও পেমেন্ট স্ট্যাটাস — এক জায়গায়
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button">
            <Icon name="download" size={15} />
            PDF ডাউনলোড
          </button>
          <button className="demo-btn primary" type="button">
            <Icon name="plus" size={15} />
            নতুন ইনভয়েস
          </button>
        </div>
      </div>

      <section className="demo-stat-grid">
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon orange">
              <Icon name="invoice" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Total Invoiced</p>
          <p className="demo-stat-value">{formatMoney(total)}</p>
          <p className="demo-stat-hint">নভেম্বর ২০২৬ · ১২৮ ইনভয়েস</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon green">
              <Icon name="check" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Paid</p>
          <p className="demo-stat-value">{formatMoney(paid)}</p>
          <p className="demo-stat-hint">৮৪% কালেকশন রেট</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon blue">
              <Icon name="clock" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Due</p>
          <p className="demo-stat-value">{formatMoney(due)}</p>
          <p className="demo-stat-hint">১৮ ক্লায়েন্ট · due date চলছে</p>
        </article>
        <article className="demo-stat-card">
          <div className="demo-stat-top">
            <div className="demo-stat-icon red">
              <Icon name="alert" size={19} />
            </div>
          </div>
          <p className="demo-stat-label">Overdue</p>
          <p className="demo-stat-value">{formatMoney(overdue)}</p>
          <p className="demo-stat-hint">৩ ক্লায়েন্ট · grace শেষ</p>
        </article>
      </section>

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>ইনভয়েস লিস্ট</h3>
            <p>VAT ৫% · exclusive</p>
          </div>
          <div className="demo-tabs">
            <button className="demo-tab active" type="button">
              All
            </button>
            <button className="demo-tab" type="button">
              Paid
            </button>
            <button className="demo-tab" type="button">
              Due
            </button>
            <button className="demo-tab" type="button">
              Overdue
            </button>
          </div>
        </div>

        <div className="demo-table-wrap">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Period</th>
                <th>Amount</th>
                <th>VAT 5%</th>
                <th>Total</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="mono">{invoice.number}</td>
                  <td>
                    <span className="demo-cell-main">{invoice.client}</span>
                  </td>
                  <td>{invoice.period}</td>
                  <td>{formatMoney(invoice.amount)}</td>
                  <td>{formatMoney(invoice.vat)}</td>
                  <td className="amount">{formatMoney(invoice.total)}</td>
                  <td>{invoice.dueDate}</td>
                  <td>
                    <span className={`demo-badge ${tone[invoice.status]}`}>
                      {statusLabel[invoice.status]}
                    </span>
                  </td>
                  <td>
                    <button className="demo-btn sm" type="button">
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
          <span>Showing 1–7 of 128 invoices</span>
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

      <div className="demo-note">
        <strong>VAT নোট:</strong> Super Admin চাইলে VAT বন্ধ করতে পারবে। বন্ধ থাকলে
        ইনভয়েসে VAT লাইন দেখাবে না। প্রতিটি ইনভয়েসে VAT rate snapshot করা থাকে, তাই
        পরে rate বদলালেও পুরনো বিল বদলাবে না।
      </div>
    </>
  );
}
