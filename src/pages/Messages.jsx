import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

const THREAD_ID = 'message_thread_local';

export default function Messages() {
  const user = useAuthStore(state => state.user);
  const { vaultAKey } = useAuthStore();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Load the locally-encrypted message thread. PHI never leaves the device.
  useEffect(() => {
    async function loadThread() {
      if (!vaultAKey) return;
      try {
        const thread = await loadSecureRecord(vaultAKey, THREAD_ID, 'A');
        if (thread) setMessages(thread);
      } catch (err) {
        console.warn('No local message thread yet.');
      }
    }
    loadThread();
  }, [vaultAKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !vaultAKey) return;

    const messageData = {
      id: Date.now(),
      sender: user?.username || 'Unknown',
      text: newMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updated = [...messages, messageData];
    setMessages(updated);
    setNewMessage('');
    try {
      await saveSecureRecord(vaultAKey, THREAD_ID, updated, 'A');
    } catch (err) {
      console.error('Failed to persist message to encrypted vault:', err);
    }
  };

  return (
    <div className="data-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
      <h2>Secure Messaging</h2>
      <p style={{ color: 'var(--color-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        🔒 Stored locally, AES-256-GCM encrypted at rest. Not transmitted off-device.
      </p>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-color-main)', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map(msg => {
          const isMe = msg.sender === user?.username;
          return (
            <div key={msg.id} style={{ 
              alignSelf: isMe ? 'flex-end' : 'flex-start',
              background: isMe ? 'var(--color-primary)' : 'var(--bg-color-surface)',
              color: isMe ? 'white' : 'var(--text-primary)',
              padding: '1rem',
              borderRadius: '12px',
              maxWidth: '70%',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.25rem' }}>{isMe ? 'You' : msg.sender} • {msg.time}</div>
              <div>{msg.text}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <input 
          type="text" 
          placeholder="Type a secure message..." 
          value={newMessage} 
          onChange={e => setNewMessage(e.target.value)}
          style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
        />
        <button type="submit" className="btn-primary">Send</button>
      </form>
    </div>
  );
}
