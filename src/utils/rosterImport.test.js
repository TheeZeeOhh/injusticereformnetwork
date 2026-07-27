import { describe, it, expect } from 'vitest';
import { parseRoster } from './rosterImport';

describe('parseRoster', () => {
  it('parses a basic roster with common headers', () => {
    const csv = 'Name,Preferred Name,Phone,SMS Consent\nJordan Ellis,Jay,(410) 555-0142,yes\nMarcus Rivera,Mari,(443) 555-0117,no';
    const { clients, skipped, columns } = parseRoster(csv);
    expect(clients).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(columns).toEqual(expect.arrayContaining(['legalName', 'alias', 'phone', 'smsConsent']));
    expect(clients[0]).toMatchObject({ legalName: 'Jordan Ellis', alias: 'Jay', phone: '(410) 555-0142', smsConsent: true });
    expect(clients[1].smsConsent).toBe(false);
  });

  it('maps varied header aliases (BestNotes-style)', () => {
    const csv = 'Full Name,Cell,Emergency Contact\nDee Okafor,410-555-0173,Partner 410-555-0190';
    const { clients } = parseRoster(csv);
    expect(clients[0]).toMatchObject({ legalName: 'Dee Okafor', phone: '410-555-0173', emergency: 'Partner 410-555-0190' });
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,Emergency Contact\n"Rivera, Marcus","Sister, (410) 555-0188"';
    const { clients } = parseRoster(csv);
    expect(clients[0].legalName).toBe('Rivera, Marcus');
    expect(clients[0].emergency).toBe('Sister, (410) 555-0188');
  });

  it('handles escaped double-quotes', () => {
    const csv = 'Name\n"Some ""Nickname"" Person"';
    expect(parseRoster(csv).clients[0].legalName).toBe('Some "Nickname" Person');
  });

  it('skips rows with no name', () => {
    const csv = 'Name,Phone\nReal Person,555-1\n,555-2\n   ,555-3';
    const { clients, skipped } = parseRoster(csv);
    expect(clients).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('interprets various truthy SMS-consent values', () => {
    const csv = 'Name,SMS\nA,Y\nB,TRUE\nC,1\nD,opt-in\nE,no\nF,';
    const c = parseRoster(csv).clients;
    expect(c.map((x) => x.smsConsent)).toEqual([true, true, true, true, false, false]);
  });

  it('ignores unrecognized columns without erroring', () => {
    const csv = 'Name,Insurance ID,Zip\nJane Doe,XYZ123,21201';
    const { clients, columns } = parseRoster(csv);
    expect(clients[0].legalName).toBe('Jane Doe');
    expect(columns).toEqual(['legalName']); // insurance/zip ignored
  });

  it('strips a BOM and tolerates CRLF', () => {
    const csv = '\uFEFFName,Phone\r\nBOM Person,555-9\r\n';
    expect(parseRoster(csv).clients[0].legalName).toBe('BOM Person');
  });

  it('throws on empty input', () => {
    expect(() => parseRoster('')).toThrow(/empty/i);
    expect(() => parseRoster('   ')).toThrow(/empty/i);
  });

  it('throws when no name column is present', () => {
    expect(() => parseRoster('Phone,Zip\n555,21201')).toThrow(/name column/i);
  });
});
