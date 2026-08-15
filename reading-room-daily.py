#!/usr/bin/env python3
"""Reading Room — text of the day.

Pulls one substantive passage from the local 514-book Sanctuary library and
prints it with a citation. The pick is seeded by the date, so it's STABLE for
the whole day (a desktop widget can poll this every few seconds without the
text flickering) and rotates at midnight.

Purely local: reads the FTS index (index.db) directly. No Ollama, no network.

  reading-room-daily.py            pretty text (for the terminal)
  reading-room-daily.py --json     {"text","book","author"} for a widget
  reading-room-daily.py --date YYYY-MM-DD   pick as if it were that day

Override the library location with SABLE_LIBRARY=/path/to/library (the dir that
holds index.db). We auto-detect it otherwise — it has moved before.
"""
import sqlite3, sys, json, os, re, hashlib, argparse, datetime
from pathlib import Path

def find_db():
    env = os.environ.get("SABLE_LIBRARY")
    cands = []
    if env:
        cands.append(Path(env) / "index.db")
    home = Path.home()
    cands += [
        home / "Desktop/Folders/Sanctuary/library/index.db",
        home / "Desktop/Sanctuary/library/index.db",
    ]
    for c in cands:
        if c.is_file():
            return c
    hits = list(home.glob("Desktop/**/library/index.db"))
    return hits[0] if hits else None

# A passage worth showing: long enough to stand alone, mostly prose (not an
# index/TOC/table of frames), and not dominated by digits or citation cruft.
def is_prose(body):
    if not body or len(body) < 260:
        return False
    letters = sum(c.isalpha() for c in body)
    digits = sum(c.isdigit() for c in body)
    if letters < 180 or digits > letters * 0.18:
        return False
    if body.count(".") < 2:            # needs at least a couple of sentences
        return False
    # Reject OCR-spaced garbage ("N e w s papers", "k n o w n"): clean prose has
    # very few one-letter words beyond a / I. A high ratio means split letters.
    toks = body.split()
    if len(toks) < 40:
        return False
    stray = sum(1 for t in toks if len(t) == 1 and t.isalpha() and t not in ("a", "A", "I"))
    if stray > len(toks) * 0.08:
        return False
    return True

def clean(body):
    body = re.sub(r"\s+", " ", body).strip()
    # Trim to a sentence-ish boundary under ~360 chars.
    if len(body) > 360:
        cut = body[:360]
        m = re.search(r"[.!?]\s+[^.!?]*$", cut)
        body = (cut[:m.start() + 1] if m else cut.rsplit(" ", 1)[0] + "…")
    return body

def pick(db, day):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        maxid = con.execute("SELECT max(id) FROM chunks_content").fetchone()[0] or 1
        seed = int(hashlib.sha256(day.encode()).hexdigest(), 16)
        # Walk a deterministic sequence of candidate rows until one is good.
        for i in range(400):
            rid = (seed + i * 2654435761) % maxid + 1     # Knuth multiplicative step
            row = con.execute(
                "SELECT c0, c1, c2 FROM chunks_content WHERE id = ?", (rid,)
            ).fetchone()
            if row and is_prose(row[0]):
                return {"text": clean(row[0]), "book": row[1] or "", "author": row[2] or ""}
        return None
    finally:
        con.close()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    a = ap.parse_args()

    db = find_db()
    if not db:
        msg = "Reading Room: can't find index.db (set SABLE_LIBRARY=/path/to/library)"
        print(json.dumps({"text": msg, "book": "", "author": ""}) if a.json else msg)
        sys.exit(0 if a.json else 1)

    p = pick(db, a.date) or {"text": "the library is quiet today.", "book": "", "author": ""}
    if a.json:
        print(json.dumps(p))
    else:
        cite = p["book"] + (f" — {p['author']}" if p["author"] else "")
        print(f"\n  “{p['text']}”\n")
        if cite:
            print(f"      — {cite}\n")

if __name__ == "__main__":
    main()
