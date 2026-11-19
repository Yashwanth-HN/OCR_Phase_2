"""Upload the backend to a Hugging Face Space (Docker SDK) and set its runtime variables.

Note: Docker Spaces on cpu-basic need a Hugging Face PRO plan (a free account gets HTTP 402).

One-time login first (stores your token locally, not in this repo):
    python -c "from huggingface_hub import login; login()"

Then, from the backend folder:
    python scripts/deploy_hf_space.py <your-hf-username>/kannada-ocr --origins https://<your-app>.vercel.app

The Space builds the Dockerfile itself; the first build takes ~10 minutes. The API is then at
https://<your-hf-username>-kannada-ocr.hf.space (e.g. .../health).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import HfApi

BACKEND = Path(__file__).resolve().parent.parent

# Only what the Dockerfile needs (no tests, other model versions, local feedback data).
FILES = [
    "Dockerfile",
    ".dockerignore",
    "requirements.txt",
    "app/*.py",
    "fonts/*",
    "lexicon/kn_words.tsv",
    "models/crnn_v8.pth",
    "models/charset_v8.txt",
]

SPACE_CARD = """---
title: Kannada OCR API
emoji: 📖
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 8000
pinned: false
short_description: CRNN Kannada OCR backend (FastAPI)
---

FastAPI backend of the Kannada OCR web app: CRNN + CTC recognition of printed Kannada,
translation, offline text-to-speech (MMS-TTS) and PDF export.

Endpoints: `GET /health`, `POST /ocr`, `/translate`, `/tts`, `/export/pdf`, `/feedback`.
Interactive API docs: `/docs`. Source: https://github.com/Yashwanth-HN/OCR_Phase_2
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("space_id", help="<username>/<space-name>, e.g. yashwanth/kannada-ocr")
    ap.add_argument("--origins", default="", help="frontend URL(s) allowed by CORS, comma-separated")
    ap.add_argument("--max-pdf-pages", default="2",
                    help="free CPU Spaces are ~2x slower than a laptop; keep PDFs under the UI's 120 s timeout")
    args = ap.parse_args()

    api = HfApi()
    api.create_repo(args.space_id, repo_type="space", space_sdk="docker", exist_ok=True)
    api.upload_folder(
        folder_path=str(BACKEND),
        repo_id=args.space_id,
        repo_type="space",
        allow_patterns=FILES,
        commit_message="Deploy Kannada OCR backend",
    )
    api.upload_file(
        path_or_fileobj=SPACE_CARD.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=args.space_id,
        repo_type="space",
        commit_message="Space card",
    )
    api.add_space_variable(args.space_id, "MAX_PDF_PAGES", args.max_pdf_pages)
    if args.origins:
        api.add_space_variable(args.space_id, "FRONTEND_ORIGINS", args.origins)

    user, name = args.space_id.split("/")
    print(f"Uploaded. Build log: https://huggingface.co/spaces/{args.space_id}")
    print(f"API (after the build): https://{user.lower()}-{name.lower().replace('_', '-')}.hf.space/health")


if __name__ == "__main__":
    main()
