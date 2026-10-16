# ಕನ್ನಡ OCR — Frontend

Production-grade web client for a Kannada OCR model: word, paragraph and full-page recognition with a
Kannada-first UI (ಕನ್ನಡ | EN), light/dark themes, review tooling, batch processing and exports.

React 18 · TypeScript (strict) · Vite 5 · react-router 6 · zustand · vitest. Fonts are self-hosted (no third-party requests).

## Quick start

```bash
npm install
cp .env.example .env.local     # VITE_USE_MOCK=true runs with a built-in demo backend
npm run dev                    # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (proxies `/api/*` → `VITE_DEV_PROXY_TARGET`, default `http://localhost:8000`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Typecheck + production build to `dist/` |

## Connecting your VS Code backend

Set `VITE_USE_MOCK=false`. In dev the frontend calls `/api/...`, which Vite forwards to your server
(strip `/api`). Default target is `http://localhost:8000`; change `VITE_DEV_PROXY_TARGET` if needed.
If your server is on another origin, enable CORS there or set `VITE_API_BASE_URL`.

### `POST /ocr` — multipart/form-data

Fields: `file`, `mode` (`word|paragraph|page`), `text_type` (`printed|handwritten`), `deskew`, `denoise`,
`contrast` (0–100), `brightness` (0–100).

The response is normalised by `src/api/normalize.ts`, which accepts any of:

```jsonc
{ "pages": [{ "width": 1200, "height": 1600, "lines": [
  { "id": "p0l0", "text": "…", "confidence": 0.97,
    "box": { "x": 0.08, "y": 0.10, "w": 0.84, "h": 0.06 }, "alternatives": [] } ] }] }   // full contract
{ "lines": [ { "text": "…", "confidence": 0.9 } ] }                                       // one page
{ "text": "ಕನ್ನಡ", "confidence": 0.99 }                                                   // word model
```

Confidence may be 0–1 or 0–100. Boxes may be fractions, or pixels (`bbox: [x, y, w, h]`) — pixels are
divided by the page size. Missing boxes are laid out as evenly stacked rows.
If your model returns something else, adapt it in `normalize.ts` (single place, covered by tests).

### Other endpoints (optional — the UI degrades gracefully if absent)

| Endpoint | Body → Response | Used for |
| --- | --- | --- |
| `POST /translate` | `{text, source:"kn", target:"en"}` → `{translation}` | English translation |
| `POST /feedback` | `{job_id, line_id, original, corrected, mode, text_type}` | Review corrections (training data) |
| `POST /export/pdf` | `{title, text}` → `application/pdf` | PDF export (else the browser print dialog is used) |
| `GET /health` | 200 | Status check on the API page |

Paths live in `src/api/config.ts`.

## Features

- **Input**: drag & drop, file picker, camera capture, paste from clipboard (Ctrl+V), image URL, sample image. PNG/JPG/WEBP/PDF, size-validated.
- **Modes**: word / paragraph / full page, printed or handwritten; switch mode and re-run.
- **Image enhancement**: deskew, denoise, contrast, brightness (live preview + sent to backend).
- **Viewer**: zoom, numbered confidence-coloured boxes, page thumbnails, scan animation while processing.
- **Result**: text / lines / JSON tabs, inline editing, overall confidence, copy, `.txt`, `.docx`, PDF.
- **Listen** (Web Speech, `kn-IN`, speed toggle), **English translation**.
- **Review**: lines under 75 % confidence flagged; pick an alternative or type a correction; sent as feedback.
- **Shortcuts**: `Ctrl+C` copy · `Space` listen · `T` translate.
- **Batch**: queue (2 concurrent), cancel/retry/remove, export single file or a per-file ZIP (`.docx`/`.txt`).
- **History**: filters, search, CSV export (UTF-8 BOM, formula-injection safe), delete / clear all. Stored in `localStorage` — text only, images are never persisted.
- **API docs page**, Kannada/English toggle, light/dark/system theme, mobile bottom navigation, accessible (skip link, focus rings, ARIA, reduced-motion).

## Deployment

```bash
docker build -t kannada-ocr-frontend .
docker run -p 8080:80 -e BACKEND_URL=http://host.docker.internal:8000 kannada-ocr-frontend
```

nginx serves the SPA (history fallback), proxies `/api/` to `BACKEND_URL`, sets security headers/CSP and caches hashed assets.
CI (`.github/workflows/ci.yml`) runs typecheck, tests and build.

## Notes

- Kannada UI strings (`src/i18n/kn.ts`) were machine-drafted — have a native speaker review them. `en.ts` must keep the same keys (enforced by a test).
- Handwriting, text-to-speech voice availability (`kn-IN` depends on the OS/browser), translation and feedback depend on your backend/browser.
