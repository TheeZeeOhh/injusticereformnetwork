import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLanguage } from '../i18n/LanguageContext';

export default function UserProfile() {
  const { user } = useAuthStore();
  const { t } = useLanguage();
  // The avatar persists in the non-PHI settings store (localStorage), so it
  // survives navigation and reloads. Seed local state from the stored value.
  const storedPhoto = useSettingsStore((s) => s.profile.photo);
  const setProfilePhoto = useSettingsStore((s) => s.setProfilePhoto);
  const [profilePic, setProfilePic] = useState(storedPhoto || null);

  // Local state for form fields
  const [formData, setFormData] = useState({
    fullName: user?.username || 'Navigator Admin',
    role: user?.role || 'Lead Navigator',
    email: 'admin@sanctuary.irn.org',
    phone: '(410) 555-0987',
    pgpKey: '0x4F92B3A1C6D7E8F9',
  });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        // Persist to the settings store; it rejects oversized/non-image input.
        const ok = setProfilePhoto(dataUrl);
        if (ok) {
          setProfilePic(dataUrl);
        } else {
          alert(t('profile.tooLargeAlert'));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    alert(t('profile.savedAlert'));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>{t('profile.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          {t('profile.subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Left Column: Avatar & Upload */}
        <div className="glass-panel" style={{ flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center' }}>
          
          <div style={{ 
            width: '150px', 
            height: '150px', 
            borderRadius: '50%', 
            background: profilePic ? `url(${profilePic}) center/cover no-repeat` : 'var(--charcoal-lighter)',
            border: '4px solid var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: profilePic ? '0' : '3rem',
            color: 'var(--gold)',
            fontFamily: 'var(--font-serif)',
            boxShadow: 'var(--shadow-lg)'
          }}>
            {!profilePic && formData.fullName.charAt(0)}
          </div>
          
          <div>
            <h2 style={{ color: 'var(--bone)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-serif)' }}>{formData.fullName}</h2>
            <span style={{ background: 'var(--gold-dim)', color: 'var(--gold)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {formData.role}
            </span>
          </div>

          <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', width: '100%', textAlign: 'center' }}>
            {t('profile.uploadPicture')}
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '-0.5rem' }}>{t('profile.pictureHint')}</p>
        </div>

        {/* Right Column: Profile Settings */}
        <div className="glass-panel" style={{ flex: 2, padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <h3 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', margin: 0, fontFamily: 'var(--font-serif)' }}>
            {t('profile.identityDetails')}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.fullName')}</label>
              <input 
                type="text" 
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                style={{ width: '100%', padding: '0.75rem' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.officialTitle')}</label>
              <input 
                type="text" 
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                style={{ width: '100%', padding: '0.75rem' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.secureEmail')}</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                style={{ width: '100%', padding: '0.75rem' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.burnerPhone')}</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                style={{ width: '100%', padding: '0.75rem' }} 
              />
            </div>
          </div>

          <h3 style={{ color: 'var(--gold)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', margin: '1rem 0 0 0', fontFamily: 'var(--font-serif)' }}>
            {t('profile.cryptographicKeys')}
          </h3>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.pgpFingerprint')}</label>
            <input 
              type="text" 
              value={formData.pgpKey}
              onChange={e => setFormData({...formData, pgpKey: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', fontFamily: 'monospace', color: 'var(--ember)' }} 
              readOnly
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>{t('profile.pgpHint')}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={handleSave} className="btn-primary" style={{ background: 'var(--gold)', color: 'var(--charcoal)', fontWeight: 'bold' }}>
              {t('profile.saveIdentity')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
