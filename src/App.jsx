import React, { useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import NoteTemplates from './pages/NoteTemplates';
import DischargeGenerator from './pages/DischargeGenerator';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Login from './pages/Login';
import { useAuthStore } from './store/authStore';
import { vaultExists } from './utils/cryptoEngine';
import './index.css';

function DashboardHome() {
  const user = useAuthStore(state => state.user);
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Clinical Overview</h1>
        <p>Welcome back, {user?.username}. Here is what is happening today.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card glass-panel">
          <span className="stat-title">Active Patients</span>
          <span className="stat-value">1,248</span>
          <span className="stat-change positive">↑ 12% this month</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="stat-title">Pending Reviews</span>
          <span className="stat-value">34</span>
          <span className="stat-change negative">↓ 5% this week</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="stat-title">Staff Available</span>
          <span className="stat-value">42</span>
          <span className="stat-change positive">Optimal coverage</span>
        </div>
      </div>

      <div className="data-section">
        <div className="data-panel glass-panel">
          <h2>Recent Patient Activity</h2>
          <div className="patient-list">
            <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              No recent activity. Client records live encrypted in your vault — open <strong>Clients</strong> to begin.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import ClientsModule from './pages/ClientsModule';
import ShiftSwaps from './pages/ShiftSwaps';
import IntelligenceLayer from './pages/IntelligenceLayer';
import MedicationManagement from './pages/MedicationManagement';
import OnCallDashboard from './pages/OnCallDashboard';
import StaffingKanban from './pages/StaffingKanban';
import DocumentLibrary from './pages/DocumentLibrary';

import AudioIntake from './pages/AudioIntake';
import Telehealth from './pages/Telehealth';
import UserProfile from './pages/UserProfile';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import HrtTracking from './pages/HrtTracking';
import ConsentManager from './pages/ConsentManager';
import TransportationHub from './pages/TransportationHub';
import VoucherProgram from './pages/VoucherProgram';
import UserManual from './pages/UserManual';
import VisualCanvas from './pages/VisualCanvas';
import FOIAGenerator from './pages/FOIAGenerator';
import EvidenceVault from './pages/EvidenceVault';
import AttorneyDirectory from './pages/AttorneyDirectory';

const GlobalTicker = () => (
  <>
    <div style={{ background: 'var(--charcoal)', color: 'var(--bone)', padding: '0.4rem 1rem', display: 'flex', gap: '2rem', fontSize: '0.85rem', overflow: 'hidden', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', borderTop: '2px solid var(--ember)', zIndex: 9999 }}>
      <div style={{ display: 'flex', gap: '3rem', animation: 'scroll 20s linear infinite' }}>
        <span style={{ color: 'var(--ember)' }}>🚨 [Predictive Interrupter] High-Tension Alert: Crisis detected!</span>
        <span style={{ color: 'var(--gold)' }}>🛡️ [Policy Sentinel] 2026 Civil Monetary Penalty adjustments detected.</span>
        <span style={{ color: 'var(--bone)' }}>🧠 [Clinical Co-Pilot] Clinical Alert: Record flagged for triage!</span>
        <span style={{ color: 'var(--ember)' }}>🔥 [Ember Fund] New revenue swept to Sovereignty Fund.</span>
        
        {/* Duplicated for seamless loop */}
        <span style={{ color: 'var(--ember)' }}>🚨 [Predictive Interrupter] High-Tension Alert: Crisis detected!</span>
        <span style={{ color: 'var(--gold)' }}>🛡️ [Policy Sentinel] 2026 Civil Monetary Penalty adjustments detected.</span>
        <span style={{ color: 'var(--bone)' }}>🧠 [Clinical Co-Pilot] Clinical Alert: Record flagged for triage!</span>
        <span style={{ color: 'var(--ember)' }}>🔥 [Ember Fund] New revenue swept to Sovereignty Fund.</span>
      </div>
    </div>
    <style>{`
      @keyframes scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
    `}</style>
  </>
);

function App() {
  const location = useLocation();
  const { isAuthenticated, isOnboarded, user, logout, vaultBKey, panicWipeVaultB } = useAuthStore();

  // Hardware dead-man's switch: when the Rust poll thread detects the armed USB
  // token was removed, it emits 'usb-disconnect-kill-signal'. We respond by
  // logging out, which zeroes the vault keys held in RAM. Tauri-only.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;
    let unlisten;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen('usb-disconnect-kill-signal', () => {
        logout();
        alert('USB security token removed. All vault keys have been wiped from memory.');
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, [logout]);

  const renderContent = () => {
    // First run on this device (no vault enrolled yet): onboard BEFORE any
    // login/passphrase screen, so the user creates their profile and sets up
    // the vault first. Returning users (a vault exists) go straight to Login.
    if (!isAuthenticated) {
      if (!vaultExists() && !isOnboarded) {
        return <Onboarding />;
      }
      return <Login />;
    }

    return (
      <div className="app-container" style={{ height: '100%' }}>
        {/* Sidebar */}
        <aside className="sidebar glass-panel-dark">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"></div>
            Sanctuary
          </div>
          
          <ul className="nav-links">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
                <span>📊</span> Dashboard
              </li>
            </Link>
            <Link to="/clients" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/clients' ? 'active' : ''}`}>
                <span>👥</span> Clients
              </li>
            </Link>
            <Link to="/templates" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/templates' ? 'active' : ''}`}>
                <span>📝</span> Dispatch Log
              </li>
            </Link>
            <Link to="/canvas" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/canvas' ? 'active' : ''}`}>
                <span>🎨</span> Visual Canvas
              </li>
            </Link>
            <Link to="/foia" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/foia' ? 'active' : ''}`}>
                <span>⚖️</span> FOIA Gen
              </li>
            </Link>
            <Link to="/evidence" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/evidence' ? 'active' : ''}`}>
                <span>🔐</span> Evidence Vault
              </li>
            </Link>
            <Link to="/attorneys" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/attorneys' ? 'active' : ''}`}>
                <span>⚖️</span> Attorneys
              </li>
            </Link>
            <Link to="/audio" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/audio' ? 'active' : ''}`}>
                <span>🎙️</span> Audio Intake
              </li>
            </Link>
            <Link to="/telehealth" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/telehealth' ? 'active' : ''}`}>
                <span>📹</span> Telehealth
              </li>
            </Link>
            <Link to="/discharge" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/discharge' ? 'active' : ''}`}>
                <span>📋</span> Discharge Gen
              </li>
            </Link>
            <Link to="/schedule" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/schedule' ? 'active' : ''}`}>
                <span>📅</span> Schedule
              </li>
            </Link>
            <Link to="/shifts" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/shifts' ? 'active' : ''}`}>
                <span>🔄</span> Shift Swaps
              </li>
            </Link>
            <Link to="/messages" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/messages' ? 'active' : ''}`}>
                <span>💬</span> Messages
              </li>
            </Link>
            <Link to="/intelligence" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/intelligence' ? 'active' : ''}`}>
                <span>🧠</span> Intelligence Layer
              </li>
            </Link>
            <Link to="/meds" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/meds' ? 'active' : ''}`}>
                <span>💊</span> Medications
              </li>
            </Link>
            <Link to="/hrt" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/hrt' ? 'active' : ''}`}>
                <span>🏳️‍⚧️</span> HRT Continuity
              </li>
            </Link>
            <Link to="/consent" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/consent' ? 'active' : ''}`}>
                <span>📜</span> Consent (Vault B)
              </li>
            </Link>
            <Link to="/oncall" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/oncall' ? 'active' : ''}`}>
                <span>🚨</span> On-Call Dashboard
              </li>
            </Link>
            <Link to="/staffing" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/staffing' ? 'active' : ''}`}>
                <span>📋</span> Staffing Pipeline
              </li>
            </Link>
            <Link to="/docs" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/docs' ? 'active' : ''}`}>
                <span>📁</span> Document Library
              </li>
            </Link>
            <Link to="/transport" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/transport' ? 'active' : ''}`}>
                <span>🚗</span> Transportation Hub
              </li>
            </Link>
            <Link to="/vouchers" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/vouchers' ? 'active' : ''}`}>
                <span>🎫</span> Voucher Program
              </li>
            </Link>
            <Link to="/manual" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/manual' ? 'active' : ''}`}>
                <span>📘</span> User Manual
              </li>
            </Link>
            <Link to="/onboarding" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/onboarding' ? 'active' : ''}`}>
                <span>🚀</span> Onboarding
              </li>
            </Link>
            <Link to="/settings" style={{ textDecoration: 'none' }}>
              <li className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
                <span>⚙️</span> Settings
              </li>
            </Link>
          </ul>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <header className="topbar glass-panel-dark">
            <div className="search-bar">
              <span>🔍</span>
              <input type="text" placeholder="Search patients, staff, or records..." />
            </div>
            <div className="user-profile">
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{user?.role}</span>
              <button
                className="btn-primary"
                onClick={panicWipeVaultB}
                disabled={!vaultBKey}
                title="BridgeVault closure: instantly wipe the Vault B key from memory"
                style={{ background: vaultBKey ? '#e11d48' : 'var(--charcoal)', color: 'white', fontWeight: 'bold' }}
              >
                {vaultBKey ? '🚨 Close Vault B' : 'Vault B Closed'}
              </button>
              <button className="btn-primary" onClick={logout} style={{ background: 'var(--charcoal)' }}>Logout</button>
              <Link to="/profile" style={{ textDecoration: 'none' }}>
                <div className="avatar" style={{ cursor: 'pointer' }} title="Edit Profile">
                  {user?.username.substring(0, 2).toUpperCase()}
                </div>
              </Link>
            </div>
          </header>

          <div style={{ padding: '1.5rem 3rem' }}>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/clients" element={<ClientsModule />} />
              <Route path="/templates" element={<NoteTemplates />} />
              <Route path="/canvas" element={<VisualCanvas />} />
              <Route path="/foia" element={<FOIAGenerator />} />
              <Route path="/evidence" element={<EvidenceVault />} />
              <Route path="/attorneys" element={<AttorneyDirectory />} />
              <Route path="/audio" element={<AudioIntake />} />
              <Route path="/telehealth" element={<Telehealth />} />
              <Route path="/discharge" element={<DischargeGenerator />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/shifts" element={<ShiftSwaps />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/intelligence" element={<IntelligenceLayer />} />
              <Route path="/meds" element={<MedicationManagement />} />
              <Route path="/hrt" element={<HrtTracking />} />
              <Route path="/consent" element={<ConsentManager />} />
              <Route path="/oncall" element={<OnCallDashboard />} />
              <Route path="/staffing" element={<StaffingKanban />} />
              <Route path="/docs" element={<DocumentLibrary />} />
              <Route path="/transport" element={<TransportationHub />} />
              <Route path="/vouchers" element={<VoucherProgram />} />
              <Route path="/manual" element={<UserManual />} />
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <GlobalTicker />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
