"""Build the Kannada word list used for word correction (app/lexicon.py).

Source: Kannada Wikipedia (wikimedia/wikipedia, 20231101.kn on Hugging Face), licence CC BY-SA 4.0.
Output: lexicon/kn_words.tsv  ->  word<TAB>count, most frequent first.

    python scripts/build_lexicon.py                # writes lexicon/kn_words.tsv
    python scripts/build_lexicon.py --keep-download

The ~150 MB parquet download is deleted afterwards unless --keep-download is given.
"""
from __future__ import annotations

import argparse
import re
import shutil
import tempfile
from collections import Counter
from pathlib import Path

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download

BACKEND = Path(__file__).resolve().parent.parent
# Kannada letters/signs/digits plus ZWNJ/ZWJ (U+200C/D, used in forms like ಬ್ಯಾಂಕ್‌ನಲ್ಲಿ).
WORD = re.compile(r"[ಀ-೿‌‍]+")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(BACKEND / "lexicon" / "kn_words.tsv"))
    ap.add_argument("--min-count", type=int, default=3)
    ap.add_argument("--max-words", type=int, default=200_000)
    ap.add_argument("--keep-download", action="store_true")
    args = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="kn_wiki_"))
    try:
        path = hf_hub_download("wikimedia/wikipedia", "20231101.kn/train-00000-of-00001.parquet",
                               repo_type="dataset", cache_dir=str(tmp))
        counts: Counter[str] = Counter()
        pf = pq.ParquetFile(path)
        for batch in pf.iter_batches(columns=["text"], batch_size=2000):
            for text in batch.column(0).to_pylist():
                for w in WORD.findall(text or ""):
                    w = w.strip("‌‍")
                    if len(w) >= 2:
                        counts[w] += 1
        words = [(w, c) for w, c in counts.most_common(args.max_words) if c >= args.min_count]
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8", newline="\n") as f:
            f.write("# Kannada word frequencies from Kannada Wikipedia (20231101.kn), CC BY-SA 4.0.\n")
            for w, c in words:
                f.write(f"{w}\t{c}\n")
        print(f"{len(counts):,} distinct words; wrote {len(words):,} (count >= {args.min_count}) to {out}")
    finally:
        if not args.keep_download:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
