// aminaEngine.js
//
// Amina — the Resource Navigator's assistant. Recovered from the original
// Sanctuary (ThriveBMore persona: Black-led, LGBTQIA+, centering Trans Women of
// Color; warm, affirming, trans-led, Baltimore-specific).
//
// The LOCAL tiers below (askAmina) remain no-cloud / no-PHI:
//   Tier 2: a real local LLM via Ollama (http://localhost:11434) when available.
//   Tier 1: a deterministic GUIDED assistant when Ollama is absent. This is
//           honestly labeled as rule-based guidance, NOT a fake LLM.
// NOTE: askWifey() (added below) adds a HYBRID layer on top: generic,
// referent-free questions may be routed to a hosted model. That path is NOT
// local and NOT PHI-free-by-architecture — it is gated by routeEngine (default
// closed) + guardrails, and carries only the bare question. Client-specific
// input always stays on the local tiers. See askWifey for the boundary.

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

// Wifey — persona used ONLY on the hosted (generic-question) path. It never
// receives client data or the resource list (see askWifey / the Rust command),
// so its job is narrow: explain a generic piece of bureaucracy in plain terms
// and always end with a verification anchor. Legal-accuracy and honesty rules
// are baked in because this path can reach a hosted model.
export const WIFEY_SYSTEM = [
  'You are Wifey, a reentry-navigation assistant. Direct, dry, no throat-clearing,',
  'no "happy to help". Say the true thing efficiently, then stop.',
  'You are answering a GENERIC question with no person attached. You have NO access',
  'to any client record, vault, or resource list — do not pretend to. If the question',
  'turns out to be about a specific person, say it needs the local navigator tools',
  'and stop.',
  'LEGAL ACCURACY: never state a deadline, statute, filing window, fee, or eligibility',
  'rule as fact unless it is given to you. If you know the shape but not the number,',
  'say so ("often short, sometimes 15–30 days — confirm with the clerk"). Jurisdiction',
  'matters: a Virginia rule is not a Maryland rule; if it is unknown, say so.',
  'Every legal-process answer ends with who verifies it (clerk, navigator, attorney)',
  'and how. You are not a lawyer and say so when actual legal advice is needed.',
  'Say "I don\u2019t know" plainly rather than guessing.'
].join(' ');

// Best-effort Tauri invoke handle. In a browser/dev context without Tauri this
// stays null and the hosted path simply isn't available (we fall back to local).
async function tauriInvoke(cmd, args) {
  try {
    const mod = await import('@tauri-apps/api/core');
    return await mod.invoke(cmd, args);
  } catch {
    return Promise.reject(new Error('tauri unavailable'));
  }
}

// Orchestrator. Order: deterministic guardrails -> routing -> hosted|local.
// `resources` and any client data are ONLY ever passed to the local path.
// The hosted path receives the bare question and WIFEY_SYSTEM, nothing else.
export async function askWifey(message, resources, opts = {}) {
  const { checkGuardrails } = await import('./guardrails');
  const { classifyRoute } = await import('./routeEngine');

  // PHI hard gate: if a client transcript/context is attached, this question is
  // client-specific by definition. Force clientRecordOpen so classifyRoute's
  // default-closed Gate 0 keeps it LOCAL — the transcript can never reach the
  // hosted model. This is belt-and-suspenders with never passing clientContext
  // to the hosted branch below.
  if (opts.clientContext) {
    opts = { ...opts, clientRecordOpen: true };
  }

  const guard = checkGuardrails(message);

  // Crisis: deterministic, persona-off, never hosted. Surface crisis resources
  // via the existing local guided path (which puts crisis lines first).
  if (guard.kind === 'crisis') {
    return {
      text: 'I want you safe first. You can reach 988 (call or text) any time — the '
        + 'Suicide & Crisis Lifeline. If you\u2019re in immediate danger, 911. And the '
        + 'people below are here for you right now; you don\u2019t have to explain yourself.',
      resources: resources.filter((r) => r.cat === 'Crisis'),
      source: 'crisis'
    };
  }

  // Escalation ceiling: hand to a human navigator, never hosted, no guessing.
  if (guard.kind === 'escalate') {
    return {
      text: `This one goes to an IRN navigator — reason: ${guard.why}. A wrong answer `
        + 'here is worse than a slow one. Bring any paperwork you have and the key dates '
        + 'when you talk to them; that\u2019s your next step.',
      resources: [],
      source: 'escalate'
    };
  }

  // Not blocked. Decide routing. Default-closed: only provably-generic questions
  // are eligible for the hosted model.
  const route = classifyRoute(message, { clientRecordOpen: opts.clientRecordOpen });

  if (route === 'hosted') {
    try {
      const text = await tauriInvoke('hosted_assistant_ask', {
        question: message,
        systemPrompt: WIFEY_SYSTEM
      });
      if (text && String(text).trim()) {
        return { text: String(text).trim(), resources: [], source: 'hosted' };
      }
      throw new Error('empty hosted reply');
    } catch {
      // Fail closed toward LOCAL — never leave the user without an answer, and
      // never fall back to a second cloud.
      return { ...(await askAmina(message, resources, opts)), routedHostedButFellBack: true };
    }
  }

  // Local path: the existing Amina engine (Ollama or guided), untouched.
  return askAmina(message, resources, opts);
}

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

  // Optional per-client transcript context. This is PHI and stays fully local:
  // it is only ever placed in the Ollama (localhost) system prompt here, never
  // in the hosted path. Cap to the most recent ~4000 chars so a long transcript
  // can't overflow the model context.
  const MAX_CONTEXT_CHARS = 4000;
  let clientBlock = '';
  if (typeof opts.clientContext === 'string' && opts.clientContext.trim()) {
    const trimmed = opts.clientContext.trim().slice(-MAX_CONTEXT_CHARS);
    clientBlock = `\n\nClient intake transcript (confidential context — use it to inform your answer, do not repeat it back verbatim):\n${trimmed}`;
  }

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
          { role: 'system', content: `${AMINA_SYSTEM}\n\nAvailable resources (only reference these):\n${resourceContext}${clientBlock}` },
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
