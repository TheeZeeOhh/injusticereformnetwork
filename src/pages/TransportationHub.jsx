import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

export default function TransportationHub() {
  const { vaultAKey } = useAuthStore();
  const [rides, setRides] = useState([]);

  const [isAdding, setIsAdding] = useState(false);
  const [newClient, setNewClient] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newTime, setNewTime] = useState('');

  // Load persisted transport requests on mount
  useEffect(() => {
    async function loadRequests() {
      if (!vaultAKey) return;
      try {
        const stored = await loadSecureRecord(vaultAKey, 'transport_requests', 'A');
        if (stored) setRides(stored);
      } catch (err) {
        console.warn("No transport requests found, using defaults.");
      }
    }
    loadRequests();
  }, [vaultAKey]);

  const persistRides = async (updatedRides) => {
    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, 'transport_requests', updatedRides, 'A');
    } catch (err) {
      console.error("Failed to persist transport requests to vault", err);
    }
  };

  const handleAddRide = async (e) => {
    e.preventDefault();
    if (!newClient.trim() || !newDestination.trim()) return;
    const updatedRides = [{
      id: Date.now(),
      client: newClient,
      destination: newDestination,
      time: newTime || 'ASAP',
      status: 'Pending Driver',
      driver: 'Unassigned'
    }, ...rides];
    setRides(updatedRides);
    setNewClient('');
    setNewDestination('');
    setNewTime('');
    setIsAdding(false);
    await persistRides(updatedRides);
  };

  const dispatchDriver = async (id) => {
    const updatedRides = rides.map(r => r.id === id ? { ...r, status: 'Dispatched', driver: `Mutual Aid Volunteer ${Math.floor(Math.random() * 10) + 1}` } : r);
    setRides(updatedRides);
    await persistRides(updatedRides);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Transportation Hub</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            Coordinate mutual aid drivers and manage emergency transit vouchers.
          </p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>
          {isAdding ? 'Cancel' : '+ Request Transport'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddRide} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', background: 'var(--charcoal)' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Client Name</label>
            <input autoFocus type="text" value={newClient} onChange={e => setNewClient(e.target.value)} placeholder="e.g. David Kim" style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Destination</label>
            <input type="text" value={newDestination} onChange={e => setNewDestination(e.target.value)} placeholder="e.g. Health Clinic" style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ width: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Time</label>
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
            Submit Request
          </button>
        </form>
      )}

      <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Time</th>
              <th style={{ padding: '1rem' }}>Client</th>
              <th style={{ padding: '1rem' }}>Destination</th>
              <th style={{ padding: '1rem' }}>Driver / Resource</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rides.map(ride => (
              <tr key={ride.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{ride.time}</td>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{ride.client}</td>
                <td style={{ padding: '1rem' }}>{ride.destination}</td>
                <td style={{ padding: '1rem', color: ride.driver === 'Unassigned' ? 'var(--ember)' : 'var(--gold)' }}>{ride.driver}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    background: ride.status === 'Completed' ? 'rgba(74, 222, 128, 0.1)' : ride.status === 'Dispatched' ? 'rgba(217, 164, 65, 0.1)' : 'rgba(226, 85, 43, 0.1)', 
                    color: ride.status === 'Completed' ? '#4ade80' : ride.status === 'Dispatched' ? 'var(--gold)' : 'var(--ember)', 
                    padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' 
                  }}>
                    {ride.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  {ride.status === 'Pending Driver' && (
                    <button className="btn-primary" onClick={() => dispatchDriver(ride.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>
                      Dispatch Driver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rides.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>No transport requests today.</div>}
      </div>
    </div>
  );
}
