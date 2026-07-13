// aminaEngine.js
//
// Amina — the Resource Navigator's assistant. Recovered from the original
// Sanctuary (ThriveBMore persona: Black-led, LGBTQIA+, centering Trans Women of
// Color; warm, affirming, trans-led, Baltimore-specific).
//
// Two tiers, both LOCAL-ONLY (no cloud API, no PHI transmission — consistent
// with the technical-incapacity design):
//   Tier 2: a real local LLM via Ollama (http://localhost:11434) when available.
//   Tier 1: a deterministic GUIDED assistant when Ollama is absent. This is
//           honestly labeled as rule-based guidance, NOT a fake LLM.

// Amina's system persona (recovered voice). Used as the Ollama system prompt and
// as the tone reference for guided replies.
export const AMINA_SYSTEM = [
  'You are Amina, a Baltimore community health navigator assistant for Sanctuary,',
  'a Black-led, LGBTQIA+ nonprofit centering Trans Women of Color. You support',
  'trans/nonbinary people, LGBTQIA+ community members, and allies.',
  'TONE: Warm, direct, affirming. Never clinical. Never bureaucratic. Center',
  'autonomy. Acknowledge difficulty before pivoting to solutions. Use chosen',
  'names and correct pronouns.',
  'You help Navigators find the right LOCAL Baltimore/Maryland resource. Keep',
  'answers short and practical. Never invent phone numbers or orgs — only',
  'reference the provided resource list.'
].join(' ');

// Maps free-text intent to a resource category, for the guided (Tier 1) path.
const INTENT = [
  { cat: 'Healthcare', kw: ['hormone', 'hrt', 'gender-affirming', 'affirming', 'doctor', 'clinic', 'health', 'prep', 'trans care', 'estrogen', 'testosterone'] },
  { cat: 'Housing', kw: ['housing', 'shelter', 'homeless', 'evicted', 'sleep', 'stay', 'transitional'] },
  { cat: 'Legal', kw: ['legal', 'lawyer', 'name change', 'gender marker', 'id', 'court', 'rights', 'discrimination', 'immigration'] },
  { cat: 'Crisis', kw: ['crisis', 'suicid', 'hurt', 'emergency', 'hotline', 'danger', 'unsafe', 'help now', '988'] },
  { cat: 'Harm Reduction', kw: ['narcan', 'naloxone', 'overdose', 'safer use', 'harm reduction'] },
  { cat: 'Recovery', kw: ['recovery', 'mat', 'methadone', 'suboxone', 'buprenorphine', 'treatment', 'sober', 'detox', 'addiction', 'using again', 'relapse', 'quit'] },
  { cat: 'Food', kw: ['food', 'hungry', 'eat', 'pantry', 'groceries', 'meal', 'snap', 'wic'] },
  { cat: 'Financial', kw: ['money', 'relief', 'fund', 'cash', 'rent', 'financial', 'bills'] }
];

// Appended to a guided reply when any suggested resource is unverified.
const UNVERIFIED_NOTE = ' A heads-up: some of these I haven\u2019t been able to double-check recently, so please confirm the number before you pass it to your client.';

// Detect whether the local Ollama service is reachable (Tier 2 availability).
export async function isAminaLlmAvailable() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// Tier 1: deterministic guided reply. Classifies intent, returns Amina's warm
// framing plus the matching resources from the provided dataset. `resources` is
// the caller's real resource array (name, cat, phone, note, addr).
export function guidedReply(message, resources) {
  const text = (message || '').toLowerCase();
  const crisisHit = INTENT[3].kw.some((k) => text.includes(k));

  let match = null;
  for (const rule of INTENT) {
    if (rule.kw.some((k) => text.includes(k))) { match = rule.cat; break; }
  }

  // Crisis always surfaces crisis lines first.
  if (crisisHit) {
    const crisis = resources.filter((r) => r.cat === 'Crisis');
    return {
      text: 'I hear you, and I want you safe first. Here are people you can reach right now — you don\u2019t have to explain yourself to them:',
      resources: crisis
    };
  }

  if (match) {
    const picks = resources.filter((r) => r.cat === match);
    const base = `Okay. For ${match.toLowerCase()}, these are options in Baltimore:`;
    const hasUnverified = picks.some((r) => r.unverified);
    return {
      text: hasUnverified ? base + UNVERIFIED_NOTE : base,
      resources: picks
    };
  }

  // No clear intent — offer the categories, in Amina's voice.
  return {
    text: 'I\u2019ve got you. Tell me what you need and I\u2019ll point you to the right people \u2014 gender-affirming care, housing, legal help, crisis support, harm reduction, or financial relief. What\u2019s going on?',
    resources: []
  };
}

// Tier 2: ask the local Ollama LLM. `resources` are injected so the model can
// only reference real orgs. Falls back to guidedReply on any failure.
export async function askAmina(message, resources, opts = {}) {
  const model = opts.model || 'llama3.2';
  const resourceContext = resources
    .map((r) => `- ${r.name} [${r.cat}] ${r.phone} \u2014 ${r.note} (${r.addr})`)
    .join('\n');

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: `${AMINA_SYSTEM}\n\nAvailable resources (only reference these):\n${resourceContext}` },
          { role: 'user', content: message }
        ]
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('Ollama returned an error');
    const data = await res.json();
    const content = data?.message?.content?.trim();
    if (!content) throw new Error('Empty Ollama response');
    // Surface any resources the model likely referenced, for the pin/list UI.
    const referenced = resources.filter((r) => content.toLowerCase().includes(r.name.toLowerCase()));
    return { text: content, resources: referenced, source: 'llm' };
  } catch {
    // Graceful degradation to the guided assistant.
    return { ...guidedReply(message, resources), source: 'guided' };
  }
}
