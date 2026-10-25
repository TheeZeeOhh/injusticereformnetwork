#!/usr/bin/env python3
"""IRN Lawbook builder.

data/laws.json is the curated list: which sections matter and why, in plain
words. Nothing in it is trusted on its own. For every entry this script
fetches the section from the official code (Virginia LIS, the Maryland General
Assembly, Cornell LII for federal law), checks that the official text actually
contains the words the entry's summary depends on, and records what it found.

  python3 build.py            fetch anything not cached, verify, build
  python3 build.py --refresh  re-fetch every section (use when laws change)
  python3 build.py --offline  build from the cache only

Outputs:
  data/text/<id>.json  official text as fetched (public law, no client data)
  data/verified.json   per-entry result: ok / mismatch / unreachable
  lawbook.sqlite       laws + topics + an FTS5 index over the full text
  site/index.html      the website, one self-contained file

An entry that fails verification is still shown, with a visible warning, so
a bad citation is caught by a reader instead of silently dropped. The test
suite fails while any entry is not "ok".
"""
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
TEXT = os.path.join(DATA, "text")
UA = "IRN-Lawbook/1.0 (citation checker)"

MD_ARTICLES = {
    "gcs": "Corr. Servs.", "gcj": "Cts. & Jud. Proc.", "gcr": "Crim. Law",
    "gcp": "Crim. Proc.", "ged": "Educ.", "gel": "Elec. Law", "gfl": "Fam. Law",
    "ggp": "Gen. Provis.", "ghg": "Health-Gen.", "gho": "Health Occ.",
    "ghs": "Hous. & Cmty. Dev.", "gin": "Ins.", "gle": "Lab. & Empl.",
    "gps": "Pub. Safety", "grp": "Real Prop.", "gsf": "State Fin. & Proc.",
    "gsg": "State Gov't", "gsp": "State Pers. & Pens.", "gtr": "Transp.",
    "gab": "Alc. Bev. & Cann.",
}


def url_for(law):
    code, sec = law["code"], law["sec"]
    if code == "va":
        return f"https://law.lis.virginia.gov/vacode/{sec}/"
    if code == "va-const":
        art, s = sec.split("-")
        return f"https://law.lis.virginia.gov/constitution/article{art}/section{s}/"
    if code.startswith("md:"):
        return ("https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText"
                f"?article={code[3:]}&section={sec}&enactments=false")
    if code.startswith("usc:"):
        return f"https://www.law.cornell.edu/uscode/text/{code[4:]}/{sec}"
    if code.startswith("cfr:"):
        return f"https://www.law.cornell.edu/cfr/text/{code[4:]}/{sec}"
    raise ValueError(f"{law['id']}: unknown code {code}")


def cite_for(law):
    code, sec = law["code"], law["sec"]
    if code == "va":
        return f"Va. Code § {sec}"
    if code == "va-const":
        art, s = sec.split("-")
        return f"Va. Const. art. {art}, § {s}"
    if code.startswith("md:"):
        return f"Md. Code, {MD_ARTICLES[code[3:]]} § {sec}"
    if code.startswith("usc:"):
        return f"{code[4:]} U.S.C. § {sec}"
    if code.startswith("cfr:"):
        return f"{code[4:]} C.F.R. § {sec}"
    return sec


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:  # network trouble is reported, not fatal
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(str(last))


def flatten(fragment):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fragment, flags=re.S)
    s = re.sub(r"</p>|<br\s*/?>|</h\d>|</li>|</div>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\xa0]+", " ", s)
    return "\n".join(line.strip() for line in s.split("\n") if line.strip())


def extract(law, page):
    """Return (heading, body) from an official page."""
    code = law["code"]
    if code.startswith("va"):
        i = page.find("id='va_code'" if code == "va" else "id='va_constitution'")
        j = page.find("googleoff", i) if i >= 0 else -1
        frag = page[i:j] if 0 <= i < j else ""
        heads = list(re.finditer(r"<h2>(.*?)</h2>", frag, re.S))
        heading = " ".join(flatten(m.group(1)) for m in heads)
        body = flatten(frag[heads[-1].end():] if heads else frag)
        return heading, body
    if code.startswith("md:"):
        flat = flatten(page).replace("\n", " ")
        i = flat.find("Previous Next")
        j = flat.find("Previous Next", i + 5)
        body = flat[i + 13:j].strip() if 0 <= i < j else ""
        # Restore paragraph breaks at subsection markers like "(a)" for reading.
        body = re.sub(r"\s{2,}(?=\((?:[a-z]{1,4}|\d{1,2})\)\s)", "\n", body)
        return "", body
    # Cornell LII
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    heading = flatten(m.group(1)) if m else ""
    i = page.find('id="tab_default_1"')
    i = page.find(">", i) + 1 if i >= 0 else -1
    j = page.find('id="tab_default_2"', i) if i >= 0 else -1
    j = page.rfind("<", 0, j) if j >= 0 else -1
    body = flatten(page[i:j] if 0 <= i < j else page)
    return heading, body


def norm(s):
    s = s.lower()
    for a in "‐‑‒–—":
        s = s.replace(a, "-")
    s = s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s)


def main(argv):
    refresh, offline = "--refresh" in argv, "--offline" in argv
    db = json.load(open(os.path.join(DATA, "laws.json"), encoding="utf-8"))
    os.makedirs(TEXT, exist_ok=True)
    vpath = os.path.join(DATA, "verified.json")
    prev = json.load(open(vpath)) if os.path.exists(vpath) else {}
    topics = {t["id"] for t in db["topics"]}
    seen, verified = set(), {}

    for law in db["laws"]:
        lid = law["id"]
        assert lid not in seen, f"duplicate id {lid}"
        seen.add(lid)
        bad = [t for t in law["topics"] if t not in topics]
        assert not bad, f"{lid}: unknown topic {bad}"
        assert law["j"] in ("VA", "MD", "US"), f"{lid}: jurisdiction {law['j']}"
        law["url"], law["cite"] = url_for(law), cite_for(law)

        tpath = os.path.join(TEXT, f"{lid}.json")
        cached = json.load(open(tpath)) if os.path.exists(tpath) else None
        if cached and cached.get("url") != law["url"]:
            cached = None  # the citation changed; the old text is for another section
        if (refresh or not cached) and not offline:
            try:
                heading, body = extract(law, fetch(law["url"]))
                cached = {"url": law["url"], "heading": heading, "body": body,
                          "fetched": date.today().isoformat()}
                with open(tpath, "w", encoding="utf-8") as f:
                    json.dump(cached, f, ensure_ascii=False, indent=1)
                time.sleep(0.3)
            except Exception as e:
                print(f"  unreachable {lid}: {e}", file=sys.stderr)

        if not cached or len(cached["body"]) < 40:
            verified[lid] = {"status": "unreachable", "missing": [],
                             "checked": prev.get(lid, {}).get("checked")}
            continue
        hay = norm(cached["heading"] + "\n" + cached["body"])
        missing = [w for w in law["check"] if norm(w) not in hay]
        head = norm(cached["heading"])
        repealed = bool(re.match(r"^\W*(repealed|reserved|expired)\b", norm(cached["body"][:60]))) \
            or head.rstrip(". ").endswith("repealed")
        verified[lid] = {
            "status": "ok" if not missing and not repealed else "mismatch",
            "missing": missing, "repealed": repealed, "heading": cached["heading"],
            "checked": cached["fetched"],
            "sha256": hashlib.sha256(cached["body"].encode()).hexdigest(),
        }

    with open(vpath, "w", encoding="utf-8") as f:
        json.dump(verified, f, indent=1, ensure_ascii=False)
    build_sqlite(db, verified)
    build_site(db, verified)

    counts = {}
    for v in verified.values():
        counts[v["status"]] = counts.get(v["status"], 0) + 1
    print(f"{len(db['laws'])} laws: " + ", ".join(f"{n} {k}" for k, n in sorted(counts.items())))
    for lid, v in verified.items():
        if v["status"] != "ok":
            print(f"  {v['status']:11} {lid}  missing={v.get('missing')} "
                  f"repealed={v.get('repealed')} heading={v.get('heading', '')[:80]!r}")
    return 0 if counts.get("ok") == len(db["laws"]) else 1


def body_of(lid):
    p = os.path.join(TEXT, f"{lid}.json")
    return json.load(open(p, encoding="utf-8"))["body"] if os.path.exists(p) else ""


def build_sqlite(db, verified):
    path = os.path.join(HERE, "lawbook.sqlite")
    tmp = path + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.executescript("""
      CREATE TABLE topics (id TEXT PRIMARY KEY, label TEXT, blurb TEXT);
      CREATE TABLE laws (
        id TEXT PRIMARY KEY, jurisdiction TEXT, cite TEXT, name TEXT, summary TEXT,
        enacted TEXT, url TEXT, official_heading TEXT, official_text TEXT,
        status TEXT, checked TEXT, sha256 TEXT);
      CREATE TABLE law_topics (law_id TEXT REFERENCES laws(id), topic_id TEXT REFERENCES topics(id));
      CREATE VIRTUAL TABLE laws_fts USING fts5(id UNINDEXED, cite, name, summary, official_text);
    """)
    con.executemany("INSERT INTO topics VALUES (?,?,?)",
                    [(t["id"], t["label"], t["blurb"]) for t in db["topics"]])
    for law in db["laws"]:
        v, body = verified[law["id"]], body_of(law["id"])
        con.execute("INSERT INTO laws VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            law["id"], law["j"], law["cite"], law["name"], law["summary"], law.get("enacted", ""),
            law["url"], v.get("heading", ""), body, v["status"], v.get("checked"), v.get("sha256")))
        con.executemany("INSERT INTO law_topics VALUES (?,?)", [(law["id"], t) for t in law["topics"]])
        con.execute("INSERT INTO laws_fts VALUES (?,?,?,?,?)",
                    (law["id"], law["cite"], law["name"], law["summary"], body))
    con.commit()
    con.close()
    os.replace(tmp, path)


TEXT_CAP = 9000  # characters of official text embedded per law; the link has the rest


def build_site(db, verified):
    rows = []
    for law in db["laws"]:
        v, body = verified[law["id"]], body_of(law["id"])
        rows.append({
            "id": law["id"], "j": law["j"], "cite": law["cite"], "name": law["name"],
            "summary": law["summary"], "enacted": law.get("enacted", ""), "topics": law["topics"],
            "url": law["url"], "heading": v.get("heading", ""), "status": v["status"],
            "checked": v.get("checked"), "text": body[:TEXT_CAP], "cut": len(body) > TEXT_CAP,
        })
    payload = {"meta": db["meta"], "topics": db["topics"], "laws": rows,
               "built": date.today().isoformat()}
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    blob = blob.replace("</", "<\\/")  # statute text must never close the script tag
    tpl = open(os.path.join(HERE, "site", "template.html"), encoding="utf-8").read()
    out = tpl.replace("/*LAWBOOK_DATA*/null", blob, 1)
    assert out != tpl, "template is missing the /*LAWBOOK_DATA*/null marker"
    with open(os.path.join(HERE, "site", "index.html"), "w", encoding="utf-8") as f:
        f.write(out)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
