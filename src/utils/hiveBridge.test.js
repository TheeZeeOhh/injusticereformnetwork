import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getStateMock, insertMock, flattenMock, getVectorEmbeddingMock, admissionGateMock } =
  vi.hoisted(() => ({
    getStateMock: vi.fn(),
    insertMock: vi.fn(),
    flattenMock: vi.fn(() => []),
    getVectorEmbeddingMock: vi.fn(),
    admissionGateMock: vi.fn(),
  }));

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: getStateMock },
}));

vi.mock('./hiveEngine', () => ({
  hiveMind: { insert: insertMock, flatten: flattenMock },
  getVectorEmbedding: getVectorEmbeddingMock,
  admissionGate: admissionGateMock,
}));

import { handleHiveAdmitRequest } from './hiveBridge';

describe('handleHiveAdmitRequest (hiveBridge)', () => {
  let persistHiveMock;

  beforeEach(() => {
    insertMock.mockReset().mockResolvedValue(undefined);
    flattenMock.mockReset().mockReturnValue([1, 2, 3]);
    getVectorEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    admissionGateMock.mockReset().mockReturnValue({ ok: true, reason: null });
    persistHiveMock = vi.fn().mockResolvedValue(4);
    getStateMock.mockReset().mockReturnValue({ hiveKey: 'fake-hive-key', persistHive: persistHiveMock });
  });

  it('refuses when Vault A is locked, without touching the gate or embeddings', async () => {
    getStateMock.mockReturnValue({ hiveKey: null, persistHive: persistHiveMock });
    const res = await handleHiveAdmitRequest({ key: 'k', sourceText: 'public ground truth' });
    expect(res).toEqual({ ok: false, reason: 'Vault A is locked' });
    expect(admissionGateMock).not.toHaveBeenCalled();
    expect(getVectorEmbeddingMock).not.toHaveBeenCalled();
  });

  it('refuses a candidate missing key or sourceText', async () => {
    await expect(handleHiveAdmitRequest({ sourceText: 'text only' })).resolves.toEqual({
      ok: false,
      reason: 'key and sourceText are both required',
    });
    await expect(handleHiveAdmitRequest({ key: 'key only' })).resolves.toEqual({
      ok: false,
      reason: 'key and sourceText are both required',
    });
  });

  it('respects a gate rejection and never spends an embedding call', async () => {
    admissionGateMock.mockReturnValue({ ok: false, reason: 'person-identifying content' });
    const res = await handleHiveAdmitRequest({ key: 'k', sourceText: 'my client has a hearing' });
    expect(res).toEqual({ ok: false, reason: 'person-identifying content' });
    expect(getVectorEmbeddingMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('admits, persists, and reports the persisted count on success', async () => {
    const res = await handleHiveAdmitRequest({
      key: 'va-filing-rule-x',
      sourceText: 'Norfolk Circuit Court accepts e-filing as of 2026.',
      isPattern: true,
      sourceCount: 5,
      lastVerifiedBy: 'norfolk navigator',
    });
    expect(insertMock).toHaveBeenCalledWith(
      'va-filing-rule-x',
      [0.1, 0.2],
      expect.any(Number),
      expect.objectContaining({ sourceText: expect.any(String), isPattern: true, sourceCount: 5 })
    );
    expect(persistHiveMock).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, admitted: 4 });
  });

  it('falls back to the in-RAM count when persist reports not-logged-in (false)', async () => {
    persistHiveMock.mockResolvedValue(false);
    const res = await handleHiveAdmitRequest({ key: 'k', sourceText: 'public ground truth' });
    expect(res).toEqual({ ok: true, admitted: 3 }); // flattenMock() -> [1,2,3]
  });

  it('surfaces a re-gate rejection thrown by insert() itself, not just the precheck', async () => {
    insertMock.mockRejectedValue(new Error('hive-mind admission REJECTED: below source floor'));
    const res = await handleHiveAdmitRequest({ key: 'k', sourceText: 'public ground truth' });
    expect(res).toEqual({ ok: false, reason: 'hive-mind admission REJECTED: below source floor' });
  });
});
