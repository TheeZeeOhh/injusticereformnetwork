---
name: privacy-agg
description: Apply IRN's privacy-aggregation rules before emitting ANY aggregate, rollup, dashboard number, count, chart, or grant-report statistic derived from client/casework data. Enforces min cell size (n≥5), quasi-identifiers counting toward the threshold, and uncertainty→silence. Use whenever building or reviewing anything that summarizes people.
---

# /privacy-agg — aggregation privacy gate

Before any number derived from client/casework data leaves an aggregate — a
dashboard tile, a rollup, a chart, a grant-report statistic, a CSV export — it
must pass these rules. A small count is a re-identification. "How many trans
clients in the 757 this week" with an answer of 1 *is* that person's record.

## The rules

1. **Minimum cell size n ≥ 5.** Any cell (any bucket you'd display a count for)
   with fewer than 5 underlying individuals is suppressed. Not rounded, not
   starred — **suppressed**.

2. **Quasi-identifiers count toward the threshold.** The threshold applies to the
   *combination*, not just an explicit "identity" column. Jurisdiction +
   demographic + timeframe (e.g. `757 / trans / this-week`) is a quasi-identifier
   tuple; if that combined cell has n<5 it is suppressed, even though no name
   appears. Watch especially: region, gender/trans status, age band, case type,
   provider, narrow time windows — and any *cross-tab* of them.

3. **Uncertainty resolves to silence.** If you cannot confirm a cell is ≥5, or
   cannot tell whether a breakdown is a quasi-identifier, **emit nothing** for it.
   Default is suppression, never "probably fine."

4. **Complementary suppression.** If you suppress one small cell in a row/column
   whose total is shown, suppress a second cell too — otherwise the small one is
   recoverable by subtraction. (A single suppressed cell next to a visible total
   is not actually suppressed.)

## Use the enforced gate — do not reinvent it

This rule is **already implemented in code** and is the single source of truth:

- `src/utils/guardrails.js` → `MIN_CELL_SIZE` (=5), `cellEmittable(n)`,
  `suppressSmallCells(rows, countKey='n')`.
- Covered by `src/utils/guardrails.test.js` (`aggregate suppression (n < 5)`).

**Any new rollup/dashboard/report tooling must route its aggregate rows through
`suppressSmallCells` (or `cellEmittable`) — not a hand-rolled `>= 5` check.** If a
new surface needs different bucketing, extend the shared gate and its tests; do
not fork the threshold. If you change `MIN_CELL_SIZE`, the tests must change with
it and Aziza must sign off — it is a privacy parameter, not a tuning knob.

## Relationship to the hive-mind rules (don't conflate)

- **This skill** governs *aggregates/statistics* about people — k-anonymity on
  emitted counts.
- The **hive-mind admission gate** (subpoena litmus test) and the **n≥k distinct-
  source floor** for entity-pattern records are a *separate, stricter* gate for
  what may enter the replicated P2P store. Person-level data never enters the
  hive-mind at all; there, cell-size discipline applies to *provenance/sourcing*,
  not just aggregate counts.
- When in doubt about which applies: aggregate number for internal/grant display
  → this skill. Candidate record for the replicated store → hive-mind gate. Both
  resolve uncertainty to silence.

## Checklist before emitting

- [ ] Every displayed cell has a known underlying count ≥ 5.
- [ ] Cross-tabs / quasi-identifier tuples checked, not just top-line totals.
- [ ] Suppression routed through `suppressSmallCells`, not an ad-hoc filter.
- [ ] Complementary suppression applied where totals are shown.
- [ ] Anything uncertain is suppressed, not emitted.
