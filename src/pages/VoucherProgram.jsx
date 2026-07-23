import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../i18n/LanguageContext';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

export default function VoucherProgram() {
  const { t } = useLanguage();
  const { vaultAKey } = useAuthStore();
  const [budget, setBudget] = useState(5000);
  const [vouchers, setVouchers] = useState([]);

  const [isIssuing, setIsIssuing] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newType, setNewType] = useState('Transit');

  // Load persisted vouchers and budget on mount
  useEffect(() => {
    async function loadVouchers() {
      if (!vaultAKey) return;
      try {
        const storedVouchers = await loadSecureRecord(vaultAKey, 'vouchers', 'A');
        if (storedVouchers) setVouchers(storedVouchers);
        const storedBudget = await loadSecureRecord(vaultAKey, 'voucher_budget', 'A');
        if (storedBudget !== null && storedBudget !== undefined) setBudget(storedBudget);
      } catch (err) {
        console.warn("No voucher records found, using defaults.");
      }
    }
    loadVouchers();
  }, [vaultAKey]);

  const handleIssueVoucher = async (e) => {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (!newRecipient.trim() || isNaN(amt) || amt <= 0) return;

    if (amt > budget) {
      alert("Insufficient funds in the Sovereignty Budget for this voucher.");
      return;
    }

    const newId = `V-${Math.floor(Math.random() * 9000) + 1000}`;
    const updatedVouchers = [{
      id: newId,
      type: newType,
      recipient: newRecipient,
      amount: amt,
      date: new Date().toISOString().split('T')[0],
      status: 'Issued'
    }, ...vouchers];
    setVouchers(updatedVouchers);

    const updatedBudget = budget - amt;
    setBudget(updatedBudget);
    setNewRecipient('');
    setNewAmount('');
    setNewType('Transit');
    setIsIssuing(false);

    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, 'vouchers', updatedVouchers, 'A');
      await saveSecureRecord(vaultAKey, 'voucher_budget', updatedBudget, 'A');
    } catch (err) {
      console.error("Failed to persist vouchers to vault", err);
    }
  };

  const markRedeemed = async (id) => {
    const updatedVouchers = vouchers.map(v => v.id === id ? { ...v, status: 'Redeemed' } : v);
    setVouchers(updatedVouchers);

    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, 'vouchers', updatedVouchers, 'A');
    } catch (err) {
      console.error("Failed to persist vouchers to vault", err);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>{t('voucher.title')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
            {t('voucher.subtitle')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{t('voucher.availableBudget')}</div>
          <div style={{ color: 'var(--ember)', fontSize: '1.5rem', fontWeight: 'bold' }}>${budget.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
         <button onClick={() => setIsIssuing(!isIssuing)} className="btn-primary" style={{ background: 'var(--charcoal-lighter)', border: '1px solid var(--gold)', color: 'var(--gold)', fontWeight: 'bold' }}>
          {isIssuing ? t('voucher.cancel') : t('voucher.toggleIssue')}
        </button>
      </div>

      {isIssuing && (
        <form onSubmit={handleIssueVoucher} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', background: 'var(--charcoal)', border: '1px solid var(--ember)' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('voucher.recipientName')}</label>
            <input autoFocus type="text" value={newRecipient} onChange={e => setNewRecipient(e.target.value)} placeholder={t('voucher.recipientPlaceholder')} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('voucher.voucherType')}</label>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
              <option>{t('voucher.typeTransit')}</option>
              <option>{t('voucher.typeHousing')}</option>
              <option>{t('voucher.typeGroceries')}</option>
              <option>{t('voucher.typeLegal')}</option>
            </select>
          </div>
          <div style={{ width: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>{t('voucher.amount')}</label>
            <input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder={t('voucher.amountPlaceholder')} style={{ width: '100%', padding: '0.75rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }} />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', background: 'var(--ember)', color: 'white', fontWeight: 'bold' }}>
            Authorize
          </button>
        </form>
      )}

      <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>{t('voucher.colId')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colDate')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colRecipient')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colType')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colAmount')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colStatus')}</th>
              <th style={{ padding: '1rem' }}>{t('voucher.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--bone)' }}>
                <td style={{ padding: '1rem', color: 'var(--gold)', fontWeight: 'bold' }}>{v.id}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{v.date}</td>
                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{v.recipient}</td>
                <td style={{ padding: '1rem' }}>{v.type}</td>
                <td style={{ padding: '1rem', color: 'var(--ember)' }}>${v.amount.toFixed(2)}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    background: v.status === 'Redeemed' ? 'rgba(74, 222, 128, 0.1)' : v.status === 'Issued' ? 'rgba(217, 164, 65, 0.1)' : 'rgba(226, 85, 43, 0.1)', 
                    color: v.status === 'Redeemed' ? '#4ade80' : v.status === 'Issued' ? 'var(--gold)' : 'var(--ember)', 
                    padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem' 
                  }}>
                    {v.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  {v.status !== 'Redeemed' && (
                    <button className="btn-primary" onClick={() => markRedeemed(v.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'var(--charcoal)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      Mark Redeemed
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vouchers.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t('voucher.noVouchers')}</div>}
      </div>
    </div>
  );
}
