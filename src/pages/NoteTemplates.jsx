import React, { useState } from 'react';

export default function NoteTemplates() {
  const [noteContent, setNoteContent] = useState('');
  const [linkedCases, setLinkedCases] = useState([]);
  const [nestedTags, setNestedTags] = useState([]);
  const [showLinkHelper, setShowLinkHelper] = useState(false);

  // Mock Database of objects for the "Structured Objects" & "Bidirectional Linking" features
  const mockDatabase = [
    { id: 'CASE-001', title: 'FOIA Request - BPD Bodycam' },
    { id: 'CASE-002', title: 'Reentry Housing - Case #002' },
    { id: 'COURT-88', title: 'Eviction Injunction Hearing' }
  ];

  const handleInput = (e) => {
    const val = e.target.value;
    setNoteContent(val);

    // Detect Obsidian-style [[ linking
    if (val.endsWith('[[')) {
      setShowLinkHelper(true);
    } else if (!val.includes('[[')) {
      setShowLinkHelper(false);
    }

    // Detect Bear-style #nested/tags
    const tagMatches = val.match(/#[\w/]+/g);
    if (tagMatches) {
      setNestedTags([...new Set(tagMatches)]);
    } else {
      setNestedTags([]);
    }
  };

  const insertLink = (objectTitle) => {
    const updatedContent = noteContent.replace(/\[\[$/, `[[${objectTitle}]] `);
    setNoteContent(updatedContent);
    setLinkedCases(prev => [...new Set([...prev, objectTitle])]);
    setShowLinkHelper(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Knowledge & Linking System</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Daily Dispatch Rollup. Type <strong>[[</strong> to bidirectionally link cases/staff. Type <strong>#</strong> for nested tags.
        </p>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '2rem' }}>
        
        {/* Editor Block */}
        <div className="glass-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: '2rem', position: 'relative' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <span style={{ color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>📄 Note: July 12, 2026</span>
            <button className="btn-primary" style={{ padding: '0.25rem 1rem', fontSize: '0.75rem' }}>Save to Vault</button>
          </div>

          <textarea
            value={noteContent}
            onChange={handleInput}
            placeholder="e.g. Discussed [[CASE-002]] with [[STAFF-12]]. Needs #housing/lease/urgent follow-up."
            style={{
              width: '100%', flex: 1, padding: '1rem', background: 'transparent', color: 'var(--bone)',
              border: 'none', outline: 'none', fontSize: '1rem', fontFamily: 'var(--font-mono)',
              lineHeight: '1.6', resize: 'none'
            }}
          />

          {/* Pop-up Link Helper */}
          {showLinkHelper && (
            <div style={{
              position: 'absolute', top: '120px', left: '2rem',
              background: 'var(--charcoal)', border: '1px solid var(--gold)', borderRadius: '4px',
              boxShadow: 'var(--shadow-lg)', zIndex: 10, width: '350px',
              fontFamily: 'var(--font-mono)'
            }}>
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', background: 'var(--charcoal-light)' }}>
                Select Object to Link...
              </div>
              {mockDatabase.map(obj => (
                <div 
                  key={obj.id} 
                  onClick={() => insertLink(obj.title)}
                  style={{ padding: '0.75rem 1rem', cursor: 'pointer', color: 'var(--bone)', transition: 'background 0.2s', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--charcoal-lighter)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <strong style={{ color: 'var(--gold)' }}>{obj.id}</strong> <br/>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{obj.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar: Backlinks & Graph */}
        <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
          
          {/* Visual Graph View */}
          <div>
            <h3 style={{ color: 'var(--gold)', marginBottom: '1rem', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              🕸️ Local Graph
            </h3>
            
            <div style={{ height: '200px', background: 'var(--charcoal-lighter)', borderRadius: '4px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
              <svg width="100%" height="100%">
                {/* Lines */}
                {linkedCases.map((_, i) => (
                  <line key={i} x1="50%" y1="50%" x2={`${20 + (i * 30)}%`} y2={`${20 + (i * 20)}%`} stroke="var(--gold)" strokeWidth="1" strokeDasharray="4" />
                ))}
                
                {/* Central Node (This Note) */}
                <circle cx="50%" cy="50%" r="8" fill="var(--ember)" />
                <text x="50%" y="40%" fill="var(--bone)" fontSize="10" textAnchor="middle" fontFamily="monospace">July 12</text>
                
                {/* Linked Nodes */}
                {linkedCases.map((link, i) => (
                  <g key={i}>
                    <circle cx={`${20 + (i * 30)}%`} cy={`${20 + (i * 20)}%`} r="6" fill="var(--gold)" />
                    <text x={`${20 + (i * 30)}%`} y={`${15 + (i * 20)}%`} fill="var(--text-secondary)" fontSize="10" textAnchor="middle" fontFamily="monospace">{link.substring(0, 10)}...</text>
                  </g>
                ))}
              </svg>
              {linkedCases.length === 0 && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                  Start linking to build graph
                </div>
              )}
            </div>
          </div>

          {/* Backlinks */}
          <div>
            <h3 style={{ color: 'var(--gold)', marginBottom: '1rem', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              🔗 Linked References
            </h3>
            {linkedCases.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>No bidirectional links established.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {linkedCases.map((link, idx) => (
                  <div key={idx} style={{ background: 'var(--charcoal)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--gold)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>References:</span> <strong style={{ color: 'var(--bone)' }}>{link}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nested Tags */}
          <div>
            <h3 style={{ color: 'var(--gold)', marginBottom: '1rem', fontFamily: 'var(--font-serif)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              🏷️ Nested Hierarchy
            </h3>
            {nestedTags.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>No nested tags detected.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {nestedTags.map((tag, idx) => {
                  const parts = tag.split('/');
                  return (
                    <div key={idx} style={{ background: 'var(--charcoal)', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)' }}>
                      {parts.map((p, i) => (
                        <span key={i}>
                          {i > 0 && <span style={{ color: 'var(--text-tertiary)', margin: '0 4px' }}>/</span>}
                          <span style={{ color: i === parts.length - 1 ? 'var(--ember)' : 'var(--text-secondary)' }}>{p}</span>
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Structured Objects Info */}
          <div style={{ marginTop: 'auto', background: 'var(--charcoal)', padding: '1rem', borderRadius: '4px', border: '1px dashed var(--gold)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-mono)', lineHeight: '1.5' }}>
              <strong>Zero-Schema Active:</strong> Entities linked here are treated as graph nodes (Cases, Staff, FOIA), bypassing rigid RDBMS schemas.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
