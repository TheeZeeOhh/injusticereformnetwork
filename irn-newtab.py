#!/usr/bin/env python3
"""IRN command-center start page — generator.

The page itself is `newtab.html`, shipped under
`os/config/includes.chroot/usr/local/share/irn-browser/`. It is a complete,
working, fully offline page on its own — that is exactly what IRN OS installs,
because the image has no python3.

This script does NOT rebuild that page. It fills in the live panels the flat
file cannot know about, by replacing the content between the IRN:SLOT markers:

    DATE      today's date
    POSTURE   live rows from sable-posture.sh (falls back to the static claims)
    ZEE       whether Zee Zee is reachable and on which model
    PASSAGE   the day's Reading Room passage

Keeping one template instead of two hand-maintained copies is the point: the
earlier version duplicated the entire page, CSS and all, in a Python f-string,
and the two drifted immediately.

  irn-newtab.py           write ~/.local/share/irn-browser/newtab.html
  irn-newtab.py --emit    ...and print that path (used by the irn-browser wrapper)
  irn-newtab.py --stdout  print the page instead of writing it

Every panel is best-effort with a short timeout: if the library, the posture
script or Ollama is not reachable, that slot keeps its static default and the
page still opens instantly. A browser start page must never block on a subprocess.
"""
import os, sys, json, html, re, subprocess, datetime
from pathlib import Path

OUT = Path(os.environ.get(
    "IRN_NEWTAB", Path.home() / ".local/share/irn-browser/newtab.html"))

# Where the sibling scripts live. Baked by install-irn-browser.sh; falls back to
# this file's directory, then a couple of known spots.
REPO_BAKED = "__REPO__"

SHARE_CANDIDATES = [
    os.environ.get("IRN_NEWTAB_TEMPLATE", ""),
    "/usr/local/share/irn-browser/newtab.html",
    # What install-irn-browser.sh drops on a daily driver. Kept distinct from
    # OUT (newtab.html) so filling the template never overwrites the template.
    str(Path.home() / ".local/share/irn-browser/newtab.html.template"),
]

COLOR = {"ok": "#7ad38a", "warn": "#ffcc66", "alert": "#ff6b6b", "unknown": "#8a94a0"}
E = html.escape


def find_repo():
    here = Path(__file__).resolve().parent
    for c in (Path(REPO_BAKED), here, Path.home() / "injusticereformnetwork"):
        try:
            if (c / "reading-room-daily.py").is_file() or (c / "sable-posture.sh").is_file():
                return c
        except OSError:
            continue
    return here


REPO = find_repo()


def find_template():
    """The shipped page is the template. Prefer the installed system copy, then
    the one in this repo, then whatever sits next to this script."""
    cands = [Path(p) for p in SHARE_CANDIDATES if p]
    cands += [
        REPO / "os/config/includes.chroot/usr/local/share/irn-browser/newtab.html",
        Path(__file__).resolve().parent / "newtab.html",
        OUT,  # last resort: a previously generated page (markers survive, so
              # regenerating from our own output is idempotent)
    ]
    for c in cands:
        try:
            if c.is_file():
                return c
        except OSError:
            continue
    return None


def run(cmd, timeout=20):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.stdout.strip()
    except Exception:
        return ""


def fill(page, slot, content):
    """Replace what sits between <!--IRN:SLOT:X--> and <!--/IRN:SLOT:X-->,
    keeping the markers so the result can be regenerated in place."""
    pat = re.compile(
        r"(<!--IRN:SLOT:%s-->)(.*?)(<!--/IRN:SLOT:%s-->)" % (slot, slot), re.S)
    if not pat.search(page):
        return page
    return pat.sub(lambda m: m.group(1) + content + m.group(3), page, count=1)


# --- panels ------------------------------------------------------------------
def slot_date():
    now = datetime.datetime.now().strftime("%A, %d %B %Y")
    return (f"{E(now)} &middot; hardened Firefox &middot; telemetry off "
            f"&middot; HTTPS-only &middot; encrypted DNS")


def slot_posture():
    script = REPO / "sable-posture.sh"
    if not script.is_file():
        return None
    out = run(["bash", str(script), "--json"])
    if not out:
        return None
    try:
        items = json.loads(out.splitlines()[-1]).get("items", [])
    except Exception:
        return None
    if not items:
        return None
    rows = []
    for i in items:
        c = COLOR.get(i.get("state"), COLOR["unknown"])
        rows.append(
            f'<div class="prow"><span class="dot" style="color:{c}">&#9679;</span>'
            f'<span class="plabel">{E(str(i.get("label", "")))}</span>'
            f'<span class="pval" style="color:{c}">{E(str(i.get("value", "")))}</span></div>')
    return "\n      ".join(rows)


def slot_zee():
    """Status only — never an LLM call. Warming a model would add seconds to
    every browser launch, which is how a start page gets replaced with about:blank."""
    for cand in ("irn-zee",
                 str(Path(__file__).resolve().parent / "irn-zee"),
                 "/usr/local/bin/irn-zee",
                 str(Path.home() / ".local/bin/irn-zee"),
                 str(REPO / "os/config/includes.chroot/usr/local/bin/irn-zee")):
        exe = cand if os.path.sep in cand else None
        if exe and not os.access(exe, os.X_OK):
            continue
        out = run([cand, "brief", "--json"], timeout=6)
        if not out:
            continue
        try:
            b = json.loads(out)
        except Exception:
            continue
        if b.get("available"):
            model = E(str(b.get("model") or "unknown"))
            mem = b.get("memories", 0)
            return (
                f'<div class="prow"><span class="dot">&#9679;</span>'
                f'<span class="plabel">Local twin</span>'
                f'<span class="pval">ready &middot; {model}</span></div>\n      '
                f'<div class="prow"><span class="dot">&#9679;</span>'
                f'<span class="plabel">Memory</span>'
                f'<span class="pval">{int(mem)} items</span></div>\n      '
                f'<div class="prow" style="color:#6b7684;font-size:12px;display:block;'
                f'line-height:1.7;padding-top:6px">'
                f'<code>irn-browser --ask "&hellip;"</code><br>'
                f'<code>irn-browser --capture URL --zee</code><br>'
                f'On-device only. No PHI in prompts.</div>')
        return (
            f'<div class="prow"><span class="dot" style="color:#8a94a0">&#9679;</span>'
            f'<span class="plabel">Local twin</span>'
            f'<span class="pval" style="color:#8a94a0">offline &mdash; ollama serve</span></div>')
    return None


def slot_passage():
    script = REPO / "reading-room-daily.py"
    if not script.is_file():
        return None
    out = run([sys.executable, str(script), "--json"])
    if not out:
        return None
    try:
        d = json.loads(out.splitlines()[-1])
    except Exception:
        return None
    if not d.get("text"):
        return None
    cite = d.get("book", "")
    if d.get("author"):
        cite += f" — {d['author']}"
    return (f'\n  <section class="panel" style="width:min(880px,94vw);text-align:center;'
            f'border-top:1px solid #1f2a37;padding-top:24px">'
            f'<div class="q">&ldquo;{E(d["text"])}&rdquo;</div>'
            f'<div class="cite">{E(cite)}</div></section>\n  ')


def main():
    tpl = find_template()
    if tpl is None:
        sys.exit("irn-newtab: no newtab.html template found "
                 "(looked in /usr/local/share/irn-browser and this repo)")
    page = tpl.read_text(encoding="utf-8")

    for slot, value in (("DATE", slot_date()),
                        ("POSTURE", slot_posture()),
                        ("ZEE", slot_zee()),
                        ("PASSAGE", slot_passage())):
        if value:                       # None -> keep the static default
            page = fill(page, slot, "\n      " + value + "\n      ")

    if "--stdout" in sys.argv:
        sys.stdout.write(page)
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    if "--emit" in sys.argv:
        print(OUT)


if __name__ == "__main__":
    main()
