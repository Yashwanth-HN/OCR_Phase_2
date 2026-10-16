"""Batched word recognition with the CRNN, wrapping the notebook's read_words (Cell 24).

Per word crop the steps are exactly the notebook's: enhance (upscale + sharpen) -> pad_bg(6)
-> min/max normalise -> preprocess_gray(invert) -> /255 -> model. On top of that this module
returns, from the same softmax output:
  - confidence: mean probability of the characters actually emitted (see _greedy)
  - alternatives: other readings found by a small CTC prefix beam search
"""
from __future__ import annotations

import hashlib
import os
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import torch

from app import notebook_pipeline as nbp
from app.lexicon import load_lexicon

BACKEND_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class WordReading:
    text: str
    confidence: float
    alternatives: list[str] = field(default_factory=list)  # best first, excluding `text`
    alt_confidences: list[float] = field(default_factory=list)


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else BACKEND_ROOT / p


def _load_charset(path: Path) -> list[str]:
    """charset file: one character per line, line 1 = class 1 (class 0 is the CTC blank)."""
    lines = path.read_text(encoding="utf-8").split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return [" " if ln in ("", "<space>") else ln.rstrip("\r") for ln in lines]


def _load_state_dict(path: Path) -> dict:
    # weights_only=True refuses to execute pickled code; map to CPU for checkpoints saved on GPU.
    artifact = torch.load(path, map_location="cpu", weights_only=True)
    if isinstance(artifact, dict):
        for key in ("model", "state_dict"):  # training checkpoints, e.g. crnn_v4_last.pt
            if key in artifact and isinstance(artifact[key], dict):
                return artifact[key]
    return artifact


class Recognizer:
    def __init__(self, model_path: str, charset_path: str, model_version: str | None = None,
                 batch_size: int = 64, beam_width: int = 5) -> None:
        self.model_path = _resolve(model_path)
        self.charset_path = _resolve(charset_path)
        self.batch_size = batch_size
        self.beam_width = beam_width

        chars = _load_charset(self.charset_path)
        if chars != nbp.chars[: len(chars)]:
            # Not fatal (a retrained model may have a different vocabulary) but worth knowing.
            print(f"[recognizer] note: {self.charset_path.name} differs from the notebook's charset")
        self.idx_to_char = {i + 1: c for i, c in enumerate(chars)}

        state = _load_state_dict(self.model_path)
        n_out = state["fc.weight"].shape[0]
        if n_out != len(chars) + 1:
            raise ValueError(f"model has {n_out} outputs but charset has {len(chars)} chars (+1 blank)")
        # The CNN is ~3.6 GMAC per word, so CPU threads matter (PyTorch defaults to half the cores).
        torch.set_num_threads(int(os.getenv("TORCH_THREADS", str(os.cpu_count() or 1))))
        self.model = nbp.CRNN(n_out)
        self.model.load_state_dict(state, strict=True)
        self.model.eval()

        # Kannada word list for dictionary correction (None if disabled or missing); see app/lexicon.py.
        self.lexicon = load_lexicon(self.idx_to_char)

        digest = hashlib.sha256(self.model_path.read_bytes()).hexdigest()[:8]
        self.model_version = model_version or f"{self.model_path.stem}-{digest}"
        # torch modules are not guaranteed thread-safe; requests run in a thread pool.
        self._lock = threading.Lock()

    # ---------------- preprocessing (notebook read_words, enhance_mode=True) ----------------
    @staticmethod
    def _prepare(crop: np.ndarray, invert: bool) -> np.ndarray:
        c = nbp.pad_bg(nbp.enhance(crop), 6)
        c = cv2.normalize(c, None, 0, 255, cv2.NORM_MINMAX)
        return nbp.preprocess_gray(c, augment=False, invert=invert)

    def probabilities(self, crops: list[np.ndarray], invert: bool) -> np.ndarray:
        """(N, T, C) softmax probabilities for N grayscale uint8 crops."""
        out = []
        for i in range(0, len(crops), self.batch_size):
            canv = np.stack([self._prepare(c, invert) for c in crops[i:i + self.batch_size]])
            x = torch.from_numpy(canv.astype("float32") / 255.0).unsqueeze(1)
            with self._lock, torch.inference_mode():
                out.append(self.model(x).softmax(2).numpy())
        return np.concatenate(out) if out else np.zeros((0, 0, 0), np.float32)

    def read(self, crops: list[np.ndarray], invert: bool) -> list[WordReading]:
        readings = []
        for p in self.probabilities(crops, invert):
            r = self._decode(p)
            if self.lexicon is not None and r.text:
                fixed = self.lexicon.correct(r.text, np.log(p + 1e-12), r.alternatives)
                if fixed != r.text:
                    # Keep what the model actually read as the first alternative (pickable in the Review card).
                    r = WordReading(fixed, r.confidence, [r.text] + [a for a in r.alternatives if a != fixed],
                                    [r.confidence] + r.alt_confidences)
            readings.append(r)
        return readings

    # ---------------- decoding ----------------
    def _greedy(self, probs: np.ndarray) -> tuple[str, float]:
        """Notebook decode_batch_ctc. Confidence = mean, over emitted characters, of the highest
        probability that character reached in its run of frames. (The notebook averaged the max
        probability over ALL frames, which is dominated by easy blank frames and stays ~0.97 even
        for wrong words, so it cannot flag errors.)"""
        ids = probs.argmax(1)
        text, confs, prev = [], [], 0
        for t, idx in enumerate(ids):
            idx = int(idx)
            if idx != 0 and idx != prev:
                text.append(self.idx_to_char.get(idx, ""))
                confs.append(float(probs[t, idx]))
            elif idx != 0 and idx == prev:
                confs[-1] = max(confs[-1], float(probs[t, idx]))
            prev = idx
        return "".join(text), (float(np.mean(confs)) if confs else 0.0)

    def _beam(self, probs: np.ndarray, top: int = 3) -> list[tuple[str, float]]:
        """CTC prefix beam search; returns up to `top` (text, posterior share) pairs."""
        beams: dict[tuple, tuple[float, float]] = {(): (1.0, 0.0)}  # prefix -> (p_blank, p_nonblank)
        for t in range(probs.shape[0]):
            row = probs[t]
            cand = np.where(row > 1e-3)[0]
            nxt: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
            for prefix, (pb, pnb) in beams.items():
                total = pb + pnb
                for c in cand:
                    p = float(row[c])
                    if c == 0:
                        nxt[prefix][0] += total * p
                        continue
                    last = prefix[-1] if prefix else None
                    ext = prefix + (int(c),)
                    if c == last:
                        nxt[ext][1] += pb * p        # repeated char needs a blank in between
                        nxt[prefix][1] += pnb * p    # otherwise it collapses
                    else:
                        nxt[ext][1] += total * p
            ranked = sorted(nxt.items(), key=lambda kv: kv[1][0] + kv[1][1], reverse=True)
            beams = {k: (v[0], v[1]) for k, v in ranked[: self.beam_width]}
            norm = sum(a + b for a, b in beams.values()) or 1.0
            beams = {k: (a / norm, b / norm) for k, (a, b) in beams.items()}
        ranked = sorted(beams.items(), key=lambda kv: sum(kv[1]), reverse=True)[:top]
        return [("".join(self.idx_to_char.get(i, "") for i in k), sum(v)) for k, v in ranked]

    def _decode(self, probs: np.ndarray) -> WordReading:
        text, conf = self._greedy(probs)
        alts = [(t, s) for t, s in self._beam(probs) if t != text and t.strip()]
        return WordReading(text, conf, [t for t, _ in alts], [s for _, s in alts])


def build_recognizer_from_env() -> Recognizer:
    return Recognizer(
        model_path=os.getenv("CRNN_MODEL_PATH", "models/crnn_v8.pth"),
        charset_path=os.getenv("CRNN_CHARSET_PATH", "models/charset_v8.txt"),
        model_version=os.getenv("MODEL_VERSION") or None,
        batch_size=int(os.getenv("OCR_BATCH_SIZE", "64")),
    )
