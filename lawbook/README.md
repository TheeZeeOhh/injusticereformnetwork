# IRN Lawbook

A searchable database and website of Virginia, Maryland and federal laws on
discrimination, LGBTQ+ rights, policing, records, wrongful conviction,
sentencing, prison conditions, youth justice, voting, housing, employment,
disability, health privacy, immigration, public records, hate crimes and drug
policy.

Public law only. No client data goes in here.

## Files

| Path | What it is |
|------|------------|
| `data/laws.json` | The curated list: citation, plain-language name and summary, topics, and the `check` words the summary depends on. The only file you edit by hand. |
| `data/text/<id>.json` | Official text as fetched, with the date. |
| `data/verified.json` | Result for each entry: `ok`, `mismatch` or `unreachable`. |
| `lawbook.sqlite` | The database: `laws`, `topics`, `law_topics` and an FTS5 index `laws_fts` over the full official text. |
| `site/template.html` | Page source. `build.py` inlines the data into `site/index.html`. |
| `site/index.html` | The website: one self-contained file that works offline. |

## Build

```bash
python3 build.py            # fetch anything new, verify, rebuild db + site
python3 build.py --refresh  # re-fetch every section (after a legislative session)
python3 build.py --offline  # rebuild from the cache only
```

It exits non-zero while any entry is not `ok`, and prints what failed.
`src/utils/lawbook.test.js` re-checks the cache in the `npm test` gate.

## How a citation is verified

For every entry, the builder fetches the section from the official source:
- the Code of Virginia at law.lis.virginia.gov
- the Maryland Code at mgaleg.maryland.gov
- the U.S. Code through Cornell LII
- the Supreme Court docket at supremecourt.gov, for pending cases

It then confirms that every `check` phrase appears in the official text and that
the section is not repealed. Choose `check` phrases that would be false if the
summary were wrong: `"two ounces"`, not `"marijuana"`. The first draft said
Virginia allowed one ounce, and this check caught it.

Passing means the cited section exists and contains the key words. It does not
prove that the summary captures every exception. Summaries were read against the
official text when written on 2026-10-18, but they are legal information, not
legal advice.

## Adding a law

1. Find the section on the official site.
2. Add an entry to `data/laws.json`. The `id` is `va-<section>`, `md-<article>-<section>` or `us-<title>-<section>`. Use the code `va`, `va-const`, `md:<article code>` (e.g. `md:gcp`) or `usc:<title>`.
3. Run `python3 build.py`, read the fetched text in `data/text/<id>.json`, and fix the summary until it matches.
4. Run `npx vitest run src/utils/lawbook.test.js`.

## Querying the database

```bash
sqlite3 lawbook.sqlite "SELECT l.cite, l.name FROM laws_fts f JOIN laws l ON l.id = f.id
  WHERE laws_fts MATCH 'eviction' ORDER BY rank;"
sqlite3 lawbook.sqlite "SELECT cite, name FROM laws JOIN law_topics ON law_id = id
  WHERE topic_id = 'lgbtq' AND jurisdiction = 'MD';"
```

## Known limits

- This is a curated core of 144 sections, not every law that touches injustice. Each topic is a starting point for research.
- Laws that took effect on a contingent date are labeled. Virginia § 24.2-400.1 (voting rights on release) only takes effect if the November 3, 2026 constitutional amendment passes.
- Court rules, regulations, local ordinances and case law are not included. Federal case law that changes how a statute reads, such as Bostock for Title VII, is noted in the entry.
- The exception is pending Supreme Court litigation that decides whether protections stay in force while a case is fought, such as *Trump v. Kingdom* (No. 26A416). These use the code `scotus` with the docket number as `sec`, are checked against the Court's own docket page at supremecourt.gov, and are labeled "Pending litigation" on the site. Re-run `python3 build.py --refresh` when the docket moves; facts that come from elsewhere (like a lower court's class-size estimate) are attributed in the summary and are not covered by the check.
