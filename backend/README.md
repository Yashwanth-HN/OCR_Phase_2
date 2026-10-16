# Backend: Kannada OCR (CRNN + CTC)

FastAPI server for the UI in `../frontend`. It wraps the CRNN trained in
`other/notebooks/new_kannada_ocr_fixed_v10.ipynb` (word-image recogniser, current model **crnn_v8**) and adds line/word
segmentation so paragraph photos, full pages and PDFs work too.

## Run

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check: `curl http://localhost:8000/health` → `{"status":"ok","model_version":"crnn_v8-<hash>"}`.
Then run the frontend (`npm run dev` in `../frontend/`, with `VITE_USE_MOCK=false` in
`.env.local`); its dev server proxies `/api/*` to this server.

Tests (~30 s, they load the real model): `python -m pytest -q`

## How it works

| File | What it does |
| --- | --- |
| `app/notebook_pipeline.py` | **Verbatim** copies of notebook v10 Cells 08 + 26 + 28 (charset incl. conjunct tokens), 10 (preprocess, 64×384), 18 (CRNN), 24 and 24b (page segmentation: frame removal, fused-line splitting, taller crops that keep subscript consonants). Don't edit; re-copy if you retrain with a different pipeline. |
| `app/recognizer.py` | Loads the model once; batched reading exactly like notebook `read_words`; confidence + beam-search alternatives. |
| `app/pipeline.py` | Upload decoding (PNG/JPG/WEBP/PDF, EXIF rotation), contrast/brightness/denoise/deskew, segmentation, boxes. |
| `app/main.py` | Routes, validation, errors. |
| `app/tts.py` | `/tts`: offline Kannada speech with Meta MMS-TTS for the Listen button. |
| `app/translate.py` | `/translate`: Kannada → English via Google Translate's public endpoint. |
| `app/pdf_export.py` | `/export/pdf` with Noto Sans Kannada (`fonts/`, OFL licence) and HarfBuzz shaping. |
| `app/inference.py` | Old 32×256 path. **No longer used** (it did not match how the 64×384 models were trained). |

- **word** mode: the whole image is one word crop (no segmentation).
- **paragraph / page** modes: same pipeline: notebook `segment_page` → lines → words → one batched
  model call → words joined into lines. Boxes are fractions of the original image (mapped back
  through deskew). PDFs are rendered at 200 dpi; each page also returns a small JPEG `preview_url`
  so the UI can draw boxes on it.
- **confidence** (0–1): per word, the mean probability of the characters the model emitted;
  per line, the mean over its words. (The notebook averaged over all CTC frames, which stays ~0.97
  even for wrong words.)
- **alternatives**: CTC prefix beam search (width 5) per word; a line's alternatives swap its
  least-confident word for that word's 2nd/3rd readings.
- `text_type` is accepted and validated but has no effect: there is one model.

## API

| Endpoint | Notes |
| --- | --- |
| `POST /ocr` | multipart: `file`, `mode` (word/paragraph/page), `text_type`, `deskew`, `denoise`, `contrast`, `brightness` (0–100, 50 = unchanged). Returns `{id, model_version, duration_ms, pages:[{index,width,height,lines:[{id,text,confidence,box,alternatives}]}]}` |
| `GET /health` | 200 `{status, model_version}`; 503 if the model failed to load |
| `POST /feedback` | appends `{job_id,line_id,original,corrected,mode,text_type}` to `data/feedback.jsonl` |
| `POST /translate` | `{text,source,target}` → `{translation}` via Google Translate (online, see below). 502/503 if unreachable or rate-limited |
| `POST /export/pdf` | `{title,text}` → `application/pdf` |
| `POST /tts` | `{text}` (≤ 2000 chars) → `audio/wav` 16 kHz. 501 if the speech model is unavailable |
| `POST /ocr/upload` | legacy `{text, confidence}` for the old `OCR/frontend` (word mode) |

Errors are always `{"detail": "..."}`: 413 file > 20 MB or too many PDF pages, 415 not
PNG/JPG/WEBP/PDF (checked by content), 422 bad field / undecodable file, 503 model not loaded.

## Swapping in a new Colab model

1. In Colab, save the weights: `torch.save(model.state_dict(), "crnn_v5.pth")`
   (a training checkpoint `{"model": ..., "opt": ...}` like `crnn_v4_last.pt` also works).
2. Save the charset in model order, one char per line, space as `<space>`:
   ```python
   with open("charset_v5.txt", "w", encoding="utf-8") as f:
       for i in range(1, num_classes):
           ch = idx_to_char[i]
           f.write(("<space>" if ch == " " else ch) + "\n")
   ```
3. Copy both into `backend/models/` and point the env vars at them (or rename over the old files).
4. If you changed the architecture, preprocessing (size, invert, trim) or segmentation in the
   notebook, re-copy those cells into `app/notebook_pipeline.py`. A charset/model size mismatch
   fails at startup (`/health` → 503) rather than decoding to the wrong characters.
5. Restart the server and run `python -m pytest -q`.

## Listen button (text-to-speech)

Windows/Chrome usually has no Kannada voice, so the browser cannot read Kannada by itself. The
backend generates the audio with **Meta MMS-TTS** (`facebook/mms-tts-kan`) on this machine:

- First start downloads the model once (~150 MB) into `~/.cache/huggingface`; after that it works
  offline. It loads in the background (~15 s), so OCR is available immediately.
- The UI sends one sentence at a time and fetches the next while the current one plays; on this
  8-core CPU a sentence is generated ~1.7x faster than it plays.
- Kannada digits (೦-೯) are converted to 0-9 (the model only knows those); punctuation is used for
  pauses. How the model pronounces numbers has not been checked by a Kannada speaker.
- **Licence: CC-BY-NC 4.0, non-commercial use only.** Set `TTS_ENABLED=false` to turn it off; the
  UI then falls back to the browser's voice.

## Translate button

Uses Google Translate's public JSON endpoint (`translate.googleapis.com`, `client=gtx`): no API key
and no download, but it **needs internet, sends the text to Google, is unofficial and can be
rate-limited**. OCR line breaks are joined into paragraphs first so sentences are not cut in half.
(The `translate.google.com/m` page used by libraries like deep-translator returned Google's
"unusual traffic" captcha on this network, so it is not used.) `TRANSLATOR=none` disables it.
An offline option (facebook/nllb-200-distilled-600M, ~2.5 GB) did not fit on the disk.

## Models

| Model | Classes | Notes |
| --- | --- | --- |
| `crnn_v8.pth` + `charset_v8.txt` (**default**) | 142 (141 + blank) | 106 characters + 35 conjunct tokens: `್`+consonant (e.g. `್ಲ`) is ONE class (notebook Cell 28). Each charset line is one class, so some lines hold two characters. |
| `crnn_v4.pth` + `charset_v4.txt` | 107 | previous model; set `CRNN_MODEL_PATH` / `CRNN_CHARSET_PATH` to use it |

Measured here with the same pipeline, on a clean printed page (2 pages, 8 lines scored): v4 CER 1.9 % / WER 11.8 %,
**v8 CER 0.3 % / WER 3.9 %**. `charset_v8.txt` was generated here from the notebook's own rules (Cell 08 + 26 + 28); it should match the
`charset_v6.txt` the notebook writes to Drive (not compared, that file was not downloaded).

## Environment variables

| Variable | Default | |
| --- | --- | --- |
| `CRNN_MODEL_PATH` | `models/crnn_v8.pth` | relative to `backend/` |
| `CRNN_CHARSET_PATH` | `models/charset_v8.txt` | 141 classes; must match the model |
| `MODEL_VERSION` | `<file stem>-<sha256[:8]>` | shown in the UI and `/health` |
| `FRONTEND_ORIGINS` | localhost:5173, 8080, 8081 | CORS, comma-separated |
| `MAX_UPLOAD_MB` | `20` | |
| `MAX_PDF_PAGES` | `5` | a dense page takes ~10–15 s on an 8-core CPU; the UI times out at 120 s |
| `PDF_DPI` | `200` | |
| `MAX_IMAGE_SIDE` | `4000` | longer side is downscaled to this |
| `SMALL_TEXT_PX` / `TARGET_GLYPH_PX` / `MAX_UPSCALE` | `16` / `20` / `2.5` | small-text upscaling (see above) |
| `TORCH_THREADS` | all cores | |
| `OCR_BATCH_SIZE` | `64` | |
| `FEEDBACK_PATH` | `data/feedback.jsonl` | |
| `TRANSLATOR` | `google` | `none` to disable `/translate` (501) |
| `TRANSLATE_TIMEOUT` | `20` | seconds |
| `TTS_ENABLED` | `true` | offline Kannada speech for `/tts` |
| `TTS_MODEL` | `facebook/mms-tts-kan` | Hugging Face id or a local folder |
| `MAX_TTS_CHARS` | `2000` | per `/tts` request |

## Small text and page borders (paragraph / page modes)

Two steps run before the notebook segmentation (in `app/pipeline.py`, not in the verbatim notebook code):

- **Small-text upscaling.** If the text is smaller than `SMALL_TEXT_PX` (16 px glyphs, measured from ink blobs), the
  page is enlarged so glyphs are about `TARGET_GLYPH_PX` (20 px), at most `MAX_UPSCALE` (2.5x). Without it, a
  low-resolution screenshot of a framed page came back as ONE line ("ರ", 17 %): the thin text was lighter than the
  border, so the notebook's ink mask kept the border and dropped the text.
- **Page-border crop.** A hollow outline spanning >80 % of the page is cropped away (boxes are mapped back), because
  the notebook's `remove_frame` keeps borders when little text ink is inside them.

Measured on real screenshots: a 370x499 framed textbook page went from 1 line to 28 lines (mean confidence 0.17 -> 0.91);
the clean 200-dpi test page is unchanged (CER 0.3 %). Best results still come from sharp input: a PDF page or a scan /
photo where Kannada letters are at least ~20 px tall.

## Known limitations

- Speed: ~60 ms per word on CPU (the 64×384 CNN is ~3.6 GMAC per word). No GPU is used.
- Segmentation is single-column. Pictures/clipart can produce junk lines; posters with
  coloured or tightly spaced text can get words merged.
- Sentence-final `.` is often lost (the notebook's word splitter discards spans narrower than
  15 % of the line height, and the model also misses some), and `ಕ್ರಿ.ಶ 1598` read as `ಕ್ರಿಶ 11 96`
  on a clean test page: digits and punctuation are the weakest classes.
- The model is trained on printed text; handwriting is not expected to work well.
