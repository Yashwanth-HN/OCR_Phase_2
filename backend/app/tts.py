"""Offline Kannada text-to-speech with Meta MMS-TTS (facebook/mms-tts-kan, VITS, 16 kHz).

Runs on this machine; no text leaves it after the one-time model download (~150 MB, cached by
Hugging Face in ~/.cache/huggingface, or point TTS_MODEL at a local folder).
Model licence: CC-BY-NC 4.0, non-commercial use only.
"""
from __future__ import annotations

import io
import os
import re
import threading
import wave

import numpy as np

from app.compute import MODEL_LOCK

TTS_MODEL = os.getenv("TTS_MODEL", "facebook/mms-tts-kan")
TTS_ENABLED = os.getenv("TTS_ENABLED", "true").lower() not in ("0", "false", "no")
MAX_TTS_CHARS = int(os.getenv("MAX_TTS_CHARS", "2000"))
# Longer sentences are synthesised in pieces of about this many characters (split at spaces). Memory grows with the
# input length (measured: +280 MB at 60 chars, +390 MB at 120, +570 MB at 220), and a 220-character sentence ran
# the 2 GB deployment out of memory.
MAX_CHUNK_CHARS = int(os.getenv("TTS_MAX_CHUNK_CHARS", "100"))
SENTENCE_PAUSE_S = 0.25
PIECE_PAUSE_S = 0.08  # between pieces of one long sentence: a short breath, not a full stop

# The model's alphabet has 0-9 but not Kannada digits, which it would silently skip.
_KN_DIGITS = str.maketrans("೦೧೨೩೪೫೬೭೮೯", "0123456789")
_SENTENCE_END = re.compile(r"(?<=[.?!।|\n])\s*")


class TTSUnavailable(RuntimeError):
    pass


def split_at_spaces(text: str, max_chars: int) -> list[str]:
    """Split into pieces of at most max_chars, at spaces (a single longer word stays whole)."""
    pieces: list[str] = []
    current = ""
    for word in text.split():
        if current and len(current) + 1 + len(word) > max_chars:
            pieces.append(current)
            current = word
        else:
            current = f"{current} {word}" if current else word
    if current:
        pieces.append(current)
    return pieces or [text]


class KannadaTTS:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._tokenizer = None
        self.load_error = ""

    def load(self) -> None:
        """Idempotent; safe to call from a background thread at startup."""
        with self._lock:
            if self._model is not None or self.load_error:
                return
            try:
                from transformers import AutoTokenizer, VitsModel

                self._tokenizer = AutoTokenizer.from_pretrained(TTS_MODEL)
                self._model = VitsModel.from_pretrained(TTS_MODEL).eval()
            except Exception as exc:  # noqa: BLE001 - missing package, no network on first run, ...
                self.load_error = f"Kannada speech model could not be loaded: {exc}"
                print(f"[tts] {self.load_error}")

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def sample_rate(self) -> int:
        return int(self._model.config.sampling_rate) if self._model is not None else 16000

    def _chunks(self, text: str) -> list[tuple[str, float]]:
        """(piece, pause after it): sentences/lines, so long text does not degrade and gets natural pauses; sentences
        longer than MAX_CHUNK_CHARS are split further at spaces (memory, see above)."""
        vocab = self._tokenizer.get_vocab()
        out = []
        for part in _SENTENCE_END.split(text.translate(_KN_DIGITS)):
            # Keep only characters the model knows; everything else would be dropped anyway.
            clean = " ".join("".join(c if c in vocab else " " for c in part).split())
            if clean:
                pieces = split_at_spaces(clean, MAX_CHUNK_CHARS)
                out += [(p, PIECE_PAUSE_S) for p in pieces[:-1]] + [(pieces[-1], SENTENCE_PAUSE_S)]
        return out

    def synthesize(self, text: str) -> bytes:
        """Text -> 16-bit mono WAV bytes."""
        import torch

        if not TTS_ENABLED:
            raise TTSUnavailable("Speech is disabled on this server (TTS_ENABLED=false)")
        self.load()
        if not self.ready:
            raise TTSUnavailable(self.load_error or "Speech model is not loaded")

        pieces: list[np.ndarray] = []
        for chunk, pause_s in self._chunks(text):
            inputs = self._tokenizer(chunk, return_tensors="pt")
            if inputs["input_ids"].shape[1] == 0:
                continue
            # Shared with OCR (app/compute.py): an overlapping OCR batch and TTS sentence ran a 2 GB container out of memory.
            with MODEL_LOCK, torch.inference_mode():
                wav = self._model(**inputs).waveform[0].numpy()
            pieces += [wav, np.zeros(int(pause_s * self.sample_rate), np.float32)]
        audio = np.concatenate(pieces) if pieces else np.zeros(int(SENTENCE_PAUSE_S * self.sample_rate), np.float32)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.sample_rate)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        return buf.getvalue()
