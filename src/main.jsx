import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'

// Apply the saved theme BEFORE React mounts so there is no flash of dark on a
// light-mode reload. The App keeps it in sync afterward; this just wins the
// first paint. Reads the same non-PHI settings blob the store persists to.
try {
  const raw = localStorage.getItem('sanctuary_ui_settings')
  const mode = raw ? JSON.parse(raw)?.theme?.mode : null
  if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light')
} catch { /* fall back to default dark */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
)
