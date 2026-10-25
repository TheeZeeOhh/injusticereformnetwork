/**
 * IRN paste guard — what the browser add-on treats as client information.
 *
 * detect.js is a content script, not a module, so it is evaluated in a vm
 * context the same way Firefox evaluates it. Every sample below is synthetic:
 * invented numbers in valid shapes, no real person's data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = '../../os/config/includes.chroot/usr/local/share/irn-browser/';
const read = (f) => readFileSync(new URL(dir + f, import.meta.url), 'utf8');

const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(read('paste-guard/detect.js'), sandbox);
const { findPHI, isAllowed } = sandbox.irnPasteGuard;
const kinds = (t) => findPHI(t).map((f) => f.kind);

describe('findPHI — identifiers are caught', () => {
  it('catches a separated SSN, and a bare one only when labelled', () => {
    expect(kinds('client SSN is 123-45-6789 per intake')).toContain('ssn');
    expect(kinds('123 45 6789')).toContain('ssn');
    expect(kinds('SSN: 123456789')).toContain('ssn');
    expect(kinds('Social Security Number 123456789')).toContain('ssn');
  });

  it('ignores numbers that are never issued as SSNs', () => {
    for (const t of ['000-12-3456', '666-12-3456', '900-12-3456', '123-00-4567', '123-45-0000']) {
      expect(kinds(t), t).not.toContain('ssn');
    }
  });

  it('catches a date of birth in the common written forms', () => {
    for (const t of ['DOB: 04/12/1991', 'date of birth 1991-04-12', 'born on March 3, 1988', 'D.O.B. 4.12.91']) {
      expect(kinds(t), t).toContain('dob');
    }
  });

  it('catches record, Medicare, Medicaid and diagnosis numbers by their label', () => {
    expect(kinds('MRN 00482913')).toContain('mrn');
    expect(kinds('Patient ID: A-77120')).toContain('mrn');
    expect(kinds('1EG4TE5MK73')).toContain('mbi');
    expect(kinds('Medicaid ID 830412991')).toContain('member');
    expect(kinds('Dx: F11.20')).toContain('icd');
  });

  it('flags a health detail only when it sits next to who it is about', () => {
    expect(kinds('started estradiol in May, reach her at 757-555-0142')).toContain('health');
    expect(kinds('DOB 01/02/1990, on Suboxone')).toEqual(['dob', 'health']);
    expect(kinds('jane.doe@example.org methadone clinic intake')).toContain('health');
  });
});

describe('findPHI — research is left alone', () => {
  it('does not flag ordinary legal and health research', () => {
    for (const t of [
      'methadone clinic hours in Norfolk',
      '42 CFR Part 2 court order requirements for substance use records',
      'Virginia HB 691 gender-affirming care',
      'case no. 2026-CR-001234 hearing set for 10/20/2026',
      'call the clerk at 757-555-0100',
      'ICD-10 lookup tool',
      'Born to Run by Bruce Springsteen',
      'MRN format documentation',
      'FOIA tracking number 123456789',
      'routing 234561234 for the filing fee',
    ]) {
      expect(findPHI(t), t).toEqual([]);
    }
  });

  it('never returns the matched text, only what kind it was', () => {
    const out = JSON.stringify(findPHI('SSN 123-45-6789, DOB 04/12/1991'));
    expect(out).not.toContain('6789');
    expect(out).not.toContain('1991');
  });

  it('copes with junk input', () => {
    expect(findPHI(null)).toEqual([]);
    expect(findPHI('')).toEqual([]);
    expect(findPHI('x'.repeat(500000))).toEqual([]);
  });
});

describe('isAllowed — where client information may go', () => {
  it('always allows this machine, where Sanctuary runs', () => {
    expect(isAllowed('http://localhost:5173/intake')).toBe(true);
    expect(isAllowed('http://127.0.0.1:5000/')).toBe(true);
    expect(isAllowed('file:///home/x/notes.html')).toBe(true);
  });

  it('allows a policy origin exactly, never a lookalike', () => {
    const allow = ['https://ehr.example.org'];
    expect(isAllowed('https://ehr.example.org/chart/1', allow)).toBe(true);
    expect(isAllowed('https://ehr.example.org.evil.test/', allow)).toBe(false);
    expect(isAllowed('http://ehr.example.org/', allow)).toBe(false);
    expect(isAllowed('https://mail.google.com/', allow)).toBe(false);
    expect(isAllowed('not a url', allow)).toBe(false);
  });
});

describe('the add-on as shipped', () => {
  const manifest = JSON.parse(read('paste-guard/manifest.json'));
  const policies = JSON.parse(read('policies.json')).policies;
  const guard = read('paste-guard/guard.js');

  it('asks for no permission beyond reading its policy', () => {
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.content_scripts[0].js).toEqual(['detect.js', 'guard.js']);
    expect(manifest.browser_specific_settings.gecko.id).toBe('paste-guard@irn.local');
  });

  it('sends nothing, stores nothing and builds no HTML from page text', () => {
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'localStorage',
                       'sessionStorage', 'indexedDB', 'storage.local', 'storage.sync', 'innerHTML',
                       'console.log', 'runtime.sendMessage']) {
      expect(guard.includes(bad), bad).toBe(false);
    }
  });

  it('is force-installed by policy from a root-owned path, with an empty allow list', () => {
    const e = policies.ExtensionSettings['paste-guard@irn.local'];
    expect(e.installation_mode).toBe('force_installed');
    expect(e.install_url).toBe('file:///usr/local/lib/irn-browser/paste-guard.xpi');
    expect(policies['3rdparty'].Extensions['paste-guard@irn.local'].allow).toEqual([]);
  });
});
