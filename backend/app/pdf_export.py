"""Text -> PDF with Noto Sans Kannada. HarfBuzz shaping (uharfbuzz) is required for correct conjuncts."""
from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"


def build_pdf(title: str, text: str) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_font("NotoKannada", fname=str(FONT_DIR / "NotoSansKannada-Regular.ttf"))
    pdf.add_font("NotoSans", fname=str(FONT_DIR / "NotoSans-Regular.ttf"))  # Latin, digits, quotes
    pdf.set_fallback_fonts(["NotoSans"])
    pdf.set_text_shaping(True)
    pdf.set_title(title or "Kannada OCR")
    pdf.add_page()
    if title:
        pdf.set_font("NotoKannada", size=16)
        pdf.multi_cell(0, 9, title)
        pdf.ln(3)
    pdf.set_font("NotoKannada", size=12)
    pdf.multi_cell(0, 7.5, text or " ")
    return bytes(pdf.output())
