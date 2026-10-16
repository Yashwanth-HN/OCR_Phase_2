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

TTS_MODEL = os.getenv("TTS_MODEL", "facebook/mms-tts-kan")
TTS_ENABLED = os.getenv("TTS_ENABLED", "true").lower() not in ("0", "false", "no")
MAX_TTS_CHARS = int(os.getenv("MAX_TTS_CHARS", "2000"))

# The model's alphabet has 0-9 but not Kannada digits, which it would silently skip.
_KN_DIGITS = str.maketrans("೦೧೨೩೪೫೬೭೮೯", "0123456789")
_SENTENCE_END = re.compile(r"(?<=[.?!।|\n])\s*")


class TTSUnavailable(RuntimeError):
    pass


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

    def _chunks(self, text: str) -> list[str]:
        """Sentences/lines, so long text does not degrade and gets natural pauses."""
        vocab = self._tokenizer.get_vocab()
        out = []
        for part in _SENTENCE_END.split(text.translate(_KN_DIGITS)):
            # Keep only characters the model knows; everything else would be dropped anyway.
            clean = " ".join("".join(c if c in vocab else " " for c in part).split())
            if clean:
                out.append(clean)
        return out

    def synthesize(self, text: str) -> bytes:
        """Text -> 16-bit mono WAV bytes."""
        import torch

        if not TTS_ENABLED:
            raise TTSUnavailable("Speech is disabled on this server (TTS_ENABLED=false)")
        self.load()
        if not self.ready:
            raise TTSUnavailable(self.load_error or "Speech model is not loaded")

        pause = np.zeros(int(0.25 * self.sample_rate), np.float32)
        pieces: list[np.ndarray] = []
        for chunk in self._chunks(text):
            inputs = self._tokenizer(chunk, return_tensors="pt")
            if inputs["input_ids"].shape[1] == 0:
                continue
            with self._lock, torch.inference_mode():
                wav = self._model(**inputs).waveform[0].numpy()
            pieces += [wav, pause]
        audio = np.concatenate(pieces) if pieces else pause

        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.sample_rate)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        return buf.getvalue()
