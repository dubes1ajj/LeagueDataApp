import { useState } from 'react';
import { parseGolfSoftwareHTML } from '../lib/parser';
import type { EventData } from '../types/golf';
import { X, Upload, Link } from 'lucide-react';

interface AddEventModalProps {
  onClose: () => void;
  onAdd: (event: Omit<EventData, 'id'>) => void;
}

export default function AddEventModal({ onClose, onAdd }: AddEventModalProps) {
  const [tab, setTab] = useState<'paste' | 'url'>('paste');
  const [htmlInput, setHtmlInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handlePasteImport() {
    setError('');
    const parsed = parseGolfSoftwareHTML(htmlInput);
    if (!parsed) {
      setError('Could not parse the HTML. Make sure you pasted the full page source from golfsoftware.com.');
      return;
    }
    onAdd(parsed);
  }

  function handleHtmlChange(value: string) {
    setHtmlInput(value);
  }

  async function handleUrlImport() {
    setError('');
    setLoading(true);

    try {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlInput.trim());
      } catch {
        setError('Please enter a valid URL (e.g. https://service.golfleague.net/lm/...)');
        setLoading(false);
        return;
      }

      if (!parsedUrl.hostname.includes('golfleague.net')) {
        setError('URL must be from service.golfleague.net');
        setLoading(false);
        return;
      }

      const proxyPath = '/golf-proxy' + parsedUrl.pathname + parsedUrl.search;
      const res = await fetch(proxyPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const parsed = parseGolfSoftwareHTML(html);
      if (!parsed) {
        setError('Fetched the page but could not find player data. Make sure the URL points to a player_standings_by_points page.');
        setLoading(false);
        return;
      }
      onAdd(parsed);
    } catch (e) {
      setError(`Failed to fetch: ${(e as Error).message}. Try the "Paste HTML" tab if the error persists.`);
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Event Data</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => setTab('paste')}
          >
            Paste HTML
          </button>
          <button
            className={`tab ${tab === 'url' ? 'active' : ''}`}
            onClick={() => setTab('url')}
          >
            <Link size={14} style={{ marginRight: 4 }} /> Load from URL
          </button>
        </div>

        {tab === 'paste' && (
          <div className="modal-body">
            <p className="hint">
              Open the standings URL in your browser, then press <kbd>Ctrl+U</kbd> (View Page Source).
              Press <kbd>Ctrl+A</kbd> to select all, <kbd>Ctrl+C</kbd> to copy, then paste below.
            </p>
            <textarea
              className="html-input"
              placeholder="Paste full page HTML here..."
              value={htmlInput}
              onChange={e => handleHtmlChange(e.target.value)}
              rows={8}
            />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handlePasteImport} disabled={!htmlInput.trim()}>
                <Upload size={14} style={{ marginRight: 6 }} /> Import
              </button>
            </div>
          </div>
        )}

        {tab === 'url' && (
          <div className="modal-body">
            <p className="hint">
              Paste the standings page URL from golfsoftware.com. The app fetches it
              through a local proxy so the SSL certificate is handled by Node.js, not your browser. The played nine is auto-detected from the page.
            </p>
            <input
              className="url-input"
              type="url"
              placeholder="https://service.golfleague.net/lm/.../player_standings_by_points-01.html"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleUrlImport} disabled={!urlInput.trim() || loading}>
                {loading ? 'Loading...' : <><Link size={14} style={{ marginRight: 6 }} /> Fetch & Import</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

