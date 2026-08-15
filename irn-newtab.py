#!/usr/bin/env python3
"""IRN command-center start page.

Builds a self-contained (offline, no external requests) HTML page with curated
IRN tool links, the day's Reading Room passage, and a security-posture glance.
The irn-browser wrapper runs this on launch and opens the result.

  irn-newtab.py           write the page to ~/.local/share/irn-browser/newtab.html
  irn-newtab.py --emit    ...and print that path (used by the wrapper)

Best-effort: if the library or posture script isn't reachable, those panels are
simply omitted — the links always render. Edit LINKS below to taste.
"""
import os, sys, json, html, subprocess, datetime
from pathlib import Path

# --- Curated tools. Edit freely. (label, url) -------------------------------
LINKS = [
    ("Notion back office", "https://www.notion.so"),
    ("Sanctuary (local)", "http://localhost:5173"),
    ("IRN site", "https://theezeeohh.github.io"),
    ("MuckRock — FOIA", "https://www.muckrock.com"),
    ("VA Courts", "https://www.vacourts.gov"),
    ("PACER — dockets", "https://pacer.uscourts.gov"),
    ("CourtListener", "https://www.courtlistener.com"),
    ("EquityGuard", "https://theezeeohh.github.io"),
]

OUT = Path(os.environ.get("IRN_NEWTAB", Path.home() / ".local/share/irn-browser/newtab.html"))
# Where the sibling scripts live. Baked by install-irn-browser.sh; falls back to
# this file's directory, then a couple of known spots.
REPO_BAKED = "__REPO__"

def find_repo():
    here = Path(__file__).resolve().parent
    cands = [Path(REPO_BAKED), here, Path.home() / "injusticereformnetwork"]
    for c in cands:
        if (c / "reading-room-daily.py").is_file() or (c / "sable-posture.sh").is_file():
            return c
    return here

REPO = find_repo()

def daily_passage():
    script = REPO / "reading-room-daily.py"
    if not script.is_file():
        return None
    try:
        out = subprocess.run([sys.executable, str(script), "--json"],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        d = json.loads(out.splitlines()[-1])
        if d.get("text"):
            return d
    except Exception:
        return None
    return None

def posture_rows():
    script = REPO / "sable-posture.sh"
    if not script.is_file():
        return []
    try:
        out = subprocess.run(["bash", str(script), "--json"],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        return json.loads(out.splitlines()[-1]).get("items", [])
    except Exception:
        return []

COLOR = {"ok": "#7ad38a", "warn": "#ffcc66", "alert": "#ff6b6b", "unknown": "#8a94a0"}

def render():
    passage = daily_passage()
    posture = posture_rows()
    e = html.escape

    links_html = "\n".join(
        f'<a class="tool" href="{e(u)}">{e(l)}</a>' for l, u in LINKS
    )

    passage_html = ""
    if passage:
        cite = passage.get("book", "")
        if passage.get("author"):
            cite += f" — {passage['author']}"
        passage_html = f'''
      <section class="passage">
        <div class="q">&ldquo;{e(passage["text"])}&rdquo;</div>
        <div class="cite">{e(cite)}</div>
      </section>'''

    posture_html = ""
    if posture:
        rows = "\n".join(
            f'<div class="prow"><span class="dot" style="color:{COLOR.get(i["state"],"#8a94a0")}">&#9679;</span>'
            f'<span class="plabel">{e(i["label"])}</span>'
            f'<span class="pval" style="color:{COLOR.get(i["state"],"#8a94a0")}">{e(str(i["value"]))}</span></div>'
            for i in posture
        )
        posture_html = f'<section class="posture"><h2>posture</h2>{rows}</section>'

    now = datetime.datetime.now().strftime("%A, %d %B %Y")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IRN Command Center</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; min-height: 100vh; background: #0c1016; color: #c9d1d9;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; align-items: center; padding: 8vh 24px; gap: 34px; }}
  header {{ text-align: center; }}
  h1 {{ font-size: 26px; margin: 0; letter-spacing: 3px; color: #7ab8ff; font-weight: 600; }}
  .date {{ color: #6b7684; font-size: 13px; margin-top: 6px; }}
  .tools {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; width: min(760px, 92vw); }}
  .tool {{ display: block; padding: 16px 18px; background: #131a24; border: 1px solid #1f2a37;
    border-radius: 12px; color: #d7dee6; text-decoration: none; font-size: 15px; transition: .12s; }}
  .tool:hover {{ border-color: #7ab8ff; color: #fff; background: #16202c; }}
  .passage {{ width: min(680px, 92vw); text-align: center; border-top: 1px solid #1f2a37; padding-top: 26px; }}
  .q {{ font-family: Georgia, serif; font-style: italic; font-size: 18px; line-height: 1.6; color: #e8e2d0; }}
  .cite {{ color: #b89b6e; margin-top: 12px; font-size: 13px; }}
  .posture {{ width: min(680px, 92vw); }}
  .posture h2 {{ font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #6b7684; margin: 0 0 10px; }}
  .prow {{ display: flex; align-items: center; gap: 10px; padding: 3px 0; font-size: 13px; }}
  .plabel {{ min-width: 120px; color: #9aa4b0; }}
  .dot {{ font-size: 10px; }}
</style></head>
<body>
  <header><h1>IRN COMMAND CENTER</h1><div class="date">{e(now)}</div></header>
  <nav class="tools">{links_html}</nav>{passage_html}
  {posture_html}
</body></html>'''

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(), encoding="utf-8")
    if "--emit" in sys.argv:
        print(OUT)

if __name__ == "__main__":
    main()
