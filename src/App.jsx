import React, { useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import NoteTemplates from './pages/NoteTemplates';
import DischargeGenerator from './pages/DischargeGenerator';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Login from './pages/Login';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { vaultExists, vaultBEnrolled } from './utils/cryptoEngine';
import { needsVaultBRekey } from './utils/migrationEngine';
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
import ResourceNavigator from './pages/ResourceNavigator';
import TransportationHub from './pages/TransportationHub';
import VoucherProgram from './pages/VoucherProgram';
import UserManual from './pages/UserManual';
import VisualCanvas from './pages/VisualCanvas';
import FOIAGenerator from './pages/FOIAGenerator';
import EvidenceVault from './pages/EvidenceVault';
import AttorneyDirectory from './pages/AttorneyDirectory';

// Cycle through the theme accent colors so the marquee keeps its multicolor look
// regardless of how many messages the user configures.
const TICKER_COLORS = ['var(--ember)', 'var(--gold)', 'var(--bone)'];

const GlobalTicker = () => {
  const ticker = useSettingsStore(state => state.ticker);

  if (!ticker.enabled || ticker.messages.length === 0) return null;

  // Duplicate the message set so the -50% keyframe loops seamlessly.
  const loop = [...ticker.messages, ...ticker.messages];

  return (
    <>
      <div style={{ background: 'var(--charcoal)', color: 'var(--bone)', padding: '0.4rem 1rem', display: 'flex', gap: '2rem', fontSize: '0.85rem', overflow: 'hidden', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', borderTop: '2px solid var(--ember)', zIndex: 9999 }}>
        <div style={{ display: 'flex', gap: '3rem', animation: `scroll ${ticker.speed}s linear infinite` }}>
          {loop.map((msg, i) => (
            <span key={i} style={{ color: TICKER_COLORS[i % TICKER_COLORS.length] }}>{msg}</span>
          ))}
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
};

// Grouped sidebar navigation. Sections make ~25 modules findable, and pull the
// sensitive (Vault B / 42 CFR Part 2) modules into their own clearly-labelled
// group so the security boundary is visible in the UI.
const NAV_GROUPS = [
  {
    title: 'Client Care',
    items: [
      { to: '/', icon: '📊', label: 'Dashboard' },
      { to: '/clients', icon: '👥', label: 'Clients' },
      { to: '/meds', icon: '💊', label: 'Medications' },
      { to: '/discharge', icon: '📋', label: 'Discharge Gen' },
      { to: '/telehealth', icon: '📹', label: 'Telehealth' },
      { to: '/audio', icon: '🎙️', label: 'Audio Intake' }
    ]
  },
  {
    title: 'Sensitive · Vault B (42 CFR)',
    items: [
      { to: '/hrt', icon: '🏳️‍⚧️', label: 'HRT Continuity' },
      { to: '/consent', icon: '📜', label: 'Consent' }
    ]
  },
  {
    title: 'Resources & Docs',
    items: [
      { to: '/resources', icon: '🏳️‍🌈', label: 'Resource Navigator' },
      { to: '/docs', icon: '📁', label: 'Document Library' },
      { to: '/evidence', icon: '🔐', label: 'Evidence Vault' },
      { to: '/vouchers', icon: '🎫', label: 'Voucher Program' },
      { to: '/transport', icon: '🚗', label: 'Transportation Hub' }
    ]
  },
  {
    title: 'Legal & Advocacy',
    items: [
      { to: '/foia', icon: '⚖️', label: 'FOIA Gen' },
      { to: '/attorneys', icon: '⚖️', label: 'Attorneys' },
      { to: '/canvas', icon: '🎨', label: 'Visual Canvas' }
    ]
  },
  {
    title: 'Operations & Staff',
    items: [
      { to: '/schedule', icon: '📅', label: 'Schedule' },
      { to: '/shifts', icon: '🔄', label: 'Shift Swaps' },
      { to: '/staffing', icon: '📋', label: 'Staffing Pipeline' },
      { to: '/oncall', icon: '🚨', label: 'On-Call Dashboard' },
      { to: '/templates', icon: '📝', label: 'Dispatch Log' },
      { to: '/messages', icon: '💬', label: 'Messages' },
      { to: '/intelligence', icon: '🧠', label: 'Intelligence Layer' }
    ]
  },
  {
    title: 'System',
    items: [
      { to: '/manual', icon: '📘', label: 'User Manual' },
      { to: '/onboarding', icon: '🚀', label: 'Onboarding' },
      { to: '/settings', icon: '⚙️', label: 'Settings' }
    ]
  }
];

function App() {
  const location = useLocation();
  const { isAuthenticated, isOnboarded, user, logout, vaultBKey, panicWipeVaultB, unlockVaultB, rekeyVaultB } = useAuthStore();

  // Explicit Vault B unlock (finding C1). Vault B is closed after login and
  // requires its OWN separate passphrase. Three cases:
  //   1. Legacy install with pre-C1 Vault B records -> "upgrade your vault"
  //      re-key: decrypt with the login passphrase, set a new Vault B passphrase.
  //   2. First-ever unlock, no legacy data -> enroll a new Vault B passphrase.
  //   3. Already enrolled -> challenge the existing Vault B passphrase.
  // Cases 1 and 2 both set a new passphrase, so they show the
  // unrecoverable-by-design warning and require acknowledgement (no escrow).
  const handleUnlockVaultB = async () => {
    // Case 1: legacy re-key upgrade.
    if (await needsVaultBRekey()) {
      const ack = window.confirm(
        'Upgrade Vault B security.\n\n' +
        'Your Vault B records currently share your login passphrase. This ' +
        'upgrade moves them to a SEPARATE Vault B passphrase so closing Vault B ' +
        'actually protects them.\n\n' +
        'WARNING: the new Vault B passphrase is UNRECOVERABLE by design — no ' +
        'reset, no escrow. If you forget it, Vault B data is permanently lost.\n\n' +
        'Press OK to continue.'
      );
      if (!ack) return;
      const loginPass = window.prompt('Confirm your LOGIN passphrase to decrypt existing Vault B records:');
      if (!loginPass) return;
      const newPassB = window.prompt('Choose a NEW Vault B passphrase (min 8 chars, different from login):');
      if (!newPassB) return;
      const ok = await rekeyVaultB(loginPass, newPassB);
      if (!ok) {
        alert(useAuthStore.getState().vaultBError || 'Vault B upgrade failed. Nothing was changed.');
      }
      return;
    }

    const firstTime = !vaultBEnrolled();
    if (firstTime) {
      const ack = window.confirm(
        'Set the Vault B passphrase.\n\n' +
        'Vault B protects the most sensitive records (42 CFR Part 2, HRT). It ' +
        'uses a SEPARATE passphrase from your login.\n\n' +
        'WARNING: Vault B is UNRECOVERABLE by design. There is no reset and no ' +
        'escrow. If you forget this passphrase, Vault B data is permanently ' +
        'lost.\n\n' +
        'Press OK to acknowledge and set your Vault B passphrase.'
      );
      if (!ack) return;
    }
    const passB = window.prompt(
      firstTime
        ? 'Choose a Vault B passphrase (min 8 chars, different from your login):'
        : 'Enter your Vault B passphrase to unlock:'
    );
    if (!passB) return;
    const ok = await unlockVaultB(passB);
    if (!ok) {
      alert(useAuthStore.getState().vaultBError || 'Vault B unlock failed.');
    }
  };

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
        alert('USB security token removed. All vault keys have been dropped from memory.');
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
            {NAV_GROUPS.map((group) => (
              <React.Fragment key={group.title}>
                <li style={{ listStyle: 'none', padding: '0.9rem 1rem 0.3rem', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>
                  {group.title}
                </li>
                {group.items.map((item) => (
                  <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
                    <li className={`nav-item ${location.pathname === item.to ? 'active' : ''}`}>
                      <span>{item.icon}</span> {item.label}
                    </li>
                  </Link>
                ))}
              </React.Fragment>
            ))}
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
              {vaultBKey ? (
                <button
                  className="btn-primary"
                  onClick={panicWipeVaultB}
                  title="BridgeVault closure: drop the Vault B key from memory"
                  style={{ background: '#e11d48', color: 'white', fontWeight: 'bold' }}
                >
                  🚨 Close Vault B
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleUnlockVaultB}
                  title="Open Vault B with its separate passphrase"
                  style={{ background: 'var(--charcoal)', color: 'white', fontWeight: 'bold' }}
                >
                  🔒 Unlock Vault B
                </button>
              )}
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
              <Route path="/resources" element={<ResourceNavigator />} />
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
