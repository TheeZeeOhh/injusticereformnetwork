import React from 'react';

export default function DocumentLibrary() {
  const documents = [
    { 
      title: 'Standard Operating Procedures (SOP) 2026', 
      type: 'PDF', 
      size: '2.4 MB', 
      date: 'Oct 10, 2026',
      icon: '📄'
    },
    { 
      title: 'HIPAA Compliance Guidelines v7', 
      type: 'PDF', 
      size: '1.1 MB', 
      date: 'Oct 01, 2026',
      icon: '📄'
    },
    { 
      title: 'Crisis Intervention Flowchart', 
      type: 'PNG', 
      size: '840 KB', 
      date: 'Sep 28, 2026',
      icon: '📄'
    },
    { 
      title: 'Quarterly Staff Meeting Minutes', 
      type: 'DOCX', 
      size: '145 KB', 
      date: 'Sep 15, 2026',
      icon: '📄'
    }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Document Library</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Secure, offline-first file repository.
        </p>
      </div>

      {/* Action Bar */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '500px' }}>
          <input 
            type="text" 
            placeholder="Search documents..." 
            style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--charcoal-lighter)', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <button className="btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
          + Upload Document
        </button>
      </div>

      {/* Document List */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '1rem 0.5rem' }}>Name</th>
              <th style={{ padding: '1rem 0.5rem' }}>Format</th>
              <th style={{ padding: '1rem 0.5rem' }}>Size</th>
              <th style={{ padding: '1rem 0.5rem' }}>Uploaded</th>
              <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'var(--transition-fast)' }} onMouseOver={e => e.currentTarget.style.background = 'var(--charcoal-lighter)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--bone)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{doc.icon}</span> 
                  <span style={{ fontWeight: '500' }}>{doc.title}</span>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>
                  <span style={{ background: 'var(--charcoal)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{doc.type}</span>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>{doc.size}</td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>{doc.date}</td>
                <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>
                  <button style={{ background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: '0.2s' }} onMouseOver={e => { e.target.style.background = 'var(--gold-dim)'; }} onMouseOut={e => { e.target.style.background = 'transparent'; }}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
