import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord } from '../utils/storageEngine';

export default function DischargeGenerator() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [generatedSummary, setGeneratedSummary] = useState('');
  const { vaultAKey } = useAuthStore();

  // Load the client roster from the local encrypted vault (never the plaintext server).
  useEffect(() => {
    async function loadDirectory() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (dir) setPatients(dir);
      } catch (err) {
        console.warn('No encrypted client directory available yet.');
      }
    }
    loadDirectory();
  }, [vaultAKey]);

  const handleGenerate = async () => {
    if (!selectedPatient) return;
    // Pull the full decrypted client record from the local vault on demand.
    let patient = patients.find(p => p.id === selectedPatient);
    try {
      const record = await loadSecureRecord(vaultAKey, selectedPatient, 'A');
      if (record) {
        patient = { ...patient, name: record.legalName || patient?.name, status: record.status || patient?.status };
      }
    } catch (err) {
      console.warn('Could not load full client record; using directory summary.');
    }
    
    // Simulate AI discharge generation
    setGeneratedSummary(`Clinical Discharge Summary\n\nPatient Name: ${patient?.name}\nDate: ${new Date().toLocaleDateString()}\nStatus: ${patient?.status}\n\nClinical Overview:\nPatient has successfully completed their treatment plan and met all primary milestones. They report feeling stable and have demonstrated consistent improvement across all domains.\n\nRecommendations:\nFollow-up with PCP in 30 days. Maintain community support connections.\n\nClinician Signature: _______________________`);
  };

  const handleExportPDF = () => {
    if (!generatedSummary) return;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Sanctuary Health", 20, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    
    // Split text to fit within page width
    const splitText = doc.splitTextToSize(generatedSummary, 170);
    doc.text(splitText, 20, 40);
    
    doc.save('discharge_summary.pdf');
  };

  return (
    <div className="data-panel glass-panel">
      <h2>Discharge Generator</h2>
      <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
        Select a patient to automatically generate a clinical discharge summary based on their case history.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <select 
          value={selectedPatient} 
          onChange={e => setSelectedPatient(e.target.value)}
          style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', flex: 1 }}
        >
          <option value="">-- Select Patient --</option>
          {patients.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={handleGenerate} className="btn-primary">Generate Summary</button>
      </div>

      {generatedSummary && (
        <div style={{ background: 'var(--bg-color-surface)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: '1.6' }}>
            {generatedSummary}
          </pre>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <button className="btn-primary" onClick={handleExportPDF} style={{ background: 'var(--color-secondary)' }}>Export PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}
