// Fixed staff-administered intake (needs assessment). Psychosocial / needs only:
// health, substance, and clinical questions deliberately live in Vault B (42-CFR),
// not this Vault-A record. Edit this array to change the questionnaire.
//
// Shared so both the intake form (ClientsModule) and the case report render the
// same questions with the same human labels.
export const INTAKE_QUESTIONS = [
  { id: 'housingStatus', label: 'Current housing situation', type: 'select',
    options: ['Stably housed', 'Temporary / doubled-up', 'Shelter', 'Unsheltered', 'Prefer not to say'] },
  { id: 'housingRisk', label: 'At risk of losing housing in the next 30 days?', type: 'yesno' },
  { id: 'incomeSource', label: 'Primary source of income', type: 'select',
    options: ['Employment', 'Benefits (SSI/SSDI/TANF)', 'Family / informal', 'None', 'Prefer not to say'] },
  { id: 'benefitsHelp', label: 'Needs help applying for benefits?', type: 'yesno' },
  { id: 'legalNeeds', label: 'Current legal needs', type: 'text' },
  { id: 'idDocuments', label: 'Has government photo ID?', type: 'yesno' },
  { id: 'safetyConcerns', label: 'Any immediate safety concerns?', type: 'yesno' },
  { id: 'safetyNotes', label: 'Safety / other notes', type: 'text' },
];
