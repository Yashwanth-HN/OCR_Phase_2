# ಕನ್ನಡ OCR

Kannada OCR web app: a React UI and a FastAPI server around a CRNN model (crnn_v8).

```
frontend/   React 18 + Vite + TypeScript UI          -> see frontend/README.md
backend/    FastAPI + PyTorch CRNN, /ocr /translate /tts /export/pdf ...  -> see backend/README.md
```

## Run locally (two terminals)

**1. Backend** (http://localhost:8000)

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check http://localhost:8000/health → `{"status":"ok", ...}`.

**2. Frontend** (http://localhost:5173)

```powershell
cd frontend
npm install
copy .env.example .env.local   # then set VITE_USE_MOCK=false
npm run dev
```

The dev server proxies `/api/*` to the backend on port 8000.

## Run with Docker

```
docker compose up --build      # UI on http://localhost:8080
```
