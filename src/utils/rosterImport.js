// rosterImport.js — parse a client roster CSV exported from another system
// (BestNotes, most EHRs, spreadsheets) into Sanctuary client records.
//
// Pure and deterministic so it can be unit-tested without a file picker or the
// vault. The caller (ClientsModule) picks the CSV, calls parseRoster, then writes
// each record through the encrypted vault path — this module never touches PHI
// storage itself.
//
// openEHR note: openEHR exports are compositions in XML/JSON archetypes, not a
// flat roster. Those need a dedicated mapper; this handles the common CSV case
// (which BestNotes and most systems can export) and is the 80% path.

// Header aliases → canonical client field. Case/space/underscore-insensitive.
const FIELD_ALIASES = {
  legalName: ['legal name', 'name', 'full name', 'client name', 'patient name', 'fullname', 'legalname'],
  alias: ['alias', 'preferred name', 'chosen name', 'nickname', 'goes by'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'contact number', 'telephone'],
  emergency: ['emergency', 'emergency contact', 'emergency phone', 'next of kin'],
  smsConsent: ['sms consent', 'sms', 'text consent', 'consent to text', 'sms_consent'],
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');

// Map a raw header to a canonical field name, or null if unrecognized.
function headerToField(header) {
  const h = norm(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

// Parse one CSV line respecting double-quoted fields (handles commas inside
// quotes and "" escapes). Returns an array of cell strings.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cells.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

const truthy = (v) => /^(y|yes|true|1|consent(ed)?|opt.?in)$/i.test(String(v || '').trim());

/**
 * Parse roster CSV text into { clients, skipped, columns }.
 * - clients: [{ legalName, alias, phone, emergency, smsConsent, photo:'', pronouns:[], pronounsSelfDescribe:'' }]
 * - skipped: rows with no usable name (count)
 * - columns: which canonical fields were recognized from the header
 * Throws on empty input or a header with no recognizable name column.
 */
export function parseRoster(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, ''); // strip BOM
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('The file is empty.');

  const headerCells = parseCsvLine(lines[0]);
  const fieldByIndex = headerCells.map(headerToField);
  const recognized = fieldByIndex.filter(Boolean);
  if (!recognized.includes('legalName')) {
    throw new Error('No name column found. Expected a header like "Name", "Legal Name", or "Client Name".');
  }

  const clients = [];
  let skipped = 0;
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const rec = { legalName: '', alias: '', phone: '', emergency: '', smsConsent: false, photo: '', pronouns: [], pronounsSelfDescribe: '' };
    fieldByIndex.forEach((field, i) => {
      if (!field) return;
      const val = cells[i] ?? '';
      if (field === 'smsConsent') rec.smsConsent = truthy(val);
      else rec[field] = val.trim();
    });
    if (!rec.legalName) { skipped++; continue; }
    clients.push(rec);
  }
  return { clients, skipped, columns: [...new Set(recognized)] };
}
