import { hiveMind, getVectorEmbedding, admissionGate } from './hiveEngine';

// Seed the hive-mind with REAL, verified, public filing-rule ground truth for the
// jurisdictions IRN works (Virginia + Maryland). Every fact here was taken from an
// official .gov court source and each entry cites it inline. This is durable,
// non-personal procedural truth — no client data, no names, no individual dates —
// so it clears the admission gate.
//
// Sources (verified 2026-07-29):
//  - Va. general district / circuit jurisdiction thresholds: vacourts.gov
//    (https://www.vacourts.gov/courts/circuit/home) and Va. Code cited there.
//  - Va. circuit civil filing fees are calculated per-locality/amount, not a flat
//    number: https://www.vacourts.gov/ccfees_calc_app — so we record the RULE
//    (calculator-based, varies by locality) rather than a single figure.
//  - Md. District Court Cost Schedule DCA-109, effective March 1, 2026:
//    https://www.mdcourts.gov/sites/default/files/court-forms/dca109.pdf
//  - Md. certified-mail cost notice, effective March 2026:
//    https://www.courts.state.md.us/sites/default/files/import/district/forms/acct/publicnotice/dca109publicnotice_03.2026.pdf
//  - Md. District Court jurisdiction thresholds: https://www.courts.state.md.us/district
//
// If a figure changes, UPDATE the entry (LWW by timestamp) — do not stack a second
// contradictory one. Fees/rules current as of the dates above.

// Each seed: key, human sourceText (cites source), and gate metadata. isPattern is
// false — these are single-source official facts, not multi-source inferred
// patterns, so they are not subject to the n>=k source floor. lastVerifiedBy is a
// role/region token, never a person.
export const FILING_RULE_SEEDS = [
  {
    key: 'va_gdc_jurisdiction_threshold',
    sourceText:
      'Virginia General District Court has exclusive civil jurisdiction in claims up to $4,500, and concurrent jurisdiction with the circuit court for claims between $4,500 and $25,000. Source: vacourts.gov circuit court overview.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'va_circuit_jurisdiction_threshold',
    sourceText:
      'Virginia Circuit Court hears most civil cases with claims above $25,000, and shares authority with the general district court from $4,500 to $25,000; personal injury and wrongful death claims may be heard up to $50,000. Source: vacourts.gov circuit court overview.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'va_circuit_civil_fee_is_calculated',
    sourceText:
      'Virginia circuit court civil filing fees are not a single flat amount: they are computed by locality and by the amount in controversy using the official civil filing fee calculator (ccfees_calc_app). Confirm the exact fee with the local circuit court civil section. Source: vacourts.gov circuit civil filing fee calculator.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'va_service_by_sheriff_per_person',
    sourceText:
      'In Virginia, in-state service of process by the sheriff or high constable is $12 per person served (Va. Code 17.1-272). Do not enter a number when using a private process server. Source: vacourts.gov civil filing fee help.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'va_efiling_paper_surcharge',
    sourceText:
      'In Virginia, for every civil action first filed on paper in an e-filing circuit court, the court may impose an additional $5 fee under Va. Code 17.1-258.3. Source: Richmond Circuit Court civil fee schedule, vacourts.gov.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'va_fee_waiver_form_cc1414',
    sourceText:
      'A low-income filer in Virginia may request a filing fee waiver using Form CC-1414. Source: selfhelp.vacourts.gov filing fees and waivers.',
    lastVerifiedBy: 'VA region',
  },
  {
    key: 'md_dc_jurisdiction_threshold',
    sourceText:
      'The Maryland District Court has exclusive civil jurisdiction in claims of $5,000 or less, and concurrent jurisdiction with the circuit courts for claims above $5,000 but less than $30,000. The District Court does not conduct jury trials. Source: courts.state.md.us district court overview.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_small_claim_filing_fee',
    sourceText:
      'Maryland District Court small claims complaint (contract or tort, new suit) filing fee is $44, per the DCA-109 Cost Schedule effective March 2026. Source: mdcourts.gov DCA-109.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_large_claim_filing_fee',
    sourceText:
      'Maryland District Court large claims complaint (contract or tort, new suit) filing fee is $56, per the DCA-109 Cost Schedule effective March 2026. Source: mdcourts.gov DCA-109.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_appeal_to_circuit_fee',
    sourceText:
      'A post-judgment appeal from the Maryland District Court costs $10 filed at the District Court plus $165 made payable to the Circuit Court, per DCA-109 effective March 2026. Source: mdcourts.gov DCA-109.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_summary_ejectment_baltimore',
    sourceText:
      'Maryland District Court summary ejectment (failure to pay rent) filing fee is $50 in all counties except Baltimore City, and $60 in Baltimore City, per DCA-109 effective March 2026. Source: mdcourts.gov DCA-109.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_certified_mail_surcharge',
    sourceText:
      'Effective March 2026, the Maryland District Court adds a $20 certified-mail charge to any filing or court service that requires certified mail. Source: mdcourts.gov DCA-109 public notice.',
    lastVerifiedBy: 'MD region',
  },
  {
    key: 'md_dc_state_not_taxed_costs',
    sourceText:
      'Under Maryland District Court Administrative Regulation XIX, the State of Maryland and its officers, agencies, and departments are not taxed costs in any District Court civil proceeding. Source: mdcourts.gov DCA-109.',
    lastVerifiedBy: 'MD region',
  },
];

/**
 * Insert every not-yet-present filing-rule seed into the hive-mind. Idempotent:
 * keys already in the store are skipped (so re-running never duplicates). Each
 * candidate is re-checked against admissionGate first (insert enforces it too).
 * Does NOT persist — the caller persists once afterward (e.g. via authStore
 * persistHive) so a single encrypted write covers the whole batch.
 *
 * @returns {{ inserted: string[], skipped: string[], rejected: {key:string,reason:string}[] }}
 */
export async function seedHiveFilingRules() {
  const existing = new Set(hiveMind.flatten().map(n => n.key));
  const inserted = [];
  const skipped = [];
  const rejected = [];

  for (const seed of FILING_RULE_SEEDS) {
    if (existing.has(seed.key)) { skipped.push(seed.key); continue; }

    const candidate = { sourceText: seed.sourceText, lastVerifiedBy: seed.lastVerifiedBy };
    const verdict = admissionGate(candidate);
    if (!verdict.ok) {
      // A seed that fails the gate is a bug in the seed text, not a runtime input —
      // surface it rather than silently dropping, so it gets fixed.
      rejected.push({ key: seed.key, reason: verdict.reason });
      continue;
    }

    const vector = await getVectorEmbedding(seed.sourceText);
    await hiveMind.insert(seed.key, vector, Date.now(), candidate);
    inserted.push(seed.key);
  }

  return { inserted, skipped, rejected };
}
