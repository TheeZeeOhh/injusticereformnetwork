import { describe, it, expect, vi, afterEach } from 'vitest';
import { askWifey, WIFEY_SYSTEM } from './aminaEngine';

const RES = [
  { name: 'Chase Brexton Health Care', cat: 'Healthcare', phone: '410-837-2050', note: 'Gender-affirming', addr: '1001 Cathedral St' },
  { name: 'Trans Lifeline', cat: 'Crisis', phone: '877-565-8860', note: 'By and for trans people', addr: 'National' }
];

// Mock the Tauri invoke module so we can assert exactly what is (and isn't) sent.
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invokeMock(...a) }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); invokeMock.mockReset(); });

describe('askWifey orchestration', () => {
  it('crisis bypasses hosted entirely and surfaces 988 + crisis resources', async () => {
    const r = await askWifey('I want to kill myself', RES);
    expect(r.source).toBe('crisis');
    expect(r.text).toMatch(/988/);
    expect(r.resources.every((x) => x.cat === 'Crisis')).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('escalation bypasses hosted and hands to a navigator with a reason', async () => {
    const r = await askWifey('CPS took the kids, what do I do', RES);
    expect(r.source).toBe('escalate');
    expect(r.text).toMatch(/navigator/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('PHI-looking questions route LOCAL and never call the hosted command', async () => {
    // Force the local Ollama path to fail so it degrades to guided, proving the
    // hosted command was never even attempted.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no ollama')));
    const r = await askWifey('my client was evicted and needs shelter', RES);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(r.source).toBe('guided');
  });

  it('generic questions reach the hosted path with the bare question and NO resources', async () => {
    invokeMock.mockResolvedValue('A continuance is a postponement of a hearing. Confirm the new date with the clerk.');
    const r = await askWifey('what is a continuance', RES);
    expect(r.source).toBe('hosted');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = invokeMock.mock.calls[0];
    expect(cmd).toBe('hosted_assistant_ask');
    expect(args.question).toBe('what is a continuance');
    expect(args.systemPrompt).toBe(WIFEY_SYSTEM);
    // The critical assertion: no resource data is passed to the hosted call.
    expect(JSON.stringify(args)).not.toMatch(/Chase Brexton|410-837-2050|Trans Lifeline/);
  });

  it('falls back to LOCAL (not a second cloud) when the hosted call fails', async () => {
    invokeMock.mockRejectedValue(new Error('hosted down'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no ollama')));
    const r = await askWifey('what is a continuance', RES);
    expect(r.source).toBe('guided');
    expect(r.routedHostedButFellBack).toBe(true);
  });
});
