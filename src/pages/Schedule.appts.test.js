import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveSecureRecord, loadSecureRecord } from '../utils/storageEngine';
import { deriveVaultAKey } from '../utils/cryptoEngine';
import { clearAuditKey } from '../utils/auditLog';

// Contract test for the appointment data that Schedule.jsx writes and both
// Schedule and the SMS reminder (ClientsModule) read: an array under
// 'appointments' in Vault A, each { id, patientId, startTime(ISO), status }.
// Guards against the two ways this broke before: appointments that could not be
// created at all, and a patientId shape the reminder matcher can't resolve.

const STRONG = 'correct horse battery staple gymnasium';
const APPTS_ID = 'appointments';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// The exact filter ClientsModule uses to find a client's next appointment.
function matcherFinds(appts, clientId) {
  const bareId = clientId.replace('client_', '');
  return appts.filter((a) => a.patientId === clientId || a.patientId === bareId);
}

describe('appointment creation storage contract', () => {
  let key;
  beforeEach(async () => {
    installLocalStorage();
    indexedDB = new IDBFactory();
    clearAuditKey();
    key = await deriveVaultAKey(STRONG);
  });

  it('round-trips a created appointment through Vault A', async () => {
    const appt = {
      id: `appt_${crypto.randomUUID()}`,
      patientId: 'client_PT-1234',
      startTime: new Date('2026-08-01T15:30:00Z').toISOString(),
      status: 'Scheduled',
    };
    await saveSecureRecord(key, APPTS_ID, [appt], 'A');
    const loaded = await loadSecureRecord(key, APPTS_ID, 'A');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].patientId).toBe('client_PT-1234');
    expect(loaded[0].id).toMatch(/^appt_/);
    expect(() => new Date(loaded[0].startTime).toISOString()).not.toThrow();
  });

  it('stores a patientId the reminder matcher can resolve', async () => {
    const appt = {
      id: `appt_${crypto.randomUUID()}`,
      patientId: 'client_PT-9', // full id, as Schedule writes it
      startTime: new Date('2026-08-02T10:00:00Z').toISOString(),
      status: 'Confirmed',
    };
    await saveSecureRecord(key, APPTS_ID, [appt], 'A');
    const loaded = await loadSecureRecord(key, APPTS_ID, 'A');
    expect(matcherFinds(loaded, 'client_PT-9')).toHaveLength(1);
  });

  it('keeps appointments ordered by start time', async () => {
    const mk = (iso) => ({ id: `appt_${crypto.randomUUID()}`, patientId: 'client_PT-1', startTime: new Date(iso).toISOString(), status: 'Scheduled' });
    const list = [mk('2026-09-01T09:00:00Z'), mk('2026-08-01T09:00:00Z'), mk('2026-08-15T09:00:00Z')];
    const sorted = [...list].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    await saveSecureRecord(key, APPTS_ID, sorted, 'A');
    const loaded = await loadSecureRecord(key, APPTS_ID, 'A');
    const times = loaded.map((a) => a.startTime);
    expect(times).toEqual([...times].sort());
  });

  it('supports cancel (removal) by id', async () => {
    const a = { id: 'appt_a', patientId: 'client_PT-1', startTime: new Date().toISOString(), status: 'Scheduled' };
    const b = { id: 'appt_b', patientId: 'client_PT-2', startTime: new Date().toISOString(), status: 'Scheduled' };
    await saveSecureRecord(key, APPTS_ID, [a, b], 'A');
    const remaining = [a, b].filter((x) => x.id !== 'appt_a');
    await saveSecureRecord(key, APPTS_ID, remaining, 'A');
    const loaded = await loadSecureRecord(key, APPTS_ID, 'A');
    expect(loaded.map((x) => x.id)).toEqual(['appt_b']);
  });
});
