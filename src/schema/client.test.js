import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientSchema } from './client';

// Mock the crypto/vault store so schema behavior is tested in isolation.
vi.mock('../utils/storageEngine', () => ({
  saveSecureRecord: vi.fn().mockResolvedValue(true),
  loadSecureRecord: vi.fn(),
}));

import { saveClientRecord, loadClientRecord } from './index';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';

const FULL = {
  legalName: 'Jordan Ellis', alias: 'Jay', phone: '(410) 555-0142',
  emergency: 'Sister', smsConsent: true, photo: '',
  pronouns: ['they/them'], pronounsSelfDescribe: '',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('ClientSchema', () => {
  it('parses a full valid client unchanged', () => {
    const r = ClientSchema.parse(FULL);
    expect(r).toMatchObject(FULL);
  });

  it('applies defaults for a legacy record missing newer fields', () => {
    // A record saved before pronouns/photo existed.
    const legacy = { legalName: 'Old Client', alias: '', phone: '', emergency: '', smsConsent: false };
    const r = ClientSchema.parse(legacy);
    expect(r.pronouns).toEqual([]);
    expect(r.photo).toBe('');
    expect(r.pronounsSelfDescribe).toBe('');
  });

  it('preserves unknown keys (passthrough — never drops client data)', () => {
    const r = ClientSchema.parse({ ...FULL, futureField: 'keep me' });
    expect(r.futureField).toBe('keep me');
  });

  it('rejects a malformed record (pronouns as a string)', () => {
    expect(ClientSchema.safeParse({ ...FULL, pronouns: 'they/them' }).success).toBe(false);
  });
});

describe('saveClientRecord (fail-closed)', () => {
  it('validates then encrypts a good record', async () => {
    await saveClientRecord('key', 'client_1', FULL, 'A');
    expect(saveSecureRecord).toHaveBeenCalledOnce();
    const [, id, payload, tag] = saveSecureRecord.mock.calls[0];
    expect(id).toBe('client_1');
    expect(tag).toBe('A');
    expect(payload.pronouns).toEqual(['they/them']);
  });

  it('THROWS and never writes when the record is malformed', async () => {
    await expect(
      saveClientRecord('key', 'client_1', { ...FULL, pronouns: 42 }, 'A')
    ).rejects.toThrow(/schema validation/i);
    expect(saveSecureRecord).not.toHaveBeenCalled();
  });
});

describe('loadClientRecord (fail-open)', () => {
  it('returns null for a missing record', async () => {
    loadSecureRecord.mockResolvedValueOnce(null);
    expect(await loadClientRecord('key', 'nope', 'A')).toBeNull();
  });

  it('returns normalized data for a valid stored record', async () => {
    loadSecureRecord.mockResolvedValueOnce({ legalName: 'Old', alias: '', phone: '', emergency: '', smsConsent: false });
    const r = await loadClientRecord('key', 'client_1', 'A');
    expect(r.pronouns).toEqual([]); // default applied
  });

  it('returns the RAW object (not throw) when stored data fails the schema', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { legalName: 'X', pronouns: 'they/them' }; // pronouns wrong type
    loadSecureRecord.mockResolvedValueOnce(broken);
    const r = await loadClientRecord('key', 'client_1', 'A');
    expect(r).toBe(broken);      // raw, unmodified — no data lost
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
