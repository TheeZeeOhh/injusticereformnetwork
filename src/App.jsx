import React, { useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import DischargeGenerator from './pages/DischargeGenerator';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Login from './pages/Login';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { vaultExists, vaultBEnrolled } from './utils/cryptoEngine';
import { needsVaultBRekey } from './utils/migrationEngine';
import { useLanguage } from './i18n/LanguageContext';
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
          <span className="stat-value">0</span>
          <span className="stat-change">No data yet</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="stat-title">Pending Reviews</span>
          <span className="stat-value">0</span>
          <span className="stat-change">No data yet</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="stat-title">Staff Available</span>
          <span className="stat-value">0</span>
          <span className="stat-change">No data yet</span>
        </div>
      </div>

      <ClinicalAlertsPanel />

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
import NoteTemplatesLibrary from './pages/NoteTemplatesLibrary';
import ClinicalAlertsPanel from './pages/ClinicalAlertsPanel';
import CaseReporting from './pages/CaseReporting';
import StipendTracker from './pages/StipendTracker';
import CredentialMonitor from './pages/CredentialMonitor';
import ReferralTracker from './pages/ReferralTracker';
import PortableSession from './pages/PortableSession';
import WeatherWidget from './pages/WeatherWidget';
import { SidebarRadio } from './pages/SidebarExtras';

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
// group so the security boundary is visible in the UI. Labels are i18n KEYS
// (resolved via t() at render time), not literal strings.
const NAV_GROUPS = [
  {
    titleKey: 'nav.groupClientCare',
    items: [
      { to: '/', icon: '📊', labelKey: 'nav.dashboard' },
      { to: '/clients', icon: '👥', labelKey: 'nav.clients' },
      { to: '/meds', icon: '💊', labelKey: 'nav.medications' },
      { to: '/discharge', icon: '📋', labelKey: 'nav.dischargeGen' },
      { to: '/note-templates', icon: '📝', labelKey: 'nav.noteTemplates' },
      { to: '/telehealth', icon: '📹', labelKey: 'nav.telehealth' },
      { to: '/audio', icon: '🎙️', labelKey: 'nav.audioIntake' }
    ]
  },
  {
    titleKey: 'nav.groupSensitive',
    items: [
      { to: '/hrt', icon: '🏳️‍⚧️', labelKey: 'nav.hrtContinuity' },
      { to: '/consent', icon: '📜', labelKey: 'nav.consent' }
    ]
  },
  {
    titleKey: 'nav.groupResources',
    items: [
      { to: '/resources', icon: '🏳️‍🌈', labelKey: 'nav.resourceNavigator' },
      { to: '/docs', icon: '📁', labelKey: 'nav.documentLibrary' },
      { to: '/evidence', icon: '🔐', labelKey: 'nav.evidenceVault' },
      { to: '/vouchers', icon: '🎫', labelKey: 'nav.voucherProgram' },
      { to: '/stipends', icon: '🎁', labelKey: 'nav.stipends' },
      { to: '/referrals', icon: '🔗', labelKey: 'nav.referrals' },
      { to: '/transport', icon: '🚗', labelKey: 'nav.transportationHub' }
    ]
  },
  {
    titleKey: 'nav.groupLegal',
    items: [
      { to: '/foia', icon: '⚖️', labelKey: 'nav.foiaGen' },
      { to: '/case-report', icon: '🗂️', labelKey: 'nav.caseReport' },
      { to: '/attorneys', icon: '⚖️', labelKey: 'nav.attorneys' },
      { to: '/canvas', icon: '🎨', labelKey: 'nav.visualCanvas' }
    ]
  },
  {
    titleKey: 'nav.groupOperations',
    items: [
      { to: '/schedule', icon: '📅', labelKey: 'nav.schedule' },
      { to: '/shifts', icon: '🔄', labelKey: 'nav.shiftSwaps' },
      { to: '/staffing', icon: '📋', labelKey: 'nav.staffingPipeline' },
      { to: '/credentials', icon: '🎓', labelKey: 'nav.credentials' },
      { to: '/oncall', icon: '🚨', labelKey: 'nav.onCallDashboard' },
      { to: '/templates', icon: '📝', labelKey: 'nav.dispatchLog' },
      { to: '/messages', icon: '💬', labelKey: 'nav.messages' },
      { to: '/intelligence', icon: '🧠', labelKey: 'nav.intelligenceLayer' }
    ]
  },
  {
    titleKey: 'nav.groupSystem',
    items: [
      { to: '/manual', icon: '📘', labelKey: 'nav.userManual' },
      { to: '/onboarding', icon: '🚀', labelKey: 'nav.onboarding' },
      { to: '/portable', icon: '🔌', labelKey: 'nav.portable' },
      { to: '/settings', icon: '⚙️', labelKey: 'nav.settings' }
    ]
  }
];

// Compact preferences footer for the sidebar: language (EN/ES/FR) + theme.
function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const theme = useSettingsStore((s) => s.theme.mode);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const codes = ['en', 'es', 'fr'];
  const pillBase = {
    flex: 1,
    padding: '0.35rem 0',
    fontSize: '0.7rem',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    cursor: 'pointer',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
  };
  const pill = (active) => ({
    ...pillBase,
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? 'var(--charcoal)' : 'var(--text-secondary)',
    fontWeight: active ? 'bold' : 'normal',
  });
  return (
    <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
          {t('lang.label')}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {codes.map((c) => (
            <button key={c} onClick={() => setLang(c)} aria-pressed={lang === c} style={pill(lang === c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
          {t('theme.label')}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} style={pill(theme === 'dark')}>
            {t('theme.dark')}
          </button>
          <button onClick={() => setTheme('light')} aria-pressed={theme === 'light'} style={pill(theme === 'light')}>
            {t('theme.light')}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const { t } = useLanguage();
  const themeMode = useSettingsStore((s) => s.theme.mode);
  const { isAuthenticated, isOnboarded, user, logout, vaultBKey, panicWipeVaultB, unlockVaultB, rekeyVaultB } = useAuthStore();

  // Reflect the chosen theme onto <html data-theme>. Light mode is a CSS token
  // remap keyed off this attribute; dark is the default so we clear it.
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }, [themeMode]);

  // Idle auto-lock (HIPAA §164.312(a)(2)(iii)). While authenticated, an inactivity
  // timer locks the vault (logout drops keys from RAM) after DEFAULT_IDLE_MS with
  // no operator activity. Complements the USB dead-man's switch with an always-on
  // software fallback so an unattended unlocked machine does not expose PHI.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let timer;
    let bump;
    let cancelled = false;
    (async () => {
      const { createIdleTimer } = await import('./utils/idleLock');
      if (cancelled) return;
      timer = createIdleTimer(() => logout());
      bump = () => timer.bump();
      const events = ['mousedown', 'keydown', 'touchstart', 'mousemove', 'wheel'];
      for (const ev of events) window.addEventListener(ev, bump, { passive: true });
      timer._events = events;
    })();
    return () => {
      cancelled = true;
      if (timer) timer.stop();
      if (bump && timer && timer._events) {
        for (const ev of timer._events) window.removeEventListener(ev, bump);
      }
    };
  }, [isAuthenticated, logout]);

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

  // Anti-exfiltration UI hardening (defense-in-depth, on by default).
  // Blocks the EASY ways to lift PHI off the screen from inside the app:
  //   - right-click context menu (Save Image / Copy / Inspect)
  //   - copy / cut of selected text
  //   - dragging an image (e.g. a client photo) out of the app
  // Text selection is also disabled via CSS (see index.css .no-select).
  // NOTE: this is friction, not a guarantee — it cannot stop an OS screenshot
  // tool or a phone camera. OS-level screen-capture exclusion is applied in the
  // Rust shell (set_content_protected), effective on Windows/macOS only.
  // Admin bypass: protections are LIFTED only for a Systems Admin who has ALSO
  // unlocked Vault B. Vault B has its own independent passphrase (a real secret,
  // unrecoverable, not cross-keyed), so this is an AUTHENTICATED override — not
  // the self-selected login role alone (which anyone could pick). Everyone else
  // is locked out of right-click / copy / selection / image-drag.
  const adminBypass = user?.role === 'Systems Admin' && !!vaultBKey;

  useEffect(() => {
    // Reflect bypass state on <body> so the CSS selection rules can key off it.
    document.body.classList.toggle('admin-unlocked', adminBypass);
    if (adminBypass) return undefined; // admin: no listeners, full access

    const block = (e) => e.preventDefault();
    // Allow copy/cut only when it originates inside a form field (a navigator
    // legitimately needs to copy e.g. a resource phone number they typed/see in
    // an input). Everywhere else — the PHI surfaces — copy/cut is blocked.
    const blockCopyOutsideInputs = (e) => {
      const el = e.target;
      const inField = el && typeof el.closest === 'function' && el.closest('input, textarea');
      if (!inField) e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', blockCopyOutsideInputs);
    document.addEventListener('cut', blockCopyOutsideInputs);
    document.addEventListener('dragstart', block);
    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', blockCopyOutsideInputs);
      document.removeEventListener('cut', blockCopyOutsideInputs);
      document.removeEventListener('dragstart', block);
    };
  }, [adminBypass]);

  // USB insertion trigger: when the Rust poll thread sees the persisted trigger
  // token appear on the bus, it emits 'usb-token-inserted'. If the app is locked,
  // we bring the window forward and ask whether to start/unlock (a confirm box —
  // never auto-unlock). Tauri-only.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;
    let unlisten;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen('usb-token-inserted', async () => {
        // Only prompt when locked; if already unlocked, a re-insert is a no-op.
        // When locked, the <Login /> unlock screen is already the rendered view,
        // so "start" just means bringing the window forward for the user.
        if (isAuthenticated) return;
        // eslint-disable-next-line no-alert
        const start = window.confirm('Sanctuary security token detected. Bring up Sanctuary to unlock?');
        if (!start) return;
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const w = getCurrentWindow();
          await w.show();
          await w.setFocus();
        } catch { /* window focus is best-effort */ }
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, [isAuthenticated]);

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

          <WeatherWidget inline />

          <ul className="nav-links">
            {NAV_GROUPS.map((group) => (
              <React.Fragment key={group.titleKey}>
                <li style={{ listStyle: 'none', padding: '0.9rem 1rem 0.3rem', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>
                  {t(group.titleKey)}
                </li>
                {group.items.map((item) => (
                  <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
                    <li className={`nav-item ${location.pathname === item.to ? 'active' : ''}`}>
                      <span>{item.icon}</span> {t(item.labelKey)}
                    </li>
                  </Link>
                ))}
              </React.Fragment>
            ))}
          </ul>

          <LanguageSwitcher />
          <SidebarRadio />
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <header className="topbar glass-panel-dark">
            <div className="search-bar">
              <span>🔍</span>
              <input type="text" placeholder={t('topbar.searchPlaceholder')} />
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
                  {t('topbar.closeVaultB')}
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleUnlockVaultB}
                  title="Open Vault B with its separate passphrase"
                  style={{ background: 'var(--charcoal)', color: 'white', fontWeight: 'bold' }}
                >
                  {t('topbar.unlockVaultB')}
                </button>
              )}
              <button className="btn-primary" onClick={logout} style={{ background: 'var(--charcoal)' }}>{t('topbar.logout')}</button>
              <Link to="/profile" style={{ textDecoration: 'none' }}>
                <div className="avatar" style={{ cursor: 'pointer' }} title={t('topbar.editProfile')}>
                  {user?.username.substring(0, 2).toUpperCase()}
                </div>
              </Link>
            </div>
          </header>

          <div style={{ padding: '1.5rem 3rem' }}>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/clients" element={<ClientsModule />} />
              <Route path="/templates" element={<NoteTemplatesLibrary />} />
              <Route path="/note-templates" element={<NoteTemplatesLibrary />} />
              <Route path="/canvas" element={<VisualCanvas />} />
              <Route path="/foia" element={<FOIAGenerator />} />
              <Route path="/case-report" element={<CaseReporting />} />
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
              <Route path="/credentials" element={<CredentialMonitor />} />
              <Route path="/docs" element={<DocumentLibrary />} />
              <Route path="/transport" element={<TransportationHub />} />
              <Route path="/vouchers" element={<VoucherProgram />} />
              <Route path="/stipends" element={<StipendTracker />} />
              <Route path="/referrals" element={<ReferralTracker />} />
              <Route path="/manual" element={<UserManual />} />
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/portable" element={<PortableSession />} />
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
