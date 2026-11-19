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

## Deploy (free): backend on Hugging Face Spaces, frontend on Vercel

The backend needs ~2 GB RAM (PyTorch + speech model), which free CPU Spaces provide.

**1. Backend → Hugging Face Space** (Docker; builds `backend/Dockerfile`)

```powershell
pip install -U huggingface_hub
python -c "from huggingface_hub import login; login()"     # paste a token with write access
cd backend
python scripts/deploy_hf_space.py <hf-username>/kannada-ocr
```

After the build (~10 min) check `https://<hf-username>-kannada-ocr.hf.space/health`.

**2. Frontend → Vercel**: import the GitHub repo, set *Root Directory* to `frontend`, and add the
environment variable `VITE_API_BASE_URL=https://<hf-username>-kannada-ocr.hf.space`. `frontend/vercel.json`
handles SPA routing.

**3. Allow the frontend in CORS**: re-run the script with the Vercel URL (sets the Space variable
`FRONTEND_ORIGINS`; the Space restarts):

```powershell
python scripts/deploy_hf_space.py <hf-username>/kannada-ocr --origins https://<your-app>.vercel.app
```

A free Space sleeps after ~48 h without visits; the first request then takes 1–2 minutes.
