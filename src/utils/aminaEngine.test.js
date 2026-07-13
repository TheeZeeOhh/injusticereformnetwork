import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { guidedReply, askAmina, isAminaLlmAvailable, AMINA_SYSTEM } from './aminaEngine';

const RES = [
  { name: 'Chase Brexton Health Care', cat: 'Healthcare', phone: '410-837-2050', note: 'Gender-affirming', addr: '1001 Cathedral St' },
  { name: 'Baltimore Station', cat: 'Housing', phone: '410-779-4801', note: 'Transitional housing', addr: '140 W West St' },
  { name: 'Trans Lifeline', cat: 'Crisis', phone: '877-565-8860', note: 'By and for trans people', addr: 'National' },
  { name: 'Free Narcan', cat: 'Harm Reduction', phone: 'x', note: 'No prescription', addr: 'MD pharmacies' }
];

describe('guidedReply (Tier 1)', () => {
  it('surfaces crisis lines first for crisis intent', () => {
    const r = guidedReply('I feel unsafe and want to hurt myself', RES);
    expect(r.resources.every((x) => x.cat === 'Crisis')).toBe(true);
    expect(r.resources[0].name).toBe('Trans Lifeline');
  });

  it('matches gender-affirming care intent to Healthcare', () => {
    const r = guidedReply('where can I get hormones', RES);
    expect(r.resources[0].cat).toBe('Healthcare');
  });

  it('matches housing intent', () => {
    const r = guidedReply('my client was evicted and needs shelter', RES);
    expect(r.resources[0].cat).toBe('Housing');
  });

  it('offers categories when intent is unclear', () => {
    const r = guidedReply('hi', RES);
    expect(r.resources).toHaveLength(0);
    expect(r.text).toMatch(/gender-affirming|housing|legal/i);
  });

  it('has a recovered, affirming persona', () => {
    expect(AMINA_SYSTEM).toMatch(/Trans Women of Color/i);
    expect(AMINA_SYSTEM).toMatch(/affirming/i);
  });
});

describe('askAmina (Tier 2 with graceful fallback)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('uses the LLM when Ollama responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Try Chase Brexton Health Care for affirming care.' } })
    }));
    const r = await askAmina('hormones?', RES);
    expect(r.source).toBe('llm');
    expect(r.text).toMatch(/Chase Brexton/);
    expect(r.resources.some((x) => x.name === 'Chase Brexton Health Care')).toBe(true);
  });

  it('falls back to guided when Ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await askAmina('where can I get hormones', RES);
    expect(r.source).toBe('guided');
    expect(r.resources[0].cat).toBe('Healthcare');
  });

  it('falls back to guided on a non-ok Ollama response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const r = await askAmina('I need housing', RES);
    expect(r.source).toBe('guided');
    expect(r.resources[0].cat).toBe('Housing');
  });
});

describe('isAminaLlmAvailable', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('true when tags endpoint is ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    expect(await isAminaLlmAvailable()).toBe(true);
  });
  it('false when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no')));
    expect(await isAminaLlmAvailable()).toBe(false);
  });
});
