// Built-in clinical note templates + the placeholder helper. Templates are
// non-PHI reference content (blank forms with [Placeholder] variables); a note
// only becomes PHI once filled with a client's data and saved to the vault.

export const NOTE_SERVICE_TYPES = [
  'Assessment',
  'Progress',
  'Discharge',
  'Crisis',
  'Psychiatric',
  'Treatment Plan',
  'Case Management',
];

// Extract unique [Placeholder] variable names from a template body, in order of
// first appearance. Ignores empty brackets.
export function extractPlaceholders(body) {
  const out = [];
  const seen = new Set();
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

// Substitute values into a template body. Unfilled placeholders are left in
// place (visible) so a partial note clearly shows what still needs completing.
export function fillTemplate(body, values = {}) {
  return String(body || '').replace(/\[([^\]]+)\]/g, (match, name) => {
    const key = name.trim();
    const v = values[key];
    return (v !== undefined && v !== '') ? v : match;
  });
}

export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_initial_assessment',
    name: 'Initial Assessment',
    serviceType: 'Assessment',
    body: `INITIAL ASSESSMENT
Client: [Client Name]    Date: [Date]    Navigator: [Navigator]

Presenting concerns:
[Presenting Concerns]

History:
[Relevant History]

Current needs (housing, legal, health, benefits):
[Current Needs]

Risk / safety screen:
[Risk Screen]

Initial plan:
[Initial Plan]`,
  },
  {
    id: 'tpl_soap',
    name: 'SOAP Progress Note',
    serviceType: 'Progress',
    body: `SOAP PROGRESS NOTE
Client: [Client Name]    Date: [Date]

Subjective:
[Subjective]

Objective:
[Objective]

Assessment:
[Assessment]

Plan:
[Plan]`,
  },
  {
    id: 'tpl_dap',
    name: 'DAP Progress Note',
    serviceType: 'Progress',
    body: `DAP PROGRESS NOTE
Client: [Client Name]    Date: [Date]

Data:
[Data]

Assessment:
[Assessment]

Plan:
[Plan]`,
  },
  {
    id: 'tpl_discharge',
    name: 'Discharge Summary',
    serviceType: 'Discharge',
    body: `DISCHARGE SUMMARY
Client: [Client Name]    Discharge Date: [Date]    Navigator: [Navigator]

Reason for discharge:
[Reason]

Services provided:
[Services Provided]

Outcomes / progress:
[Outcomes]

Referrals & follow-up:
[Referrals]

Final status:
[Final Status]`,
  },
  {
    id: 'tpl_crisis',
    name: 'Crisis Assessment',
    serviceType: 'Crisis',
    body: `CRISIS ASSESSMENT
Client: [Client Name]    Date/Time: [Date Time]    Navigator: [Navigator]

Nature of crisis:
[Nature of Crisis]

Risk to self / others:
[Risk Level]

Safety plan:
[Safety Plan]

Immediate actions taken:
[Actions Taken]

Follow-up:
[Follow Up]`,
  },
  {
    id: 'tpl_psych_eval',
    name: 'Psychiatric Evaluation',
    serviceType: 'Psychiatric',
    body: `PSYCHIATRIC EVALUATION
Client: [Client Name]    Date: [Date]    Evaluator: [Evaluator]

Chief complaint:
[Chief Complaint]

History of present illness:
[HPI]

Mental status exam:
[MSE]

Diagnosis (impression):
[Diagnosis]

Medications / recommendations:
[Recommendations]`,
  },
  {
    id: 'tpl_treatment_plan',
    name: 'Treatment Plan',
    serviceType: 'Treatment Plan',
    body: `TREATMENT PLAN
Client: [Client Name]    Date: [Date]    Navigator: [Navigator]

Goals:
[Goals]

Objectives (measurable):
[Objectives]

Interventions:
[Interventions]

Target dates / review:
[Review Date]`,
  },
  {
    id: 'tpl_case_management',
    name: 'Case Management Note',
    serviceType: 'Case Management',
    body: `CASE MANAGEMENT NOTE
Client: [Client Name]    Date: [Date]    Navigator: [Navigator]

Contact type:
[Contact Type]

Summary of contact:
[Summary]

Coordination / referrals:
[Coordination]

Next steps:
[Next Steps]`,
  },
];
