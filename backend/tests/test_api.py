"""API tests. Run from backend/:  python -m pytest -q

Test images are rendered with fpdf2 + HarfBuzz (correct Kannada conjuncts) and rasterised with
PyMuPDF, so no system Kannada font or Pillow/raqm build is needed.
"""
from __future__ import annotations

import json

import cv2
import numpy as np
import pymupdf
import pytest
from fastapi.testclient import TestClient

from app import main
from app.pdf_export import build_pdf


def render_png(text: str, dpi: int = 150, pad: int = 20) -> bytes:
    """Render text with the export font and crop to the ink (+pad)."""
    page = pymupdf.open(stream=build_pdf("", text), filetype="pdf")[0]
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    gray = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, 0]
    ys, xs = np.where(gray < 128)
    crop = gray[max(0, ys.min() - pad): ys.max() + pad, max(0, xs.min() - pad): xs.max() + pad]
    return cv2.imencode(".png", crop)[1].tobytes()


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[-1]


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:  # runs the lifespan -> loads the model once
        yield c


def assert_line_shape(line: dict) -> None:
    assert set(line) >= {"id", "text", "confidence", "box", "alternatives"}
    assert 0.0 <= line["confidence"] <= 1.0
    b = line["box"]
    assert 0 <= b["x"] <= 1 and 0 <= b["y"] <= 1 and 0 < b["w"] <= 1 and 0 < b["h"] <= 1
    assert b["x"] + b["w"] <= 1.0001 and b["y"] + b["h"] <= 1.0001
    assert isinstance(line["alternatives"], list)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["model_version"]


def test_word_mode(client):
    r = client.post("/ocr", files={"file": ("w.png", render_png("ಕನ್ನಡ"), "image/png")}, data={"mode": "word"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] and body["model_version"] and isinstance(body["duration_ms"], int)
    assert len(body["pages"]) == 1
    lines = body["pages"][0]["lines"]
    assert len(lines) == 1
    assert_line_shape(lines[0])
    assert levenshtein(lines[0]["text"], "ಕನ್ನಡ") <= 1, lines[0]["text"]


def test_paragraph_mode_multiline(client):
    truth = ["ಕರ್ನಾಟಕ ರಾಜ್ಯದ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು", "ಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ", "ಮೈಸೂರು ಅರಮನೆ ಬಹಳ ಸುಂದರವಾಗಿದೆ"]
    png = render_png("\n".join(truth))
    r = client.post("/ocr", files={"file": ("p.png", png, "image/png")},
                    data={"mode": "paragraph", "text_type": "printed", "deskew": "true", "denoise": "true",
                          "contrast": "50", "brightness": "50"})
    assert r.status_code == 200, r.text
    page = r.json()["pages"][0]
    h, w = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE).shape
    assert (page["width"], page["height"]) == (w, h)
    lines = page["lines"]
    assert len(lines) == 3, [l["text"] for l in lines]
    for line in lines:
        assert_line_shape(line)
    ys = [l["box"]["y"] for l in lines]
    assert ys == sorted(ys)  # top to bottom
    assert [l["id"] for l in lines] == ["p0l0", "p0l1", "p0l2"]
    # Word segmentation: same number of words per line as the source text.
    assert [len(l["text"].split()) for l in lines] == [len(t.split()) for t in truth]
    cer = levenshtein(" ".join(l["text"] for l in lines), " ".join(truth)) / len(" ".join(truth))
    assert cer < 0.15, (cer, [l["text"] for l in lines])


def test_pdf_gives_one_entry_per_page(client):
    pdf = build_pdf("", "ಕನ್ನಡ ಭಾಷೆ\n" * 60)  # long enough to spill onto a second page
    assert pymupdf.open(stream=pdf, filetype="pdf").page_count == 2
    r = client.post("/ocr", files={"file": ("d.pdf", pdf, "application/pdf")}, data={"mode": "page"})
    assert r.status_code == 200, r.text
    pages = r.json()["pages"]
    assert [p["index"] for p in pages] == [0, 1]
    assert all(p["preview_url"].startswith("data:image/jpeg;base64,") for p in pages)
    assert all(p["lines"] for p in pages)


def test_invalid_file_type(client):
    r = client.post("/ocr", files={"file": ("x.png", b"this is not an image", "image/png")}, data={"mode": "word"})
    assert r.status_code == 415
    assert "Unsupported file type" in r.json()["detail"]


def test_corrupt_image(client):
    r = client.post("/ocr", files={"file": ("x.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 100, "image/png")})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_oversize_file(client):
    big = b"\x89PNG\r\n\x1a\n" + b"\0" * (20 * 1024 * 1024)
    r = client.post("/ocr", files={"file": ("big.png", big, "image/png")}, data={"mode": "page"})
    assert r.status_code == 413
    assert "20 MB" in r.json()["detail"]


@pytest.mark.parametrize("field,value", [("mode", "line"), ("text_type", "cursive"), ("contrast", "150"), ("deskew", "maybe")])
def test_bad_fields(client, field, value):
    r = client.post("/ocr", files={"file": ("w.png", render_png("ಕನ್ನಡ"), "image/png")}, data={field: value})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_missing_file_has_string_detail(client):
    r = client.post("/ocr", data={"mode": "word"})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_feedback_appends_jsonl(client, tmp_path, monkeypatch):
    path = tmp_path / "feedback.jsonl"
    monkeypatch.setattr(main, "FEEDBACK_PATH", path)
    item = {"job_id": "j1", "line_id": "p0l0", "original": "ಕನಡ", "corrected": "ಕನ್ನಡ",
            "mode": "word", "text_type": "printed"}
    assert client.post("/feedback", json=item).status_code == 204
    assert client.post("/feedback", json=item).status_code == 204
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]
    assert rows == [item, item]


def test_translate_joins_ocr_lines_into_paragraphs(client, monkeypatch):
    from app import translate as tr

    sent = []

    def fake_google(text, source, target):
        sent.append((text, source, target))
        return "EN(" + text + ")"

    monkeypatch.setattr(tr, "_google", fake_google)
    r = client.post("/translate", json={"text": "ಸಾಲು ಒಂದು\nಸಾಲು ಎರಡು\n\nಹೊಸ ಪ್ಯಾರಾ", "source": "kn", "target": "en"})
    assert r.status_code == 200, r.text
    # Printed-line breaks are joined, the blank line stays a paragraph break; one request.
    assert sent == [("ಸಾಲು ಒಂದು ಸಾಲು ಎರಡು\n\nಹೊಸ ಪ್ಯಾರಾ", "kn", "en")]
    assert r.json() == {"translation": "EN(ಸಾಲು ಒಂದು ಸಾಲು ಎರಡು\n\nಹೊಸ ಪ್ಯಾರಾ)"}


def test_translate_join_is_capped_and_respects_sentence_ends():
    from app import translate as tr

    line = "ಕನ್ನಡ ಭಾಷೆ " * 6  # ~66 chars
    text = "\n".join([line, line, line, "ಮುಗಿಯಿತು.", "ಹೊಸ ವಾಕ್ಯ"])
    segs = tr.paragraphs(text)[0].split("\n")
    assert all(len(s) < tr._MAX_JOINED for s in segs)  # no giant run-on segment
    assert segs[-1] == "ಹೊಸ ವಾಕ್ಯ"  # a line after a full stop starts a new segment


def test_translate_long_text_is_chunked():
    from app import translate as tr

    paras = ["ಕನ್ನಡ " * 500] * 4  # ~3000 chars each
    chunks = tr._chunks(tr.paragraphs("\n\n".join(paras)))
    assert len(chunks) == 4 and all(len(c) <= tr._CHUNK for c in chunks)


def test_translate_service_down_is_502(client, monkeypatch):
    from app import translate as tr

    def down(*_):
        raise tr.TranslationFailed("Could not reach the translation service (internet connection?)")

    monkeypatch.setattr(tr, "_google", down)
    r = client.post("/translate", json={"text": "ಕನ್ನಡ"})
    assert r.status_code == 502
    assert "translation service" in r.json()["detail"]


def test_translate_disabled_is_501(client, monkeypatch):
    from app import translate as tr

    monkeypatch.setattr(tr, "TRANSLATOR", "none")
    assert client.post("/translate", json={"text": "ಕನ್ನಡ"}).status_code == 501


def test_translate_live_google(client):
    """Real call; skipped when there is no internet."""
    r = client.post("/translate", json={"text": "ಕರ್ನಾಟಕವು ಒಂದು ರಾಜ್ಯ."})
    if r.status_code in (502, 503):
        pytest.skip(r.json()["detail"])
    assert r.status_code == 200
    assert "karnataka" in r.json()["translation"].lower()


def test_export_pdf(client):
    r = client.post("/export/pdf", json={"title": "ಪರೀಕ್ಷೆ", "text": "ಕನ್ನಡ ಭಾಷೆ 123"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    text = pymupdf.open(stream=r.content, filetype="pdf")[0].get_text()
    assert "123" in text


def _tts_available() -> bool:
    try:
        import transformers  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.skipif(not _tts_available(), reason="transformers not installed")
def test_tts_returns_kannada_wav(client):
    import io
    import wave

    r = client.post("/tts", json={"text": "ಕನ್ನಡ ನಮ್ಮ ಭಾಷೆ. ೧೯೫೬ ರಲ್ಲಿ"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "audio/wav"
    with wave.open(io.BytesIO(r.content)) as w:
        assert w.getnchannels() == 1 and w.getframerate() == 16000
        seconds = w.getnframes() / w.getframerate()
        samples = np.frombuffer(w.readframes(w.getnframes()), "<i2")
    assert seconds > 1.0
    assert np.abs(samples).max() > 1000  # not silence


def test_tts_rejects_empty_text(client):
    assert client.post("/tts", json={"text": ""}).status_code == 422


def test_tts_kannada_digits_are_spoken_not_dropped():
    from app.tts import _KN_DIGITS

    assert "೧೯೫೬".translate(_KN_DIGITS) == "1956"


def test_small_text_inside_a_page_frame_is_upscaled_and_segmented(client):
    """Regression: a low-resolution screenshot of a framed page (text ~8 px) used to come back as ONE line ('ರ'),
    because the thin text was lighter than the border and the notebook mask kept only the border."""
    from app import pipeline as P

    truth = ["ಕರ್ನಾಟಕ ರಾಜ್ಯದ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು", "ಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ", "ಮೈಸೂರು ಅರಮನೆ ಬಹಳ ಸುಂದರವಾಗಿದೆ"]
    big = cv2.imdecode(np.frombuffer(render_png("\n".join(truth), dpi=150, pad=40), np.uint8), cv2.IMREAD_GRAYSCALE)
    small = cv2.resize(big, None, fx=0.4, fy=0.4, interpolation=cv2.INTER_AREA)  # ~8 px text, like a screenshot
    small = cv2.cvtColor(small, cv2.COLOR_GRAY2BGR)
    h, w = small.shape[:2]
    cv2.rectangle(small, (4, 4), (w - 5, h - 5), (90, 0, 200), 3)  # dark coloured page frame
    assert P.upscale_factor(P.to_gray(small)) > 1.5
    r = client.post("/ocr", files={"file": ("s.png", cv2.imencode(".png", small)[1].tobytes(), "image/png")},
                    data={"mode": "page"})
    assert r.status_code == 200, r.text
    page = r.json()["pages"][0]
    assert (page["width"], page["height"]) == (w, h)  # boxes stay in the original image's frame
    assert len(page["lines"]) == 3, [l["text"] for l in page["lines"]]
    for line in page["lines"]:
        assert_line_shape(line)


def test_normal_size_text_is_not_upscaled():
    from app import pipeline as P

    g = cv2.imdecode(np.frombuffer(render_png("ಕನ್ನಡ ಭಾಷೆ\nಮೈಸೂರು ಅರಮನೆ", dpi=150), np.uint8), cv2.IMREAD_GRAYSCALE)
    assert P.upscale_factor(g) == 1.0
