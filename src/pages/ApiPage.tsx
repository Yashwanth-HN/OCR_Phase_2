import { useState } from 'react';
import { api, USE_MOCK } from '@/api';
import { API_BASE, ENDPOINTS } from '@/api/config';
import { useI18n } from '@/i18n';

const OCR_RESPONSE = `{
  "id": "job_123",
  "model_version": "kannada-ocr-v1",
  "duration_ms": 1840,
  "pages": [
    {
      "index": 0,
      "width": 1200,
      "height": 1600,
      "preview_url": null,
      "lines": [
        {
          "id": "p0l0",
          "text": "ಕರ್ನಾಟಕವು ಭಾರತದ ದಕ್ಷಿಣ ಭಾಗದಲ್ಲಿರುವ",
          "confidence": 0.97,
          "box": { "x": 0.08, "y": 0.10, "w": 0.84, "h": 0.06 },
          "alternatives": []
        }
      ]
    }
  ]
}`;

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  body: string;
}

const ENDPOINT_DOCS: Endpoint[] = [
  {
    method: 'POST',
    path: ENDPOINTS.ocr,
    summary: 'multipart/form-data',
    body: 'file · mode (word|paragraph|page) · text_type (printed|handwritten) · deskew · denoise · contrast (0-100) · brightness (0-100)',
  },
  { method: 'POST', path: ENDPOINTS.translate, summary: 'application/json', body: '{ "text": "…", "source": "kn", "target": "en" } → { "translation": "…" }' },
  { method: 'POST', path: ENDPOINTS.feedback, summary: 'application/json', body: '{ "job_id", "line_id", "original", "corrected", "mode", "text_type" }' },
  { method: 'POST', path: ENDPOINTS.exportPdf, summary: 'application/json', body: '{ "title": "…", "text": "…" } → application/pdf' },
  { method: 'GET', path: ENDPOINTS.health, summary: '', body: '200 OK' },
];

const CURL = `curl -X POST "${API_BASE}${ENDPOINTS.ocr}" \\
  -F "file=@page.jpg" \\
  -F "mode=paragraph" \\
  -F "text_type=printed"`;

export default function ApiPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');

  const check = async () => {
    setStatus('checking');
    setStatus((await api.health()) ? 'online' : 'offline');
  };

  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">{t('api.title')}</h1>
          <p className="muted">{t('api.intro')}</p>
        </div>
      </div>

      <section className="panel" aria-labelledby="api-status">
        <h2 id="api-status" className="panel__title">
          {t('api.status')}
        </h2>
        {USE_MOCK && <p className="hint">{t('api.mock')}</p>}
        <div className="api-status">
          <button type="button" className="btn btn--outline" onClick={check} disabled={status === 'checking'}>
            {status === 'checking' ? t('common.loading') : t('api.check')}
          </button>
          {status === 'online' && <span className="badge badge--done">{t('api.online')}</span>}
          {status === 'offline' && <span className="badge badge--error">{t('api.offline')}</span>}
          <code className="code-inline">{API_BASE}</code>
        </div>
      </section>

      <section className="panel" aria-labelledby="api-endpoints">
        <h2 id="api-endpoints" className="panel__title">
          {t('api.endpoints')}
        </h2>
        <ul className="endpoints">
          {ENDPOINT_DOCS.map((e) => (
            <li key={e.path} className="endpoint">
              <span className={`method method--${e.method.toLowerCase()}`}>{e.method}</span>
              <code className="code-inline">{e.path}</code>
              <span className="muted">{e.summary}</span>
              <p className="endpoint__body">{e.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="api-example">
        <h2 id="api-example" className="panel__title">
          {t('api.example')}
        </h2>
        <pre className="code">{CURL}</pre>
        <h3 className="panel__subtitle">{t('api.response')}</h3>
        <pre className="code">{OCR_RESPONSE}</pre>
      </section>
    </div>
  );
}
