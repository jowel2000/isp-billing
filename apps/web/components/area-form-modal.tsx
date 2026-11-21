'use client';

import { FormEvent, useState } from 'react';
import { createArea } from '@/lib/live-api';
import { Icon } from './icon';

interface AreaFormModalProps {
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AreaFormModal({ onClose, onSaved }: AreaFormModalProps) {
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const area = await createArea({
        name: name.trim(),
        ...(district.trim() ? { district: district.trim() } : {}),
        ...(thana.trim() ? { thana: thana.trim() } : {}),
      });
      onSaved(`এরিয়া তৈরি হয়েছে — ${area.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'এরিয়া তৈরি করা যায়নি');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="live-modal-backdrop" onMouseDown={onClose}>
      <div className="live-modal" style={{ maxWidth: 500 }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="live-modal-head">
          <div>
            <h3>নতুন এরিয়া</h3>
            <p>এরিয়া অনুযায়ী ক্লায়েন্ট ও কালেকশন রিপোর্ট হবে।</p>
          </div>
          <button className="live-modal-close" type="button" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="live-form-grid">
            <div className="live-field full">
              <label htmlFor="area-name">এরিয়ার নাম *</label>
              <input
                id="area-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="যেমন Muradnagar"
                required
              />
            </div>
            <div className="live-field">
              <label htmlFor="area-district">জেলা</label>
              <input
                id="area-district"
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                placeholder="Cumilla"
              />
            </div>
            <div className="live-field">
              <label htmlFor="area-thana">থানা</label>
              <input
                id="area-thana"
                value={thana}
                onChange={(event) => setThana(event.target.value)}
                placeholder="Muradnagar"
              />
            </div>
          </div>

          {error ? <div className="live-error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div className="live-form-actions">
            <button className="demo-btn" type="button" onClick={onClose}>
              বাতিল
            </button>
            <button className="demo-btn primary" type="submit" disabled={submitting}>
              <Icon name="check" size={14} />
              {submitting ? 'তৈরি হচ্ছে…' : 'এরিয়া তৈরি করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
