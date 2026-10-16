"""Dictionary correction of recognised words, checked against the model's own output.

A word is only changed when ALL of these hold:
  1. the model's reading is not a known Kannada word (lexicon/kn_words.tsv, from Kannada Wikipedia);
  2. a known word is within 1 (short words) or 2 (longer words) model tokens of it;
  3. that known word explains the image almost as well as the model's own reading: its CTC probability under the
     same softmax output is at most LOSS_PER_EDIT nats lower per edited token, and probability + LAMBDA * log(word frequency) is higher.
So a correct-but-rare word (a name, an uncommon inflection) keeps its much better image score and is not touched.

Distances are counted in model tokens (a conjunct like '್ರ' is one token), which is how the model makes mistakes:
ಶತುಗಳು -> ಶತ್ರುಗಳು is one missing token. The lexicon also restores ZWNJ, which the model cannot output:
ಬ್ಯಾಂಕ್ನಲ್ಲಿ -> ಬ್ಯಾಂಕ್‌ನಲ್ಲಿ.
"""
from __future__ import annotations

import math
import os
import re
from pathlib import Path

import numpy as np
from rapidfuzz import process
from rapidfuzz.distance import Levenshtein

LEXICON_PATH = Path(os.getenv("LEXICON_PATH", str(Path(__file__).resolve().parent.parent / "lexicon" / "kn_words.tsv")))
LEXICON_ENABLED = os.getenv("LEXICON_ENABLED", "true").lower() not in ("0", "false", "no")
LAMBDA = float(os.getenv("LEXICON_LAMBDA", "1.0"))           # weight of log word frequency
LOSS_PER_EDIT = float(os.getenv("LEXICON_LOSS_PER_EDIT", "6.0"))  # max CTC log-prob drop (nats) per edited token
TRUST_COUNT = int(os.getenv("LEXICON_TRUST_COUNT", "50"))    # words this frequent are never changed
OOV_COUNT = 0.5                                              # pseudo-frequency of a word not in the lexicon

_JOINERS = "‌‍"
_KANNADA = re.compile(r"^[ಀ-೿]+$")
_EDGE_PUNCT = re.compile(r"^([^ಀ-೿]*)(.*?)([^ಀ-೿]*)$", re.S)


def _log_sum(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    m = np.maximum(a, b)
    m_safe = np.where(np.isfinite(m), m, 0.0)
    with np.errstate(divide="ignore"):  # log(0) for impossible paths is -inf, which is what we want
        return np.where(np.isfinite(m), m_safe + np.log(np.exp(a - m_safe) + np.exp(b - m_safe)), -np.inf)


def ctc_log_prob(log_probs: np.ndarray, labels: list[int]) -> float:
    """log P(labels | frames) under CTC (blank = 0); log_probs is (T, C)."""
    if not labels:
        return float(log_probs[:, 0].sum())
    ext = [0]
    for lab in labels:
        ext += [lab, 0]
    ext_arr = np.array(ext)
    S = len(ext)
    # transitions from s-2 are allowed when ext[s] is a label different from ext[s-2]
    skip = np.zeros(S, bool)
    skip[2:] = (ext_arr[2:] != 0) & (ext_arr[2:] != ext_arr[:-2])
    alpha = np.full(S, -np.inf)
    alpha[0] = log_probs[0, 0]
    alpha[1] = log_probs[0, ext[1]]
    for t in range(1, log_probs.shape[0]):
        prev = alpha
        a = prev.copy()
        a[1:] = _log_sum(a[1:], prev[:-1])
        a[2:] = np.where(skip[2:], _log_sum(a[2:], prev[:-2]), a[2:])
        alpha = a + log_probs[t, ext_arr]
    return float(_log_sum(np.array([alpha[-1]]), np.array([alpha[-2]]))[0]) if S > 1 else float(alpha[-1])


class Lexicon:
    def __init__(self, idx_to_char: dict[int, str], path: Path = LEXICON_PATH) -> None:
        self.char_to_idx = {c: i for i, c in idx_to_char.items()}
        self.virama = "್"
        self.counts: dict[str, int] = {}      # key (joiners removed) -> count
        self.surface: dict[str, str] = {}     # key -> most frequent written form (may contain ZWNJ)
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            word, count = line.split("\t")
            key = word.translate({ord(c): None for c in _JOINERS})
            if self.tokens(key) is None:
                continue
            if int(count) > self.counts.get(key, 0):
                self.surface[key] = word
            self.counts[key] = self.counts.get(key, 0) + int(count)
        # Token strings (one private-use character per model token) for fast edit distance, by token length.
        self._by_len: dict[int, tuple[list[str], list[str]]] = {}
        for key in self.counts:
            enc = self._encode(key)
            keys, encs = self._by_len.setdefault(len(enc), ([], []))
            keys.append(key)
            encs.append(enc)

    def tokens(self, text: str) -> list[int] | None:
        """Text -> model token ids, with virama+consonant as one token (notebook Cell 28). None if unencodable."""
        out, i = [], 0
        while i < len(text):
            pair = text[i:i + 2]
            if text[i] == self.virama and pair in self.char_to_idx:
                out.append(self.char_to_idx[pair])
                i += 2
                continue
            idx = self.char_to_idx.get(text[i])
            if idx is None:
                return None
            out.append(idx)
            i += 1
        return out

    def _encode(self, text: str) -> str:
        return "".join(chr(0xE000 + t) for t in (self.tokens(text) or []))

    def known(self, word: str) -> bool:
        return word in self.counts

    def neighbours(self, word: str) -> list[str]:
        enc = self._encode(word)
        n = len(enc)
        max_d = 1 if n <= 3 else 2
        found: list[str] = []
        for length in range(n - max_d, n + max_d + 1):
            bucket = self._by_len.get(length)
            if not bucket:
                continue
            keys, encs = bucket
            for _, _, j in process.extract(enc, encs, scorer=Levenshtein.distance, score_cutoff=max_d, limit=25):
                found.append(keys[j])
        return found

    def correct(self, text: str, log_probs: np.ndarray, extra: list[str]) -> str:
        """Return the corrected word (or `text` unchanged). `extra` = model beam alternatives."""
        m = _EDGE_PUNCT.match(text)
        if not m:
            return text
        pre, core, post = m.groups()
        if len(core) < 2 or not _KANNADA.match(core):
            return text
        own_count = self.counts.get(core, 0)
        if own_count >= TRUST_COUNT:  # well-attested word: only restore its written form (e.g. ZWNJ)
            return pre + self.surface.get(core, core) + post
        # Rare "words" are often typos in the source text itself (ಕಡಿಮ next to ಕಡಿಮೆ), so they can still be corrected.
        own = self.tokens(text)
        if own is None:
            return text
        base_lp = ctc_log_prob(log_probs, own)
        best, best_score = None, base_lp + LAMBDA * math.log(max(own_count, OOV_COUNT))
        own_enc = self._encode(core)
        candidates = set(self.neighbours(core))
        for alt in extra:
            am = _EDGE_PUNCT.match(alt)
            if am and am.group(2) in self.counts:
                candidates.add(am.group(2))
        for cand in candidates:
            labels = self.tokens(pre + cand + post)
            if labels is None:
                continue
            lp = ctc_log_prob(log_probs, labels)
            edits = max(1, Levenshtein.distance(own_enc, self._encode(cand)))
            if lp < base_lp - LOSS_PER_EDIT * edits:  # the image must still support the candidate
                continue
            s = lp + LAMBDA * math.log(self.counts[cand])
            if s > best_score:
                best, best_score = cand, s
        if best is None:
            return pre + self.surface.get(core, core) + post if core in self.surface else text
        return pre + self.surface.get(best, best) + post


def load_lexicon(idx_to_char: dict[int, str]) -> Lexicon | None:
    if not LEXICON_ENABLED or not LEXICON_PATH.exists():
        return None
    return Lexicon(idx_to_char)
