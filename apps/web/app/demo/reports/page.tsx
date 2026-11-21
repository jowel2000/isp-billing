import { Icon, type IconName } from '@/components/icon';
import {
  areaCollections,
  formatMoney,
  revenueSeries,
} from '@/lib/mock-data';

const reportCards: Array<{
  title: string;
  detail: string;
  icon: IconName;
  tone: string;
  action: string;
}> = [
  {
    title: 'দৈনিক কালেকশন',
    detail: 'bKash, ক্যাশ ও স্টাফ-ওয়ারি আদায়ের রিপোর্ট',
    icon: 'wallet',
    tone: 'orange',
    action: 'রিপোর্ট দেখুন',
  },
  {
    title: 'Due রিপোর্ট',
    detail: 'ক্লায়েন্ট, এরিয়া ও প্যাকেজ অনুযায়ী বাকি',
    icon: 'clock',
    tone: 'red',
    action: 'Due দেখুন',
  },
  {
    title: 'Profit & Margin',
    detail: 'লোকাল বিল বনাম upstream খরচের হিসাব',
    icon: 'trend-up',
    tone: 'green',
    action: 'মার্জিন দেখুন',
  },
  {
    title: 'VAT রিপোর্ট',
    detail: '৫% VAT সংগৃহীত ও payable সারসংক্ষেপ',
    icon: 'invoice',
    tone: 'blue',
    action: 'VAT দেখুন',
  },
];

export default function DemoReportsPage() {
  const maxValue = Math.max(...revenueSeries.map((point) => point.value));
  const totalCollected = areaCollections.reduce((sum, area) => sum + area.collected, 0);
  const totalDue = areaCollections.reduce((sum, area) => sum + area.due, 0);

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>রিপোর্ট</h2>
          <p className="demo-page-sub">
            কালেকশন, Due, মার্জিন ও VAT — সিদ্ধান্তের জন্য পরিষ্কার ডেটা
          </p>
        </div>
        <div className="demo-actions">
          <button className="demo-btn ghost" type="button">
            <Icon name="clock" size={15} />
            নভেম্বর ২০২৬
          </button>
          <button className="demo-btn primary" type="button">
            <Icon name="download" size={15} />
            এক্সপোর্ট
          </button>
        </div>
      </div>

      <section className="demo-report-grid">
        {reportCards.map((report) => (
          <article className="demo-report-card" key={report.title}>
            <span className={`demo-report-icon ${report.tone}`}>
              <Icon name={report.icon} size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <h3>{report.title}</h3>
              <p>{report.detail}</p>
              <button className="demo-btn sm" type="button">
                {report.action}
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="demo-grid-2">
        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>মাসিক কালেকশন</h3>
              <p>এপ্রিল – নভেম্বর ২০২৬</p>
            </div>
            <span className="demo-badge green">+12.4%</span>
          </div>
          <div className="demo-bars">
            {revenueSeries.map((point, index) => (
              <div className="demo-bar-col" key={point.month}>
                <div
                  className={`demo-bar ${index % 3 === 2 ? 'alt' : ''}`}
                  style={{ height: `${Math.round((point.value / maxValue) * 100)}%` }}
                  title={formatMoney(point.value)}
                />
                <span>{point.month}</span>
              </div>
            ))}
          </div>
          <div className="demo-chart-legend" style={{ marginTop: 12 }}>
            <span>
              <i className="demo-legend-dot" style={{ background: '#f59e0b' }} />
              bKash + Cash
            </span>
            <span>
              <i className="demo-legend-dot" style={{ background: '#3b82f6' }} />
              Previous quarter
            </span>
          </div>
        </article>

        <article className="demo-card">
          <div className="demo-card-head">
            <div>
              <h3>এরিয়া ওয়ারি আদায়</h3>
              <p>নভেম্বর ২০২৬</p>
            </div>
            <span className="demo-badge blue">{formatMoney(totalCollected)}</span>
          </div>
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Clients</th>
                  <th>Collected</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {areaCollections.map((area) => (
                  <tr key={area.area}>
                    <td>
                      <span className="demo-cell-main">{area.area}</span>
                    </td>
                    <td>{area.clients}</td>
                    <td className="amount">{formatMoney(area.collected)}</td>
                    <td>{formatMoney(area.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="demo-note" style={{ marginTop: 12 }}>
            মোট Due <strong>{formatMoney(totalDue)}</strong> — এরিয়া ভিত্তিক reminder
            পাঠানো যাবে।
          </div>
        </article>
      </section>

      <div className="demo-note">
        <strong>রিপোর্ট নোট:</strong> আসল ডেটা সিঙ্ক হলে এখানে upstream-এর ক্লায়েন্ট,
        প্যাকেজ ও login history মিলিয়ে রিপোর্ট তৈরি হবে। প্রতিটি রিপোর্ট CSV/PDF
        এক্সপোর্টযোগ্য হবে।
      </div>
    </>
  );
}
