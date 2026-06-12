import { useState } from 'react';
import { X, Lock } from 'lucide-react';

interface AdminUnlockModalProps {
  onUnlock: (pin: string) => boolean;
  onClose: () => void;
}

export default function AdminUnlockModal({ onUnlock, onClose }: AdminUnlockModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleSubmit() {
    const ok = onUnlock(pin);
    if (!ok) {
      setError('Incorrect PIN.');
      setPin('');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={16} />
            <h2>Admin Access</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="hint">Enter your PIN to unlock admin features (add events, edit course, manage data).</p>
          <input
            className="url-input"
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            maxLength={12}
            onChange={e => { setPin(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
            style={{ marginTop: 10, letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
          />
          {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={!pin.trim()}>
              Unlock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
