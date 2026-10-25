// IRN paste guard: what counts as client information in pasted text.
//
// Pure functions, no DOM and no storage, so the same file runs as a content
// script and under the test suite. It looks for identifiers, not topics:
// "methadone clinic hours" in a search box is research, while a date of birth
// next to "methadone" is someone's record. A health term only counts when the
// same paste also carries an identifier.
"use strict";

(function (root) {
  // SSN with separators, or bare nine digits only when the text says SSN.
  // Never 000/666/9xx area, 00 group or 0000 serial (those are not issued).
  const SSN_SEP = /\b(?!000|666|9\d\d)\d{3}([- ])(?!00)\d{2}\1(?!0000)\d{4}\b/;
  const SSN_BARE = /\b(?:ssn|ss#|soc(?:ial)?\.?\s*sec(?:urity)?(?:\s*(?:no|number|#))?)\s*[:#]?\s*(?!000|666|9\d\d)\d{3}(?!00)\d{2}(?!0000)\d{4}\b/i;

  // A date right after a birth keyword.
  const DATE = String.raw`(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})`;
  const DOB = new RegExp(String.raw`\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|birth\s*date|born(?:\s+on)?)\s*[:\-]?\s*` + DATE, "i");

  // Medical record and patient numbers: the keyword, then something ID-shaped
  // that has at least one digit.
  const MRN = /\b(?:mrn|medical\s+record(?:\s+(?:no|number|#))?|patient\s+(?:id|no|number|#)|chart\s+(?:no|number|#))\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b/i;

  // Medicare Beneficiary Identifier: 11 characters in a fixed letter/digit
  // pattern that excludes S, L, O, I, B and Z. Specific enough on its own.
  const MBI = /\b[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y]{2}\d{2}\b/;

  // Medicaid and insurance member IDs, by keyword.
  const MEMBER = /\b(?:medicaid|medicare|member|subscriber|policy)\s+(?:id|no|number|#)\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}\b/i;

  // ICD-10 diagnosis codes, only next to a diagnosis keyword.
  const ICD = /\b(?:dx|diagnos[ie]s|icd[- ]?10(?:[- ]cm)?)\s*(?:code)?\s*[:#]?\s*[A-TV-Z]\d{2}(?:\.[0-9A-Z]{1,4})?\b/i;

  // Health details that matter most under 42 CFR Part 2 and for trans clients.
  // On their own these are topics; they only count alongside an identifier.
  const HEALTH = /\b(?:hiv(?:\s*(?:positive|\+|status))?|aids|hepatitis\s*c|substance\s+use|opioid\s+use\s+disorder|oud|methadone|buprenorphine|suboxone|naltrexone|vivitrol|detox|rehab|psychiatric|bipolar|schizo\w*|ptsd|suicid\w*|overdose|estradiol|testosterone|spironolactone|hrt|hormone\s+therapy|gender[- ]affirming|transition(?:ing)?|pregnan\w*|abortion|std|sti|diagnos\w*|prescri\w*)\b/i;

  // Contact details. Not flagged alone (they are everywhere), but they turn a
  // health term into a record.
  const PHONE = /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/;
  const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const STREET = /\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}(?:st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court|way|pl|place)\b\.?/;

  const CHECKS = [
    ["ssn", "a Social Security number", (t) => SSN_SEP.test(t) || SSN_BARE.test(t)],
    ["dob", "a date of birth", (t) => DOB.test(t)],
    ["mrn", "a medical record or patient number", (t) => MRN.test(t)],
    ["mbi", "a Medicare number", (t) => MBI.test(t)],
    ["member", "an insurance or Medicaid ID", (t) => MEMBER.test(t)],
    ["icd", "a diagnosis code", (t) => ICD.test(t)],
  ];

  // Returns [{kind, label}], strongest first. Empty means nothing to warn about.
  // Never returns the matched text itself: the warning must not display the
  // very thing it is protecting.
  function findPHI(text) {
    if (typeof text !== "string" || text.length < 6) return [];
    const t = text.length > 200000 ? text.slice(0, 200000) : text;
    const found = CHECKS.filter(([, , test]) => test(t)).map(([kind, label]) => ({ kind, label }));
    const contact = PHONE.test(t) || EMAIL.test(t) || STREET.test(t);
    if ((found.length || contact) && HEALTH.test(t)) {
      found.push({ kind: "health", label: "a health detail next to who it is about" });
    }
    return found;
  }

  // Origins where pasting client information is the point: this machine
  // (Sanctuary runs on localhost) plus whatever the policy allows.
  function isAllowed(href, extra) {
    let u;
    try { u = new URL(href); } catch { return false; }
    if (u.protocol === "file:" || u.protocol === "about:" || u.protocol === "moz-extension:") return true;
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return true;
    return (extra || []).some((o) => {
      try { return new URL(o).origin === u.origin; } catch { return false; }
    });
  }

  const api = { findPHI, isAllowed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.irnPasteGuard = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
