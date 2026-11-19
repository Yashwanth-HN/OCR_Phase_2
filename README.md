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

## Deploy: backend on Azure Container Apps, frontend on Vercel

The backend needs ~2 GB RAM (PyTorch, the CRNN, the word list and the speech model).

**1. Image**: every push to `main` that touches `backend/` runs `.github/workflows/backend-image.yml`, which
builds `backend/Dockerfile` and pushes `ghcr.io/<owner>/kannada-ocr-backend:latest`. Make the package public once
(GitHub → Packages → kannada-ocr-backend → Package settings → Change visibility) so Azure can pull it.

**2. Backend → Azure Container Apps** (scales to zero when idle; the monthly free grant covers ~50 h of
activity at 1 vCPU / 2 GiB):

```powershell
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az group create -n kannada-ocr-rg -l <region>
az containerapp env create -n kannada-ocr-env -g kannada-ocr-rg -l <region> --logs-destination none
az containerapp create -n kannada-ocr-api -g kannada-ocr-rg --environment kannada-ocr-env `
  --image ghcr.io/<owner>/kannada-ocr-backend:latest --target-port 8000 --ingress external `
  --cpu 1 --memory 2Gi --min-replicas 0 --max-replicas 1 `
  --env-vars MAX_PDF_PAGES=2 FRONTEND_ORIGINS=https://<your-app>.vercel.app
```

The app URL is printed as `properties.configuration.ingress.fqdn`; check `https://<fqdn>/health`.
After it has been idle the first request starts a container, which takes about a minute.

**3. Frontend → Vercel**: import the GitHub repo, set *Root Directory* to `frontend`, and add the
environment variable `VITE_API_BASE_URL=https://<fqdn>`. `frontend/vercel.json` handles SPA routing.
If the Vercel URL is new, update CORS:
`az containerapp update -n kannada-ocr-api -g kannada-ocr-rg --set-env-vars FRONTEND_ORIGINS=https://<your-app>.vercel.app`

(`backend/scripts/deploy_hf_space.py` deploys to a Hugging Face Docker Space instead; that needs a PRO plan.)
