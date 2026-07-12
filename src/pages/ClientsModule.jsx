import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

export default function ClientsModule() {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail'
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const { vaultAKey } = useAuthStore();
  
  // Directory of all clients
  const [clientDirectory, setClientDirectory] = useState([]);

  // Active client details
  const [clientData, setClientData] = useState({
    legalName: '',
    alias: '',
    phone: '',
    emergency: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  // Load directory on mount
  useEffect(() => {
    async function loadDirectory() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (dir) setClientDirectory(dir);
      } catch (err) {
        console.warn("No client directory found, using default.");
      }
    }
    loadDirectory();
  }, [vaultAKey]);

  // Load active client data when selected
  useEffect(() => {
    async function loadActiveClient() {
      if (!vaultAKey || !activeClientId) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, activeClientId, 'A');
        if (stored) {
          setClientData(stored);
        } else {
          // New blank client
          setClientData({ legalName: 'New Client', alias: '', phone: '', emergency: '' });
        }
      } catch (err) {
        console.error("Failed to load secure client record", err);
      }
    }
    loadActiveClient();
  }, [vaultAKey, activeClientId]);

  const handleSaveToVault = async () => {
    if (!vaultAKey || !activeClientId) return;
    setIsSaving(true);
    try {
      // Save client profile
      await saveSecureRecord(vaultAKey, activeClientId, clientData, 'A');
      
      // Update & Save directory
      const updatedDir = [...clientDirectory];
      const existing = updatedDir.find(c => c.id === activeClientId);
      if (existing) {
        existing.name = clientData.legalName || 'Unnamed Client';
      } else {
        updatedDir.push({ id: activeClientId, name: clientData.legalName || 'Unnamed Client', status: 'Active' });
      }
      setClientDirectory(updatedDir);
      await saveSecureRecord(vaultAKey, 'client_directory', updatedDir, 'A');
      
      alert('Client securely saved to local IndexedDB Vault.');
    } catch (err) {
      alert('Failed to save to vault: ' + err.message);
    }
    setIsSaving(false);
  };

  const handleCreateNewClient = () => {
    const newId = `client_PT-${Math.floor(Math.random() * 10000)}`;
    setActiveClientId(newId);
    setClientData({ legalName: 'New Client', alias: '', phone: '', emergency: '' });
    setActiveTab('profile');
    setViewMode('detail');
  };

  const openClient = (id) => {
    setActiveClientId(id);
    setActiveTab('profile');
    setViewMode('detail');
  };

  const tabs = [
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'health', icon: '⚕️', label: 'Health & Meds' },
    { id: 'housing', icon: '🏠', label: 'Housing' },
    { id: 'canvas', icon: '🎨', label: 'Visual Canvas' }
  ];

  if (viewMode === 'list') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-serif)' }}>Client Directory</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Secure offline registry</p>
          </div>
          <button className="btn-primary" onClick={handleCreateNewClient} style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>
            + Add New Client
          </button>
        </div>

        <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '1rem' }}>Client ID</th>
                <th style={{ padding: '1rem' }}>Legal Name</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clientDirectory.map(client => (
                <tr key={client.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                  <td style={{ padding: '1rem', color: 'var(--gold)' }}>{client.id.replace('client_', '')}</td>
                  <td style={{ padding: '1rem' }}>{client.name}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' }}>
                      {client.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button className="btn-primary" onClick={() => openClient(client.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal)', border: '1px solid var(--border-color)' }}>
                      Open Chart
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

  // DETAIL MODE
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      {/* Client Header */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
            ← Back
          </button>
          <div className="avatar" style={{ width: '56px', height: '56px', fontSize: '1.5rem', background: 'var(--color-secondary)' }}>
            {clientData.legalName ? clientData.legalName.substring(0, 2).toUpperCase() : '??'}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--bone)', fontFamily: 'var(--font-serif)' }}>
              {clientData.legalName} <span style={{ fontSize: '0.8rem', background: 'var(--charcoal)', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{activeClientId.replace('client_', '')}</span>
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={handleSaveToVault} disabled={isSaving} style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
            {isSaving ? 'Encrypting...' : 'Save to Vault'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--charcoal-lighter)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ 
              flex: 1, padding: '0.75rem', background: activeTab === tab.id ? 'var(--charcoal)' : 'transparent', 
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', 
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: '0.2s', borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        
        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Client Profile</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Legal Name</label><input type="text" value={clientData.legalName} onChange={e => setClientData({...clientData, legalName: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chosen Name / Alias</label><input type="text" value={clientData.alias} onChange={e => setClientData({...clientData, alias: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Contact Number</label><input type="text" value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
              <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Emergency Contact</label><input type="text" value={clientData.emergency} onChange={e => setClientData({...clientData, emergency: e.target.value})} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}/></div>
            </div>
          </div>
        )}

        {/* HEALTH */}
        {activeTab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Health (Vault B)</h2>
            <div style={{ background: 'rgba(225, 29, 72, 0.1)', padding: '1rem', borderLeft: '3px solid #e11d48', color: 'var(--bone)', fontFamily: 'var(--font-mono)' }}>
              This tab is locked behind Vault B 42-CFR protections. Mocked for preview.
            </div>
          </div>
        )}

        {/* HOUSING */}
        {activeTab === 'housing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', margin: 0, fontFamily: 'var(--font-serif)' }}>Housing Tracker</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>Current Status: <strong style={{ color: 'var(--ember)' }}>Pending Vouchers</strong></p>
          </div>
        )}

        {/* VISUAL CANVAS TIMELINE */}
        {activeTab === 'canvas' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>Visual Case Canvas</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--charcoal)', border: '1px solid var(--border-color)' }}>+ Add Node</button>
              </div>
            </div>
            
            <div style={{ 
              flex: 1, 
              background: 'var(--charcoal-light)', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)',
              position: 'relative',
              overflow: 'hidden',
              backgroundImage: 'radial-gradient(var(--border-color) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}>
               <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                  Canvas Engine Loading...
                </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
