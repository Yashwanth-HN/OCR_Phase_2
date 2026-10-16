"""Kannada -> English translation for the UI's Translate button.

Provider "google" calls Google Translate's public JSON endpoint (translate.googleapis.com,
client=gtx). No API key, but it is unofficial and may be rate-limited; the text is sent to Google.
Set TRANSLATOR=none to disable (the endpoint then returns 501).
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

TRANSLATOR = os.getenv("TRANSLATOR", "google").lower()
TIMEOUT_S = float(os.getenv("TRANSLATE_TIMEOUT", "20"))
_CHUNK = 4000  # characters per request
_GTX = "https://translate.googleapis.com/translate_a/single"


class TranslationUnavailable(RuntimeError):
    """No translator configured (-> 501)."""


class TranslationFailed(RuntimeError):
    """The provider could not be reached or refused (-> 502/503)."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


_SENTENCE_END = re.compile(r"[.?!।:][\"”’)]?$")
_MAX_JOINED = 160  # characters


def paragraphs(text: str) -> list[str]:
    """OCR text has a newline after every printed line, which cuts sentences in half, so a line is
    joined to the previous one while that sentence is unfinished. The join is capped at
    _MAX_JOINED characters because the OCR often drops full stops: an uncapped paragraph becomes
    one huge "sentence", and Google then silently truncates its translation (seen in testing).
    Blank lines stay paragraph breaks."""
    out = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n")):
        segments: list[str] = []
        for line in (ln.strip() for ln in block.split("\n")):
            if not line:
                continue
            if segments and not _SENTENCE_END.search(segments[-1]) and len(segments[-1]) + len(line) < _MAX_JOINED:
                segments[-1] += " " + line
            else:
                segments.append(line)
        if segments:
            out.append("\n".join(segments))
    return out


def _chunks(paras: list[str]) -> list[str]:
    chunks, current = [], ""
    for p in paras:
        while len(p) > _CHUNK:  # very long paragraph: split at a space
            cut = p.rfind(" ", 0, _CHUNK)
            cut = cut if cut > 0 else _CHUNK
            if current:
                chunks.append(current)
                current = ""
            chunks.append(p[:cut])
            p = p[cut:].strip()
        candidate = f"{current}\n\n{p}" if current else p
        if len(candidate) > _CHUNK:
            chunks.append(current)
            current = p
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _google(text: str, source: str, target: str) -> str:
    # Google sometimes answers one client id with a 429 "Sorry..." page (seen from Python while curl still
    # worked); the same endpoint with the Chrome-extension client id kept working, so fall back to it.
    for client in _CLIENTS:
        try:
            return _google_once(text, source, target, client)
        except TranslationFailed as exc:
            if exc.status != 503 or client == _CLIENTS[-1]:
                raise
    raise AssertionError("unreachable")


_CLIENTS = ("gtx", "dict-chrome-ex")


def _google_once(text: str, source: str, target: str, client: str) -> str:
    url = _GTX + "?" + urllib.parse.urlencode({"client": client, "sl": source, "tl": target, "dt": "t"})
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode({"q": text}).encode(),  # POST: no URL-length limit
        headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise TranslationFailed("Translation service is rate-limiting requests; try again shortly", 503) from exc
        raise TranslationFailed(f"Translation service returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise TranslationFailed("Could not reach the translation service (internet connection?)") from exc
    except ValueError as exc:
        raise TranslationFailed("Unexpected response from the translation service") from exc
    try:
        return "".join(seg[0] for seg in body[0] if seg and seg[0])
    except (TypeError, IndexError) as exc:
        raise TranslationFailed("Unexpected response from the translation service") from exc


def translate(text: str, source: str = "kn", target: str = "en") -> str:
    if TRANSLATOR in ("none", "off", "false", ""):
        raise TranslationUnavailable("Translation is disabled on this server (TRANSLATOR=none)")
    if TRANSLATOR != "google":
        raise TranslationUnavailable(f"Unknown TRANSLATOR '{TRANSLATOR}'")
    return "\n\n".join(_google(chunk, source, target) for chunk in _chunks(paragraphs(text)))
