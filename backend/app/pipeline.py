"""Upload -> pages -> (enhance, deskew) -> lines/words (notebook segmentation) -> CRNN -> contract JSON."""
from __future__ import annotations

import base64
import io
import os
import time
import uuid
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps

from app import notebook_pipeline as nbp
from app.recognizer import Recognizer, WordReading

# A dense page takes ~10-15 s on an 8-core CPU and the UI times out at 120 s, so keep this small.
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "5"))
PDF_DPI = int(os.getenv("PDF_DPI", "200"))
MAX_SIDE = int(os.getenv("MAX_IMAGE_SIDE", "4000"))  # longer side is downscaled to this
Image.MAX_IMAGE_PIXELS = 60_000_000                   # refuse decompression bombs
# Small-text upscaling (paragraph/page modes), see upscale_factor().
SMALL_TEXT_PX = float(os.getenv("SMALL_TEXT_PX", "16"))
TARGET_GLYPH_PX = float(os.getenv("TARGET_GLYPH_PX", "20"))
# Sliver lines (see drop_slivers): thinner than this fraction of a normal line and below this confidence.
SLIVER_HEIGHT = float(os.getenv("SLIVER_HEIGHT", "0.55"))
SLIVER_MAX_CONF = float(os.getenv("SLIVER_MAX_CONF", "0.6"))
MAX_UPSCALE = float(os.getenv("MAX_UPSCALE", "3.0"))  # 2.5 -> 3.0: CER 12.6% -> 6.4% on a 370 px page

MODES = ("word", "paragraph", "page")
TEXT_TYPES = ("printed", "handwritten")


class InputError(ValueError):
    """Bad input the client can fix -> HTTP 4xx with this message."""

    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class Options:
    mode: str = "page"
    text_type: str = "printed"   # accepted for the contract; there is one model for both
    deskew: bool = True
    denoise: bool = True
    contrast: int = 50           # 0..100, 50 = unchanged (same scale as the UI preview)
    brightness: int = 50


@dataclass
class PageImage:
    bgr: np.ndarray              # 3- or 4-channel uint8, as decoded
    width: int                   # original size reported to the client
    height: int
    preview_url: str | None = None


# ---------------------------------------------------------------- decoding
def sniff(raw: bytes) -> str | None:
    if raw.startswith(b"%PDF-"):
        return "pdf"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        return cv2.cvtColor(np.asarray(img.convert("RGBA")), cv2.COLOR_RGBA2BGRA)
    return cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _preview(bgr: np.ndarray, max_side: int = 1400) -> str:
    h, w = bgr.shape[:2]
    s = min(1.0, max_side / max(h, w))
    small = cv2.resize(bgr[:, :, :3], (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else bgr[:, :, :3]
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def decode(raw: bytes, kind: str) -> list[PageImage]:
    if kind == "pdf":
        import pymupdf

        try:
            doc = pymupdf.open(stream=raw, filetype="pdf")
        except Exception as exc:
            raise InputError("Could not read the PDF file") from exc
        if doc.needs_pass:
            raise InputError("Password-protected PDFs are not supported")
        if doc.page_count == 0:
            raise InputError("The PDF has no pages")
        if doc.page_count > MAX_PDF_PAGES:
            raise InputError(f"The PDF has {doc.page_count} pages; the limit is {MAX_PDF_PAGES}", 413)
        pages = []
        for page in doc:
            pix = page.get_pixmap(dpi=PDF_DPI, alpha=False)
            rgb = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            # The browser cannot preview a PDF page, so send a small JPEG to draw the boxes on.
            pages.append(PageImage(bgr, pix.width, pix.height, _preview(bgr)))
        return pages

    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # phone photos: match the orientation the browser shows
        bgr = _pil_to_bgr(img)
    except Image.DecompressionBombError as exc:
        raise InputError("Image is too large (pixel count)", 413) from exc
    except Exception as exc:
        raise InputError("Could not decode the image") from exc
    return [PageImage(bgr, bgr.shape[1], bgr.shape[0])]


# ---------------------------------------------------------------- image prep
def to_gray(im: np.ndarray) -> np.ndarray:
    """Notebook load_gray (Cell 23/24), taking an array instead of a path."""
    if im.ndim == 2:
        return im
    if im.shape[2] == 4:  # transparent PNG: composite on white
        a = im[:, :, 3:4].astype(np.float32) / 255.0
        im = (im[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    if np.median(gray) > 127:
        return im.min(axis=2)  # light background: darkest channel, coloured text turns dark
    return im.max(axis=2)


def adjust(gray: np.ndarray, contrast: int, brightness: int) -> np.ndarray:
    """Same maths as the UI preview's CSS filter: contrast(0.5+c/100) then brightness(0.5+b/100)."""
    if contrast == 50 and brightness == 50:
        return gray
    x = gray.astype(np.float32) / 255.0
    x = (x - 0.5) * (0.5 + contrast / 100) + 0.5
    x = x * (0.5 + brightness / 100)
    return (np.clip(x, 0, 1) * 255).astype(np.uint8)


def denoise(gray: np.ndarray) -> np.ndarray:
    # searchWindowSize 11 (not the default 21): ~4x faster on full pages, same effect on scan speckle.
    return cv2.fastNlMeansDenoising(gray, None, h=6, templateWindowSize=7, searchWindowSize=11)


def estimate_skew(gray: np.ndarray, max_angle: float = 6.0, step: float = 0.25) -> float:
    """Angle (degrees) whose rotation gives the sharpest horizontal projection profile."""
    mask = nbp.ink_mask(gray)
    s = min(1.0, 900 / max(mask.shape))
    small = cv2.resize(mask, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else mask
    h, w = small.shape
    centre = (w / 2, h / 2)
    best, best_score = 0.0, -1.0
    for a in np.arange(-max_angle, max_angle + 1e-6, step):
        m = cv2.getRotationMatrix2D(centre, float(a), 1.0)
        rot = cv2.warpAffine(small, m, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
        prof = rot.sum(axis=1, dtype=np.float64)
        score = float(np.sum(np.diff(prof) ** 2))
        if score > best_score:
            best, best_score = float(a), score
    return best


def rotate(gray: np.ndarray, angle: float) -> tuple[np.ndarray, np.ndarray]:
    """Rotate on an enlarged canvas (nothing is cut off). Returns (image, 2x3 matrix orig->rotated)."""
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw, nh = int(h * sin + w * cos + 0.5), int(h * cos + w * sin + 0.5)
    m[0, 2] += nw / 2 - w / 2
    m[1, 2] += nh / 2 - h / 2
    out = cv2.warpAffine(gray, m, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=int(np.median(gray)))
    return out, m


# ---------------------------------------------------------------- recognition
def _ink_box(gray: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(nbp.ink_mask(gray) > 0)
    if len(xs) == 0:
        return 0, 0, gray.shape[1], gray.shape[0]
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def _line_alternatives(words: list[WordReading], limit: int = 2) -> list[str]:
    """Swap the least-confident word that has beam alternatives for each of its alternatives."""
    candidates = [i for i, w in enumerate(words) if w.alternatives]
    if not candidates:
        return []
    k = min(candidates, key=lambda i: words[i].confidence)
    out = []
    for alt in words[k].alternatives[:limit]:
        out.append(" ".join(alt if i == k else w.text for i, w in enumerate(words) if (alt if i == k else w.text)))
    return out


def _box(x0: float, y0: float, x1: float, y1: float, w: int, h: int) -> dict:
    x0, x1 = max(0.0, min(x0, w)), max(0.0, min(x1, w))
    y0, y1 = max(0.0, min(y0, h)), max(0.0, min(y1, h))
    return {"x": round(x0 / w, 5), "y": round(y0 / h, 5), "w": round((x1 - x0) / w, 5), "h": round((y1 - y0) / h, 5)}


def glyph_height(gray: np.ndarray) -> float | None:
    """Median height of character-sized ink blobs (Otsu), i.e. roughly the text size in pixels."""
    b = cv2.GaussianBlur(gray, (3, 3), 0)
    _, th = cv2.threshold(b, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if (th > 0).mean() > 0.5:  # light text on dark background
        th = 255 - th
    H, W = th.shape
    _, _, st, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    hs = [h for _, _, w, h, a in st[1:] if 3 <= h < 0.2 * H and w < 0.2 * W and a >= 6]
    return float(np.median(hs)) if len(hs) >= 5 else None


def upscale_factor(gray: np.ndarray) -> float:
    """Small text (e.g. a low-resolution screenshot of a page) breaks the notebook's segmentation: the thin,
    anti-aliased strokes are lighter than borders/pictures, so ink_mask keeps the border and drops the text,
    and the whole page becomes one 'line'. Bring the text to the ~20 px glyph height of the images the
    pipeline works well on. Measured on real screenshots: 6-13 px text read correctly only after this."""
    gh = glyph_height(gray)
    if gh is None or gh >= SMALL_TEXT_PX:
        return 1.0
    return float(min(MAX_UPSCALE, TARGET_GLYPH_PX / gh))


def frame_inner_box(gray: np.ndarray) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) just inside a page border, or None.

    The notebook's remove_frame only drops a border when plenty of text ink sits inside it; with small or
    light text it keeps the border, whose sides are then read as stray letters on every line and whose bottom
    edge becomes a junk line. A border here = one hollow Otsu blob spanning >80 % of both sides."""
    b = cv2.GaussianBlur(gray, (3, 3), 0)
    _, th = cv2.threshold(b, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if (th > 0).mean() > 0.5:
        th = 255 - th
    H, W = th.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    frames = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if w <= 0.8 * W or h <= 0.8 * H or area >= 0.3 * w * h:
            continue
        thickness = area / max(1.0, 2.0 * (w + h))  # a hollow outline: area ~ perimeter x thickness
        m = int(3 * thickness) + 2                  # its interior (well inside the outline) must be empty
        interior = lab[y + m:y + h - m, x + m:x + w - m] == i
        if interior.size and interior.sum() < 0.05 * area:
            frames.append((x, y, w, h, thickness))
    if not frames:
        return None
    x, y, w, h, thickness = max(frames, key=lambda s: s[2] * s[3])
    pad = int(2 * thickness) + 3
    if w - 2 * pad < 0.5 * w or h - 2 * pad < 0.5 * h:
        return None
    return int(x + pad), int(y + pad), int(w - 2 * pad), int(h - 2 * pad)


def recognize_page(rec: Recognizer, page: PageImage, index: int, opts: Options) -> dict:
    gray = to_gray(page.bgr)
    scale = 1.0
    if max(gray.shape) > MAX_SIDE:
        scale = MAX_SIDE / max(gray.shape)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    elif opts.mode != "word":  # a word crop is upscaled per crop anyway (notebook enhance())
        up = upscale_factor(gray)
        if up > 1.0:
            scale = up
            # Lanczos keeps thin strokes (vowel signs, subscripts) slightly sharper than cubic here.
            gray = cv2.resize(gray, None, fx=up, fy=up, interpolation=cv2.INTER_LANCZOS4)
    gray = adjust(gray, opts.contrast, opts.brightness)
    if opts.denoise:
        gray = denoise(gray)

    result = {"index": index, "width": page.width, "height": page.height, "lines": []}
    if page.preview_url:
        result["preview_url"] = page.preview_url
    gh, gw = gray.shape
    W, H = gw / scale, gh / scale  # original-pixel frame for the fractional boxes

    if opts.mode == "word":
        reading = rec.read([gray], nbp.needs_invert(gray))[0]
        if reading.text.strip():
            x0, y0, x1, y1 = _ink_box(gray)
            result["lines"].append({
                "id": f"p{index}l0", "text": reading.text, "confidence": round(reading.confidence, 4),
                "box": _box(x0 / scale, y0 / scale, x1 / scale, y1 / scale, W, H),
                "alternatives": reading.alternatives,
            })
        return result

    # paragraph / page
    crop_x = crop_y = 0
    inner = frame_inner_box(gray)
    if inner is not None:  # read only what is inside a page border (see frame_inner_box)
        crop_x, crop_y, cw, ch = inner
        gray = gray[crop_y:crop_y + ch, crop_x:crop_x + cw]

    inv_m = None
    if opts.deskew:
        angle = estimate_skew(gray)
        if abs(angle) >= 0.3:
            gray, m = rotate(gray, angle)
            inv_m = cv2.invertAffineTransform(m)

    off = 0
    work = gray
    if gray.shape[0] > 20 and gray.shape[1] > 20:  # notebook Cell 24 trims a 3 px border
        work, off = gray[3:-3, 3:-3], 3
    invert = nbp.needs_invert(work)
    segs = nbp.segment_page(work, 0.25)
    if not segs:  # nothing segmented: read the whole image as one word (as the notebook does)
        segs = [(0, work.shape[0], [(0, work.shape[1], work)])]

    readings = rec.read([c for _, _, ws in segs for (_, _, c) in ws], invert)

    def to_original(x0, y0, x1, y1):
        pts = np.array([[x0, y0], [x1, y0], [x0, y1], [x1, y1]], np.float64) + off
        if inv_m is not None:
            pts = pts @ inv_m[:, :2].T + inv_m[:, 2]
        pts += (crop_x, crop_y)
        pts /= scale
        return pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()

    k = 0
    for ya, yb, ws in segs:
        words = readings[k:k + len(ws)]
        k += len(ws)
        kept = [(w, (a, b)) for w, (a, b, _) in zip(words, ws) if w.text.strip()]
        if not kept:
            continue
        xs0 = min(a for _, (a, _) in kept)
        xs1 = max(b for _, (_, b) in kept)
        words_only = [w for w, _ in kept]
        result["lines"].append({
            "id": f"p{index}l{len(result['lines'])}",
            "text": " ".join(w.text for w in words_only),
            "confidence": round(float(np.mean([w.confidence for w in words_only])), 4),
            "box": _box(*to_original(xs0, ya, xs1, yb), W, H),
            "alternatives": _line_alternatives(words_only),
        })
    result["lines"] = drop_slivers(result["lines"], index)
    return result


def drop_slivers(lines: list[dict], page_index: int) -> list[dict]:
    """Remove junk 'lines' that are really slivers of the line above (descenders, subscripts, a page number
    on a border): much thinner than a normal line, overlapping a neighbour, and read with low confidence.
    On a real page these came out as 'ಎ', 'ಸಯ', '೨ ಈ - ಆ ...' with confidence 0.17-0.53."""
    if len(lines) < 3:
        return lines
    heights = sorted(l["box"]["h"] for l in lines)
    typical = heights[len(heights) // 2]

    def overlap(a: dict, b: dict) -> float:
        top = max(a["box"]["y"], b["box"]["y"])
        bottom = min(a["box"]["y"] + a["box"]["h"], b["box"]["y"] + b["box"]["h"])
        return max(0.0, bottom - top) / max(a["box"]["h"], 1e-9)

    kept = []
    for i, line in enumerate(lines):
        thin = line["box"]["h"] < SLIVER_HEIGHT * typical
        touches = any(overlap(line, lines[j]) > 0.2 for j in (i - 1, i + 1) if 0 <= j < len(lines))
        if thin and touches and line["confidence"] < SLIVER_MAX_CONF:
            continue
        kept.append(line)
    for n, line in enumerate(kept):  # keep ids sequential: p0l0, p0l1, ...
        line["id"] = f"p{page_index}l{n}"
    return kept


def run_ocr(rec: Recognizer, raw: bytes, kind: str, opts: Options) -> dict:
    started = time.perf_counter()
    pages = decode(raw, kind)
    out_pages = [recognize_page(rec, p, i, opts) for i, p in enumerate(pages)]
    return {
        "id": uuid.uuid4().hex,
        "model_version": rec.model_version,
        "duration_ms": int((time.perf_counter() - started) * 1000),
        "pages": out_pages,
    }
