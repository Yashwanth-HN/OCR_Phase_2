"""Verbatim copies of the Colab notebook code the model was trained/tested with.

Source: other/notebooks/new_kannada_ocr_fixed_v10.ipynb  (model: crnn_v8.pth)
  - charset:         Cell 08 + EXTRA_CHARS (Cell 26) + conjunct tokens (Cell 28)
  - preprocessing:   Cell 10 (trim_margins, needs_invert, preprocess_gray)
  - model:           Cell 18 (CRNN, 64x384 input)
  - segmentation:    Cell 24 (ink_mask ... resplit_tall, enhance, pad_bg) and Cell 24b
                     (extend_to_ink + the segment_page that replaces Cell 24's)

Do NOT edit these functions to "improve" them: the model only works well on inputs
prepared exactly the way it was trained. If you retrain with a changed pipeline,
re-copy the cells here. Only the imports, this docstring and section comments were added.
"""
from __future__ import annotations

import cv2
import numpy as np
import torch
import torch.nn as nn

# ---------------- Cell 08: fixed vocabulary ----------------
_vowels = [0x0C85,0x0C86,0x0C87,0x0C88,0x0C89,0x0C8A,0x0C8B,0x0C8E,0x0C8F,0x0C90,0x0C92,0x0C93,0x0C94,0x0CE0]
_signs = [0x0C82,0x0C83,0x0CBD]
_consonants = [0x0C95,0x0C96,0x0C97,0x0C98,0x0C99,0x0C9A,0x0C9B,0x0C9C,0x0C9D,0x0C9E,
               0x0C9F,0x0CA0,0x0CA1,0x0CA2,0x0CA3,0x0CA4,0x0CA5,0x0CA6,0x0CA7,0x0CA8,
               0x0CAA,0x0CAB,0x0CAC,0x0CAD,0x0CAE,0x0CAF,0x0CB0,0x0CB1,0x0CB2,0x0CB3,
               0x0CB5,0x0CB6,0x0CB7,0x0CB8,0x0CB9]
_matras = [0x0CBE,0x0CBF,0x0CC0,0x0CC1,0x0CC2,0x0CC3,0x0CC4,0x0CC6,0x0CC7,0x0CC8,0x0CCA,0x0CCB,0x0CCC]
_virama = [0x0CCD]
_length_marks = [0x0CD5,0x0CD6]
_kn_digits = list(range(0x0CE6, 0x0CF0))

chars = [" "] + [chr(c) for c in _vowels + _signs + _consonants + _matras + _virama + _length_marks + _kn_digits]
chars += [str(d) for d in range(10)]          # Arabic digits 0-9
chars += [".", ",", "?", "!", "-", chr(0x0964)]  # . , ? ! - danda(।)

# Cell 26: extended the vocabulary in place (old indices never change).
EXTRA_CHARS = [":", ";", "(", ")", '"', "'", "“", "”", "‘", "’", "/"]
chars += [c for c in EXTRA_CHARS if c not in chars]

# Cell 28: "virama + consonant" is ONE class (appended after everything above, consonants in Cell 08 order).
# These tokens are two characters long; decoding simply emits both characters.
VIRAMA = "\u0CCD"
chars += [VIRAMA + chr(c) for c in _consonants if VIRAMA + chr(c) not in chars]

idx_to_char = {i + 1: c for i, c in enumerate(chars)}   # 0 = CTC blank
num_classes = len(chars) + 1

# ---------------- Cell 10: shared preprocessing ----------------
TARGET_H, TARGET_W = 64, 384


def trim_margins(img, pad=4, thresh=35):
    bg = int(np.median(img))
    ys, xs = np.where(np.abs(img.astype(np.int16) - bg) > thresh)
    if len(xs) == 0:
        return img
    y0, y1 = max(0, ys.min() - pad), min(img.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(img.shape[1], xs.max() + pad + 1)
    return img[y0:y1, x0:x1]

def needs_invert(img):
    """Text is the minority colour. If the minority (ink) is bright, invert."""
    blur = cv2.GaussianBlur(img, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return (th == 255).mean() < 0.5

def preprocess_gray(img, augment=False, invert=None):
    """img: uint8 grayscale -> uint8 (TARGET_H, TARGET_W) canvas.
    invert=None -> auto-detect; True/False -> force."""
    if invert is None:
        invert = needs_invert(img)
    if invert:
        img = 255 - img
    img = trim_margins(img)
    if augment:
        img = train_augment(image=img)["image"]
    h, w = img.shape
    scale = min(TARGET_W / w, TARGET_H / h)
    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    img = cv2.resize(img, (new_w, new_h), interpolation=interp)
    canvas = np.full((TARGET_H, TARGET_W), int(np.median(img)), dtype=np.uint8)
    y0 = (TARGET_H - new_h) // 2
    canvas[y0:y0 + new_h, 0:new_w] = img
    return canvas


# ---------------- Cell 18: model ----------------
class CRNN(nn.Module):
    def __init__(self, num_classes):
        super(CRNN, self).__init__()

        self.cnn = nn.Sequential(
            nn.Conv2d(1, 64, 3, 1, 1), nn.BatchNorm2d(64), nn.ReLU(),
            nn.MaxPool2d(2, 2),                       # (64,384) -> (32,192)

            nn.Conv2d(64, 128, 3, 1, 1), nn.BatchNorm2d(128), nn.ReLU(),
            nn.MaxPool2d(2, 2),                       # -> (16,96)

            nn.Conv2d(128, 256, 3, 1, 1), nn.BatchNorm2d(256), nn.ReLU(),
            nn.Conv2d(256, 256, 3, 1, 1), nn.BatchNorm2d(256), nn.ReLU(),
            nn.MaxPool2d((2, 1), (2, 1)),             # -> (8,96)

            nn.Conv2d(256, 512, 3, 1, 1), nn.BatchNorm2d(512), nn.ReLU(),
            nn.MaxPool2d((2, 1), (2, 1)),             # -> (4,96)

            nn.Conv2d(512, 512, 3, 1, 1), nn.BatchNorm2d(512), nn.ReLU(),
            nn.MaxPool2d((2, 1), (2, 1)),             # -> (2,96)

            nn.Conv2d(512, 512, (2, 1), 1, 0), nn.BatchNorm2d(512), nn.ReLU(),  # -> (1,96)
        )

        self.rnn = nn.LSTM(
            input_size=512,
            hidden_size=256,
            num_layers=2,
            bidirectional=True,
            batch_first=True,
            dropout=0.2
        )
        self.dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(256 * 2, num_classes)

    def forward(self, x):
        x = self.cnn(x)                 # (B, 512, 1, 96)
        x = x.squeeze(2)                # (B, 512, 96)
        x = x.permute(0, 2, 1)          # (B, 96, 512)
        x, _ = self.rnn(x)              # (B, 96, 512)
        x = self.dropout(x)
        return self.fc(x)               # (B, 96, num_classes)


# ---------------- Cell 24: page segmentation helpers + crop enhancement ----------------

def ink_mask(gray, f=0.5):
    b = cv2.GaussianBlur(gray, (3, 3), 0)
    _, th = cv2.threshold(b, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink_is_dark = (th == 255).mean() >= 0.5
    bg = float(np.median(b))
    if ink_is_dark:
        lo = float(np.percentile(b, 1))
        m = (b < lo + f * (bg - lo)).astype(np.uint8) * 255
    else:
        hi = float(np.percentile(b, 99))
        m = (b > hi - f * (hi - bg)).astype(np.uint8) * 255
    if (m > 0).sum() > 0.002 * m.size:
        return m
    return th if (th == 255).mean() < 0.5 else 255 - th


def runs_from_bool(v):
    spans, start = [], None
    for i, on in enumerate(v):
        if on and start is None: start = i
        if not on and start is not None: spans.append([start, i]); start = None
    if start is not None: spans.append([start, len(v)])
    return spans


def split_lines(mask, merge_ratio=0.12, min_h=6, rel=0.0):
    counts = (mask > 0).sum(axis=1)
    thr = max(1, 0.003 * mask.shape[1], 0.01 * counts.max())
    if rel > 0 and (counts > 0).any():              # tightly spaced lines: ascenders/descenders touch, so
        thr = max(thr, rel * np.percentile(counts[counts > 0], 75))   # require a real share of a typical row's ink
    rows = counts > thr
    runs = runs_from_bool(rows)
    if not runs:
        return []
    big = max(b - a for a, b in runs)
    merged = []
    for r in runs:
        if merged:
            gap = r[0] - merged[-1][1]
            prev_h = merged[-1][1] - merged[-1][0]
            small = (r[1] - r[0]) < 0.15 * big
            if gap < merge_ratio * max(r[1] - r[0], prev_h) or (small and gap < 0.2 * prev_h):
                merged[-1][1] = r[1]
                continue
        merged.append(r)
    return [(a, b) for a, b in merged if (b - a) >= min_h]


def expand_lines(mask, cores):
    """Grow each core line to include its ascenders/descenders: boundaries go to the thinnest row between neighbours."""
    counts = (mask > 0).sum(axis=1)
    H = len(counts)
    base = max(1, 0.003 * mask.shape[1])
    out = []
    for i, (a, b) in enumerate(cores):
        top_lim = cores[i - 1][1] if i > 0 else 0
        bot_lim = cores[i + 1][0] if i + 1 < len(cores) else H
        y0 = a
        while y0 > top_lim and counts[y0 - 1] > base: y0 -= 1
        if i > 0 and y0 == top_lim and top_lim < a:
            y0 = top_lim + int(np.argmin(counts[top_lim:a]))
        y1 = b
        while y1 < bot_lim and counts[min(y1, H - 1)] > base: y1 += 1
        if i + 1 < len(cores) and y1 == bot_lim and b < bot_lim:
            y1 = b + int(np.argmin(counts[b:bot_lim]))
        out.append((y0, y1))
    # short lines (e.g. a last half-line) fall below the relative threshold: pick up any leftover ink rows
    cover = np.zeros(H, bool)
    for a, b in out: cover[a:b] = True
    extra = [r for r in runs_from_bool((counts > base) & ~cover) if r[1] - r[0] >= max(8, 0.35 * float(np.median([b - a for a, b in out])))]
    return sorted(out + [tuple(r) for r in extra])


def lines_look_wrong(mask, lines):
    """A 'line' much taller than it is wide means several lines got glued together (mid-tone objects)."""
    for a, b in lines:
        cols = runs_from_bool((mask[a:b] > 0).any(axis=0))
        if cols and (b - a) > 0.6 * (cols[-1][1] - cols[0][0]):
            return True
    return False


def remove_underlines(mline):
    """Remove underlines / rules. Returns (cleaned mask, boolean mask of the removed pixels).
    Pass 1: rows that are ink almost all the way across the line.
    Pass 2: long thin horizontal runs (link underlines under only part of a line)."""
    m = mline.copy()
    removed = np.zeros(m.shape, bool)
    cols = np.where((m > 0).any(axis=0))[0]
    if len(cols) == 0:
        return m, removed
    span = m[:, cols.min():cols.max() + 1]
    rows = (span > 0).mean(axis=1) > 0.85
    removed[rows] = True
    m[rows] = 0
    rws = np.where((m > 0).any(axis=1))[0]
    if len(rws):
        h = rws.max() - rws.min() + 1
        for y in range(m.shape[0]):
            for a, b in runs_from_bool(m[y] > 0):
                if (b - a) > 1.2 * h:
                    removed[y, a:b] = True
                    m[y, a:b] = 0
    return m, removed


def words_in_line(mline, gap_ratio=0.25, adaptive=True):
    """Split a line into words. A gap wider than gap_ratio x text height is a space (small text).
    For larger text (height >= 30 px) with adaptive=True the space size is worked out per line from
    the gaps themselves: small gaps are inside a word, big gaps are spaces."""
    rows = np.where((mline > 0).any(axis=1))[0]
    if len(rows) == 0:
        return []
    h = rows.max() - rows.min() + 1
    spans = runs_from_bool((mline > 0).any(axis=0))
    if not spans:
        return []
    thr = gap_ratio * h
    if adaptive:
        gaps = sorted(g for g in (spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)) if g < 2 * h)
        if h >= 30:
            thr = max(0.16 * h, 5.5)
        if gaps and gaps[-1] <= 1.6 * float(np.median(gaps)):
            thr = 1e9                                # all gaps alike (letter-spaced or single word): no spaces
        if gaps:
            best_r, best_i = 1.0, -1
            for i in range(len(gaps) - 1):
                r = (gaps[i + 1] + 1.0) / (gaps[i] + 1.0)
                if r > best_r:
                    best_r, best_i = r, i
            if best_r >= 1.8 and best_i >= 0:
                cand = 0.5 * (gaps[best_i] + gaps[best_i + 1])
                if cand >= max(3.0, 0.15 * h):
                    thr = cand
    out = [spans[0][:]]
    for a, b in spans[1:]:
        if a - out[-1][1] < thr:
            out[-1][1] = b
        else:
            out.append([a, b])
    return [(a, b) for a, b in out if (b - a) >= 0.15 * h]


def remove_frame(mask):
    """Delete a page border / rounded frame: a big hollow outline that has the whole text inside it."""
    H, W = mask.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), connectivity=8)
    out = mask.copy()
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if w > 0.85 * W and h > 0.85 * H and area < 0.08 * w * h:      # hollow, spans the whole page
            inside = int((mask[y:y + h, x:x + w] > 0).sum()) - int(area)
            if inside > 0.5 * area:                                      # and real text sits inside it
                out[lab == i] = 0
    return out


def ink_mask_nf(gray, f=0.5):
    return remove_frame(ink_mask(gray, f))


def resplit_tall(mask, lns):
    """Tightly spaced lines can fuse into one tall 'line'. Estimate the line pitch from the page's row profile
    and cut any line that is clearly taller than one pitch at the thinnest row near each expected boundary."""
    if not lns:
        return lns
    counts = (mask > 0).sum(axis=1).astype(np.float32)
    sm = cv2.GaussianBlur(counts.reshape(-1, 1), (1, 0), 1.5).ravel()
    y0, y1 = lns[0][0], lns[-1][1]
    seg = sm[y0:y1] - sm[y0:y1].mean()
    if len(seg) < 40:
        return lns
    ac = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
    ac = ac / (ac[0] + 1e-9)
    lo, hi = 12, min(len(ac) - 1, 140)
    if hi <= lo + 2:
        return lns
    peaks = [i for i in range(lo + 1, hi) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0.25]
    if not peaks:
        return lns
    P = max(peaks[:1] + [i for i in peaks if ac[i] >= 0.9 * ac[peaks[0]]][:1])      # first strong peak = line pitch
    out = []
    for (a, b) in lns:
        if (b - a) <= 1.5 * P:
            out.append((a, b))
            continue
        typical = float(np.mean(sm[a:b]))
        cand = [i for i in range(a + 3, b - 3)
                if sm[i] <= sm[i - 1] and sm[i] <= sm[i + 1] and sm[i] < 0.5 * typical          # real valleys only:
                and sm[i] < 0.4 * min(sm[max(a, i - int(P)):i].max(), sm[i:min(b, i + int(P))].max())]  # dense text on BOTH sides
        cuts = []
        for i in sorted(cand, key=lambda i: sm[i]):                                      # deepest valleys first
            if all(abs(i - c) >= 0.6 * P for c in cuts):
                cuts.append(i)
        cuts = sorted(cuts)
        edges = [a] + cuts + [b]
        pieces = [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]
        out += [p for p in pieces if p[1] - p[0] >= 6] or [(a, b)]
    return out


def enhance(crop, up_h=128, sharpen=True):
    """Upscale a word crop (Lanczos) and sharpen it - small text reads better this way."""
    h, w = crop.shape
    s = max(1.0, up_h / float(h))
    img = cv2.resize(crop, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_LANCZOS4)
    if sharpen:
        blur = cv2.GaussianBlur(img, (0, 0), 1.2)
        img = cv2.addWeighted(img, 1.6, blur, -0.6, 0)
    return img


def pad_bg(img, p):
    return cv2.copyMakeBorder(img, p, p, p, p, cv2.BORDER_CONSTANT, value=int(np.median(img)))


# ---------------- Cell 24b: taller word crops (keep subscript consonants) ----------------

def extend_to_ink(mask, lns, max_frac=0.45):
    """Core line bands skip thin rows (subscript consonants like the ಥ in ಸ್ಥ, tails of ಲ್ಲ). Grow each band down/up
    over those thin ink rows, but never past the middle of the gap to the next line and never by more than max_frac of the band."""
    counts = (mask > 0).sum(axis=1)
    H = len(counts)
    base = max(1, 0.0012 * mask.shape[1])
    out = []
    for i, (a, b) in enumerate(lns):
        h = b - a
        top_lim = (lns[i - 1][1] + a) // 2 if i > 0 else 0
        bot_lim = (b + lns[i + 1][0]) // 2 if i + 1 < len(lns) else H
        y0, y1 = a, b
        lim0 = max(top_lim, a - int(max_frac * h)); lim1 = min(bot_lim, b + int(max_frac * h))
        while y0 > lim0 and counts[y0 - 1] > base: y0 -= 1
        while y1 < lim1 and counts[min(y1, H - 1)] > base: y1 += 1
        out.append((y0, y1))
    return out


def segment_page(gray, gap_ratio=0.25, adaptive=True):
    """Returns a list of lines; each line is (y0, y1, [(x0, x1, cleaned_crop), ...])."""
    H, W = gray.shape
    mask = ink_mask_nf(gray, f=0.5)
    lns = split_lines(mask)
    if lines_look_wrong(mask, lns):                 # stricter mask when lines got glued together
        mask = ink_mask_nf(gray, f=0.35)
        lns = split_lines(mask)
    if len(lns) <= 1 or lines_look_wrong(mask, lns):   # lines glued by touching ascenders/descenders
        for _rel in (0.15, 0.25, 0.35):
            _l = split_lines(ink_mask_nf(gray, f=0.5), rel=_rel)
            _l = expand_lines(ink_mask_nf(gray, f=0.5), _l) if len(_l) > 1 else _l
            if len(_l) > len(lns) and not lines_look_wrong(ink_mask_nf(gray, f=0.5), _l):
                mask, lns = ink_mask_nf(gray, f=0.5), _l
                break
    lns = resplit_tall(mask, lns)
    ext = extend_to_ink(mask, lns)                  # same lines, but taller: includes subscript consonants / long tails
    result = []
    for (y0, y1), (e0, e1) in zip(lns, ext):
        ya, yb = max(0, y0 - 4), min(H, y1 + 4)                 # word SPLITTING uses the same band as before ...
        mline, _ul = remove_underlines(mask[ya:yb])
        ya2, yb2 = max(0, e0 - 4), min(H, e1 + 4)               # ... the CROP uses the taller band
        mline2, ul = remove_underlines(mask[ya2:yb2])
        ul = cv2.dilate(ul.astype(np.uint8), np.ones((3, 1), np.uint8)).astype(bool)   # catch anti-aliased edges
        words = []
        for (a, b) in words_in_line(mline, gap_ratio, adaptive):
            xa, xb = max(0, a - 3), min(W, b + 3)
            crop = gray[ya2:yb2, xa:xb].copy()
            keep = cv2.dilate(mline2[:, xa:xb], np.ones((3, 3), np.uint8), iterations=2)
            bgv = int(np.median(crop))
            crop[keep == 0] = bgv                              # wipe watermark / noise
            crop[ul[:, xa:xb]] = bgv                           # wipe underline pixels
            words.append((a, b, crop))
        if words:
            result.append((ya2, yb2, words))
    return result
