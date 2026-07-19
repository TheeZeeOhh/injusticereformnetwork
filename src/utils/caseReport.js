// Pure builder for the per-client case summary. Takes already-decrypted records
// and returns a plain-text, sectioned report string. No I/O, no jsPDF — so it is
// deterministic and unit-testable. The caller (CaseReporting) handles loading
// from the vault and the PDF export.

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(iso);
}

function section(title, lines) {
  return [`== ${title} ==`, ...(lines.length ? lines : ['(none on file)']), ''].join('\n');
}

// @param opts.client        { legalName, alias, phone, emergency, pronouns[], pronounsSelfDescribe }
// @param opts.clientId      full id ('client_PT-1234')
// @param opts.intake        { answers:{qid:val}, updatedAt } | null
// @param opts.intakeQuestions [{ id, label }]
// @param opts.notes         [{ templateName, serviceType, filledBody, savedAt }]
// @param opts.appts         [{ startTime, status }]  (already filtered to this client)
// @param opts.transcripts   [{ savedAt, lines:[{original,translated}] }]
// @param opts.hrt           { regimen, refillWindow, prescriber, pharmacy } | null
// @param opts.hrtLocked     boolean — Vault B closed, HRT deliberately omitted
// @param opts.now           Date
export function buildCaseSummaryText(opts) {
  const {
    client = {}, clientId = '', intake = null, intakeQuestions = [],
    notes = [], appts = [], transcripts = [], hrt = null, hrtLocked = false,
    now = new Date(),
  } = opts || {};

  const ref = String(clientId).replace('client_', '');
  const name = client.legalName || ref || 'Unknown client';

  const header = [
    'IRN CASE SUMMARY (CONFIDENTIAL — CONTAINS CLIENT PHI)',
    `Client: ${name}${client.alias ? ` (${client.alias})` : ''}   ID: ${ref}`,
    `Generated: ${now.toLocaleString()}`,
    '',
  ].join('\n');

  const pronouns = [
    ...(Array.isArray(client.pronouns) ? client.pronouns : []),
    ...(client.pronounsSelfDescribe ? [client.pronounsSelfDescribe] : []),
  ].join(', ');

  const profile = section('Profile', [
    `Legal / chosen name: ${client.legalName || '—'}`,
    `Alias: ${client.alias || '—'}`,
    `Pronouns: ${pronouns || '—'}`,
    `Contact: ${client.phone || '—'}`,
    `Emergency contact: ${client.emergency || '—'}`,
  ]);

  const intakeLines = intake && intake.answers
    ? intakeQuestions
        .filter((q) => intake.answers[q.id] !== undefined && intake.answers[q.id] !== '')
        .map((q) => `${q.label}: ${intake.answers[q.id]}`)
    : [];
  const intakeBlock = section(
    `Intake / Needs Assessment${intake?.updatedAt ? ` (updated ${fmtDate(intake.updatedAt)})` : ''}`,
    intakeLines
  );

  const noteLines = (notes || []).flatMap((n) => [
    `[${fmtDate(n.savedAt)}] ${n.templateName || 'Note'} (${n.serviceType || '—'})`,
    ...String(n.filledBody || '').split('\n').map((l) => `    ${l}`),
    '',
  ]);
  const notesBlock = section('Clinical Notes', noteLines.length ? noteLines : []);

  const apptLines = (appts || [])
    .slice()
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((a) => `${fmtDate(a.startTime)} — ${a.status || '—'}`);
  const apptBlock = section('Appointments', apptLines);

  const transcriptLines = (transcripts || []).map((s, i) => {
    const count = Array.isArray(s.lines) ? s.lines.length : 0;
    return `Session ${i + 1} — ${fmtDate(s.savedAt)} (${count} line${count === 1 ? '' : 's'})`;
  });
  const transcriptBlock = section('Saved Intake Transcripts', transcriptLines);

  let hrtBlock;
  if (hrtLocked) {
    hrtBlock = section('HRT Continuity (Vault B)', ['HRT omitted — Vault B was locked at generation time.']);
  } else if (hrt) {
    hrtBlock = section('HRT Continuity (Vault B)', [
      `Regimen: ${hrt.regimen || '—'}`,
      `Refill window: ${hrt.refillWindow || '—'}`,
      `Prescriber: ${hrt.prescriber || '—'}`,
      `Pharmacy: ${hrt.pharmacy || '—'}`,
    ]);
  } else {
    hrtBlock = section('HRT Continuity (Vault B)', []);
  }

  return [header, profile, intakeBlock, notesBlock, apptBlock, transcriptBlock, hrtBlock].join('\n');
}
