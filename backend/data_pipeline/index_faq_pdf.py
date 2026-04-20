"""
Extract FAQ content from a PDF and save to data/faq.json.

The script auto-detects three common PDF structures:
  1. Explicit markers  →  Q: … / A: …  (or Frage: / Antwort:)
  2. Question lines    →  lines ending with "?" followed by answer paragraph
  3. Fallback          →  every paragraph becomes a searchable chunk

Usage:
    python index_faq_pdf.py path/to/faq.pdf

Output:
    ../../data/faq.json   (loaded at runtime by lib/faq.ts)
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime, timezone

try:
    import pypdf
except ImportError:
    print("pypdf is not installed. Run:  pip install pypdf")
    sys.exit(1)


# ──────────────────────────────────────────────────────────────
# PDF text extraction
# ──────────────────────────────────────────────────────────────

def extract_text(pdf_path: str) -> str:
    reader = pypdf.PdfReader(pdf_path)
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text.strip())
    return "\n\n".join(pages)


# ──────────────────────────────────────────────────────────────
# Q&A parsing
# ──────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Remove excess whitespace from extracted PDF text."""
    return re.sub(r"[ \t]{2,}", " ", text).strip()


def parse_explicit_markers(text: str) -> list[dict]:
    """
    Detect blocks of the form:
        Q: <question text>
        A: <answer text>
    Also handles German Frage:/Antwort: and English Question:/Answer:.
    """
    pattern = re.compile(
        r"(?:Q:|Frage:|Question:)\s*(.+?)[\n\r]+"
        r"\s*(?:A:|Antwort:|Answer:)\s*(.+?)"
        r"(?=(?:Q:|Frage:|Question:)|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    matches = pattern.findall(text)
    return [
        {"id": i, "question": _clean(q), "answer": _clean(a)}
        for i, (q, a) in enumerate(matches, 1)
    ]


def parse_question_lines(text: str) -> list[dict]:
    """
    Detect lines that end with '?' as questions; the following non-empty
    lines (until the next question) form the answer.
    """
    entries: list[dict] = []
    lines = text.splitlines()
    entry_id = 1
    i = 0

    while i < len(lines):
        line = lines[i].strip()
        if line.endswith("?") and len(line) > 10:
            question = line
            answer_lines: list[str] = []
            i += 1
            while i < len(lines):
                next_line = lines[i].strip()
                # Stop when a new question starts
                if next_line.endswith("?") and len(next_line) > 10:
                    break
                if next_line:
                    answer_lines.append(next_line)
                i += 1
            if answer_lines:
                entries.append(
                    {
                        "id": entry_id,
                        "question": question,
                        "answer": _clean(" ".join(answer_lines)),
                    }
                )
                entry_id += 1
        else:
            i += 1

    return entries


def parse_paragraphs(text: str) -> list[dict]:
    """
    Fallback: every paragraph with > 30 characters becomes a searchable
    knowledge chunk. The first sentence is used as the display 'question'.
    """
    entries: list[dict] = []
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    for i, para in enumerate(paragraphs, 1):
        if len(para) < 30:
            continue
        # Use first sentence as the label / question
        first_sentence = re.split(r"(?<=[.!?])\s+", para)[0]
        entries.append(
            {
                "id": i,
                "question": first_sentence,
                "answer": _clean(para),
            }
        )

    return entries


def parse_qa_pairs(text: str) -> tuple[list[dict], str]:
    """Return (entries, strategy_used)."""
    result = parse_explicit_markers(text)
    if result:
        return result, "explicit markers (Q:/A:)"

    result = parse_question_lines(text)
    if result:
        return result, "question lines (ends with ?)"

    result = parse_paragraphs(text)
    return result, "paragraph chunks (fallback)"


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage:  python index_faq_pdf.py path/to/faq.pdf")
        sys.exit(1)

    pdf_path = Path(sys.argv[1]).resolve()
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    print(f"📄  Reading PDF: {pdf_path.name}")
    text = extract_text(str(pdf_path))
    print(f"✓   Extracted {len(text):,} characters from {pdf_path.name}")

    entries, strategy = parse_qa_pairs(text)
    print(f"✓   Parsed {len(entries)} entries  [{strategy}]")

    if not entries:
        print("⚠️  No entries found — is the PDF text-based (not a scanned image)?")
        sys.exit(1)

    output = {
        "entries": entries,
        "metadata": {
            "source": pdf_path.name,
            "total_entries": len(entries),
            "parse_strategy": strategy,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
        },
    }

    # Resolve output path relative to this script → ../../data/faq.json
    output_path = Path(__file__).parent.parent.parent / "data" / "faq.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✅  Saved → {output_path}")
    print()
    print("Preview (first entry):")
    e = entries[0]
    print(f"  Q: {e['question'][:100]}")
    print(f"  A: {e['answer'][:150]}")
    print()
    print("Next step: commit data/faq.json and redeploy to Vercel.")


if __name__ == "__main__":
    main()
