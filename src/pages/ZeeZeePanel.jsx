import React, { useState, useEffect, useRef } from 'react';
import { chat, ping } from '../utils/zeeEngine';

export default function ZeeZeePanel() {
  const [messages, setMessages] = useState([
    { from: 'zeezee', text: 'Hi! I am Zee Zee, your Sovereign AI Twin. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState('connecting'); // connecting, ready, error
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Check if bridge is up
    ping().then(() => {
      setStatus('ready');
    }).catch((err) => {
      setStatus('error');
      console.error("Zee Zee bridge error:", err);
    });
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking || status !== 'ready') return;
    
    setInput('');
    setMessages((m) => [...m, { from: 'user', text }]);
    setThinking(true);
    
    try {
      // Create a placeholder for the streaming reply
      const msgIndex = messages.length + 1; // user is appended, so +1
      setMessages((m) => [...m, { from: 'zeezee', text: '' }]);
      
      const onToken = (token) => {
        setMessages((m) => {
          const newM = [...m];
          newM[msgIndex] = { ...newM[msgIndex], text: newM[msgIndex].text + token };
          return newM;
        });
      };
      
      const reply = await chat(text, { onToken });
      
      // If streaming didn't fire tokens (some models don't stream), just set the final
      setMessages((m) => {
        const newM = [...m];
        if (newM[msgIndex].text === '') {
          newM[msgIndex] = { ...newM[msgIndex], text: reply };
        }
        return newM;
      });
    } catch (err) {
      setMessages((m) => [...m, { from: 'zeezee', text: `[Error: ${err.message}]` }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div className="glass-panel" style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-serif)', fontWeight: 'bold', fontSize: '1.2rem' }}>
            Zee Zee (Sovereign Twin)
          </div>
          <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: status === 'ready' ? '#4ade80' : 'var(--text-tertiary)' }}>
            {status === 'connecting' ? 'Connecting to bridge...' : status === 'ready' ? '● Bridge Connected' : '⚠ Bridge Offline'}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem', marginTop: '1rem' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ 
                background: m.from === 'user' ? 'var(--gold)' : 'var(--charcoal-lighter)', 
                color: m.from === 'user' ? 'var(--charcoal)' : 'var(--bone)', 
                padding: '0.6rem 1rem', 
                borderRadius: '10px', 
                fontSize: '0.9rem', 
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {thinking && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic', alignSelf: 'flex-start', marginLeft: '0.5rem' }}>Thinking...</div>}
          <div ref={endRef} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Talk to Zee Zee..."
            disabled={status !== 'ready'}
            style={{ 
              flex: 1, 
              padding: '0.8rem', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              background: 'var(--charcoal-lighter)', 
              color: 'var(--bone)', 
              fontFamily: 'var(--font-mono)', 
              fontSize: '0.95rem' 
            }}
          />
          <button 
            onClick={send} 
            disabled={thinking || status !== 'ready' || !input.trim()} 
            className="btn-primary" 
            style={{ padding: '0 1.5rem', fontWeight: 'bold' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
