import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { useLanguage } from '../i18n/LanguageContext';
import { saveBytes } from '../utils/download';

export default function FOIAGenerator() {
  const { t } = useLanguage();
  const [agency, setAgency] = useState('NYPD');
  const [incidentDate, setIncidentDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const generateFOIA = (e) => {
    e.preventDefault();

    if (!clientName.trim() || !incidentDate.trim()) {
      setErrorMessage(t('foia.errNeedFields'));
      return;
    }
    setErrorMessage('');

    // Build the exact same letter text shown in the on-screen Document Preview.
    const letter =
      `Date: ${new Date().toLocaleDateString()}\n` +
      `To: FOIA Officer, ${agency}\n` +
      `Subject: Freedom of Information Law Request\n\n` +
      `Dear FOIA Officer,\n\n` +
      `Under the Freedom of Information Law, I am requesting access to records pertaining to an incident involving ${clientName} that occurred on ${incidentDate}.\n\n` +
      `Please include all arrest reports, body-worn camera (BWC) footage, and disciplinary records for any officers involved${badgeNumber ? ` (including Shield #${badgeNumber})` : ''}.\n\n` +
      `Sincerely,\n` +
      `Injustice Reform Network (IRN) Legal Advocacy`;

    const doc = new jsPDF();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(letter, 170);
    doc.text(splitText, 20, 20);

    const safeAgency = agency.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const safeDate = incidentDate.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    // doc.save() uses a blob-anchor download that the Tauri webview drops; route
    // the PDF bytes through the native save helper instead.
    saveBytes(new Uint8Array(doc.output('arraybuffer')), `FOIA_Request_${safeAgency}_${safeDate}.pdf`);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>{t('foia.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          {t('foia.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', flex: 1 }}>
        <form onSubmit={generateFOIA} className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'var(--charcoal)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('foia.targetAgency')}</label>
            <select value={agency} onChange={e => setAgency(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px' }}>
              <option>NYPD</option>
              <option>BOP (Bureau of Prisons)</option>
              <option>ICE</option>
              <option>Department of Corrections</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('foia.clientName')}</label>
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t('foia.clientNamePlaceholder')} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('foia.incidentDate')}</label>
            <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('foia.badgeNumber')}</label>
            <input type="text" value={badgeNumber} onChange={e => setBadgeNumber(e.target.value)} placeholder={t('foia.badgePlaceholder')} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px' }} />
          </div>
          {errorMessage && (
            <p style={{ color: 'var(--danger, #e05555)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', margin: 0 }}>
              {errorMessage}
            </p>
          )}
          <button type="submit" className="btn-primary" style={{ padding: '1rem', background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold', marginTop: '1rem' }}>
            {t('foia.generate')}
          </button>
        </form>

        <div className="glass-panel" style={{ padding: '2rem', background: 'var(--charcoal-dark)', overflowY: 'auto' }}>
          <h3 style={{ color: 'var(--bone)', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: '0 0 1rem 0' }}>{t('foia.previewHeading')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', margin: '0 0 1rem 0', opacity: 0.8 }}>{t('foia.previewNote')}</p>
          <div style={{ background: '#fff', color: '#000', padding: '2rem', fontFamily: 'serif', fontSize: '0.9rem', lineHeight: '1.6', minHeight: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
            <p><strong>To:</strong> FOIA Officer, {agency}</p>
            <p><strong>Subject:</strong> Freedom of Information Law Request</p>
            <br />
            <p>Dear FOIA Officer,</p>
            <p>Under the Freedom of Information Law, I am requesting access to records pertaining to an incident involving <strong>{clientName || '[CLIENT]'}</strong> that occurred on <strong>{incidentDate || '[DATE]'}</strong>.</p>
            <p>Please include all arrest reports, body-worn camera (BWC) footage, and disciplinary records for any officers involved{badgeNumber ? ` (including Shield #${badgeNumber})` : ''}.</p>
            <br />
            <p>Sincerely,</p>
            <p>Injustice Reform Network (IRN) Legal Advocacy</p>
          </div>
        </div>
      </div>
    </div>
  );
}
