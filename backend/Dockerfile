# syntax=docker/dockerfile:1
FROM python:3.11-slim
# Hugging Face Spaces runs the container as user 1000, so create that user and let it own /app
# (it writes data/feedback.jsonl). Locally / in docker compose it runs as the same user.
RUN useradd -m -u 1000 user
WORKDIR /app
# HF_HOME inside /app: the speech model downloaded at build time is found again at run time.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/app/.hf-cache
COPY requirements.txt .
# CPU-only torch wheel (the default index pulls ~2 GB of CUDA libraries).
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
# Bake the Kannada speech model into the image so /tts works offline.
RUN python -c "from transformers import AutoTokenizer, VitsModel; AutoTokenizer.from_pretrained('facebook/mms-tts-kan'); VitsModel.from_pretrained('facebook/mms-tts-kan')"
COPY app ./app
COPY fonts ./fonts
# Kannada word list for dictionary correction (without it the correction is silently skipped).
COPY lexicon ./lexicon
COPY models/crnn_v8.pth models/charset_v8.txt ./models/
RUN mkdir -p data && chown -R user:user /app
USER user
EXPOSE 8000
HEALTHCHECK --interval=30s --start-period=30s CMD python -c "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://localhost:8000/health').status != 200)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
