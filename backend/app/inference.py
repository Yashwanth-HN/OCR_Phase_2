from __future__ import annotations

import os
import importlib
from pathlib import Path
from typing import Any, Tuple

import numpy as np
from PIL import Image


def _build_crnn_model(torch: Any, num_classes: int) -> Any:
    nn = torch.nn

    class CRNN(nn.Module):
        def __init__(self, n_classes: int) -> None:
            super().__init__()
            self.cnn = nn.Sequential(
                nn.Conv2d(1, 64, 3, 1, 1), nn.BatchNorm2d(64), nn.ReLU(),
                nn.MaxPool2d(2, 2),

                nn.Conv2d(64, 128, 3, 1, 1), nn.BatchNorm2d(128), nn.ReLU(),
                nn.MaxPool2d(2, 2),

                nn.Conv2d(128, 256, 3, 1, 1), nn.BatchNorm2d(256), nn.ReLU(),
                nn.Conv2d(256, 256, 3, 1, 1), nn.BatchNorm2d(256), nn.ReLU(),
                nn.MaxPool2d((2, 1), (2, 1)),

                nn.Conv2d(256, 512, 3, 1, 1), nn.BatchNorm2d(512), nn.ReLU(),
                nn.MaxPool2d((2, 1), (2, 1)),

                nn.Conv2d(512, 512, 3, 1, 1), nn.BatchNorm2d(512), nn.ReLU(),
                nn.Identity(),
                nn.Conv2d(512, 512, (2, 1), 1, 0), nn.BatchNorm2d(512), nn.ReLU(),
            )
            self.rnn = nn.LSTM(
                input_size=512,
                hidden_size=256,
                num_layers=2,
                bidirectional=True,
                batch_first=True,
                dropout=0.2,
            )
            self.dropout = nn.Dropout(0.2)
            self.fc = nn.Linear(256 * 2, n_classes)

        def forward(self, x: Any) -> Any:
            x = self.cnn(x)
            b, c, h, w = x.size()
            x = x.squeeze(2)
            x = x.permute(0, 2, 1)
            x, _ = self.rnn(x)
            x = self.dropout(x)
            x = self.fc(x)
            return x

    return CRNN(num_classes)


class CRNNOCRService:
    """Loads CRNN artifacts and predicts text using notebook-compatible decode logic."""

    def __init__(self, model_path: str, charset_path: str) -> None:
        self.model_path = Path(model_path)
        self.charset_path = Path(charset_path)
        self.torch: Any | None = None
        self.model = None
        self.load_error = ""
        self.idx_to_char = self._load_charset()
        self._try_load_model()

    def _load_charset(self) -> dict[int, str]:
        if not self.charset_path.exists():
            return {}

        mapping: dict[int, str] = {}
        with self.charset_path.open("r", encoding="utf-8") as f:
            raw_lines = [line.rstrip("\r\n") for line in f]

        # Supported formats:
        # 1) one character per line (implies index starts from 1)
        # 2) idx\tchar
        # 3) char\tidx
        for i, raw in enumerate(raw_lines, start=1):
            if "\t" not in raw:
                # A literal space can't survive as its own line (blank lines are
                # filtered above), so it's written as this placeholder token.
                mapping[i] = " " if raw in {"", "<space>"} else raw
                continue

            left, right = raw.split("\t", 1)
            if left.isdigit():
                mapping[int(left)] = right
            elif right.isdigit():
                mapping[int(right)] = left
            else:
                mapping[i] = raw

        return mapping

    def _try_load_model(self) -> None:
        if not self.model_path.exists():
            return
        if not self.idx_to_char:
            return

        try:
            self.torch = importlib.import_module("torch")
            num_classes = max(self.idx_to_char.keys()) + 1
            self.model = _build_crnn_model(self.torch, num_classes=num_classes)

            artifact = self.torch.load(self.model_path, map_location="cpu")
            if isinstance(artifact, dict) and "state_dict" in artifact:
                state_dict = artifact["state_dict"]
            else:
                state_dict = artifact

            self.model.load_state_dict(state_dict, strict=True)
            self.model.eval()
            self.load_error = ""
        except Exception as exc:
            self.load_error = f"Failed loading model artifact: {exc}"
            self.torch = None
            self.model = None

    def _preprocess(self, image: Image.Image) -> Any:
        assert self.torch is not None

        # Must match the notebook's OCRDataset preprocessing exactly: the
        # model was trained on aspect-ratio-preserving resize + white-pad,
        # not a naive squish-resize. A naive resize here would distort
        # every input differently than what the model learned from,
        # silently hurting accuracy without raising any error.
        target_h, target_w = 32, 256
        gray = image.convert("L")
        w, h = gray.size
        scale = min(target_w / w, target_h / h)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
        resized = gray.resize((new_w, new_h), Image.Resampling.BILINEAR)

        canvas = Image.new("L", (target_w, target_h), color=255)
        y_offset = (target_h - new_h) // 2
        canvas.paste(resized, (0, y_offset))

        arr = np.array(canvas, dtype=np.float32) / 255.0
        tensor = self.torch.tensor(arr, dtype=self.torch.float32).unsqueeze(0).unsqueeze(0)
        return tensor

    def _decode_ctc(self, outputs: Any) -> tuple[str, float]:
        assert self.torch is not None

        probs = outputs.softmax(2)[0]  # (T, C)
        pred_ids = probs.argmax(1).cpu().numpy().tolist()

        decoded_chars: list[str] = []
        token_confidences: list[float] = []
        prev = 0

        for t, idx in enumerate(pred_ids):
            if idx == 0:
                prev = idx
                continue
            if idx == prev:
                continue

            ch = self.idx_to_char.get(idx, "")
            if ch:
                decoded_chars.append(ch)
                token_confidences.append(float(probs[t, idx].item()))
            prev = idx

        text = "".join(decoded_chars)
        confidence = float(sum(token_confidences) / len(token_confidences)) if token_confidences else 0.0
        return text, confidence

    def predict(self, image: Image.Image) -> Tuple[str, float]:
        if self.model is None or self.torch is None:
            if self.load_error:
                return (self.load_error, 0.0)
            return (
                "Model not loaded. Place model in backend/models and charset in backend/models/charset.txt",
                0.0,
            )
        if not self.idx_to_char:
            return ("Charset not loaded. Add backend/models/charset.txt", 0.0)

        with self.torch.no_grad():
            img_tensor = self._preprocess(image)
            outputs = self.model(img_tensor)
            text, confidence = self._decode_ctc(outputs)

        if not text:
            return ("", confidence)

        return text, confidence


def build_service_from_env() -> CRNNOCRService:
    backend_root = Path(__file__).resolve().parent.parent

    model_path = Path(os.getenv("CRNN_MODEL_PATH", "models/crnn_v4.pth"))
    charset_path = Path(os.getenv("CRNN_CHARSET_PATH", "models/charset_v4.txt"))

    if not model_path.is_absolute():
        model_path = backend_root / model_path
    if not charset_path.is_absolute():
        charset_path = backend_root / charset_path

    return CRNNOCRService(model_path=model_path, charset_path=charset_path)
