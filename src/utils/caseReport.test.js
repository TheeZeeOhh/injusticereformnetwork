import { describe, it, expect } from 'vitest';
import { buildCaseSummaryText } from './caseReport';

const QUESTIONS = [
  { id: 'housingStatus', label: 'Current housing situation' },
  { id: 'legalNeeds', label: 'Current legal needs' },
];
const NOW = new Date('2026-07-19T12:00:00Z');

const baseClient = {
  legalName: 'Jordan Ellis', alias: 'Jay', phone: '(410) 555-0142',
  emergency: 'Sister', pronouns: ['they/them'], pronounsSelfDescribe: '',
};

describe('buildCaseSummaryText', () => {
  it('includes the client name and every section header', () => {
    const txt = buildCaseSummaryText({ client: baseClient, clientId: 'client_PT-1', intakeQuestions: QUESTIONS, now: NOW });
    expect(txt).toContain('Jordan Ellis');
    for (const h of ['Profile', 'Intake', 'Clinical Notes', 'Appointments', 'Transcripts', 'HRT Continuity']) {
      expect(txt).toContain(h);
    }
  });

  it('renders intake answers with human labels', () => {
    const txt = buildCaseSummaryText({
      client: baseClient, clientId: 'client_PT-1', intakeQuestions: QUESTIONS,
      intake: { answers: { housingStatus: 'Shelter', legalNeeds: 'Expungement' }, updatedAt: NOW.toISOString() },
      now: NOW,
    });
    expect(txt).toContain('Current housing situation: Shelter');
    expect(txt).toContain('Current legal needs: Expungement');
  });

  it('shows empty-state lines for missing records without crashing', () => {
    const txt = buildCaseSummaryText({ client: {}, clientId: 'client_PT-9', intakeQuestions: QUESTIONS, now: NOW });
    expect(txt).toContain('(none on file)');
  });

  it('includes HRT details when provided (Vault B unlocked)', () => {
    const txt = buildCaseSummaryText({
      client: baseClient, clientId: 'client_PT-1', intakeQuestions: QUESTIONS,
      hrt: { regimen: 'Estradiol 4mg daily', refillWindow: '2026-07-25', prescriber: 'Dr X', pharmacy: 'CVS' },
      now: NOW,
    });
    expect(txt).toContain('Estradiol 4mg daily');
    expect(txt).toContain('2026-07-25');
  });

  it('notes HRT omitted when Vault B is locked', () => {
    const txt = buildCaseSummaryText({
      client: baseClient, clientId: 'client_PT-1', intakeQuestions: QUESTIONS,
      hrt: null, hrtLocked: true, now: NOW,
    });
    expect(txt).toMatch(/HRT omitted.*Vault B/i);
  });

  it('lists notes and appointments', () => {
    const txt = buildCaseSummaryText({
      client: baseClient, clientId: 'client_PT-1', intakeQuestions: QUESTIONS,
      notes: [{ templateName: 'SOAP Progress Note', serviceType: 'Progress', filledBody: 'S: ok', savedAt: NOW.toISOString() }],
      appts: [{ startTime: NOW.toISOString(), status: 'Completed' }],
      now: NOW,
    });
    expect(txt).toContain('SOAP Progress Note');
    expect(txt).toContain('Completed');
  });
});
