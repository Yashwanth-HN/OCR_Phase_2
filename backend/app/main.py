from __future__ import annotations

import json
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.pdf_export import build_pdf
from app.pipeline import MODES, TEXT_TYPES, InputError, Options, run_ocr, sniff
from app.recognizer import Recognizer, build_recognizer_from_env
from app.schemas import OcrResponse
from app.translate import TranslationFailed, TranslationUnavailable
from app.translate import translate as translate_text
from app.tts import MAX_TTS_CHARS, TTS_ENABLED, KannadaTTS, TTSUnavailable

BACKEND_ROOT = Path(__file__).resolve().parent.parent
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)
FEEDBACK_PATH = Path(os.getenv("FEEDBACK_PATH", str(BACKEND_ROOT / "data" / "feedback.jsonl")))

state: dict[str, object] = {"recognizer": None, "load_error": ""}
tts = KannadaTTS()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load the model ONCE at startup. A failure is reported by /health and /ocr (503), not hidden.
    try:
        state["recognizer"] = build_recognizer_from_env()
    except Exception as exc:  # noqa: BLE001
        state["load_error"] = f"Model failed to load: {exc}"
        print(f"[startup] {state['load_error']}")
    if TTS_ENABLED:
        # The speech model is optional: load it in the background so OCR is ready immediately.
        threading.Thread(target=tts.load, name="tts-load", daemon=True).start()
    yield


app = FastAPI(title="Kannada OCR Backend", version="0.2.0", lifespan=lifespan)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        os.getenv(
            "FRONTEND_ORIGIN",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://localhost:8081",
        ),
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Flatten FastAPI's list-of-errors into one readable {"detail": "..."} string for the UI.
    parts = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query"))
        parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "Invalid request"})


def _recognizer() -> Recognizer:
    rec = state["recognizer"]
    if rec is None:
        raise HTTPException(status_code=503, detail=state["load_error"] or "Model is not loaded")
    return rec  # type: ignore[return-value]


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File is larger than {MAX_UPLOAD_MB:g} MB")
    if not raw:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")
    kind = sniff(raw)  # by content, not by the (client-controlled) file name or content type
    if kind is None:
        raise HTTPException(status_code=415, detail="Unsupported file type. Use PNG, JPG, WEBP or PDF.")
    return raw, kind


def _bool(value: str, name: str) -> bool:
    v = value.strip().lower()
    if v in ("true", "1", "yes", "on"):
        return True
    if v in ("false", "0", "no", "off"):
        return False
    raise HTTPException(status_code=422, detail=f"{name} must be true or false")


def _percent(value: str, name: str) -> int:
    try:
        n = float(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{name} must be a number from 0 to 100") from None
    if not 0 <= n <= 100:
        raise HTTPException(status_code=422, detail=f"{name} must be from 0 to 100")
    return int(round(n))


async def _run(raw: bytes, kind: str, opts: Options) -> dict:
    rec = _recognizer()
    try:
        # CPU-bound: run off the event loop so other requests (e.g. /health) stay responsive.
        return await run_in_threadpool(run_ocr, rec, raw, kind, opts)
    except InputError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


# ---------------------------------------------------------------- routes
@app.get("/health")
def health() -> JSONResponse:
    rec = state["recognizer"]
    if rec is None:
        return JSONResponse(status_code=503, content={"status": "error", "detail": state["load_error"]})
    return JSONResponse(content={"status": "ok", "model_version": rec.model_version})  # type: ignore[union-attr]


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    mode: str = Form("page"),
    text_type: str = Form("printed"),
    deskew: str = Form("true"),
    denoise: str = Form("true"),
    contrast: str = Form("50"),
    brightness: str = Form("50"),
) -> dict:
    if mode not in MODES:
        raise HTTPException(status_code=422, detail=f"mode must be one of: {', '.join(MODES)}")
    if text_type not in TEXT_TYPES:
        raise HTTPException(status_code=422, detail=f"text_type must be one of: {', '.join(TEXT_TYPES)}")
    opts = Options(
        mode=mode,
        text_type=text_type,
        deskew=_bool(deskew, "deskew"),
        denoise=_bool(denoise, "denoise"),
        contrast=_percent(contrast, "contrast"),
        brightness=_percent(brightness, "brightness"),
    )
    raw, kind = await _read_upload(file)
    return await _run(raw, kind, opts)


@app.post("/ocr/upload", response_model=OcrResponse)
async def upload_image(file: UploadFile = File(...)) -> OcrResponse:
    """Legacy endpoint used by the older OCR/frontend: one word image -> {text, confidence}."""
    raw, kind = await _read_upload(file)
    if kind == "pdf":
        raise HTTPException(status_code=415, detail="Only image uploads are supported")
    result = await _run(raw, kind, Options(mode="word", deskew=False, denoise=False))
    lines = result["pages"][0]["lines"]
    return OcrResponse(text=lines[0]["text"] if lines else "", confidence=lines[0]["confidence"] if lines else 0.0)


class FeedbackIn(BaseModel):
    job_id: str = Field(max_length=200)
    line_id: str = Field(max_length=200)
    original: str = Field(max_length=10_000)
    corrected: str = Field(max_length=10_000)
    mode: Literal["word", "paragraph", "page"]
    text_type: Literal["printed", "handwritten"]


_feedback_lock = threading.Lock()


@app.post("/feedback", status_code=204)
def feedback(body: FeedbackIn) -> Response:
    FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(body.model_dump(), ensure_ascii=False)
    with _feedback_lock, FEEDBACK_PATH.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    return Response(status_code=204)


class TranslateIn(BaseModel):
    text: str = Field(max_length=20_000)
    source: str = Field(default="kn", pattern=r"^[a-z]{2,3}$")
    target: str = Field(default="en", pattern=r"^[a-z]{2,3}$")


@app.post("/translate")
async def translate(body: TranslateIn) -> dict:
    if not body.text.strip():
        return {"translation": ""}
    try:
        result = await run_in_threadpool(translate_text, body.text, body.source, body.target)
    except TranslationUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except TranslationFailed as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return {"translation": result}


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TTS_CHARS)


@app.post("/tts")
async def text_to_speech(body: TtsIn) -> Response:
    """Kannada text -> audio/wav, generated offline by MMS-TTS. The UI sends one sentence at a time."""
    try:
        audio = await run_in_threadpool(tts.synthesize, body.text)
    except TTSUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")


class ExportIn(BaseModel):
    title: str = Field(default="", max_length=300)
    text: str = Field(max_length=500_000)


@app.post("/export/pdf")
async def export_pdf(body: ExportIn) -> Response:
    pdf = await run_in_threadpool(build_pdf, body.title, body.text)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="kannada-ocr.pdf"'},
    )
